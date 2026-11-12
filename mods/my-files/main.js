// A lazy file browser for the focused folder, with an editor and a comparison view.
import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, h_resizable, resizable_panel, Editor, EditorState, Scrollbar, v_virtual_list } from "gpui-base";
import { spaces, panes, focused, props, exec, readTextFile, writeTextFile, watchFolder, theme, settings, window, shared, layout } from "herdr";
import { markColor, changeColor, withAlpha, UI, TYPE, SIZE } from "./colors.js";

const MOD = "my-files";
// How often a shown copy refreshes; a hidden one does nothing and catches up
// from `render` when the stack shows it again.
const POLL_MS = 10000;
// A save is several watch events; scan once after the burst instead of once per
// event (each scan starts shell and git processes).
const WATCH_DEBOUNCE_MS = 150;

// A stack draws one child. Herdr gives a block no "is this shown" flag, so walk
// the current layout: only the active child of every stack is visible. Without
// this check a Files or Changes copy behind the terminal scanned the worktree
// every 10 s for a view nobody was looking at.
function shownInLayout(mod) {
  const pending = [layout()];
  while (pending.length) {
    const node = pending.pop();
    if (!node || node.hidden) continue;
    if (node.content?.mod === mod) return true;
    if (node.type === "stack") {
      const child = node.children?.find((c) => c.id === node.active);
      if (child) pending.push(child);
    } else {
      for (const child of node.children ?? []) pending.push(child);
    }
  }
  return false;
}


// 工作区固定视图跟随当前终端目录；旧版独立工具 Tab 保留自己的根目录和展开状态。
function location(tab, openedAt, workspace = false) {
  const space = spaces().find(s => s.active), f = focused();
  if (workspace) {
    const all = panes(), ids = new Set((space?.tabs ?? []).map(t => t.id));
    const at = all.find(p => p.pane === f?.pane && p.terminal);
    const terminal = at ?? all.find(p => p.tab === f?.tab && p.terminal) ?? all.find(p => ids.has(p.tab) && p.terminal);
    const on = f?.pane === null ? (f.terminal?.includes("/") ? f.terminal.split("/")[0] : null) : space?.machine ?? null;
    return { cwd: (f?.pane === null ? f.cwd : terminal?.cwd) || space?.folder, on, space: space?.id };
  }
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
// Changes 传来的仓库根和本视图的根目录可能不同（终端停在仓库子目录）：
// 把绝对路径换算成相对本视图根目录的路径；Windows 的反斜杠一并归一。
function relativePath(root, path) {
  const base = String(root).replace(/\\/g, "/").replace(/\/+$/, "");
  const target = String(path).replace(/\\/g, "/");
  return target.startsWith(base + "/") ? target.slice(base.length + 1) : null;
}
const READ = ["--no-optional-locks", "-c", "core.fsmonitor=false", "-c", "diff.autoRefreshIndex=false"];
const MAX_DIFF = 20000;
// `split("\n")` allocated the whole file again just to count lines.
const countLines = (text) => {
  if (!text) return 0;
  let n = 1;
  for (let i = text.indexOf("\n"); i !== -1; i = text.indexOf("\n", i + 1)) n++;
  return text.endsWith("\n") ? n - 1 : n;
};
// `String#localeCompare` per row: this runtime has no Intl, and the list only
// sorts the entries of one folder at a time.
const compareNames = (a, b) => a.localeCompare(b);

// 对比视图用：每行同时记下旧文件和新文件的行号，左右两栏各自取用。
function diffRows(lines) {
  let old = 0, next = 0;
  return lines.map((line) => {
    const match = /^@@ -(\d+)(?:,\d+)? \+(\d+)/.exec(line);
    if (match) { old = +match[1]; next = +match[2]; return { kind: "@", text: line }; }
    const kind = line[0];
    if (kind === "-") return { kind, oldNumber: old++, text: line.slice(1) || " " };
    if (kind === "+") return { kind, newNumber: next++, text: line.slice(1) || " " };
    if (kind === " ") return { kind, oldNumber: old++, newNumber: next++, text: line.slice(1) || " " };
    return { kind: "", text: line };
  });
}

// 变更前/后并排：上下文行两边相同；连续删除与连续新增按行配对，多出来的
// 一侧留空。hunk 头（整个文件只有一行）不占行。
function diffPairs(rows) {
  const pairs = [];
  let i = 0;
  while (i < rows.length) {
    const row = rows[i];
    if (row.kind === "@") { i++; continue; }
    if (row.kind === "") { pairs.push({ note: row.text }); i++; continue; }
    if (row.kind === " ") { pairs.push({ left: row, right: row }); i++; continue; }
    const del = [], add = [];
    while (i < rows.length && rows[i].kind === "-") del.push(rows[i++]);
    while (i < rows.length && rows[i].kind === "+") add.push(rows[i++]);
    for (let k = 0; k < Math.max(del.length, add.length); k++) pairs.push({ left: del[k] ?? null, right: add[k] ?? null });
  }
  return pairs;
}
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
    // Rows currently stored across all folders: the TOTAL cap needs this sum on
    // every folder load, and recomputing it walked the whole tree each time.
    this.total = 0;
    this.lastRefresh = 0;
    this.shownBefore = false;
    this.reload = false;
    this.watchPending = false;
    // 布局中的固定视图跟随终端；旧版工具 Tab 仍使用打开时的目录。
    this.openedAt = props()?.cwd ?? null;
    this.workspace = Boolean(props()?.workspace);
    this.tab = null; this.lastLoc = null;
    // The editor writes back through writeTextFile with the text it read, so a
    // file changed elsewhere rejects instead of being overwritten.
    this.original = null; this.dirty = false; this.saving = false; this.saveError = null;
    this.editable = false; this.saveVersion = 0;
    // 从 Changes 打开的文件可能不在本视图的树根下，预览单独记住它的根。
    this.fileRoot = null; this.lastOpenAt = null;
    // 预览可以切成“变更前/后”并排对比；gitTop 由刷新时的 git 探测填入。
    this.gitTop = null; this.diffMode = false; this.diffFor = null; this.diffPairs = [];
    this.diffError = null; this.diffLoading = false; this.diffSeq = 0;
    // 并排对比：中缝可拖动，左右两栏各自记住水平滚动距离；行号槽固定不动，
    // 所以最长的行也能滚到末尾。compareW 是内容区宽度，拖动时用来换算比例。
    this.splitFrac = 0.5; this.splitDrag = null; this.compareW = 0;
    this.diffX = { left: 0, right: 0 }; this.diffText = { left: 0, right: 0 };
    const f = focused(), at = f?.pane ? panes().find(p => p.pane === f.pane) : null;
    if (!this.workspace && at && !at.terminal && at.mod === "my-files") this.tab = f.tab;
    // Several copies can be open, one per tab: keep their element ids apart so a
    // click or scrollbar in one never lands on another's list.
    this.uid = Math.random().toString(36).slice(2, 7);
    this.refresh(cx);
    cx.timer.every(POLL_MS, cx => this.refresh(cx));
  }

  // A workspace copy is drawn only while its stack shows it; the legacy tool tab
  // is a pane, and `location` already reports null while another tab is in front.
  visible() {
    return !this.workspace || shownInLayout(MOD);
  }

  watch(root, cx) {
    if (this.on || this.watched === root) return;
    this.watched = root;
    const context = this.context;
    cx.spawn(async cx => {
      try {
        while (this.context === context) {
          await watchFolder(root);
          if (this.current(context)) this.refreshSoon(cx);
        }
      }
      catch { if (this.context === context) this.watched = null; }
    });
  }

  // Coalesce the events a save produces into one scan.
  refreshSoon(cx) {
    if (this.watchPending) return;
    this.watchPending = true;
    cx.timer.after(WATCH_DEBOUNCE_MS, cx => {
      this.watchPending = false;
      this.refresh(cx);
    });
  }

  current(context) {
    // `want` is the position the next refresh will load, so an in-flight load
    // stops at the next folder as soon as the place changed. Re-reading
    // `spaces()`/`focused()`/`panes()` here copied three host lists per folder.
    return this.context === context && this.want === context.key;
  }

  // The listing half, so a refresh can run several folders at once.
  async listFolder(path, context) {
    const { on, cwd: root } = context;
    const entries = await directory(path ? `${root}/${path}` : root, on);
    if (!this.current(context) || (path && !this.folders.has(path))) return null;
    return entries;
  }

  // Keep `total` in step instead of summing every folder on each load: a deep
  // tree made that quadratic.
  storeFolder(path, entries) {
    // The folder may have been folded while its listing was out.
    if (path && !this.folders.has(path)) return;
    const old = this.entries.get(path)?.length ?? 0;
    const used = this.total - old;
    const next = entries.slice(0, Math.max(0, Math.min(PER_FOLDER, TOTAL - used)))
      .sort((a, b) => Number(b.dir) - Number(a.dir) || compareNames(a.name, b.name));
    this.entries.set(path, next);
    this.total += next.length - old;
    this.flat = null;
    if (entries.length > PER_FOLDER || used + entries.length > TOTAL) this.limited = true;
  }

  async loadFolder(path, context) {
    const entries = await this.listFolder(path, context);
    if (entries) this.storeFolder(path, entries);
  }

  refresh(cx, loc) {
    // Behind another stack child nothing it loads is on screen. `render` checks
    // `lastRefresh` when the view comes forward, so the catch-up is immediate.
    if (!this.visible()) {
      this.shownBefore = false;
      return;
    }
    // While another tab is in front, keep the folder this copy already shows.
    loc ??= location(this.tab, this.openedAt, this.workspace) ?? this.lastLoc;
    if (!loc) return;
    this.lastLoc = loc;
    const { cwd, on } = loc, next = keyOf(loc);
    this.want = next;
    this.lastRefresh = Date.now();
    if (next !== this.context?.key) {
      if (this.context) this.saved.set(this.context.key, { folders: this.folders, file: this.file, fileRoot: this.fileRoot });
      const saved = this.saved.get(next);
      // 先用旧目录保存尚未落盘的编辑，再切换工作区的根目录。
      this.show(null, cx);
      this.context = { key: next, cwd, on }; this.root = cwd; this.on = on; this.entries = new Map(); this.folders = new Set(saved?.folders);
      this.total = 0;
      this.pending = new Set(); this.marks = {}; this.watched = null; this.error = null; this.limited = false;
      this.loading = false; this.flat = null;
      // 旧目录的仓库根和对比结果都不能带进新目录。
      this.gitTop = null; this.diffFor = null; this.diffPairs = []; this.diffError = null; this.diffLoading = false; this.diffSeq++;
      if (saved?.file) this.show(saved.file, cx, saved.fileRoot);
    }
    if (!cwd || this.loading) {
      // A change arrived while a scan was out: run one more when it finishes.
      if (this.loading) this.reload = true;
      return;
    }
    const context = this.context;
    this.loading = true;
    this.reload = false;
    this.limited = false;
    cx.spawn(async cx => {
      // The git look does not depend on the listings: start it alongside them
      // instead of doing the whole worktree scan after the folders.
      const git = (async () => {
        try {
          const top = await exec("git", ["rev-parse", "--show-toplevel"], { cwd, on }).catch(() => null);
          const root = top?.code === 0 ? top.stdout.trim() : null, found = {};
          if (root) {
            // Writes nothing under .git (index lock, fsmonitor cookie): the folder watch would refresh again.
            const status = await exec("git", ["--no-optional-locks", "-c", "core.fsmonitor=false", "status", "--porcelain=v1", "-z", "--no-renames", "--untracked-files=all"], { cwd, on }).catch(() => null);
            if (status?.code === 0) for (const entry of status.stdout.split("\0").filter(Boolean).slice(0, TOTAL)) {
              const xy = entry.slice(0, 2);
              found[`${root}/${entry.slice(3)}`] = xy === "??" || xy.includes("A") ? "A" : xy.includes("U") ? "U" : xy.includes("D") ? "D" : "M";
            }
          }
          return { found, root };
        } catch { return { found: {}, root: null }; }
      })();
      try {
        // The expanded folders are independent reads: four shells at a time
        // instead of one after another (a deep tree was latency-bound).
        const paths = ["", ...this.folders];
        const listed = new Map();
        let at = 0;
        const worker = async () => {
          while (at < paths.length) {
            const path = paths[at++];
            if (!this.current(context)) return;
            const entries = await this.listFolder(path, context);
            if (entries) listed.set(path, entries);
          }
        };
        await Promise.all(Array.from({ length: Math.min(4, paths.length) }, worker));
        if (!this.current(context)) return;
        // Store in tree order so the row cap and the tree do not depend on
        // which listing happened to finish first.
        for (const path of paths) {
          const entries = listed.get(path);
          if (entries) this.storeFolder(path, entries);
        }
        const look = await git;
        if (!this.current(context)) return;
        this.marks = look.found; this.gitTop = look.root; this.flat = null; this.error = null; this.watch(cwd, cx);
        // 对比模式在等仓库根：拿到了就补上这一份。
        if (this.diffMode && this.file && this.diffFor !== this.file) this.loadDiff(cx);
      } catch (e) { if (this.current(context)) this.error = String(e); }
      finally {
        if (this.context === context) this.loading = false;
        cx.notify();
        // The watch fired while this scan was out; take one more look.
        if (this.reload) {
          this.reload = false;
          this.refresh(cx);
        }
      }
    });
  }

  toggle(path, cx) {
    if (this.folders.has(path)) {
      for (const folder of [...this.folders]) if (folder === path || folder.startsWith(path + "/")) {
        this.folders.delete(folder);
        this.total -= this.entries.get(folder)?.length ?? 0;
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
    const root = this.fileRoot ?? this.root, on = this.on, context = this.context;
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

  show(path, cx, from) {
    // Switching files must not drop an edit sitting in the auto-save window.
    if (this.dirty && cx) this.save(cx);
    this.code?.release(); this.code = null; this.file = path; this.fileError = null;
    // `from` is the repository root for a file opened from Changes that sits
    // outside this tree; a normal pick reads from the tree's own root.
    this.fileRoot = path ? (from ?? this.root) : null;
    this.original = null; this.dirty = false; this.saving = false; this.saveError = null; this.editable = false;
    // 对比结果属于上一个文件；切换后清空，打开模式下再读这一份。
    this.diffFor = null; this.diffPairs = []; this.diffError = null; this.diffLoading = false;
    this.diffX = { left: 0, right: 0 }; this.diffText = { left: 0, right: 0 };
    if (!path || !cx) return;
    if (this.diffMode && this.gitTop) this.loadDiff(cx);
    const context = this.context, root = this.fileRoot, on = this.on;
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

  // 当前文件在仓库里的相对路径；不在本视图所属的仓库里时为空。
  repoPath() {
    if (!this.gitTop || !this.file) return null;
    return relativePath(this.gitTop, `${this.fileRoot ?? this.root}/${this.file}`);
  }

  toggleDiff(cx) {
    this.diffMode = !this.diffMode;
    this.diffFor = null; this.diffPairs = []; this.diffError = null; this.diffLoading = false;
    if (this.diffMode) this.loadDiff(cx);
    cx.notify();
  }

  // 变更前/后的并排对比：整文件上下文，再按左右两栏配对。
  loadDiff(cx) {
    const path = this.file, root = this.fileRoot ?? this.root;
    if (!path || !root || !this.gitTop) return;
    const rel = relativePath(this.gitTop, `${root}/${path}`);
    const cwd = this.gitTop, on = this.on, context = this.context, seq = ++this.diffSeq;
    this.diffFor = path; this.diffPairs = []; this.diffError = null; this.diffLoading = true;
    this.diffX = { left: 0, right: 0 }; this.diffText = { left: 0, right: 0 };
    if (!rel) { this.diffLoading = false; this.diffError = "This file is outside the repository"; return; }
    cx.spawn(async cx => {
      let lines = null, error = null;
      try {
        if (this.marks[`${cwd}/${rel}`] === "A") {
          const text = await readTextFile(`${root}/${path}`, { on }).catch(() => null);
          if (text === null) error = "Cannot read this file";
          else if (text.includes("\0")) error = "Binary file · no text comparison";
          else {
            lines = [`@@ -0,0 +1,${countLines(text)} @@`, ...text.slice(0, 400000).replace(/\n$/, "").split("\n").map(l => `+${l}`)];
            if (text.length > 400000) lines.push("… file truncated");
          }
        } else {
          const head = await exec("git", ["rev-parse", "--verify", "HEAD"], { cwd, on }).catch(() => null);
          const r = await exec("git", [...READ, "diff", ...(head?.code === 0 ? ["HEAD"] : []), "-U1000000", "--no-ext-diff", "--no-textconv", "--no-color", "--", rel], { cwd, on });
          if (r.code !== 0) throw new Error(r.stderr);
          const all = r.stdout.replace(/\n$/, "").split("\n"), first = all.findIndex(l => l.startsWith("@@"));
          if (first < 0) error = r.stdout.includes("Binary files") ? "Binary file changed" : "No uncommitted changes in this file";
          else lines = all.slice(first);
        }
      } catch (e) { error = String(e); }
      if (this.context !== context || this.diffFor !== path || this.diffSeq !== seq || !this.diffMode) return;
      this.diffLoading = false;
      if (error) { this.diffError = error; this.diffPairs = []; }
      else {
        const shown = lines.slice(0, MAX_DIFF).map(line => line.length > 4000 ? line.slice(0, 4000) + "… (line truncated)" : line);
        this.diffPairs = diffPairs(diffRows(shown));
        this.measureDiff();
        if (lines.length > MAX_DIFF) this.diffPairs.push({ note: `… comparison truncated at ${MAX_DIFF} lines` });
      }
      cx.notify();
    });
  }

  // 并排对比的一行：左侧是旧文件，右侧是新文件；变化的半边用底色和符号标出。
  compareRow(pair, t) {
    if (pair.note) return div().w_full().h(SIZE.diffRow).flex_none().px(12).truncate().text_color(t.muted).child(pair.note);
    return h_flex().w_full().h(SIZE.diffRow).flex_none()
      .child(this.compareCell(pair.left, pair.left?.kind === "-" ? withAlpha(t.ansi1, UI.diff) : null, pair.left?.oldNumber, "left", t, `${this.splitFrac * 100}%`))
      .child(div().w(1).flex_none().bg(withAlpha(t.foreground, UI.field)))
      .child(this.compareCell(pair.right, pair.right?.kind === "+" ? withAlpha(t.ansi2, UI.diff) : null, pair.right?.newNumber, "right", t, null));
  }

  // 一侧的格子：行号和 +/- 槽固定，只有文字按该侧自己的水平偏移滚动并被裁剪。
  // 文字不换行也不省略，长行滚到头就能看到末尾。
  compareCell(row, tint, number, side, t, width) {
    const x = Math.min(this.diffX[side], this.diffMaxX(side));
    return h_flex().h_full().min_w(0).items_center().gap(6).pl(6).pr(6)
      .when(Boolean(row) && Boolean(tint), (el) => el.bg(tint))
      .when(Boolean(width), (el) => el.w(width).flex_none())
      .when(!width, (el) => el.flex_1())
      .child(div().w(36).flex_none().text_right().text_size(TYPE.meta).text_color(t.dim).child(row && number !== undefined ? String(number) : ""))
      .child(div().w(8).flex_none().text_size(TYPE.meta).text_color(row?.kind === "-" ? t.ansi1 : row?.kind === "+" ? t.ansi2 : t.dim).child(row?.kind === "-" ? "−" : row?.kind === "+" ? "+" : ""))
      .child(div().flex_1().min_w(0).h_full().overflow_hidden()
        .child(div().w(this.diffText[side]).h_full().ml(0 - x).whitespace_nowrap().flex().items_center().child(row?.text ?? "")));
  }

  // 每侧最长一行的像素宽度：水平滚动能走多远由它和面板宽度决定。
  // 制表符按四个字符、全角字符按两个字符估宽，比按字符串长度更接近实际排版。
  measureDiff() {
    const charW = TYPE.small * 0.65;
    // 东亚宽字符、全角符号和 emoji 占两格。
    const wide = (c) => c > 0xffff
      || (c >= 0x1100 && c <= 0x115f) || (c >= 0x2e80 && c <= 0xa4cf)
      || (c >= 0xac00 && c <= 0xd7a3) || (c >= 0xf900 && c <= 0xfaff)
      || (c >= 0xfe30 && c <= 0xfe6f) || (c >= 0xff00 && c <= 0xff60)
      || (c >= 0xffe0 && c <= 0xffe6);
    // 按码点走，不 `for…of`：每行创建字符对象的分配在 2 万行的对比里很贵。
    const span = (text) => {
      let n = 0;
      for (let i = 0; i < text.length; i++) {
        const code = text.charCodeAt(i);
        if (code === 9) n += 4;
        else if (code < 0x80) n += 1;
        else {
          const cp = code >= 0xd800 && code <= 0xdbff ? text.codePointAt(i) : code;
          if (cp > 0xffff) i++;
          n += wide(cp) ? 2 : 1;
        }
      }
      return n;
    };
    let left = 0, right = 0;
    for (const pair of this.diffPairs) {
      if (pair.note) continue;
      left = Math.max(left, span(pair.left?.text ?? ""));
      right = Math.max(right, span(pair.right?.text ?? ""));
    }
    this.diffText = { left: Math.ceil(left * charW), right: Math.ceil(right * charW) };
  }

  // 一行文字左侧固定占 68 px：左右内边距 12、行号 36、符号 8、两道间距 12。
  diffMaxX(side) {
    if (!this.compareW) return 0;
    const left = this.compareW * this.splitFrac;
    const width = side === "left" ? left : this.compareW - left - 1;
    return Math.max(0, this.diffText[side] - Math.max(40, width - 68));
  }

  // 水平滚动：指针在哪一栏就滚哪一栏；Shift+滚轮也当作水平滚动。
  // 方向与宿主一致：正的 delta 让内容向右回退。
  scrollDiff(event, cx) {
    let delta = event.delta?.x ?? 0;
    if (!delta && event.modifiers?.shift) delta = event.delta?.y ?? 0;
    if (!delta) return;
    const width = event.bounds?.width || this.compareW;
    if (!width) return;
    const side = (event.local_position?.x ?? 0) < width * this.splitFrac ? "left" : "right";
    const at = Math.max(0, Math.min(this.diffX[side] - delta, this.diffMaxX(side)));
    if (at === this.diffX[side]) return;
    this.diffX[side] = at;
    cx.stop_propagation();
    cx.notify();
  }

  // 拖动中缝：从按下处起算位移，按内容区宽度换成比例；两边都留出可读宽度。
  startSplit(event, cx) {
    this.splitDrag = { x: event.position.x, frac: this.splitFrac };
    cx.stop_propagation();
    cx.notify();
  }

  dragSplit(event, cx) {
    const drag = this.splitDrag;
    if (!drag || !this.compareW) return;
    const min = Math.min(0.4, 140 / this.compareW);
    const frac = Math.min(1 - min, Math.max(min, drag.frac + (event.position.x - drag.x) / this.compareW));
    if (Math.abs(frac - this.splitFrac) < 0.002) return;
    this.splitFrac = frac;
    // 变宽的一侧可能让另一侧原来的滚动距离超出新上限。
    this.diffX.left = Math.min(this.diffX.left, this.diffMaxX("left"));
    this.diffX.right = Math.min(this.diffX.right, this.diffMaxX("right"));
    cx.stop_propagation();
    cx.notify();
  }

  endSplit(cx) {
    if (!this.splitDrag) return;
    this.splitDrag = null;
    cx.notify();
  }

  // Changes 把要打开的文件放进 shared：只有工作区固定视图响应，旧版工具 Tab
  // 继续使用自己的目录和选中文件。
  takeOpenRequest(cx) {
    if (!this.workspace) return;
    const req = shared("files.open");
    if (!req || typeof req.at !== "number" || req.at === this.lastOpenAt) return;
    this.lastOpenAt = req.at;
    // 应用重启后旧请求还留在 shared 里：过期的请求不再打开文件。
    if (Date.now() - req.at > 30000) return;
    cx.timer.after(0, (cx) => this.openFrom(req, cx));
  }

  openFrom(req, cx, tries = 0) {
    if (!req?.path || !req?.root) return;
    if (!this.root) {
      if (tries < 10) cx.timer.after(100, (cx) => this.openFrom(req, cx, tries + 1));
      return;
    }
    const rel = relativePath(this.root, `${req.root}/${req.path}`);
    if (rel) {
      // 展开父目录，让文件在树里也有位置；目录内容由各自的加载任务补上。
      const parts = rel.split("/");
      parts.pop();
      let prefix = "";
      for (const part of parts) {
        prefix = prefix ? `${prefix}/${part}` : part;
        if (!this.folders.has(prefix)) this.toggle(prefix, cx);
      }
      this.show(rel, cx);
    } else {
      // 终端不在这个仓库的根下：不改变树根，只按仓库根预览这个文件。
      this.show(req.path, cx, req.root);
    }
    cx.notify();
  }

  // A tab closed while the auto-save timer is still pending still gets its edit.
  async close(cx) {
    const path = this.file, code = this.code;
    if (!this.dirty || !path || !code) return;
    try { await writeTextFile(`${this.fileRoot ?? this.root}/${path}`, code.value(), this.original); } catch { }
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
  fileRow(r, t, accent) {
    const selected = this.file === r.path && !r.dir;
    const markTint = changeColor(r.mark, t);
    return h_flex().h(SIZE.listRow).flex_none().pl(6 + r.depth * 14).pr(8).gap(7).items_center().rounded(SIZE.radius).cursor_pointer()
      .when(selected, el => el.bg(withAlpha(t.foreground, UI.active)))
      .when(!selected, el => el.hover(s => s.bg(withAlpha(t.foreground, UI.hover))))
      .child(r.dir ? svg(`mods/my-files/chevron-${r.open ? "down" : "right"}.svg`).size(10).flex_none().text_color(t.dim) : div().w(10).flex_none())
      .child(svg(`mods/my-files/${r.dir ? "folder" : "file"}.svg`).size(13).flex_none().text_color(selected ? accent : t.muted))
      .child(div().flex_1().min_w(0).truncate().text_size(TYPE.small).font_weight(selected ? 600 : 400)
        .text_color(selected ? t.foreground : t.muted).child(r.name))
      .when(Boolean(r.mark), el => el.child(div().w(10).flex_none().text_size(TYPE.label).font_weight(600).text_color(markTint).child(r.mark)));
  }

  render(cx) {
    // The first render may be the one where this copy becomes the focused pane;
    // remember its tab then, so later tab switches leave its state alone.
    const f = focused();
    if (this.tab === null && f?.pane) {
      const at = panes().find(p => p.pane === f.pane);
      if (!this.workspace && at && !at.terminal && at.mod === "my-files") this.tab = f.tab;
    }
    // Nothing read from the host is drawn while another stack child is in
    // front; reading it there only copied lists and started no useful work.
    const shown = this.visible();
    const now = shown ? location(this.tab, this.openedAt, this.workspace) : null;
    if (now) this.lastLoc = now;
    const loc = now ?? this.lastLoc;
    if (loc) {
      const next = keyOf(loc);
      this.want = next;
      const stale = Date.now() - this.lastRefresh >= (this.shownBefore ? POLL_MS : 1000);
      if (next !== this.context?.key) this.refresh(cx, loc);
      // Hidden while its timer ran (or just came forward): catch up at once,
      // then let the 10 s timer keep it fresh.
      else if (shown && stale) this.refresh(cx, loc);
    }
    this.shownBefore = shown;
    // 先只登记请求，等这一帧画完再打开文件，避免在 render 里改宿主状态。
    this.takeOpenRequest(cx);
    const t = theme();
    const rows = this.flat ??= this.flatten();
    const message = this.error || (this.loading ? "Loading files…" : this.root ? "No files" : "No folder");
    const listId = `files-tree-${this.uid}`, compareId = `files-compare-${this.uid}-${this.diffSeq}`;
    const repo = this.repoPath();
    // The active space's colour runs through the selected file's icon, the
    // same "selection by mark" language as the sidebar rows and tabs (the
    // location already knows the space, so no second spaces() copy is needed).
    const accentRaw = markColor((shared("space.colors") ?? {})[loc?.space], t);
    const accent = accentRaw ? accentRaw.slice(0, 7) : (t.accent ?? t.muted);
    // The file's path as a quiet directory and a strong file name.
    const parts = this.file ? this.file.split("/") : [];
    const leaf = parts.pop() ?? "";
    const dir = parts.length ? parts.join("/") + "/" : "";
    const segment = (id, label, on, enabled, tip, action) => h_flex().id(id).h(SIZE.control).flex_none().px(9).rounded(5).items_center()
      .text_size(TYPE.meta).font_weight(600)
      .when(on, (el) => el.bg(withAlpha(t.foreground, UI.active)).text_color(t.foreground))
      .when(!on, (el) => el.text_color(enabled ? t.muted : t.dim))
      .when(enabled && !on, (el) => el.cursor_pointer().hover((s) => s.text_color(t.foreground)))
      .when(enabled, (el) => el.tooltip(tip).on_click(action))
      .child(label);

    const treePanel = resizable_panel().size(260).size_range(200).child(
      v_flex().size_full().min_w(0).min_h(0)
        .child(h_flex().h(SIZE.header).flex_none().px(14).gap(8).items_center()
          .border_b(1).border_color(withAlpha(t.foreground, UI.lineSoft))
          .child(svg("mods/my-files/folder.svg").size(14).flex_none().text_color(t.muted))
          .child(div().flex_1().min_w(0).truncate().text_size(TYPE.small).font_weight(600).text_color(t.foreground).tooltip(this.root ?? "")
            .child(this.root?.split(/[\\/]/).pop() ?? "")))
        .child(v_flex().id(`files-tree-${this.uid}`).p(SIZE.inset).gap(2).flex_1().min_w(0).min_h(0)
          .when(rows.length > 0, (tree) => tree.child(v_flex().relative().flex_1().min_h(0)
            .child(v_virtual_list(listId, rows.length, SIZE.listRow, (i) => rows[i].path,
              (range) => rows.slice(range.start, range.end).map((r) => this.fileRow(r, t, accent)))
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
          .when(Boolean(this.error) || !this.entries.get("")?.length, (el) => el.child(
            div().px(8).py(10).text_size(TYPE.meta).line_height("15px").text_color(t.dim).child(message)))
          .when(this.limited, (el) => el.child(
            div().flex_none().px(8).py(8).text_size(TYPE.label).line_height("13px").text_color(t.dim).child("Limit: 500 per folder · 5,000 total"))))
    );

    const previewHeader = h_flex().h(SIZE.header).flex_none().px(12).gap(10).items_center()
      .border_b(1).border_color(withAlpha(t.foreground, UI.lineSoft))
      .child(svg("mods/my-files/file.svg").size(13).flex_none().text_color(accent))
      .child(h_flex().flex_1().min_w(0).items_center()
        .when(Boolean(dir), (el) => el.child(div().min_w(0).truncate().text_size(TYPE.meta).text_color(t.muted).child(dir)))
        .child(div().min_w(0).max_w(260).truncate().text_size(TYPE.small).font_weight(600).text_color(t.foreground).tooltip(this.file ?? "").child(leaf)))
      .child(h_flex().h(SIZE.button).flex_none().p(2).gap(2).rounded(7).items_center().bg(withAlpha(t.foreground, UI.subtle))
        .child(segment(`files-edit-${this.uid}`, "Edit", !this.diffMode, true, "Edit the file", (_e, cx) => { if (this.diffMode) this.toggleDiff(cx); }))
        .child(segment(`files-diff-${this.uid}`, "Diff", this.diffMode, Boolean(repo || this.diffMode), repo ? "Compare with the last commit" : "Not in a git repository", (_e, cx) => { if (repo) this.toggleDiff(cx); })))
      // The file saves itself after a pause; this says where a write stands
      // and saves at once when pressed.
      .when(!this.editable, (el) => el.child(div().w(76).flex_none().text_size(TYPE.meta).text_color(t.muted).child("Read-only")))
      .when(this.editable, (el) => el.child(h_flex().w(76).flex_none().gap(5).items_center().text_size(TYPE.meta)
        .text_color(this.saveError ? t.ansi1 : t.muted)
        .when(this.dirty, (e) => e.cursor_pointer().hover((s) => s.text_color(t.foreground)))
        .when(Boolean(this.saveError), (e) => e.tooltip(this.saveError))
        .on_click((_e, cx) => this.save(cx))
        .child(div().size(4).flex_none().rounded_full().bg(this.saveError ? t.ansi1 : this.dirty || this.saving ? t.working : withAlpha(t.ansi2, UI.dotSoft)))
        .child(this.saveError ? "Save failed" : this.saving ? "Saving…" : this.dirty ? "Save" : "Saved")));

    // 表头也按中缝分成两段，拖动后仍与左右两栏对齐。
    const compareHeader = h_flex().h(28).flex_none().text_size(TYPE.label).font_weight(600).text_color(t.muted)
      .bg(withAlpha(t.foreground, UI.subtle)).border_b(1).border_color(withAlpha(t.foreground, UI.lineSoft))
      .child(div().w(`${this.splitFrac * 100}%`).flex_none().pl(12).child("BEFORE"))
      .child(div().w(1).flex_none().bg(withAlpha(t.foreground, UI.field)))
      .child(div().flex_1().pl(8).child("AFTER"));

    const compareBody = div().id(`files-compare-body-${this.uid}`).relative().flex_1().min_h(0)
      .font_family(settings().font_family ?? "JetBrains Mono").text_size(TYPE.small)
      // 内容区宽度随预览面板变化；水平滚动的上限和中缝拖动都按它换算。
      .on_size_change((size, cx) => {
        if (Math.abs(size.width - this.compareW) < 1) return;
        this.compareW = size.width;
        // 面板变窄后原来的水平滚动距离可能超出新的上限，收回来看得见的位置。
        this.diffX.left = Math.min(this.diffX.left, this.diffMaxX("left"));
        this.diffX.right = Math.min(this.diffX.right, this.diffMaxX("right"));
        cx.notify();
      })
      .on_scroll_wheel((event, cx) => this.scrollDiff(event, cx))
      .on_mouse_move((event, cx) => this.dragSplit(event, cx))
      .on_mouse_up("left", (_event, cx) => this.endSplit(cx))
      .on_mouse_down_out((_event, cx) => this.endSplit(cx))
      .child(v_virtual_list(compareId, this.diffPairs.length, SIZE.diffRow, (i) => String(i),
        (range) => this.diffPairs.slice(range.start, range.end).map((pair) => this.compareRow(pair, t))).size_full())
      .child(Scrollbar.vertical(compareId).absolute().inset_0())
      // 中缝的抓取带：7 px 宽，盖在 1 px 分割线上，悬停和拖动时给出提示。
      .child(div().absolute().top(0).bottom(0).left(`${this.splitFrac * 100}%`).ml(-3).w(7)
        .cursor_col_resize()
        .when(Boolean(this.splitDrag), (el) => el.bg(withAlpha(t.foreground, UI.active)))
        .when(!this.splitDrag, (el) => el.hover((s) => s.bg(withAlpha(t.foreground, UI.hover))))
        .on_mouse_down("left", (event, cx) => this.startSplit(event, cx))
        .on_mouse_move((event, cx) => this.dragSplit(event, cx))
        .on_mouse_up("left", (_event, cx) => this.endSplit(cx)))
      // 拖动时盖住整个内容区，指针离开中缝也能继续拖动，直到松开左键。
      .when(Boolean(this.splitDrag), (el) => el.child(
        div().absolute().inset_0().cursor_col_resize()
          .on_mouse_down("left", (_event, cx) => this.endSplit(cx))
          .on_mouse_move((event, cx) => this.dragSplit(event, cx))
          .on_mouse_up("left", (_event, cx) => this.endSplit(cx))
          .on_mouse_down_out((_event, cx) => this.endSplit(cx))));

    const diffPane = this.diffMode
      ? v_flex().flex_1().min_w(0).min_h(0)
        .when(this.diffLoading, (el) => el.child(div().p(12).text_size(TYPE.meta).text_color(t.dim).child("Loading comparison…")))
        .when(!this.diffLoading && Boolean(this.diffError), (el) => el.child(div().p(12).text_size(TYPE.meta).text_color(t.dim).child(this.diffError)))
        .when(!this.diffLoading && !this.diffError && this.diffPairs.length > 0, (el) => el.child(compareHeader).child(compareBody))
        .when(!this.diffLoading && !this.diffError && this.diffPairs.length === 0, (el) => el.child(
          div().p(12).text_size(TYPE.meta).text_color(t.dim).child(this.gitTop ? "No differences" : "Not in a git repository")))
      : (this.code ? Editor.new(this.code).flex_1().min_h(0) : div().p(12).text_size(TYPE.meta).text_color(t.dim).child(this.fileError || "Loading file…"));

    const emptyPreview = v_flex().flex_1().min_w(0).p(24).items_center().justify_center().gap(8)
      .child(h_flex().size(40).mb(4).flex_none().items_center().justify_center().rounded(12).bg(withAlpha(t.foreground, UI.subtle))
        .child(svg("mods/my-files/file.svg").size(18).text_color(t.muted)))
      .child(div().text_size(TYPE.body).font_weight(500).text_color(t.foreground).child("Select a file"))
      .child(div().text_size(TYPE.meta).text_center().text_color(t.muted).child("Choose a file to preview, edit or compare."));

    const previewPanel = resizable_panel().size_range(240).child(
      v_flex().size_full().min_w(0).min_h(0).bg(t.background)
        .border_l(1).border_color(withAlpha(t.foreground, UI.line))
        .when(Boolean(this.file), (el) => el.child(previewHeader).child(diffPane))
        .when(!this.file, (el) => el.child(emptyPreview))
    );

    // 原生分栏按实例保留拖动后的宽度，重绘和切换标签不会重置。
    return h_resizable(`files-${this.uid}`).size_full().min_h(0).min_w(0).overflow_hidden().bg(t.surface).text_color(t.foreground).text_size(13)
      .child(treePanel)
      .child(previewPanel);
  }
}
