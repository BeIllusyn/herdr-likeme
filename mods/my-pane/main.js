// A pane's header, for layouts that frame their panes:
//   { "tab": "active", "pane": { "header": { "content": { "mod": "my-pane" } } } }
// Shows the program's icon (the app's program table), the agent's name or
// the terminal's title, the folder, and the agent's status; buttons split, zoom and close
// this pane. Props from the app: { pane, terminal }. Click: focus the pane.
// The header background carries an iridescent, left-to-right aurora.

import { View, div, svg, image, PathBuilder, Background } from "gpui-kit";
import { h_flex } from "gpui-base";
import { panes, props, run, theme, home } from "herdr";

// Immutable geometry, built once: each header used to rebuild a path for every
// one of its fourteen washes on every render.
const RECT = PathBuilder.fill()
  .move_to("0%", "0%").line_to("100%", "0%")
  .line_to("100%", "100%").line_to("0%", "100%")
  .close().build();
const HOME = home();

// Backgrounds are reusable and the aurora's colours never change: build each
// gradient once instead of on every header render.
const GRADIENTS = new Map();
const gradient = (from, to) => {
  const key = from + to;
  let background = GRADIENTS.get(key);
  if (!background) GRADIENTS.set(key, background = Background.linear_gradient(90, from, to));
  return background;
};

// A left-to-right wash across the element it fills.
const wash = (from, to) =>
  window.paint_path(RECT, gradient(from, to)).size_full();

// One soft colour ribbon: transparent → colour A → colour B → transparent.
// The whole ribbon slides across the header, so each colour fades in at the
// left and out at the right instead of appearing as a hard block.
const ribbon = (pane, key, width, from, to, period, a, b, alpha = "66") => {
  const A = `${a}${alpha}`, B = `${b}${alpha}`;
  return h_flex()
    .id(`pane-aurora-${pane}-${key}`)
    .absolute()
    .top(0)
    .h_full()
    .w(width * 3)
    .left(from)
    .loop("left", { from, to, period, easing: "linear" })
    .child(wash(`${a}00`, A).w(width).h_full())
    .child(wash(A, B).w(width).h_full())
    .child(wash(B, `${b}00`).w(width).h_full());
};

// Only the focused pane gets the aurora; inactive headers stay plain, and the
// aurora itself is the focus mark (no accent frame or hairline).
const aurora = (pane) => div()
  .id(`pane-aurora-${pane}`)
  .absolute()
  .top(0)
  .left(0)
  .size_full()
  // The wash itself fades in from the left, so the header enters as a soft
  // colour instead of switching on; the moving ribbons carry it onward.
  .child(wash("#ff4d9d0a", "#4de1ff4a"))
  .child(wash("#7c5cff00", "#ffb84d42"))
  .child(ribbon(pane, "rose", 320, -960, 3000, 14000, "#ff4d9d", "#ffb84d", "6b"))
  .child(ribbon(pane, "ice", 380, -1140, 3200, 16000, "#4de1ff", "#7c5cff", "63"))
  .child(ribbon(pane, "mint", 280, -840, 2800, 11000, "#5cffb0", "#4d7dff", "5c"))
  .child(ribbon(pane, "sheen", 90, -270, 3000, 7000, "#ffffff", "#ffffff", "26"));

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
    return h_flex()
      .id(`pane-head-${pane}`)
      .size_full()
      .px(10)
      .gap(8)
      .items_center()
      .bg("#1a1d22")
      .overflow_hidden()
      .border_b(1)
      .border_color(t.border)
      .text_size(12)
      .on_click(() => run("pane.focus", { pane }))
      .when(p.focused, (el) => el.child(aurora(pane)))
      .when(Boolean(pic), (el) => el.child(pic))
      .child(div().flex_none().truncate().max_w(260).text_size(12.5).font_medium().text_color(t.foreground).child(name))
      .child(div().flex_1().truncate().text_size(11.5).text_color(t.muted).child(folder(p.cwd)))
      // The window controls keep their places whether the pointer is here or not.
      // A quiet agent shows no status mark at all: a ring beside every idle pane
      // read as something to act on.
      .when(st === "working", el => el.child(div().w(18).h_full().flex_none().flex().items_center().justify_center()
        .child(div().text_size(16).line_height("16px").text_color(t.working).frames(["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"], 80))))
      .when(st === "blocked", el => el.child(div().flex_none().px(6).h(18).flex().items_center().rounded(5).bg(t.blocked + "26").text_size(10.5).font_semibold().text_color(t.blocked).child("Needs you")))
      .when(st === "done", el => el.child(div().size(7).flex_none().rounded(4).bg(t.done)))
      .child(this.button(t, `ph-r-${pane}`, "split-right", "pane.split", { direction: "right", pane }))
      .child(this.button(t, `ph-d-${pane}`, "split-down", "pane.split", { direction: "down", pane }))
      .child(this.button(t, `ph-z-${pane}`, p.zoomed ? "unzoom" : "zoom", "pane.zoom", { pane }))
      .child(this.button(t, `ph-x-${pane}`, "close", "pane.close", { pane }));
  }
}
