import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, h_resizable, resizable_panel, InputState, Input, Scrollbar, v_virtual_list, VirtualListScrollHandle } from "gpui-base";
import { spaces, panes, focused, props, exec, readTextFile, watchFolder, theme, settings, run, setShared, shared } from "herdr";
import { markColor, withAlpha, UI, TYPE } from "./colors.js";


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
const countLines = (text) => text ? text.split("\n").length - Number(text.endsWith("\n")) : 0;

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
    const f = focused(), at = f?.pane ? panes().find(p => p.pane === f.pane) : null;
    if (!this.workspace && at && !at.terminal && at.mod === "my-changes") this.tab = f.tab;
    // Several copies can be open, one per tab: keep their element ids apart so a
    // click or scrollbar in one never lands on another's list.
    this.uid = Math.random().toString(36).slice(2, 7);
    this.refresh(cx);
    cx.timer.every(10000, (cx) => this.refresh(cx));
  }

  watch(root, cx) {
    if (this.on || this.watched === root) return;
    this.watched = root;
    cx.spawn(async (cx) => {
      try {
        while (this.watched === root) {
          await watchFolder(root);
          if (this.watched === root) this.refresh(cx);
        }
      } catch { this.watched = null; }
    });
  }

  refresh(cx, loc, context) {
    // While another tab is in front, keep the folder this copy already shows.
    loc ??= location(this.tab, this.openedAt, this.workspace) ?? this.lastLoc;
    if (!loc) return;
    this.lastLoc = loc;
    context ??= keyOf(loc);
    if (this.loading || this.busy) return;
    const { cwd, on } = loc;
    if (context !== this.context) {
      this.context = context; this.root = null; this.files = []; this.open = null;
      this.setLines([]); this.message = ""; this.input.set_value(""); this.error = null; this.note = null; this.watched = null; this.closed = false; this.limited = false;
    }
    if (!cwd) return;
    this.loading = true;
    cx.spawn(async (cx) => {
      try {
        const top = await exec("git", ["rev-parse", "--show-toplevel"], { cwd, on });
        if (this.context !== context) return;
        if (top.code !== 0) { this.root = null; this.files = []; this.setLines([]); this.open = null; this.error = "Not a git repository"; return; }
        const root = top.stdout.trim(), git = (args) => exec("git", [...READ, ...args], { cwd: root, on });
        // The two reads are independent: one status scan and one rev read run
        // together rather than one after the other.
        const [status, head] = await Promise.all([
          git(["status", "--porcelain=v1", "-z", "--no-renames", "--untracked-files=all"]),
          git(["rev-parse", "--verify", "HEAD"]),
        ]);
        if (this.context !== context) return;
        if (status.code !== 0) throw new Error(status.stderr);
        const stats = {};
        const results = head.code === 0
          ? [await git(["diff", "HEAD", "--numstat", "-z", "--no-renames"])]
          : await Promise.all([git(["diff", "--cached", "--numstat", "-z", "--no-renames"]), git(["diff", "--numstat", "-z", "--no-renames"])]);
        for (const result of results) {
          if (result.code !== 0) throw new Error(result.stderr);
          for (const entry of result.stdout.split("\0")) {
            const [a, d, ...parts] = entry.split("\t");
            if (!parts.length) continue;
            const path = parts.join("\t"), old = stats[path] ?? { add: 0, del: 0 };
            stats[path] = { add: old.add + (Number(a) || 0), del: old.del + (Number(d) || 0), binary: a === "-" };
          }
        }
        const files = [];
        const entries = status.stdout.split("\0").filter(Boolean);
        for (const entry of entries.slice(0, 1000)) {
          const xy = entry.slice(0, 2), path = entry.slice(3), fresh = xy === "??";
          const conflict = xy.includes("U") || xy === "AA" || xy === "DD";
          const s = conflict ? "U" : xy.includes("D") ? "D" : fresh || xy.includes("A") ? "A" : "M";
          const stat = stats[path] ?? { add: 0, del: 0 };
          files.push({ path, status: s, fresh, ...stat });
        }
        if (this.context !== context) return;
        this.root = root; this.on = on; this.hasHead = head.code === 0; this.files = files; this.limited = entries.length > 1000; this.error = null;
        this.watch(root, cx);
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
      finally { this.loading = false; cx.notify(); }
    });
  }

  async load(path, context) {
    const file = this.files.find((f) => f.path === path), root = this.root, on = this.on;
    if (!file) return;
    let lines;
    if (file.fresh || (!this.hasHead && file.status === "A")) {
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
    this.diffWidth = Math.max(300, ...lines.map(line => line.length * 7 + 50));
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
    if (!this.open || !this.root) return;
    setShared("files.open", { root: this.root, path: this.open, at: Date.now() });
    run("layout.select", { stack: "work-body", child: "files" });
  }

  commit(cx) {
    const loc = location(this.tab, this.openedAt, this.workspace) ?? this.lastLoc;
    if (!this.message.trim() || !this.root || this.busy || this.loading || !loc || this.context !== keyOf(loc)) return;
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

  // A changed-file row inside the virtual renderer: no handler of its own; the
  // list's `on_item_click` names the path.
  fileRow(f, t, accent) {
    const parts = f.path.split("/"), name = parts.pop();
    const dir = parts.length ? parts.join("/") + "/" : "";
    const status = f.status === "A" ? t.ansi2 : f.status === "D" ? t.ansi1 : f.status === "U" ? t.ansi5 : t.ansi3;
    const on = this.open === f.path;
    return h_flex().h(27).flex_none().px(8).gap(7).items_center().rounded(6).cursor_pointer()
      .when(on, (e) => e.bg(withAlpha(t.foreground, UI.active)))
      .when(!on, (s) => s.hover((e) => e.bg(withAlpha(t.foreground, "06"))))
      .child(div().w(11).flex_none().text_size(9.5).font_weight(600).text_color(status).child(f.status))
      .child(h_flex().flex_1().min_w(0)
        .when(Boolean(dir), (e) => e.child(div().min_w(0).truncate().text_size(TYPE.label).text_color(t.dim).child(dir)))
        .child(div().max_w(220).min_w(0).truncate().text_size(TYPE.small).font_weight(on ? 500 : 400).text_color(on ? t.foreground : t.muted).child(name)))
      .when(f.add > 0, (e) => e.child(div().text_size(TYPE.label).text_color(t.ansi2).child(`+${f.add}`)))
      .when(f.del > 0, (e) => e.child(div().text_size(TYPE.label).text_color(t.ansi1).child(`−${f.del}`)));
  }

  diffRow({ kind, number, text }, t) {
    if (kind === "@") return div().w_full().px(10).h(21).flex_none().truncate().bg(withAlpha(t.foreground, "04")).text_size(9.5).text_color(t.dim).child(text);
    const add = kind === "+", del = kind === "-";
    // The tint and the coloured sign keep changes readable without a gutter
    // line and without relying on hue alone.
    return h_flex().w_full().h(21).flex_none().gap(7)
      .when(add, (e) => e.bg(withAlpha(t.ansi2, "26")))
      .when(del, (e) => e.bg(withAlpha(t.ansi1, "26")))
      .child(div().w(30).flex_none().text_right().text_size(10).text_color(t.dim).child(number === undefined ? "" : String(number)))
      .child(div().w(8).flex_none().text_size(10).text_color(add ? t.ansi2 : del ? t.ansi1 : t.dim).child(add ? "+" : del ? "−" : ""))
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
    const now = location(this.tab, this.openedAt, this.workspace);
    if (now) this.lastLoc = now;
    const loc = now ?? this.lastLoc;
    if (loc) {
      const next = keyOf(loc);
      // While a load or commit is out, the context is cleared as soon as the
      // place changes: results for the old folder are then discarded even though
      // the new refresh cannot start until the old one finishes.
      if (next !== this.context && (this.loading || this.busy)) this.context = null;
      if (next !== this.context) this.refresh(cx, loc, next);
    }
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
    const diffButton = (id, label, tip, on, action) => h_flex().id(`changes-${id}-${this.uid}`).h(22).flex_none().px(5).rounded(4).items_center()
      .text_size(TYPE.meta).font_weight(500)
      .text_color(on ? t.muted : t.dim).opacity(on ? 1 : 0.55)
      .when(on, (el) => el.cursor_pointer().hover((s) => s.bg(withAlpha(t.foreground, UI.hover)).text_color(t.foreground)))
      .tooltip(tip)
      .on_click((_e, cx) => { if (on) action(cx); })
      .child(label);

    // Left: the changed files and the commit box, above the diff's list height.
    const leftPanel = resizable_panel().size(240).size_range(200).child(
      v_flex().size_full().min_w(0).min_h(0)
        .child(h_flex().h(34).flex_none().px(12).gap(7).items_center()
          .child(div().text_size(TYPE.label).font_weight(600).text_color(t.muted).child("CHANGES"))
          .child(h_flex().h(16).flex_none().px(5).rounded(4).bg(withAlpha(t.foreground, "06")).items_center().text_size(9.5).text_color(t.muted).child(String(this.files.length)))
          .child(div().flex_1())
          .when(add > 0, (el) => el.child(div().text_size(TYPE.meta).text_color(t.ansi2).child(`+${add}`)))
          .when(del > 0, (el) => el.child(div().text_size(TYPE.meta).text_color(t.ansi1).child(`−${del}`))))
        .child(v_flex().id(`changes-list-${this.uid}`).flex_1().min_h(0).p(6)
          // Only the rows on screen are built: a thousand changed files used to
          // cost a thousand elements on every render for a 200 px box.
          .when(this.files.length > 0, (el) => el.child(v_flex().relative().flex_1().min_h(0)
            .child(v_virtual_list(filesId, this.files.length, 27, (i) => this.files[i].path,
              (range) => this.files.slice(range.start, range.end).map((f) => this.fileRow(f, t, accent)))
              .on_item_click((path, cx) => this.pick(path, cx))
              .size_full())
            .child(Scrollbar.vertical(filesId).absolute().inset_0())))
          .when(!this.files.length, (el) => el.child(
            div().px(8).py(10).text_size(TYPE.meta).line_height("15px").text_color(t.dim)
              .child(this.error || (this.loading ? "Loading changes…" : this.root ? "No uncommitted changes" : "No folder")))))
        .when(this.limited, (el) => el.child(div().px(12).pb(6).text_size(TYPE.label).text_color(t.dim).child("Showing the first 1,000 changed files")))
        .when(Boolean(this.note), (el) => el.child(div().px(12).pb(6).text_size(TYPE.label).line_height("13px").text_color(t.ansi1).child(this.note)))
        .child(v_flex().flex_none().p(8).gap(6).border_t(1).border_color(withAlpha(t.foreground, "0a"))
          .child(div().id(`commit-message-${this.uid}`).w_full().h(30).px(9).flex().items_center().rounded(6)
            .bg(withAlpha(t.foreground, "05"))
            .border(1).border_color(this.typing ? withAlpha(accent, "b0") : withAlpha(t.foreground, "10"))
            .cursor_text().on_mouse_down("left", (_e, cx) => cx.stop_propagation())
            .child(Input.new(this.input).h_full().text_size(TYPE.small).text_color(t.foreground)))
          .child(div().id(`commit-${this.uid}`).w_full().h(30).flex().items_center().justify_center().rounded(6)
            .bg(enabled ? t.solid : withAlpha(t.foreground, "06"))
            .text_color(enabled ? t.solid_foreground : t.dim)
            .text_size(TYPE.small).font_weight(600)
            .when(enabled, (el) => el.cursor_pointer())
            .on_click((_e, cx) => this.commit(cx))
            .child(this.busy ? "Committing…" : "Commit")))
    );

    // Right: the diff on the terminal's background, with the file path and
    // change navigation above it.
    const rightHeader = h_flex().h(32).flex_none().px(10).gap(6).items_center()
      .border_b(1).border_color(withAlpha(t.foreground, "0a"))
      .child(h_flex().flex_1().min_w(0).items_center()
        .when(Boolean(dir), (el) => el.child(div().min_w(0).truncate().text_size(TYPE.label).text_color(t.dim).child(dir)))
        .child(div().flex_none().max_w(200).truncate().text_size(TYPE.small).font_weight(600).text_color(t.foreground).tooltip(this.open ?? "").child(leaf)))
      .child(diffButton("prev", "↑", "Previous change", this.changes.length > 0, () => this.step(-1, cx)))
      .child(diffButton("next", "↓", "Next change", this.changes.length > 0, () => this.step(1, cx)))
      .child(diffButton("files", "Files", "Open this file in Files", Boolean(this.root), () => this.openInFiles(cx)));

    const emptyHint = v_flex().absolute().inset_0().items_center().justify_center().gap(6)
      .child(h_flex().size(32).flex_none().items_center().justify_center().rounded_full().bg(withAlpha(t.foreground, "05"))
        .child(svg("mods/my-changes/changes.svg").size(14).text_color(t.dim)))
      .child(div().text_size(TYPE.body).text_color(t.muted).child("Select a file"))
      .child(div().text_size(TYPE.meta).text_color(t.dim).child("Its changes appear here."));

    const diffArea = div().flex_1().min_w(0).min_h(0).relative().font_family(settings().font_family ?? "JetBrains Mono").text_size(11)
      .child(div().id(`changes-diff-x-${this.uid}`).size_full().overflow_x_scrollbar()
        .child(div().w_full().min_w(this.diffWidth).h_full()
          .child(v_virtual_list(diffId, this.rows.length, 21, (i) => String(i),
            (range) => this.rows.slice(range.start, range.end).map((row) => this.diffRow(row, t)))
            .track_scroll(this.scroll).size_full())))
      .child(Scrollbar.vertical(diffId).viewport_from_layout().absolute().inset_0())
      .when(!this.open && this.files.length > 0, (el) => el.child(emptyHint));

    const rightPanel = resizable_panel().size_range(240).child(
      v_flex().size_full().min_w(0).min_h(0).bg(t.background)
        .border_l(1).border_color(withAlpha(t.foreground, "0d"))
        .when(Boolean(this.open), (el) => el.child(rightHeader))
        .child(diffArea)
    );

    return v_flex().id(`changes-${this.uid}`).size_full().min_w(0).min_h(0).overflow_hidden().bg(t.surface).text_color(t.foreground).text_size(13).track_focus(this.handle)
      .on_key_down((e, cx) => {
        if (e.key === "escape" && this.typing) { this.typing = false; this.handle.focus(); cx.stop_propagation(); cx.notify(); }
      })
      // 原生分栏按实例保留拖动后的宽度，重绘和切换标签不会重置。
      .child(h_resizable(`changes-split-${this.uid}`).flex_1().min_w(0).min_h(0)
        .child(leftPanel)
        .child(rightPanel));
  }
}
