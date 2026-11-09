// A lazy file browser for the focused pane's folder, with bounded read-only previews.
import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, Editor, EditorState, Scrollbar, v_virtual_list } from "gpui-base";
import { spaces, panes, focused, exec, readTextFile, watchFolder, theme, settings, window, layout } from "herdr";

// Both nodes in one walk: `layout()` is the whole layout document.
function findMany(root, ids) {
  const wanted = new Set(ids), found = {};
  const stack = [root];
  while (stack.length) {
    const node = stack.pop();
    if (!node) continue;
    if (wanted.has(node.id)) found[node.id] = node;
    for (const child of node.children ?? []) stack.push(child);
  }
  return found;
}

// The panel is hidden by default; a hidden panel does not need a git status or
// a directory listing every ten seconds.
function shown() {
  const nodes = findMany(layout(), ["panel", "panel-body"]);
  return Boolean(nodes.panel && !nodes.panel.hidden && nodes["panel-body"]?.active === "files");
}

function location() {
  const space = spaces().find(s => s.active), f = focused();
  const pane = f?.pane ? panes().find(p => p.pane === f.pane) : null;
  const on = f?.pane === null ? (f.terminal?.includes("/") ? f.terminal.split("/")[0] : null) : space?.machine ?? null;
  return { cwd: pane?.cwd || f?.cwd || space?.folder, on, space: space?.id };
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
    this.stale = false;
    this.wake(cx);
    cx.timer.every(10000, cx => this.wake(cx));
  }

  // Hidden, there is nothing to keep fresh: mark it and refresh when it is
  // shown again. This saves a listing plus a git status every ten seconds in a
  // layout whose panel starts closed.
  wake(cx, loc) {
    if (shown()) this.refresh(cx, loc);
    else this.stale = true;
  }

  watch(root, cx) {
    if (this.on || this.watched === root) return;
    this.watched = root;
    const context = this.context;
    cx.spawn(async cx => {
      try {
        while (this.context === context) {
          await watchFolder(root);
          // A file saved while the panel is closed is not worth a listing and a
          // git status; the next render after it opens refreshes once.
          if (this.current(context)) this.wake(cx);
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

  refresh(cx, loc = location()) {
    const { cwd, on } = loc, next = keyOf(loc);
    this.want = next;
    if (next !== this.context?.key) {
      if (this.context) this.saved.set(this.context.key, { folders: this.folders, file: this.file });
      const saved = this.saved.get(next);
      this.context = { key: next, cwd, on }; this.root = cwd; this.on = on; this.entries = new Map(); this.folders = new Set(saved?.folders);
      this.pending = new Set(); this.marks = {}; this.show(null); this.watched = null; this.error = null; this.limited = false;
      this.loading = false; this.flat = null;
      if (saved?.file) this.show(saved.file, cx);
    }
    this.stale = false;
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

  show(path, cx) {
    this.code?.release(); this.code = null; this.file = path; this.fileError = null;
    if (!path || !cx) return;
    const context = this.context, root = this.root, on = this.on;
    cx.spawn(async cx => {
      try {
        const text = await readTextFile(`${root}/${path}`, { on });
        if (this.file !== path || !this.current(context)) return;
        if (text === null) { this.fileError = "This file is no longer available"; return; }
        if (text.includes("\0")) { this.fileError = "Binary file · no text preview"; return; }
        const t = theme(), ext = path.includes(".") ? path.split(".").pop() : "txt";
        this.code = EditorState.new({ language: LANG[ext] ?? ext, readonly: true,
          value: text.length > 400000 ? text.slice(0, 400000) + "\n… (file truncated)" : text,
          font_family: settings().font_family, font_size: 12,
          syntax: { keyword: t.ansi5, string: t.ansi2, comment: t.dim, function: t.ansi4, type: t.ansi3, number: t.ansi1, constant: t.ansi6 } });
      } catch { if (this.file === path && this.current(context)) this.fileError = "Cannot preview this file (binary, too large, or unreadable)"; }
      finally { cx.notify(); }
    });
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
    return h_flex().h(28).flex_none().pl(8 + r.depth * 18).pr(8).gap(7).items_center().cursor_pointer().hover(s => s.bg(t.hover))
      .child(r.dir ? svg(`mods/my-files/chevron-${r.open ? "down" : "right"}.svg`).size(12).flex_none().text_color(t.dim) : div().w(12).flex_none())
      .child(svg(`mods/my-files/${r.dir ? "folder" : "file"}.svg`).size(14).flex_none().text_color(t.muted))
      .child(div().flex_1().min_w(0).truncate().child(r.name))
      .when(Boolean(r.mark), el => el.child(div().text_size(11).text_color(r.mark === "A" ? t.ansi2 : r.mark === "D" || r.mark === "U" ? t.ansi1 : t.blocked).child(r.mark)));
  }

  render(cx) {
    const loc = location();
    const next = keyOf(loc);
    this.want = next;
    if (next !== this.context?.key || this.stale) {
      // Following every pane switch while the panel is closed is a listing and
      // a git status nobody sees; mark it and load once when it opens.
      this.wake(cx, loc);
    }
    const t = theme();
    const rows = this.file ? [] : (this.flat ??= this.flatten());
    const message = this.error || (this.loading ? "Loading files…" : this.root ? "No files" : "No folder");
    return v_flex().id("files").size_full().min_h(0).overflow_hidden().bg(t.chrome).text_color(t.foreground).text_size(13)
      .child(h_flex().h(42).flex_none().px(14).gap(8).items_center()
        .when(Boolean(this.file), el => el.child(div().id("files-back").w(20).cursor_pointer().text_color(t.muted).on_click((_e, cx) => { this.show(null); cx.notify(); }).child("←")))
        .child(div().font_semibold().child("Files"))
        .child(div().flex_1().min_w(0).truncate().text_right().text_size(12).text_color(t.dim).child(this.file ?? this.root?.split(/[\\/]/).pop() ?? "")))
      .when(!this.file, el => el.child(v_flex().id("files-tree").flex_1().min_h(0).p(6)
        .when(rows.length > 0, tree => tree.child(v_flex().relative().flex_1().min_h(0)
          .child(v_virtual_list("files-tree-list", rows.length, 28, (i) => rows[i].path,
            (range) => rows.slice(range.start, range.end).map((r) => this.fileRow(r, t)))
            .on_item_click((path, cx) => {
              const row = rows.find((r) => r.path === path);
              if (row) row.dir ? this.toggle(path, cx) : this.show(path, cx);
            })
            .size_full())
          .child(Scrollbar.vertical("files-tree-list").absolute().inset_0())))
        .when(Boolean(this.error) || !this.entries.get("")?.length, el => el.child(div().p(8).text_size(12).text_color(t.dim).child(message)))
        .when(this.limited, el => el.child(div().flex_none().p(8).text_size(11).text_color(t.dim).child("File list limited to 500 entries per folder and 5,000 total")))))
      .when(Boolean(this.file), el => el.child(this.code ? Editor.new(this.code).flex_1().min_h(0) : div().p(12).text_color(t.dim).child(this.fileError || "Loading file…")));
  }
}
