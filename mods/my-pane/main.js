// Pane headers share the tool views' height, with a quiet space tint on focus.
import { View, div, svg, image } from "gpui-kit";
import { h_flex } from "gpui-base";
import { panes, props, run, theme, home, focused, shared } from "herdr";
import { markColor, withAlpha, mix, UI, TYPE, SIZE } from "./colors.js";

const MOD_NAMES = { "my-files": "Files", "my-changes": "Changes" };

function icon(p, size, color) {
  if (!p?.icon) return null;
  return p.tint ? svg(p.icon).size(size).flex_none().text_color(color) : image(p.icon).size(size).flex_none();
}

function folder(cwd) {
  if (!cwd) return "";
  const base = home();
  return cwd === base ? "~" : cwd.startsWith(base + "/") ? "~" + cwd.slice(base.length) : cwd;
}

export default class Pane extends View {
  button(t, id, glyph, tip, command, args, danger = false) {
    return div().id(id).size(SIZE.control).flex_none().flex().items_center().justify_center().rounded(5)
      .text_color(t.muted).cursor_pointer().tooltip(tip)
      .hover(s => s.bg(withAlpha(danger ? t.ansi1 : t.foreground, UI.hover)).text_color(danger ? t.ansi1 : t.foreground))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click((_e, cx) => { cx.stop_propagation(); run(command, args); })
      .child(svg(`mods/my-pane/${glyph}.svg`).size(13));
  }

  render() {
    const t = theme();
    const p = panes().find(p => p.pane === props()?.pane);
    if (!p) return div();
    const name = ((p.program?.agent || p.program?.shell) && p.program.name) || (p.mod && MOD_NAMES[p.mod]) || p.title || p.program?.name || "shell";
    const pane = p.pane, focus = focused();
    // A mod pane may hold the keyboard while a neighbouring terminal still has
    // its old focused flag. The live focus takes precedence over that flag.
    const active = focus?.pane ? focus.pane === pane : p.focused;
    const fill = markColor((shared("space.colors") ?? {})[focus?.space], t);
    const accent = fill ?? t.accent;
    const bg = active ? mix(t.surface, fill ?? t.foreground, fill ? 0.06 : 0.025) : t.surface;
    const pic = icon(p.program, 14, active ? accent : t.dim);
    const path = folder(p.cwd);
    return h_flex().id(`pane-head-${pane}`).size_full().min_w(0).px(12).gap(8).items_center().bg(bg)
      .border_b(1).border_color(withAlpha(t.foreground, UI.lineSoft)).overflow_hidden()
      .on_click(() => run("pane.focus", { pane }))
      .when(Boolean(pic), el => el.child(pic))
      .child(div().min_w(0).max_w(200).truncate().text_size(TYPE.title).font_weight(active ? 600 : 500)
        .text_color(active ? t.foreground : t.muted).tooltip(name).child(name))
      .child(div().flex_1().min_w(0).truncate().text_size(TYPE.meta).text_color(active ? t.muted : t.dim).tooltip(path).child(path))
      // A fixed status slot keeps the path and controls still as an agent works.
      .child(h_flex().w(68).h_full().flex_none().items_center().justify_end()
        .when(p.status === "working", el => el.child(div().text_size(14).line_height("14px").text_color(t.working)
          .frames(["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"], 80)))
        .when(p.status === "blocked", el => el.child(h_flex().flex_none().px(4).h(18).items_center().rounded(4)
          .bg(withAlpha(t.blocked, UI.badge)).border(1).border_color(withAlpha(t.blocked, UI.tintEdge))
          .text_size(TYPE.label).font_semibold().text_color(t.blocked).child("NEEDS YOU")))
        .when(p.status === "done", el => el.child(div().size(5).rounded_full().bg(t.done))))
      .child(h_flex().flex_none().gap(2).items_center()
        .child(this.button(t, `ph-r-${pane}`, "split-right", "Split right", "pane.split", { direction: "right", pane }))
        .child(this.button(t, `ph-d-${pane}`, "split-down", "Split down", "pane.split", { direction: "down", pane }))
        .child(this.button(t, `ph-z-${pane}`, p.zoomed ? "unzoom" : "zoom", p.zoomed ? "Restore pane" : "Zoom pane", "pane.zoom", { pane }))
        .child(this.button(t, `ph-x-${pane}`, "close", "Close pane", "pane.close", { pane }, true)));
  }
}
