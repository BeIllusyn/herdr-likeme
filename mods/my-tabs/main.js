import { View, div, svg, image } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, panes, run, openOverlay, theme, window, shared, layout } from "herdr";
import { markColor, mix } from "./colors.js";

// Every node the tab bar needs, in one walk: `layout()` is the whole layout
// document, and the bar used to walk it three times per render.
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

export default class Tabs extends View {
  init() {
    this.pressed = null;
    this.over = null;
    // `likeme.` namespaces the choice; the bare key is the pre-rename one.
    this.panels = JSON.parse((localStorage.getItem("likeme.panels") ?? localStorage.getItem("panels")) ?? "{}");
  }

  // The side panel is remembered per space: switching shows that space's choice
  // (closed if it never had one), and opening or closing it records it.
  syncPanel(space, panel, body, enabled) {
    if (!space || !panel) return;
    const now = panel.hidden ? null : body?.active ?? null;
    if (space.id !== this.space) {
      const first = this.space === undefined;
      this.space = space.id; this.pending = null;
      if (!(first && !(space.id in this.panels))) {
        const stored = this.panels[space.id] ?? null, want = enabled.includes(stored) ? stored : null;
        if (want !== now) {
          this.pending = { want, until: Date.now() + 1000 };
          if (want) { run("layout.select", { stack: "panel-body", child: want }); run("layout.show", { id: "panel" }); }
          else run("layout.hide", { id: "panel" });
          return;
        }
      }
    }
    // Until the restore lands (or something else won), the old state isn't a choice.
    if (this.pending) {
      if (this.pending.want !== now && Date.now() < this.pending.until) return;
      this.pending = null;
    }
    if (this.panels[space.id] === now) return;
    this.panels[space.id] = now;
    localStorage.setItem("likeme.panels", JSON.stringify(this.panels));
  }

  render() {
    const t = theme();
    const space = spaces().find(p => p.active);
    const shown = space?.tabs ?? [];
    const stop = (_e, cx) => cx.stop_propagation();
    const button = (id, label, action) => div().id(id).size(26).flex_none().flex().items_center().justify_center().rounded(6).text_color(t.muted).hover(s => s.bg(t.hover).text_color(t.foreground))
      .on_mouse_down("left", stop).on_click(action).child(label);
    // A tab still named by its number shows what it runs; a name the person gave
    // it always wins (`named`). Keep the labels distinct when two tabs share a
    // folder. `panes()` is one copy per render, grouped by tab once.
    const panesByTab = new Map();
    for (const p of panes()) {
      let mine = panesByTab.get(p.tab);
      if (!mine) panesByTab.set(p.tab, mine = []);
      mine.push(p);
    }
    const entries = shown.map((c, i) => {
      const mine = panesByTab.get(c.id) ?? [];
      const pane = mine.find(p => p.program?.agent) ?? mine[0];
      const program = pane?.program;
      const auto = !c.named;
      const dir = pane?.cwd?.replace(/\/+$/, "").split("/").pop();
      return { c, i, program, auto, base: dir && dir !== "~" ? dir : program?.name ?? "Terminal" };
    });
    const programName = (e) => e.program?.name ?? "Terminal";
    // One count per base and program, not a filter of all entries per entry.
    const baseUse = new Map(), programUse = new Map();
    for (const e of entries) {
      baseUse.set(e.base, (baseUse.get(e.base) ?? 0) + 1);
      const p = programName(e);
      programUse.set(p, (programUse.get(p) ?? 0) + 1);
    }
    const labels = new Map(entries.map((e) => {
      if (!e.auto) return [e.c.id, e.c.name];
      if (baseUse.get(e.base) === 1) return [e.c.id, e.base];
      const p = programName(e);
      if (programUse.get(p) === 1) return [e.c.id, p];
      return [e.c.id, `${p} ${e.i + 1}`];
    }));
    // The active tab is the same flat tint as a selected sidebar row: an opaque
    // square mixed from `raised` and the space's colour, filling the bar's height
    // and sitting flush against the tabs beside it.
    const fill = markColor((shared("space.colors") ?? {})[space?.id], t);
    const balloon = fill ? mix(t.raised, fill, 0.30) : t.raised;
    const item = ({ c, i, program }) => {
      const name = labels.get(c.id);
      return h_flex().id(`tab-${c.id}`).relative().h_full().px(12).gap(8).items_center().flex_none().text_size(13)
        .when(c.active, el => el.bg(balloon).text_color(t.foreground))
        .when(!c.active, el => el
          .when(Boolean(fill), r => r.bg(fill + "0d"))
          .text_color(t.muted)
          .hover(s => s.bg(t.hover)))
        .on_mouse_down("left", (e, cx) => { cx.stop_propagation(); this.pressed = i; this.over = i; if (e.click_count === 2) run("tab.rename", { id: c.id }); })
        .on_mouse_move((_e, cx) => {
          if (this.pressed === null || this.over === i) return;
          this.over = i;
          cx.notify();
        })
        .on_mouse_up("left", (_e, cx) => {
          const from = this.pressed, over = this.over;
          this.pressed = null; this.over = null;
          // A press that started on the close button (which stops the mouse-down)
          // is not a tab press: don't select the tab being closed.
          if (from === null) return;
          if (shown[from] && over === i && from !== i) run("tab.move", { id: shown[from].id, index: space.tabs.findIndex(x => x.id === c.id) + 1 });
          else if (from === i) run("tab.select", { id: c.id });
          cx.notify();
        })
        .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); openOverlay({ mod: "menu", kind: "popup", width: 200, props: { tab: "tab", target: { id: c.id, space: space.id } } }); })
        // The drop line sits on the edge the tab would move past.
        .when(this.pressed !== null && this.pressed !== i && this.over === i, el => el.child(
          div().absolute().top(0).bottom(0).w(2).bg(t.accent)
            .when(this.pressed < i, line => line.right(0))
            .when(this.pressed > i, line => line.left(0)),
        ))
        .when(Boolean(program?.icon), el => el.child(program.tint ? svg(program.icon).size(16).text_color(t.muted) : image(program.icon).size(16)))
        .child(div().max_w(170).truncate().tooltip(name).child(name))
        .when(c.zoomed, el => el.child(svg("mods/pane/zoom.svg").size(11).flex_none().text_color(t.muted)))
        // The status slot is always there, so a state turn never changes the tab's width.
        .child(div().w(18).h_full().flex_none().flex().items_center().justify_center()
          .when(c.status === "working", el => el.child(div().text_size(16).line_height("16px").text_color(t.working).frames(["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"], 80)))
          .when(c.status === "blocked" || c.status === "done", el => el.child(div().size(6).rounded(3).bg(t[c.status]))))
        .child(div().id(`close-${c.id}`).size(16).flex().flex_none().items_center().justify_center().rounded(4).text_color(t.muted).opacity(c.active ? 0.9 : 0.4).hover(s => s.bg(t.hover).text_color(t.foreground).opacity(1)).on_mouse_down("left", stop).on_click((_e, cx) => { cx.stop_propagation(); run("tab.close", { id: c.id }); }).child(svg("mods/pane/close.svg").size(11)));
    };
    const root = layout(), w = window();
    const nodes = findMany(root, ["panel", "panel-body"]);
    const panel = nodes.panel, body = nodes["panel-body"];
    const enabled = shared("workspace.panels") ?? ["files", "changes"];
    this.syncPanel(space, panel, body, enabled);
    const panelButton = (id, label, icon) => {
      const on = panel && !panel.hidden && body?.active === id;
      return h_flex().id(`panel-${id}`).h_full().px(12).gap(5).flex_none().items_center()
        .text_size(12).bg(on ? balloon : fill ? fill + "0d" : t.chrome).text_color(on ? t.foreground : t.muted)
        // Hovering an open panel keeps its tint: the background is the only sign it's on.
        .when(!on, el => el.hover(s => s.bg(t.hover))).on_mouse_down("left", stop)
        .on_click(() => {
          if (on) run("layout.hide", { id: "panel" });
          else { run("layout.select", { stack: "panel-body", child: id }); run("layout.show", { id: "panel" }); }
        }).child(svg(icon).size(14)).child(label);
    };
    const newTab = div().id("tab-new").h_full().w(26).flex_none().flex().items_center().justify_center().text_color(t.muted)
      .hover(s => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
      .on_click(() => openOverlay({ mod: "new-menu", kind: "popup", width: 250, height: 512 })).child("+");
    // One-click starts beside the +, using the program table's own icons: the
    // shipped tinted glyphs inherit the button's colour, Claude's stays orange.
    const launch = (id, label, icon, tint, argv) => div().id(id).h_full().w(26).flex_none().flex().items_center().justify_center()
      .text_color(t.muted).tooltip(label)
      .hover(s => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
      .on_click(() => run("tab.new", { space: space?.id, argv }))
      .child(tint ? svg(icon).size(15) : image(icon).size(15));
    const launches = [
      launch("start-claude", "Claude Code", "icons/claude.svg", false, ["claude", "--dangerously-skip-permissions"]),
      launch("start-pi", "Pi", "icons/pi.svg", true, ["pi"]),
      launch("start-lazygit", "Lazygit", "icons/lazygit.svg", true, ["lazygit"]),
      launch("start-nvim", "Neovim", "icons/nvim.svg", true, ["nvim"]),
    ];
    return h_flex().size_full().min_w(0).gap(0).items_center().bg(t.chrome)
      .on_mouse_up("left", () => { this.pressed = null; this.over = null; })
      .child(h_flex().id("tab-scroll").flex_1().min_w(0).h_full().items_center().gap(0).overflow_x_scrollbar().children([...entries.map(item), newTab, ...launches]))
      .when(enabled.includes("files"), el => el.child(panelButton("files", "Files", "mods/my-files/file.svg")))
      .when(enabled.includes("changes"), el => el.child(panelButton("changes", "Changes", "mods/my-changes/changes.svg")))
      .when(w?.buttons, el => el.child(button("minimize", w.platform === "windows" ? svg("mods/my-tabs/win-min.svg").size(16) : "−", () => run("window.minimize")))
        .child(button("maximize", w.platform === "windows" ? svg(`mods/my-tabs/${w.maximized ? "win-restore" : "win-max"}.svg`).size(16) : "□", () => run("window.maximize")))
        .child(button("close-window", w.platform === "windows" ? svg("mods/my-tabs/win-close.svg").size(16) : svg("mods/pane/close.svg").size(13), () => run("window.close"))));
  }
}
