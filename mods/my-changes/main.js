import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, h_resizable, resizable_panel, InputState, Input, Scrollbar, v_virtual_list, VirtualListScrollHandle } from "gpui-base";
import { spaces, panes, focused, props, exec, readTextFile, watchFolder, theme, settings, run, setShared, shared, layout } from "herdr";
import { markColor, changeColor, withAlpha, UI, TYPE, SIZE } from "./colors.js";

const MOD = "my-changes";
// The scan interval for a shown copy; hidden copies catch up from `render`.
const POLL_MS = 10000;
// A save is several watch events; scan once after the burst.
const WATCH_DEBOUNCE_MS = 150;

// A stack draws one child. Herdr gives a block no "is this shown" flag, so walk
// the current layout: only the active child of every stack is visible. A hidden
// Changes copy used to run git status/diff/for-each-ref every 10 s.
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


// 工作区固定视图跟随当前终端目录；旧版独立工具 Tab 保留自己的根目录和选中文件。
function location(tab, openedAt, workspace = false) {
  const space = spaces().find((s) => s.active), f = focused();
  if (workspace) {
    const all = panes(), ids = new Set((space?.tabs ?? []).map(t => t.id));
    const at = all.find(p => p.pane === f?.pane && p.terminal);
    const terminal = at ?? all.find(p => p.tab === f?.tab && p.terminal) ?? all.find(p => ids.has(p.tab) && p.terminal);
    const on = f?.pane === null ? (f.terminal?.includes("/") ? f.terminal.split("/")[0] : null) : space?.machine ?? null;
    return { cwd: (f?.pane === null ? f.cwd : terminal?.cwd) || space?.folder, on, space: space?.id };
  }
  if (tab && f?.tab !== tab) return null;
  const at = f?.pane ? panes().find(p => p.pane === f.pane) : null;
  // Clicking the Changes pane gives it the keyboard, and a mod pane has no
  // folder: stay on the folder the tab was opened in.
  if (at && !at.terminal) return { cwd: openedAt || space?.folder, on: space?.machine ?? null, space: space?.id };
  // Before this copy has seen its own tab, start on the folder the tab was opened
  // on rather than on whichever terminal happens to be focused elsewhere.
  if (!tab && openedAt) return { cwd: openedAt, on: space?.machine ?? null, space: space?.id };
  const on = f?.pane === null ? (f.terminal?.includes("/") ? f.terminal.split("/")[0] : null) : space?.machine ?? null;
  return { cwd: at?.cwd || f?.cwd || space?.folder, on, space: space?.id };
}
const keyOf = (loc) => JSON.stringify(loc);
// Reads write nothing under .git (no index refresh or lock, no fsmonitor cookie):
// the folder watch would see it, and every refresh would start the next one.
const READ = ["--no-optional-locks", "-c", "core.fsmonitor=false", "-c", "diff.autoRefreshIndex=false"];
// `split("\n")` allocated the whole file again just to count lines.
const countLines = (text) => {
  if (!text) return 0;
  let n = 1;
  for (let i = text.indexOf("\n"); i !== -1; i = text.indexOf("\n", i + 1)) n++;
  return text.endsWith("\n") ? n - 1 : n;
};

// Numbers each diff line once, so a frame only draws the rows on screen.
function diffRows(lines) {
  let old = 0, next = 0;
  return lines.map((line) => {
    const match = /^@@ -(\d+)(?:,\d+)? \+(\d+)/.exec(line);
    if (match) { old = +match[1]; next = +match[2]; return { kind: "@", text: line }; }
    const kind = line[0];
    if (kind === "-") return { kind, number: old++, text: line.slice(1) || " " };
    if (kind === "+") return { kind, number: next++, text: line.slice(1) || " " };
    if (kind === " ") { old++; return { kind, number: next++, text: line.slice(1) || " " }; }
    return { kind: "", text: line };
  });
}

// 连续的新增/删除行算一个变动块；中间夹着未改动的行就另起一块。
function changeStarts(rows) {
  const starts = [];
  let edited = false;
  for (let i = 0; i < rows.length; i++) {
    const here = rows[i].kind === "+" || rows[i].kind === "-";
    if (here && !edited) starts.push(i);
    edited = here;
  }
  return starts;
}

// `for-each-ref --format=%(refname)%09%(symref)%09%(HEAD)` lines. A symbolic
// ref (origin/HEAD) is an alias, not a branch, so it is left out; `%(HEAD)`
// marks the local branch the checkout is on, which the picker hides because a
// branch cannot be compared with itself. Locals lead, then remotes, each
// alphabetically.
function branchEntries(text) {
  const branches = [];
  for (const line of text.split("\n")) {
    if (!line) continue;
    const [ref, symref, head] = line.split("\t");
    if (!ref || symref) continue;
    const local = ref.startsWith("refs/heads/");
    if (!local && !ref.startsWith("refs/remotes/")) continue;
    // The full ref travels with the label: `main` can also name a tag, and a
    // local `origin/main` can shadow the remote-tracking one.
    branches.push({ name: ref.slice(local ? 11 : 13), ref, local, current: local && head === "*" });
  }
  return branches.sort((a, b) => a.local !== b.local ? (a.local ? -1 : 1) : a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
}

// `git diff --name-status -z` writes `<status>\0<path>\0` (two fields, because
// --no-renames is always on). Only A and D keep a letter of their own.
function branchChanges(text) {
  const entries = text.split("\0"), changes = [];
  for (let i = 0; i + 1 < entries.length; i += 2) {
    const code = entries[i], path = entries[i + 1];
    if (!code || !path) continue;
    const conflict = code === "U" || code === "AA" || code === "DD";
    changes.push({ path, status: conflict ? "U" : code === "A" ? "A" : code === "D" ? "D" : "M" });
  }
  return changes;
}

// `git diff --numstat -z` entries: `<add>\t<del>\t<path>\0`. A binary file
// writes `-` for both counts.
function numstats(text) {
  const stats = {};
  for (const entry of text.split("\0")) {
    const [a, d, ...parts] = entry.split("\t");
    if (!parts.length) continue;
    const path = parts.join("\t");
    stats[path] = { add: Number(a) || 0, del: Number(d) || 0, binary: a === "-" };
  }
  return stats;
}

// A whole-file diff is the whole file as context; the list is virtualized, but
// a pathological file should not become an unbounded frame.
const MAX_ROWS = 20000;

export default class Changes extends View {
  init(_props, cx) {
    this.files = []; this.rows = []; this.changes = []; this.changeAt = -1; this.diffWidth = 0; this.message = ""; this.handle = cx.focus_handle();
    // The handle lets the prev/next buttons move the diff list from code.
    this.scroll = VirtualListScrollHandle.new();
    this.input = InputState.new({ placeholder: "Commit message" });
    this.input.on("change", (_e, cx) => {
      const hadMessage = Boolean(this.message.trim());
      this.message = this.input.value();
      if (hadMessage !== Boolean(this.message.trim())) cx.notify();
    });
    this.input.on("submit", (_e, cx) => this.commit(cx));
    this.input.on("focus", (_e, cx) => { this.typing = true; cx.notify(); });
    this.input.on("blur", (_e, cx) => { this.typing = false; cx.notify(); });
    // 布局中的固定视图跟随终端；旧版工具 Tab 仍使用打开时的目录。
    this.openedAt = props()?.cwd ?? null;
    this.workspace = Boolean(props()?.workspace);
    this.tab = null; this.lastLoc = null;
    // What the panel diffs: the working tree (null) or one branch's merge base
    // against HEAD. `branches` feeds the picker; `folder` is the repo identity
    // the comparison belongs to.
    this.folder = null; this.compare = null; this.compareRef = null; this.baseSha = null; this.baseFallback = false;
    this.branches = []; this.current = null; this.pickerOpen = false; this.headSha = null;
    const f = focused(), at = f?.pane ? panes().find(p => p.pane === f.pane) : null;
    if (!this.workspace && at && !at.terminal && at.mod === "my-changes") this.tab = f.tab;
    // Several copies can be open, one per tab: keep their element ids apart so a
    // click or scrollbar in one never lands on another's list.
    this.uid = Math.random().toString(36).slice(2, 7);
    this.refreshedAt = 0;
    this.shownBefore = false;
    this.reload = false;
    this.watchPending = false;
    this.refresh(cx);
    cx.timer.every(POLL_MS, (cx) => this.refresh(cx));
  }

  // A workspace copy is drawn only while its stack shows it; the legacy tool tab
  // is a pane, and `location` already reports null while another tab is in front.
  visible() {
    return !this.workspace || shownInLayout(MOD);
  }

  watch(root, cx) {
    if (this.on || this.watched === root) return;
    this.watched = root;
    cx.spawn(async (cx) => {
      try {
        while (this.watched === root) {
          await watchFolder(root);
          if (this.watched === root) this.refreshSoon(cx);
        }
      } catch { this.watched = null; }
    });
  }

  // Coalesce the events a save produces into one scan.
  refreshSoon(cx) {
    if (this.watchPending) return;
    this.watchPending = true;
    cx.timer.after(WATCH_DEBOUNCE_MS, (cx) => {
      this.watchPending = false;
      this.refresh(cx);
    });
  }

  // A folder owns its branch list and its comparison: moving to another space
  // returns to the working tree rather than naming a branch that repo may not
  // have. A typed commit message belongs to the folder, not to the mode, so a
  // Working tree / branch switch keeps it.
  place(loc) {
    const folder = keyOf(loc);
    if (folder === this.folder) return folder;
    this.folder = folder;
    this.compare = null; this.compareRef = null; this.pickerOpen = false;
    this.branches = []; this.current = null;
    this.message = ""; this.input.set_value(""); this.watched = null;
    return folder;
  }

  refresh(cx, loc, context) {
    // Behind another stack child nothing here is on screen. `render` checks
    // `refreshedAt` when the view comes forward, so the catch-up is immediate.
    if (!this.visible()) {
      this.shownBefore = false;
      return;
    }
    // While another tab is in front, keep the folder this copy already shows.
    loc ??= location(this.tab, this.openedAt, this.workspace) ?? this.lastLoc;
    if (!loc) return;
    this.lastLoc = loc;
    const folder = this.place(loc);
    // The mode is part of the identity: switching to a branch (or back to the
    // working tree) empties the list and scans again.
    context ??= `${folder}|${this.compareRef ?? this.compare ?? ""}`;
    this.refreshedAt = Date.now();
    if (this.loading || this.busy) {
      // A change arrived while a scan or a commit was out; scan once more after.
      this.reload = true;
      return;
    }
    const { cwd, on } = loc;
    if (context !== this.context) {
      this.context = context; this.root = null; this.files = []; this.open = null;
      this.setLines([]); this.error = null; this.note = null; this.closed = false; this.limited = false;
      this.baseSha = null; this.baseFallback = false; this.headSha = null;
    }
    if (!cwd) return;
    this.loading = true;
    this.reload = false;
    cx.spawn(async (cx) => {
      try {
        const top = await exec("git", ["rev-parse", "--show-toplevel"], { cwd, on });
        if (this.context !== context) return;
        if (top.code !== 0) { this.root = null; this.files = []; this.setLines([]); this.open = null; this.error = "Not a git repository"; return; }
        const root = top.stdout.trim(), git = (args) => exec("git", [...READ, ...args], { cwd: root, on });
        const compare = this.compare, target = this.compareRef ?? compare;
        // The HEAD read and the branch list are independent reads; the worktree
        // scan joins them only when the worktree is what is shown.
        const [head, refs, status] = await Promise.all([
          git(["rev-parse", "--verify", "HEAD"]),
          git(["for-each-ref", "--format=%(refname)%09%(symref)%09%(HEAD)", "refs/heads", "refs/remotes"]),
          compare ? null : git(["status", "--porcelain=v1", "-z", "--no-renames", "--untracked-files=all"]),
        ]);
        if (this.context !== context) return;
        if (status && status.code !== 0) throw new Error(status.stderr);
        this.branches = refs.code === 0 ? branchEntries(refs.stdout) : [];
        this.current = this.branches.find((b) => b.current)?.name ?? (head.code === 0 ? head.stdout.trim().slice(0, 7) : null);
        const headSha = head.code === 0 ? head.stdout.trim() : null;
        this.root = root; this.on = on; this.hasHead = head.code === 0; this.headSha = headSha; this.error = null;
        this.watch(root, cx);
        let files;
        if (compare) {
          // A branch comparison is committed history only: merge base → HEAD,
          // not the working tree, which the Working tree mode already shows.
          if (!headSha) {
            this.files = []; this.open = null; this.setLines([]); this.limited = false;
            this.error = "No commits to compare yet";
            return;
          }
          let base = null, fallback = false;
          const merge = await git(["merge-base", target, "HEAD"]);
          if (this.context !== context) return;
          if (merge.code === 0) base = merge.stdout.trim();
          else {
            // Unrelated histories have no merge base; compare the two tips so
            // the view still says something useful.
            const tip = await git(["rev-parse", "--verify", `${target}^{commit}`]);
            if (this.context !== context) return;
            if (tip.code !== 0) throw new Error(`Cannot compare with ${compare}`);
            base = tip.stdout.trim(); fallback = true;
          }
          const [names, nums] = await Promise.all([
            git(["diff", "--name-status", "-z", "--no-renames", base, headSha]),
            git(["diff", "--numstat", "-z", "--no-renames", base, headSha]),
          ]);
          if (this.context !== context) return;
          if (names.code !== 0) throw new Error(names.stderr);
          if (nums.code !== 0) throw new Error(nums.stderr);
          const stats = numstats(nums.stdout), entries = branchChanges(names.stdout);
          files = entries.slice(0, 1000).map(({ path, status }) => ({ path, status, fresh: false, ...(stats[path] ?? { add: 0, del: 0 }) }));
          this.limited = entries.length > 1000;
          this.baseSha = base; this.baseFallback = fallback;
        } else {
          const stats = {};
          const results = head.code === 0
            ? [await git(["diff", "HEAD", "--numstat", "-z", "--no-renames"])]
            : await Promise.all([git(["diff", "--cached", "--numstat", "-z", "--no-renames"]), git(["diff", "--numstat", "-z", "--no-renames"])]);
          for (const result of results) {
            if (result.code !== 0) throw new Error(result.stderr);
            const found = numstats(result.stdout);
            for (const path in found) {
              const old = stats[path] ?? { add: 0, del: 0, binary: false };
              stats[path] = { add: old.add + found[path].add, del: old.del + found[path].del, binary: old.binary || found[path].binary };
            }
          }
          const entries = status.stdout.split("\0").filter(Boolean);
          files = [];
          for (const entry of entries.slice(0, 1000)) {
            const xy = entry.slice(0, 2), path = entry.slice(3), fresh = xy === "??";
            const conflict = xy.includes("U") || xy === "AA" || xy === "DD";
            const s = conflict ? "U" : xy.includes("D") ? "D" : fresh || xy.includes("A") ? "A" : "M";
            const stat = stats[path] ?? { add: 0, del: 0 };
            files.push({ path, status: s, fresh, ...stat });
          }
          this.limited = entries.length > 1000;
          this.baseSha = null; this.baseFallback = false;
        }
        if (this.context !== context) return;
        this.files = files;
        let picked = false;
        if (this.open && !files.some((f) => f.path === this.open)) { this.open = null; this.setLines([]); picked = true; }
        // The first file's diff shows until you pick another.
        if (!this.open && !this.closed && files.length) { this.open = files[0].path; picked = true; }
        if (picked) this.changeAt = -1;
        if (this.open) {
          try { await this.load(this.open, context); }
          catch { if (this.context === context) this.setLines(["Cannot preview this diff (too large or unreadable)"]); }
          // A newly chosen file starts at its first line, not wherever the last
          // file left the list.
          if (picked && this.context === context) this.scroll.scroll_to_item(0);
        }
      } catch (e) { if (this.context === context) this.error = String(e); }
      finally {
        this.loading = false;
        cx.notify();
        if (this.reload) {
          this.reload = false;
          this.refresh(cx);
        }
      }
    });
  }

  async load(path, context) {
    const file = this.files.find((f) => f.path === path), root = this.root, on = this.on;
    if (!file) return;
    let lines;
    if (this.baseSha) {
      // merge base → HEAD, the whole file as context. Two explicit commits keep
      // uncommitted edits out of a branch comparison.
      const r = await exec("git", [...READ, "diff", this.baseSha, this.headSha ?? "HEAD", "-U1000000", "--no-ext-diff", "--no-textconv", "--no-color", "--", path], { cwd: root, on });
      if (r.code !== 0) throw new Error(r.stderr);
      const all = r.stdout.replace(/\n$/, "").split("\n"), first = all.findIndex((l) => l.startsWith("@@"));
      lines = first < 0 ? [file.binary ? "Binary file changed" : "No text diff available"] : all.slice(first);
    } else if (file.fresh || (!this.hasHead && file.status === "A")) {
      const text = await readTextFile(`${root}/${path}`, { on }).catch(() => null);
      if (text === null) lines = ["Cannot preview this file (binary, too large, or unreadable)"];
      else if (text.includes("\0")) lines = ["Binary file · no text diff"];
      else {
        file.add = countLines(text);
        lines = [`@@ -0,0 +1,${file.add} @@`, ...text.slice(0, 400000).replace(/\n$/, "").split("\n").map(l => `+${l}`)];
        if (text.length > 400000) lines.push("… file truncated");
      }
    } else {
      // 让 diff 覆盖整个文件：未改动的行也作为上下文出现，而不是只露出
      // 每个改动点前后的三行。
      const r = await exec("git", [...READ, "diff", ...(this.hasHead ? ["HEAD"] : []), "-U1000000", "--no-ext-diff", "--no-textconv", "--no-color", "--", path], { cwd: root, on });
      if (r.code !== 0) throw new Error(r.stderr);
      const all = r.stdout.replace(/\n$/, "").split("\n"), first = all.findIndex((l) => l.startsWith("@@"));
      lines = first < 0 ? [file.binary ? "Binary file changed" : "No text diff available"] : all.slice(first);
    }
    if (this.context !== context || this.open !== path) return;
    const shown = lines.slice(0, MAX_ROWS).map(line => line.length > 4000 ? line.slice(0, 4000) + "… (line truncated)" : line);
    if (lines.length > MAX_ROWS) shown.push(`… diff truncated at ${MAX_ROWS} lines`);
    this.setLines(shown);
  }

  setLines(lines) {
    this.rows = diffRows(lines);
    this.changes = changeStarts(this.rows);
    // `Math.max(300, ...lines.map(...))` built a second array of every row.
    let width = 300;
    for (const line of lines) {
      const w = line.length * TYPE.small * 0.65 + 72;
      if (w > width) width = w;
    }
    this.diffWidth = width;
  }

  pick(path, cx) {
    this.open = this.open === path ? null : path; this.setLines([]); this.note = null;
    this.closed = !this.open;
    this.changeAt = -1;
    const context = this.context;
    if (this.open) cx.spawn(async (cx) => {
      try { await this.load(path, context); }
      catch (e) { if (this.context === context && this.open === path) this.note = `Cannot preview this diff (too large or unreadable): ${e}`; }
      if (this.context === context && this.open === path) this.scroll.scroll_to_item(0);
      cx.notify();
    });
    cx.notify();
  }

  // 切换比较的对象：null 是工作区，否则是一个分支（短名用于显示，完整 ref
  // 用于 git）。先清空列表，免得旧模式的文件在新标题下停留到扫描结束。
  setBase(branch, cx) {
    const next = branch?.name ?? null, ref = branch?.ref ?? null;
    if (next === this.compare && ref === this.compareRef) return;
    this.pickerOpen = false;
    this.compare = next; this.compareRef = ref; this.baseSha = null; this.baseFallback = false;
    this.files = []; this.open = null; this.setLines([]); this.changeAt = -1; this.closed = false;
    this.error = null; this.note = null;
    // A scan in flight would otherwise finish and write the old mode's files:
    // clearing the context makes it discard its answer.
    if (this.loading || this.busy) this.context = null;
    this.refresh(cx);
    cx.notify();
  }

  // 在变动块之间移动：首尾相接，指针从文件顶部开始时下一步落在第一块。
  step(delta, cx) {
    const count = this.changes.length;
    if (!count) return;
    const from = this.changeAt >= 0 && this.changeAt < count ? this.changeAt : -1;
    const at = from < 0 ? (delta > 0 ? 0 : count - 1) : (from + delta + count) % count;
    this.changeAt = at;
    this.scroll.scroll_to_item(this.changes[at], "center");
    cx.notify();
  }

  // 在 Files 中打开当前文件。shared 里放仓库根和文件相对路径，Files 自己
  // 换算到它的树根；终端停在仓库子目录时也能预览。
  openInFiles(_cx) {
    // A branch comparison may name a file the working tree no longer has.
    if (!this.open || !this.root || this.compare) return;
    setShared("files.open", { root: this.root, path: this.open, at: Date.now() });
    run("layout.select", { stack: "work-body", child: "files" });
  }

  commit(cx) {
    const loc = location(this.tab, this.openedAt, this.workspace) ?? this.lastLoc;
    if (!this.message.trim() || !this.root || this.compare || this.busy || this.loading || !loc) return;
    if (this.context !== `${keyOf(loc)}|`) return;
    const root = this.root, on = this.on, context = this.context, message = this.message.trim();
    this.busy = true; this.note = null;
    cx.spawn(async (cx) => {
      try {
        for (const args of [["add", "-A"], ["commit", "-m", message]]) {
          const r = await exec("git", args, { cwd: root, on });
          if (r.code !== 0) throw new Error((r.stderr || r.stdout).trim());
        }
        if (this.context === context) { this.message = ""; this.input.set_value(""); }
      } catch (e) { if (this.context === context) this.note = `Commit failed: ${e}`; }
      finally { this.busy = false; this.refresh(cx); cx.notify(); }
    });
    cx.notify();
  }

  // 比较对象的入口：工作区，或一个分支。它是一行安静的选择器，右侧顺手显示
  // 当前分支；点一下把下面的文件列表换成分支列表。
  sourceRow(t, accent) {
    const comparing = Boolean(this.compare);
    return h_flex().id(`changes-source-${this.uid}`).w_full().h(SIZE.listRow).px(7).gap(6).items_center().rounded(SIZE.radius)
      .cursor_pointer()
      .when(this.pickerOpen, (el) => el.bg(withAlpha(t.foreground, UI.active)))
      .when(!this.pickerOpen, (el) => el.hover((s) => s.bg(withAlpha(t.foreground, UI.hover))))
      .tooltip(this.pickerOpen ? "Choose the branch to compare with" : comparing ? `Comparing with ${this.compare}` : "Compare the current branch with another branch")
      .on_click((_e, cx) => { this.pickerOpen = !this.pickerOpen; cx.notify(); })
      .child(svg(comparing ? "mods/workspace-chrome/branch.svg" : "mods/workspace-chrome/git-compare.svg").size(12).flex_none().text_color(comparing ? accent : t.muted))
      .child(div().flex_1().min_w(0).truncate().text_size(TYPE.small).font_weight(comparing ? 600 : 400).text_color(comparing ? t.foreground : t.muted).child(comparing ? this.compare : "Working tree"))
      .when(Boolean(this.current), (el) => el.child(div().flex_none().min_w(0).max_w(104).truncate().text_size(TYPE.label).text_color(t.dim).child(comparing ? `vs ${this.current}` : this.current)))
      .child(svg("mods/workspace-chrome/chevron-down.svg").size(10).flex_none().text_color(t.dim));
  }

  // 分支列表占据文件列表的位置，而不是浮层：点击就是普通行的点击，选择分支
  // 不需要在按下时拆掉一个原生弹层。
  branchList(t, accent) {
    const others = this.branches.filter((b) => !b.current);
    const local = others.filter((b) => b.local), remote = others.filter((b) => !b.local);
    const row = (key, label, selected, icon, action) => h_flex().id(`changes-branch-${this.uid}-${key}`)
      .h(SIZE.listRow).flex_none().px(7).gap(7).items_center().rounded(5).cursor_pointer()
      .when(selected, (el) => el.bg(withAlpha(t.foreground, UI.active)))
      .when(!selected, (el) => el.hover((s) => s.bg(withAlpha(t.foreground, UI.hover))))
      // 用点击事件自带的 cx：refresh 要用它启动异步任务，旧的 render cx 不算数。
      .on_click((_e, cx) => { action(cx); this.pickerOpen = false; cx.notify(); })
      .child(svg(icon).size(12).flex_none().text_color(selected ? accent : t.muted))
      .child(div().flex_1().min_w(0).truncate().text_size(TYPE.small).text_color(selected ? t.foreground : t.muted).child(label))
      .when(selected, (el) => el.child(svg("mods/workspace-chrome/check.svg").size(12).flex_none().text_color(accent)));
    const caption = (label, right) => h_flex().h(26).flex_none().px(7).gap(6).items_center()
      .child(div().text_size(TYPE.label).font_weight(600).text_color(t.muted).child(label))
      .child(div().flex_1())
      .when(Boolean(right), (el) => el.child(div().max_w(132).min_w(0).truncate().text_size(TYPE.label).text_color(t.dim).child(right)));
    return v_flex().flex_1().min_h(0).overflow_y_scrollbar().gap(1)
      .child(caption("COMPARE WITH", this.current))
      .child(row("worktree", "Working tree", !this.compare, "mods/changes/changes.svg", (cx) => this.setBase(null, cx)))
      .when(local.length > 0, (el) => el
        .child(div().mx(5).my(4).h(1).flex_none().bg(withAlpha(t.foreground, UI.lineSoft)))
        .child(caption("LOCAL"))
        .children(local.map((b, i) => row(`local-${i}`, b.name, this.compareRef === b.ref, "mods/workspace-chrome/branch.svg", (cx) => this.setBase(b, cx)))))
      .when(remote.length > 0, (el) => el
        .child(div().mx(5).my(4).h(1).flex_none().bg(withAlpha(t.foreground, UI.lineSoft)))
        .child(caption("REMOTE"))
        .children(remote.map((b, i) => row(`remote-${i}`, b.name, this.compareRef === b.ref, "mods/workspace-chrome/branch.svg", (cx) => this.setBase(b, cx)))))
      .when(!others.length, (el) => el.child(div().px(7).py(10).text_size(TYPE.meta).line_height("15px").text_color(t.dim)
        .child(this.loading ? "Loading branches…" : "No other branches")))
      .child(div().px(7).pt(10).text_size(TYPE.label).line_height("14px").text_color(t.dim)
        .child("Committed changes from the merge base."));
  }

  // A changed-file row inside the virtual renderer: no handler of its own; the
  // list's `on_item_click` names the path.
  fileRow(f, t, accent) {
    const parts = f.path.split("/"), name = parts.pop();
    const dir = parts.length ? parts.join("/") + "/" : "";
    const status = changeColor(f.status, t);
    const on = this.open === f.path;
    return h_flex().h(SIZE.listRow).flex_none().px(8).gap(7).items_center().rounded(SIZE.radius).cursor_pointer().tooltip(f.path)
      .when(on, (e) => e.bg(withAlpha(t.foreground, UI.active)))
      .when(!on, (s) => s.hover((e) => e.bg(withAlpha(t.foreground, UI.hover))))
      .child(h_flex().size(18).flex_none().rounded(4).items_center().justify_center()
        .bg(withAlpha(status, UI.tint)).border(1).border_color(withAlpha(status, UI.tintEdge))
        .text_size(TYPE.label).font_weight(600).text_color(status).child(f.status))
      .child(h_flex().flex_1().min_w(0).gap(6).items_center()
        .child(div().flex_1().min_w(0).truncate().text_size(TYPE.small).font_weight(on ? 600 : 400).text_color(on ? t.foreground : t.muted).child(name))
        .when(Boolean(dir), (e) => e.child(div().max_w(80).min_w(0).truncate().text_size(TYPE.label).text_color(t.dim).child(dir))))
      .when(f.add > 0, (e) => e.child(div().text_size(TYPE.label).text_color(t.ansi2).child(`+${f.add}`)))
      .when(f.del > 0, (e) => e.child(div().text_size(TYPE.label).text_color(t.ansi1).child(`−${f.del}`)));
  }

  diffRow({ kind, number, text }, t) {
    if (kind === "@") return div().w_full().px(12).h(SIZE.diffRow).flex_none().truncate().bg(withAlpha(t.foreground, UI.subtle)).text_size(TYPE.meta).text_color(t.muted).child(text);
    const add = kind === "+", del = kind === "-";
    // The tint and the coloured sign keep changes readable without a gutter
    // line and without relying on hue alone.
    return h_flex().w_full().h(SIZE.diffRow).flex_none().gap(8)
      .when(add, (e) => e.bg(withAlpha(t.ansi2, UI.diff)))
      .when(del, (e) => e.bg(withAlpha(t.ansi1, UI.diff)))
      .child(div().w(40).flex_none().text_right().text_size(TYPE.meta).text_color(t.dim).child(number === undefined ? "" : String(number)))
      .child(div().w(8).flex_none().text_size(TYPE.meta).text_color(add ? t.ansi2 : del ? t.ansi1 : t.dim).child(add ? "+" : del ? "−" : ""))
      .child(div().flex_1().min_w(0).truncate().text_color(t.foreground).child(text));
  }

  render(cx) {
    // The first render may be the one where this copy becomes the focused pane;
    // remember its tab then, so later tab switches leave its state alone.
    const f = focused();
    if (this.tab === null && f?.pane) {
      const at = panes().find(p => p.pane === f.pane);
      if (!this.workspace && at && !at.terminal && at.mod === "my-changes") this.tab = f.tab;
    }
    // Nothing read from the host is drawn while another stack child is in
    // front, and the hidden copy must not start a scan from a render either.
    const shown = this.visible();
    const now = shown ? location(this.tab, this.openedAt, this.workspace) : null;
    if (now) this.lastLoc = now;
    const loc = now ?? this.lastLoc;
    if (shown && loc) {
      // A different folder also clears any branch comparison (place does that),
      // so the mode is read after it.
      const next = `${this.place(loc)}|${this.compareRef ?? this.compare ?? ""}`;
      const stale = Date.now() - this.refreshedAt >= (this.shownBefore ? POLL_MS : 1000);
      // While a load or commit is out, the context is cleared as soon as the
      // place changes: results for the old folder are then discarded even though
      // the new refresh cannot start until the old one finishes.
      if (next !== this.context && (this.loading || this.busy)) this.context = null;
      if (next !== this.context) this.refresh(cx, loc, next);
      // Hidden while the timer ran (or just came forward): catch up at once.
      else if (stale) this.refresh(cx, loc, next);
    }
    this.shownBefore = shown;
    const t = theme(), add = this.files.reduce((n, f) => n + f.add, 0), del = this.files.reduce((n, f) => n + f.del, 0);
    const enabled = Boolean(this.message.trim() && this.root && !this.busy && !this.loading);
    const filesId = `changes-files-${this.uid}`, diffId = `changes-diff-${this.uid}`;
    // The active space's colour is the focus ring on the commit field; the
    // same thread runs from the sidebar through the tabs to this panel (the
    // location already knows the space, so no second spaces() copy is needed).
    const accentRaw = markColor((shared("space.colors") ?? {})[loc?.space], t);
    const accent = accentRaw ? accentRaw.slice(0, 7) : (t.accent ?? t.muted);
    const parts = this.open ? this.open.split("/") : [];
    const leaf = parts.pop() ?? "";
    const dir = parts.length ? parts.join("/") + "/" : "";
    // 变动导航和“在 Files 打开”共用的小工具按钮。
    const diffButton = (id, label, tip, on, action) => h_flex().id(`changes-${id}-${this.uid}`).h(SIZE.control).min_w(SIZE.control).flex_none().px(7).rounded(5).justify_center().items_center()
      .text_size(TYPE.meta).font_weight(500)
      .text_color(on ? t.muted : t.dim).opacity(on ? 1 : 0.55)
      .when(on, (el) => el.cursor_pointer().hover((s) => s.bg(withAlpha(t.foreground, UI.hover)).text_color(t.foreground)))
      .tooltip(tip)
      .on_click((_e, cx) => { if (on) action(cx); })
      .child(label);

    // Left: the changed files and the commit box, above the diff's list height.
    const leftPanel = resizable_panel().size(260).size_range(200).child(
      v_flex().size_full().min_w(0).min_h(0)
        .child(h_flex().h(SIZE.header).flex_none().px(14).gap(7).items_center()
          .border_b(1).border_color(withAlpha(t.foreground, UI.lineSoft))
          .child(div().text_size(TYPE.label).font_weight(600).text_color(t.muted).child("CHANGES"))
          .child(h_flex().h(16).flex_none().px(5).rounded(4).bg(withAlpha(t.foreground, UI.subtle)).items_center().text_size(TYPE.label).text_color(t.muted).child(String(this.files.length)))
          .child(div().flex_1())
          .when(add > 0, (el) => el.child(div().text_size(TYPE.meta).text_color(t.ansi2).child(`+${add}`)))
          .when(del > 0, (el) => el.child(div().text_size(TYPE.meta).text_color(t.ansi1).child(`−${del}`))))
        .when(Boolean(this.root), (el) => el.child(
          h_flex().flex_none().px(SIZE.inset).pt(SIZE.inset).pb(2).child(this.sourceRow(t, accent))))
        .child(v_flex().id(`changes-list-${this.uid}`).flex_1().min_h(0).p(SIZE.inset)
          // 分支列表占用文件列表的位置，所以打开时不会与浮层争抢点击或高度。
          .when(this.pickerOpen, (el) => el.child(this.branchList(t, accent)))
          // Only the rows on screen are built: a thousand changed files used to
          // cost a thousand elements on every render for a 200 px box.
          .when(!this.pickerOpen && this.files.length > 0, (el) => el.child(v_flex().relative().flex_1().min_h(0)
            .child(v_virtual_list(filesId, this.files.length, SIZE.listRow, (i) => this.files[i].path,
              (range) => this.files.slice(range.start, range.end).map((f) => this.fileRow(f, t, accent)))
              .on_item_click((path, cx) => this.pick(path, cx))
              .size_full())
            .child(Scrollbar.vertical(filesId).absolute().inset_0())))
          .when(!this.pickerOpen && !this.files.length, (el) => el.child(
            div().px(8).py(10).text_size(TYPE.meta).line_height("15px").text_color(t.dim)
              .child(this.error || (this.loading ? "Loading changes…" : this.root ? (this.compare ? `No differences from ${this.compare}` : "No uncommitted changes") : "No folder")))))
        .when(this.limited, (el) => el.child(div().px(12).pb(6).text_size(TYPE.label).text_color(t.dim).child("Showing the first 1,000 changed files")))
        .when(Boolean(this.note), (el) => el.child(div().px(12).pb(6).text_size(TYPE.label).line_height("13px").text_color(t.ansi1).child(this.note)))
        .when(!this.compare, (el) => el.child(v_flex().flex_none().p(10).gap(8).border_t(1).border_color(withAlpha(t.foreground, UI.lineSoft))
          .child(div().id(`commit-message-${this.uid}`).w_full().h(32).px(10).flex().items_center().rounded(SIZE.radius)
            .bg(t.background)
            .border(1).border_color(this.typing ? withAlpha(accent, UI.ring) : withAlpha(t.foreground, UI.field))
            .cursor_text().on_mouse_down("left", (_e, cx) => cx.stop_propagation())
            .child(Input.new(this.input).h_full().text_size(TYPE.small).text_color(t.foreground)))
          .child(div().id(`commit-${this.uid}`).w_full().h(32).flex().items_center().justify_center().rounded(SIZE.radius)
            .bg(enabled ? t.solid : withAlpha(t.foreground, UI.subtle))
            .text_color(enabled ? t.solid_foreground : t.dim)
            .text_size(TYPE.small).font_weight(600)
            .when(enabled, (el) => el.cursor_pointer().hover(s => s.opacity(0.88)))
            .on_click((_e, cx) => this.commit(cx))
            .child(this.busy ? "Committing…" : "Commit"))))
        .when(Boolean(this.compare), (el) => el.child(h_flex().flex_none().px(12).py(10).gap(7).items_center()
          .border_t(1).border_color(withAlpha(t.foreground, UI.lineSoft))
          .child(svg("mods/workspace-chrome/git-compare.svg").size(11).flex_none().text_color(t.dim))
          .child(div().flex_1().min_w(0).truncate().text_size(TYPE.label).text_color(t.dim)
            .tooltip("Uncommitted edits stay in Working tree")
            .child(this.baseFallback ? "No common ancestor; comparing tips" : "Committed changes only"))))
    );

    // Right: the diff on the terminal's background, with the file path and
    // change navigation above it.
    const rightHeader = h_flex().h(SIZE.header).flex_none().px(12).gap(8).items_center()
      .border_b(1).border_color(withAlpha(t.foreground, UI.lineSoft))
      .child(svg("mods/my-changes/changes.svg").size(13).flex_none().text_color(accent))
      .child(h_flex().flex_1().min_w(0).items_center()
        .when(Boolean(dir), (el) => el.child(div().min_w(0).truncate().text_size(TYPE.meta).text_color(t.muted).child(dir)))
        .child(div().min_w(0).max_w(260).truncate().text_size(TYPE.small).font_weight(600).text_color(t.foreground).tooltip(this.open ?? "").child(leaf)))
      .child(h_flex().flex_none().gap(2).p(2).rounded(7).bg(withAlpha(t.foreground, UI.subtle))
        .child(diffButton("prev", "↑", "Previous change", this.changes.length > 0, () => this.step(-1, cx)))
        .child(diffButton("next", "↓", "Next change", this.changes.length > 0, () => this.step(1, cx))))
      // A compared file may be gone from the working tree, so this shortcut
      // belongs to the working-tree mode only.
      .when(!this.compare, (el) => el.child(diffButton("files", "Files", "Open this file in Files", Boolean(this.root), () => this.openInFiles(cx))));

    const emptyHint = v_flex().absolute().inset_0().p(24).items_center().justify_center().gap(8)
      .child(h_flex().size(40).mb(4).flex_none().items_center().justify_center().rounded(12).bg(withAlpha(t.foreground, UI.subtle))
        .child(svg("mods/my-changes/changes.svg").size(18).text_color(t.muted)))
      .child(div().text_size(TYPE.body).font_weight(500).text_color(t.foreground).child(this.files.length ? "Select a file" : this.compare ? "No differences" : "All caught up"))
      .child(div().text_size(TYPE.meta).text_center().text_color(t.muted)
        .child(this.files.length ? "Choose a changed file to review its diff."
          : this.compare ? (this.baseFallback ? "Both branch tips have the same tree." : `This branch has no changes since ${this.compare}.`)
            : "Your working tree is clean."));

    const diffArea = div().flex_1().min_w(0).min_h(0).relative().font_family(settings().font_family ?? "JetBrains Mono").text_size(TYPE.small)
      .child(div().id(`changes-diff-x-${this.uid}`).size_full().overflow_x_scrollbar()
        .child(div().w_full().min_w(this.diffWidth).h_full()
          .child(v_virtual_list(diffId, this.rows.length, SIZE.diffRow, (i) => String(i),
            (range) => this.rows.slice(range.start, range.end).map((row) => this.diffRow(row, t)))
            .track_scroll(this.scroll).size_full())))
      .child(Scrollbar.vertical(diffId).viewport_from_layout().absolute().inset_0())
      .when(!this.open && !this.loading && !this.error && Boolean(this.root), (el) => el.child(emptyHint));

    const rightPanel = resizable_panel().size_range(240).child(
      v_flex().size_full().min_w(0).min_h(0).bg(t.background)
        .border_l(1).border_color(withAlpha(t.foreground, UI.line))
        .when(Boolean(this.open), (el) => el.child(rightHeader))
        .child(diffArea)
    );

    return v_flex().id(`changes-${this.uid}`).size_full().min_w(0).min_h(0).overflow_hidden().bg(t.surface).text_color(t.foreground).text_size(13).track_focus(this.handle)
      .on_key_down((e, cx) => {
        if (e.key === "escape" && this.pickerOpen) { this.pickerOpen = false; cx.stop_propagation(); cx.notify(); }
        else if (e.key === "escape" && this.typing) { this.typing = false; this.handle.focus(); cx.stop_propagation(); cx.notify(); }
      })
      // 原生分栏按实例保留拖动后的宽度，重绘和切换标签不会重置。
      .child(h_resizable(`changes-split-${this.uid}`).flex_1().min_w(0).min_h(0)
        .child(leftPanel)
        .child(rightPanel));
  }
}
