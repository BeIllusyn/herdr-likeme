// A lazy file browser for the focused pane's folder, with bounded read-only previews.
import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, h_resizable, resizable_panel, Editor, EditorState, Scrollbar, v_virtual_list } from "gpui-base";
import { spaces, panes, focused, props, exec, readTextFile, writeTextFile, watchFolder, theme, settings, window } from "herdr";

// `tab` is the tab this copy lives in. While another tab is in front, null says
// "keep what this copy shows": a Files tab is its own place, so switching tabs
// neither reloads another folder nor forgets its open folders.
function location(tab, openedAt) {
  const space = spaces().find(s => s.active), f = focused();
  if (tab && f?.tab !== tab) return null;
  const at = f?.pane ? panes().find(p => p.pane === f.pane) : null;
  // Clicking the Files pane gives it the keyboard, and a mod pane has no folder:
  // stay on the folder the tab was opened in.
  if (at && !at.terminal) return { cwd: openedAt || space?.folder, on: space?.machine ?? null, space: space?.id };
  // Before this copy has seen its own tab, start on the folder the tab was opened
  // on rather than on whichever terminal happens to be focused elsewhere: when
  // the first click then focuses this pane, the root does not change under it.
  if (!tab && openedAt) return { cwd: openedAt, on: space?.machine ?? null, space: space?.id };
  const on = f?.pane === null ? (f.terminal?.includes("/") ? f.terminal.split("/")[0] : null) : space?.machine ?? null;
  return { cwd: at?.cwd || f?.cwd || space?.folder, on, space: space?.id };
}
const keyOf = (loc) => JSON.stringify(loc);
const LANG = { ts: "js", tsx: "js", mts: "js", cts: "js", jsx: "js", mjs: "js", toml: "yaml", jsonc: "json", svelte: "html", vue: "html" };
const PER_FOLDER = 500, TOTAL = 5000;

async function directory(path, on) {
  if (!on && window()?.platform === "windows") {
    // Windows PowerShell otherwise uses the console code page; exec decodes UTF-8.
    // Reparse points keep directory attributes even when dangling; check their target.
    const r = await exec("powershell", ["-NoProfile", "-Command", "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); & { param($p) @(Get-ChildItem -LiteralPath $p -Force -ErrorAction Stop | Where-Object Name -ne '.git' | Select-Object -First 501 | ForEach-Object { @{ name=$_.Name; dir=($_.PSIsContainer -and (-not ($_.Attributes -band [IO.FileAttributes]::ReparsePoint) -or ($_.Target -and [IO.Directory]::Exists(([IO.Path]::Combine([IO.Path]::GetDirectoryName($_.FullName), $_.Target[0])))))) } }) | ConvertTo-Json -Compress } '" + path.replaceAll("'", "''") + "'"]);
    if (r.code !== 0) throw new Error(r.stderr || "Cannot list this folder");
    const result = JSON.parse(r.stdout || "[]");
    return Array.isArray(result) ? result : [result];
  }
  const script = 'n=0; for p in "$1"/* "$1"/.[!.]* "$1"/..?*; do [ -e "$p" ] || [ -L "$p" ] || continue; name=${p##*/}; [ "$name" = .git ] && continue; if [ -d "$p" ]; then kind=d; else kind=f; fi; printf "%s\\0%s\\0" "$kind" "$name"; n=$((n+1)); [ "$n" -gt 500 ] && break; done; test -d "$1"';
  const r = await exec("sh", ["-c", script, "files", path], { on });
  if (r.code !== 0) throw new Error(r.stderr || "Cannot list this folder");
  const fields = r.stdout.split("\0"), out = [];
  for (let i = 0; i + 1 < fields.length; i += 2) out.push({ name: fields[i + 1], dir: fields[i] === "d" });
  return out;
}

export default class Files extends View {
  init(_props, cx) {
    this.saved = new Map();
    this.entries = new Map(); this.folders = new Set(); this.pending = new Set(); this.marks = {};
    this.flat = null;
    this.want = null;
    // The tab is opened on the folder the person was working in; the copy keeps
    // that root while it is its own tab (a mod pane has no folder of its own).
    this.openedAt = props()?.cwd ?? null;
    this.tab = null; this.lastLoc = null;
    // The editor writes back through writeTextFile with the text it read, so a
    // file changed elsewhere rejects instead of being overwritten.
    this.original = null; this.dirty = false; this.saving = false; this.saveError = null;
    this.editable = false; this.saveVersion = 0;
    const f = focused(), at = f?.pane ? panes().find(p => p.pane === f.pane) : null;
    if (at && !at.terminal && at.mod === "my-files") this.tab = f.tab;
    // Several copies can be open, one per tab: keep their element ids apart so a
    // click or scrollbar in one never lands on another's list.
    this.uid = Math.random().toString(36).slice(2, 7);
    this.refresh(cx);
    cx.timer.every(10000, cx => this.refresh(cx));
  }

  watch(root, cx) {
    if (this.on || this.watched === root) return;
    this.watched = root;
    const context = this.context;
    cx.spawn(async cx => {
      try {
        while (this.context === context) {
          await watchFolder(root);
          if (this.current(context)) this.refresh(cx);
        }
      }
      catch { if (this.context === context) this.watched = null; }
    });
  }

  current(context) {
    // `want` is the position the next refresh will load, so an in-flight load
    // stops at the next folder as soon as the place changed. Re-reading
    // `spaces()`/`focused()`/`panes()` here copied three host lists per folder.
    return this.context === context && this.want === context.key;
  }

  async loadFolder(path, context) {
    const { on, cwd: root } = context;
    const entries = await directory(path ? `${root}/${path}` : root, on);
    if (!this.current(context) || (path && !this.folders.has(path))) return;
    const used = [...this.entries.entries()].filter(([p]) => p !== path).reduce((n, [, e]) => n + e.length, 0);
    this.entries.set(path, entries.slice(0, Math.max(0, Math.min(PER_FOLDER, TOTAL - used))).sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name)));
    this.flat = null;
    if (entries.length > PER_FOLDER || used + entries.length > TOTAL) this.limited = true;
  }

  refresh(cx, loc) {
    // While another tab is in front, keep the folder this copy already shows.
    loc ??= location(this.tab, this.openedAt) ?? this.lastLoc;
    if (!loc) return;
    this.lastLoc = loc;
    const { cwd, on } = loc, next = keyOf(loc);
    this.want = next;
    if (next !== this.context?.key) {
      if (this.context) this.saved.set(this.context.key, { folders: this.folders, file: this.file });
      const saved = this.saved.get(next);
      this.context = { key: next, cwd, on }; this.root = cwd; this.on = on; this.entries = new Map(); this.folders = new Set(saved?.folders);
      this.pending = new Set(); this.marks = {}; this.show(null, cx); this.watched = null; this.error = null; this.limited = false;
      this.loading = false; this.flat = null;
      if (saved?.file) this.show(saved.file, cx);
    }
    if (!cwd || this.loading) return;
    const context = this.context;
    this.loading = true;
    this.limited = false;
    cx.spawn(async cx => {
      // The git look does not depend on the listings: start it alongside them
      // instead of doing the whole worktree scan after the folders.
      const marks = (async () => {
        try {
          const top = await exec("git", ["rev-parse", "--show-toplevel"], { cwd, on }).catch(() => null);
          const found = {};
          if (top?.code === 0) {
            // Writes nothing under .git (index lock, fsmonitor cookie): the folder watch would refresh again.
            const status = await exec("git", ["--no-optional-locks", "-c", "core.fsmonitor=false", "status", "--porcelain=v1", "-z", "--no-renames", "--untracked-files=all"], { cwd, on }).catch(() => null);
            if (status?.code === 0) for (const entry of status.stdout.split("\0").filter(Boolean).slice(0, TOTAL)) {
              const xy = entry.slice(0, 2);
              found[`${top.stdout.trim()}/${entry.slice(3)}`] = xy === "??" || xy.includes("A") ? "A" : xy.includes("U") ? "U" : xy.includes("D") ? "D" : "M";
            }
          }
          return found;
        } catch { return {}; }
      })();
      try {
        for (const path of ["", ...this.folders]) {
          if (!this.current(context)) return;
          await this.loadFolder(path, context);
        }
        const found = await marks;
        if (!this.current(context)) return;
        this.marks = found; this.flat = null; this.error = null; this.watch(cwd, cx);
      } catch (e) { if (this.current(context)) this.error = String(e); }
      finally { if (this.context === context) this.loading = false; cx.notify(); }
    });
  }

  toggle(path, cx) {
    if (this.folders.has(path)) {
      for (const folder of [...this.folders]) if (folder === path || folder.startsWith(path + "/")) {
        this.folders.delete(folder);
        this.entries.delete(folder);
      }
    } else {
      this.folders.add(path);
      if (!this.entries.has(path) && !this.pending.has(path)) {
        const context = this.context;
        this.pending.add(path);
        cx.spawn(async cx => {
          try { await this.loadFolder(path, context); }
          catch (e) { if (this.current(context)) this.error = String(e); }
          finally { if (this.context === context) this.pending.delete(path); cx.notify(); }
        });
      }
    }
    this.flat = null;
    cx.notify();
  }

  // Writes the editor's text back. `expected` is what the file said when it was
  // read or last written; a change made elsewhere rejects rather than being lost.
  save(cx) {
    const path = this.file, code = this.code;
    if (!path || !code || !this.dirty) return;
    const text = code.value(), expected = this.original;
    const root = this.root, on = this.on, context = this.context;
    this.dirty = false; this.saving = true; this.saveError = null;
    cx.notify();
    cx.spawn(async cx => {
      try {
        await writeTextFile(`${root}/${path}`, text, expected);
        if (this.context === context && this.file === path) {
          this.original = text;
          this.saving = false;
          // An edit made while the write was out stays dirty for the next save.
          if (this.code?.value() !== text) this.dirty = true;
        }
      } catch {
        if (this.context === context && this.file === path) {
          this.saving = false;
          this.dirty = true;
          this.saveError = "Save failed — the file changed on disk";
        }
      } finally { cx.notify(); }
    });
  }

  show(path, cx) {
    // Switching files must not drop an edit sitting in the auto-save window.
    if (this.dirty && cx) this.save(cx);
    this.code?.release(); this.code = null; this.file = path; this.fileError = null;
    this.original = null; this.dirty = false; this.saving = false; this.saveError = null; this.editable = false;
    if (!path || !cx) return;
    const context = this.context, root = this.root, on = this.on;
    cx.spawn(async cx => {
      try {
        const text = await readTextFile(`${root}/${path}`, { on });
        if (this.file !== path || !this.current(context)) return;
        if (text === null) { this.fileError = "This file is no longer available"; return; }
        if (text.includes("\0")) { this.fileError = "Binary file · no text preview"; return; }
        const t = theme(), ext = path.includes(".") ? path.split(".").pop() : "txt";
        // A truncated preview must not be written back as the file's whole text.
        const editable = text.length <= 400000;
        this.original = text; this.editable = editable;
        this.code = EditorState.new({ language: LANG[ext] ?? ext, readonly: !editable,
          value: editable ? text : text.slice(0, 400000) + "\n… (file truncated)",
          font_family: settings().font_family, font_size: 12,
          syntax: { keyword: t.ansi5, string: t.ansi2, comment: t.dim, function: t.ansi4, type: t.ansi3, number: t.ansi1, constant: t.ansi6 } });
        if (editable) {
          // Coalesce keystrokes: one write after a pause, plus one on blur,
          // submit, file switch or close.
          this.code.on("change", (_e, cx) => {
            // Getting focus can report a change with the same text: that is not
            // an edit, and turning it into a save round-trip only redraws.
            if (this.code.value() === this.original) {
              if (!this.dirty) return;
              this.dirty = false; this.saveVersion++; cx.notify();
              return;
            }
            const wasDirty = this.dirty;
            this.dirty = true;
            const version = ++this.saveVersion;
            if (!wasDirty) cx.notify();
            cx.timer.after(700, cx => { if (this.saveVersion === version) this.save(cx); });
          });
          this.code.on("blur", (_e, cx) => this.save(cx));
          this.code.on("submit", (_e, cx) => this.save(cx));
        }
      } catch { if (this.file === path && this.current(context)) this.fileError = "Cannot preview this file (binary, too large, or unreadable)"; }
      finally { cx.notify(); }
    });
  }

  // A tab closed while the auto-save timer is still pending still gets its edit.
  async close(cx) {
    const path = this.file, code = this.code;
    if (!this.dirty || !path || !code) return;
    try { await writeTextFile(`${this.root}/${path}`, code.value(), this.original); } catch { }
  }

  // Visible rows, flat: the tree the renderer draws is a list of entries with a
  // depth, so a virtual list can draw only the rows on screen. Building a view
  // element per entry (up to 5,000) blocked the whole window on every render.
  flatten() {
    const out = [];
    const walk = (prefix, depth) => {
      if (out.length >= TOTAL || depth > 40) return;
      for (const entry of this.entries.get(prefix) ?? []) {
        if (out.length >= TOTAL) break;
        const path = prefix ? `${prefix}/${entry.name}` : entry.name;
        const open = entry.dir && this.folders.has(path);
        out.push({ path, name: entry.name, dir: entry.dir, depth, open, mark: this.marks[`${this.root}/${path}`] });
        if (open) walk(path, depth + 1);
      }
    };
    walk("", 0);
    return out;
  }

  // A row inside the virtual renderer: no handlers here (the list owns the
  // click), and it is rebuilt only while its row is on screen.
  fileRow(r, t) {
    return h_flex().h(28).flex_none().pl(8 + r.depth * 18).pr(8).gap(7).items_center().rounded(6).cursor_pointer()
      .when(this.file === r.path && !r.dir, el => el.bg(t.selected))
      .hover(s => s.bg(t.hover))
      .child(r.dir ? svg(`mods/my-files/chevron-${r.open ? "down" : "right"}.svg`).size(12).flex_none().text_color(t.dim) : div().w(12).flex_none())
      .child(svg(`mods/my-files/${r.dir ? "folder" : "file"}.svg`).size(14).flex_none().text_color(t.muted))
      .child(div().flex_1().min_w(0).truncate().child(r.name))
      .when(Boolean(r.mark), el => el.child(div().text_size(11).text_color(r.mark === "A" ? t.ansi2 : r.mark === "D" || r.mark === "U" ? t.ansi1 : t.blocked).child(r.mark)));
  }

  render(cx) {
    // The first render may be the one where this copy becomes the focused pane;
    // remember its tab then, so later tab switches leave its state alone.
    const f = focused();
    if (this.tab === null && f?.pane) {
      const at = panes().find(p => p.pane === f.pane);
      if (at && !at.terminal && at.mod === "my-files") this.tab = f.tab;
    }
    const now = location(this.tab, this.openedAt);
    if (now) this.lastLoc = now;
    const loc = now ?? this.lastLoc;
    if (loc) {
      const next = keyOf(loc);
      this.want = next;
      if (next !== this.context?.key) this.refresh(cx, loc);
    }
    const t = theme();
    const rows = this.flat ??= this.flatten();
    const message = this.error || (this.loading ? "Loading files…" : this.root ? "No files" : "No folder");
    const listId = `files-tree-${this.uid}`;
    // 原生分栏按实例保留拖动后的宽度，重绘和切换标签不会重置。
    return h_resizable(`files-${this.uid}`).size_full().min_h(0).min_w(0).overflow_hidden().bg(t.surface).text_color(t.foreground).text_size(13)
      // Left: the tree stays visible while a file is open, so a preview never
      // hides the way back. Its own header carries the folder name.
      .child(resizable_panel().size(220).size_range(160).child(v_flex().id(`files-tree-${this.uid}`).size_full().min_w(0).min_h(0).p(6).gap(2)
        .child(div().px(8).py(4).text_size(11).text_color(t.dim).truncate().child(this.root?.split(/[\\/]/).pop() ?? ""))
        .when(rows.length > 0, tree => tree.child(v_flex().relative().flex_1().min_h(0)
          .child(v_virtual_list(listId, rows.length, 28, (i) => rows[i].path,
            (range) => rows.slice(range.start, range.end).map((r) => this.fileRow(r, t)))
            .on_item_click((path, cx) => {
              const row = rows.find((r) => r.path === path);
              if (!row) return;
              if (row.dir) this.toggle(path, cx);
              // A second click on the open file goes back to the empty preview.
              else if (this.file === path) { this.show(null, cx); cx.notify(); }
              else this.show(path, cx);
            })
            .size_full())
          .child(Scrollbar.vertical(listId).absolute().inset_0())))
        .when(Boolean(this.error) || !this.entries.get("")?.length, el => el.child(div().p(8).text_size(12).text_color(t.dim).child(message)))
        .when(this.limited, el => el.child(div().flex_none().p(8).text_size(11).text_color(t.dim).child("File list limited to 500 entries per folder and 5,000 total")))))
      // Right: the preview, on the terminal's own background, with the file's
      // path above it.
      .child(resizable_panel().size_range(240).child(v_flex().size_full().min_w(0).min_h(0).bg(t.background)
        .when(Boolean(this.file), el => el
          .child(h_flex().h(32).flex_none().px(12).gap(8).items_center()
            .child(div().flex_1().min_w(0).truncate().text_size(11).text_color(t.dim).child(this.file))
            // The file saves itself after a pause; this says where a write stands
            // and saves at once when pressed.
            .when(!this.editable, el => el.child(div().text_size(11).text_color(t.dim).child("Read-only")))
            .when(this.editable, el => el.child(div().text_size(11)
              .text_color(this.saveError ? t.ansi1 : this.dirty || this.saving ? t.muted : t.dim)
              .when(this.dirty, e => e.cursor_pointer().hover(s => s.text_color(t.foreground)))
              .when(Boolean(this.saveError), e => e.tooltip(this.saveError))
              .on_click((_e, cx) => this.save(cx))
              .child(this.saveError ? "Save failed" : this.saving ? "Saving…" : this.dirty ? "Save" : "Saved"))))
          .child(this.code ? Editor.new(this.code).flex_1().min_h(0) : div().p(12).text_color(t.dim).child(this.fileError || "Loading file…")))
        .when(!this.file, el => el.child(div().flex_1().flex().items_center().justify_center().text_size(12).text_color(t.dim).child("Select a file to preview")))));
  }
}
