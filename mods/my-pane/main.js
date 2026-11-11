// A pane's header, for layouts that frame their panes:
//   { "tab": "active", "pane": { "header": { "content": { "mod": "my-pane" } } } }
// Shows the program's icon (the app's program table), the agent's name or
// the terminal's title, the folder, and the agent's status; buttons split, zoom and close
// this pane. Props from the app: { pane, terminal }. Click: focus the pane.
// The focused header wears its space's colour as an opaque tint on the theme's
// surface — the same language as the active tab and the selected sidebar row.

import { View, div, svg, image } from "gpui-kit";
import { h_flex } from "gpui-base";
import { panes, props, run, theme, home, focused, shared } from "herdr";
import { markColor, withAlpha, mix, UI, TYPE } from "./colors.js";

const HOME = home();
// A mod pane carries its folder name as `title`; the helper panes read better.
const MOD_NAMES = { "my-files": "Files", "my-changes": "Changes" };

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
      .size(24)
      .flex_none()
      .flex()
      .items_center()
      .justify_center()
      .rounded(5)
      .text_color(t.muted)
      .hover((s) => s.bg(withAlpha(t.foreground, UI.hover)).text_color(t.foreground))
      .on_click((_e, cx) => {
        cx.stop_propagation();
        run(command, args);
      })
      .child(svg(`mods/my-pane/${icon}.svg`).size(13));
  }

  render(cx) {
    const t = theme();
    const p = this.me();
    if (!p) return div();
    const name = ((p.program?.agent || p.program?.shell) && p.program.name) || (p.mod && MOD_NAMES[p.mod]) || p.title || p.program?.name || "shell";
    const st = p.status;
    const pane = p.pane;
    // The header is always the theme's surface. Focus adds a little of the
    // space's colour (8 %), brightens the title and gives the program icon the
    // same colour — selection by warmth and type, not by a line.
    let bg = t.surface;
    let focusedHere = false;
    let accent = t.accent;
    // A mod pane holds the keyboard; `focused` on the panes list is not always
    // cleared for the terminal beside it, so trust the live focus when there is
    // one. A layout terminal block (no model pane focused) keeps `focused`.
    const liveFocus = focused()?.pane;
    if (liveFocus ? liveFocus === p.pane : p.focused) {
      focusedHere = true;
      const fillRaw = markColor((shared("space.colors") ?? {})[focused()?.space], t);
      const fill = fillRaw ? fillRaw.slice(0, 7) : null;
      bg = fill ? mix(t.surface, fill, 0.08) : t.raised;
      accent = fill ?? t.accent;
    }
    const pic = icon(p.program, 13, focusedHere ? accent : t.dim);
    return h_flex()
      .id(`pane-head-${pane}`)
      .relative()
      .size_full()
      .px(10)
      .gap(8)
      .items_center()
      .bg(bg)
      .border_b(1).border_color(withAlpha(t.foreground, "10"))
      .overflow_hidden()
      .text_size(TYPE.small)
      .on_click(() => run("pane.focus", { pane }))
      .when(Boolean(pic), (el) => el.child(pic))
      .child(div().flex_none().truncate().max_w(260).text_size(TYPE.title).font_weight(focusedHere ? 600 : 500)
        .text_color(focusedHere ? t.foreground : t.muted).child(name))
      .child(div().flex_1().truncate().text_size(TYPE.meta).text_color(focusedHere ? t.muted : t.dim).child(folder(p.cwd)))
      // The window controls keep their places whether the pointer is here or not.
      // A quiet agent shows no status mark at all: a ring beside every idle pane
      // read as something to act on. The slot keeps its width so a status turn
      // never moves the folder's truncation point.
      .child(div().w(58).h_full().flex_none().flex().items_center().justify_end()
        .when(st === "working", el => el.child(div().w(18).h_full().flex_none().flex().items_center().justify_center()
          .child(div().text_size(14).line_height("14px").text_color(t.working).frames(["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"], 80))))
        .when(st === "blocked", el => el.child(div().flex_none().px(5).h(16).flex().items_center().rounded(4).bg(withAlpha(t.blocked, "1f")).text_size(TYPE.label).font_semibold().text_color(t.blocked).child("NEEDS YOU")))
        .when(st === "done", el => el.child(div().size(5).flex_none().rounded_full().bg(t.done))))
      .child(this.button(t, `ph-r-${pane}`, "split-right", "pane.split", { direction: "right", pane }))
      .child(this.button(t, `ph-d-${pane}`, "split-down", "pane.split", { direction: "down", pane }))
      .child(this.button(t, `ph-z-${pane}`, p.zoomed ? "unzoom" : "zoom", "pane.zoom", { pane }))
      .child(this.button(t, `ph-x-${pane}`, "close", "pane.close", { pane }));
  }
}
