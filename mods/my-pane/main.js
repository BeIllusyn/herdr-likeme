// A pane's header, for layouts that frame their panes:
//   { "tab": "active", "pane": { "header": { "content": { "mod": "my-pane" } } } }
// Shows the program's icon (the app's program table), the agent's name or
// the terminal's title, the folder, and the agent's status; buttons split, zoom and close
// this pane. Props from the app: { pane, terminal }. Click: focus the pane.
// The focused header wears its space's colour as a dark, opaque tint — the
// same language as the active tab and the selected sidebar row.

import { View, div, svg, image } from "gpui-kit";
import { h_flex } from "gpui-base";
import { panes, props, run, theme, home, focused, shared } from "herdr";
import { markColor, mix } from "./colors.js";

const HOME = home();

function icon(p, size, color) {
  if (!p?.icon) return null;
  return p.tint ? svg(p.icon).size(size).flex_none().text_color(color) : image(p.icon).w(size).h(size).flex_none();
}

function folder(cwd) {
  if (!cwd) return "";
  return cwd === HOME ? "~" : cwd.startsWith(HOME + "/") ? "~" + cwd.slice(HOME.length) : cwd;
}

export default class Pane extends View {
  me() {
    return panes().find((p) => p.pane === props()?.pane);
  }

  button(t, id, icon, command, args) {
    return div()
      .id(id)
      .p(3)
      .rounded(4)
      .text_color(t.muted)
      .hover((s) => s.bg(t.hover).text_color(t.foreground))
      .on_click((_e, cx) => {
        cx.stop_propagation();
        run(command, args);
      })
      .child(svg(`mods/my-pane/${icon}.svg`).size(14));
  }

  render(cx) {
    const t = theme();
    const p = this.me();
    if (!p) return div();
    const name = ((p.program?.agent || p.program?.shell) && p.program.name) || p.title || p.program?.name || "shell";
    const pic = icon(p.program, 14, t.muted);
    const st = p.status;
    const pane = p.pane;
    // The active tab and selected sidebar row use a 30% blend; a whole header
    // is much larger, so it takes the same colour at a quieter 16%. Only the
    // focused header wears it, so only that one does the lookup and blend.
    let bg = "#1a1d22";
    if (p.focused) {
      const fill = markColor((shared("space.colors") ?? {})[focused()?.space], t);
      bg = fill ? mix("#1a1d22", fill, 0.16) : "#1d2128";
    }
    return h_flex()
      .id(`pane-head-${pane}`)
      .size_full()
      .px(10)
      .gap(8)
      .items_center()
      .bg(bg)
      .overflow_hidden()
      .border_b(1)
      .border_color(t.border)
      .text_size(12)
      .on_click(() => run("pane.focus", { pane }))
      .when(Boolean(pic), (el) => el.child(pic))
      .child(div().flex_none().truncate().max_w(260).text_size(12.5).font_medium().text_color(t.foreground).child(name))
      .child(div().flex_1().truncate().text_size(11.5).text_color(t.muted).child(folder(p.cwd)))
      // The window controls keep their places whether the pointer is here or not.
      // A quiet agent shows no status mark at all: a ring beside every idle pane
      // read as something to act on. The slot keeps its width so a status turn
      // never moves the folder's truncation point.
      .child(div().w(64).h_full().flex_none().flex().items_center().justify_end()
        .when(st === "working", el => el.child(div().w(18).h_full().flex_none().flex().items_center().justify_center()
          .child(div().text_size(16).line_height("16px").text_color(t.working).frames(["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"], 80))))
        .when(st === "blocked", el => el.child(div().flex_none().px(6).h(18).flex().items_center().rounded(5).bg(t.blocked + "26").text_size(10.5).font_semibold().text_color(t.blocked).child("Needs you")))
        .when(st === "done", el => el.child(div().size(7).flex_none().rounded(4).bg(t.done))))
      .child(this.button(t, `ph-r-${pane}`, "split-right", "pane.split", { direction: "right", pane }))
      .child(this.button(t, `ph-d-${pane}`, "split-down", "pane.split", { direction: "down", pane }))
      .child(this.button(t, `ph-z-${pane}`, p.zoomed ? "unzoom" : "zoom", "pane.zoom", { pane }))
      .child(this.button(t, `ph-x-${pane}`, "close", "pane.close", { pane }));
  }
}
