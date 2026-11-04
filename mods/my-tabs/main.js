import { View, div, svg, image } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, panes, run, openOverlay, theme, window, shared, layout, settings } from "herdr";

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

export default class Tabs extends View {
  init() {
    this.pressed = null;
    this.panels = JSON.parse(localStorage.getItem("panels") ?? "{}");
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
    localStorage.setItem("panels", JSON.stringify(this.panels));
  }

  render() {
    const t = theme();
    const space = spaces().find(p => p.active);
    const shown = space?.tabs ?? [];
    const stop = (_e, cx) => cx.stop_propagation();
    const button = (id, label, action) => div().id(id).size(26).flex_none().flex().items_center().justify_center().rounded(6).text_color(t.muted).hover(s => s.bg(t.hover).text_color(t.foreground))
      .on_mouse_down("left", stop).on_click(action).child(label);
    // A default name is the tab's number ("1") or its id: label it by what it
    // runs, and keep the labels distinct when two tabs share a folder.
    const entries = shown.map((c, i) => {
      const mine = panes().filter(p => p.tab === c.id);
      const pane = mine.find(p => p.program?.agent) ?? mine[0];
      const program = pane?.program;
      const auto = /^(tb)?\d+$/.test(c.name);
      const dir = pane?.cwd?.replace(/\/+$/, "").split("/").pop();
      return { c, i, program, auto, base: dir && dir !== "~" ? dir : program?.name ?? "Terminal" };
    });
    const programName = (e) => e.program?.name ?? "Terminal";
    const labels = new Map(entries.map((e) => {
      if (!e.auto) return [e.c.id, e.c.name];
      if (entries.filter((x) => x.base === e.base).length === 1) return [e.c.id, e.base];
      const p = programName(e);
      if (entries.filter((x) => programName(x) === p).length === 1) return [e.c.id, p];
      return [e.c.id, `${p} ${e.i + 1}`];
    }));
    const item = ({ c, i, program }) => {
      const name = labels.get(c.id);
      return h_flex().id(`tab-${c.id}`).relative().h(29).px(12).gap(8).rounded(8).items_center().flex_none().text_size(13)
        .border(1).border_color(c.active ? "#4a4e56" : "#2f333a").bg(c.active ? t.raised : t.chrome).text_color(c.active ? t.foreground : t.muted)
        .hover(s => s.bg(t.hover))
        .on_mouse_down("left", (e, cx) => { cx.stop_propagation(); this.pressed = i; if (e.click_count === 2) run("tab.rename", { id: c.id }); })
        .on_mouse_up("left", () => {
          const from = this.pressed; this.pressed = null;
          if (from !== null && from !== i) run("tab.move", { id: shown[from].id, index: space.tabs.findIndex(x => x.id === c.id) + 1 });
          else run("tab.select", { id: c.id });
        })
        .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); openOverlay({ mod: "menu", kind: "popup", width: 200, props: { tab: "tab", target: { id: c.id, space: space.id } } }); })
        .when(Boolean(program?.icon), el => el.child(program.tint ? svg(program.icon).size(16).text_color(t.muted) : image(program.icon).size(16)))
        .child(div().max_w(170).truncate().child(name))
        .when(c.zoomed, el => el.child(svg("mods/pane/zoom.svg").size(11).flex_none().text_color(t.muted)))
        .when(c.status === "working", el => el.child(div().w(14).flex_none().text_center().text_size(13).text_color(t.working).frames(["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"], 80)))
        .when(c.status === "blocked" || c.status === "done", el => el.child(div().w(14).flex_none().flex().items_center().justify_center().child(div().size(6).rounded(3).bg(t[c.status]))))
        .child(div().id(`close-${c.id}`).size(16).flex().flex_none().items_center().justify_center().rounded(4).text_color(t.muted).opacity(c.active ? 0.9 : 0.4).hover(s => s.bg(t.hover).text_color(t.foreground).opacity(1)).on_mouse_down("left", stop).on_click((_e, cx) => { cx.stop_propagation(); run("tab.close", { id: c.id }); }).child(svg("mods/pane/close.svg").size(11)))
        .when(c.active, el => el.child(div().absolute().left(8).right(8).top(0).h(1).rounded(1).bg("#ffffff14")));
    };
    const root = layout(), sidebar = find(root, "sidebar"), w = window();
    // Old saved rails and a dragged-narrow sidebar can be smaller than the window buttons.
    const lightsPadding = w?.platform === "macos" && w.titlebar === "none" && !w.fullscreen && root?.traffic_lights
      ? Math.max(10, (root.traffic_lights[0] + 64) / settings().zoom - (sidebar?.hidden ? 0 : sidebar?.size?.px ?? 0))
      : 10;
    const panel = find(root, "panel"), body = find(root, "panel-body");
    const enabled = shared("workspace.panels") ?? ["files", "changes"];
    this.syncPanel(space, panel, body, enabled);
    const panelButton = (id, label, icon) => {
      const on = panel && !panel.hidden && body?.active === id;
      return h_flex().id(`panel-${id}`).h(26).px(8).gap(5).flex_none().items_center().rounded(6)
        .text_size(12).bg(on ? t.selected : t.chrome).text_color(on ? t.foreground : t.muted)
        .hover(s => s.bg(t.hover)).on_mouse_down("left", stop)
        .on_click(() => {
          if (on) run("layout.hide", { id: "panel" });
          else { run("layout.select", { stack: "panel-body", child: id }); run("layout.show", { id: "panel" }); }
        }).child(svg(icon).size(14)).child(label);
    };
    const newTab = div().id("tab-new").h(29).w(26).flex_none().flex().items_center().justify_center().rounded(8).text_color(t.muted)
      .hover(s => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
      .on_click(() => openOverlay({ mod: "new-menu", kind: "popup", width: 250, height: 512 })).child("+");
    return h_flex().size_full().min_w(0).px(10).pl(lightsPadding).gap(4).items_center().bg(t.chrome).border_b(1).border_color(t.border)
      .on_mouse_up("left", () => { this.pressed = null; })
      .on_scroll_wheel(e => { if (Math.abs(e.delta.y) >= 1) run(e.delta.y > 0 ? "tab.prev" : "tab.next"); })
      .child(h_flex().id("tab-scroll").flex_1().min_w(0).h_full().items_center().gap(4).overflow_x_scrollbar().children([...entries.map(item), newTab]))
      .when(enabled.includes("files"), el => el.child(panelButton("files", "Files", "mods/files/file.svg")))
      .when(enabled.includes("changes"), el => el.child(panelButton("changes", "Changes", "mods/changes/changes.svg")))
      .when(w?.buttons, el => el.child(button("minimize", w.platform === "windows" ? svg("mods/my-tabs/win-min.svg").size(16) : "−", () => run("window.minimize")))
        .child(button("maximize", w.platform === "windows" ? svg(`mods/my-tabs/${w.maximized ? "win-restore" : "win-max"}.svg`).size(16) : "□", () => run("window.maximize")))
        .child(button("close-window", w.platform === "windows" ? svg("mods/my-tabs/win-close.svg").size(16) : svg("mods/pane/close.svg").size(13), () => run("window.close"))));
  }
}
