// The brand bar and sidebar footer, cloned from the shipped workspace-chrome
// (0.1.12): its sidebar toggle is gone (the layout's sidebar is fixed open), the
// footer drops its top border so the chrome column runs into the sidebar list
// with no line, and the brand bar keeps only its window-drag surface — no logo,
// no search button.
import { View, div, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { theme, run, props, updates } from "herdr";

const alpha = (c, a) => (c && /^#[0-9a-f]{6}$/i.test(c) ? c + a : c);

export default class Brand extends View {
  footer(t) {
    const row = (id, icon, label, dim, action) => h_flex().id(id).h(26).px(7).gap(8).items_center().rounded(5)
      .text_color(dim ? t.dim : t.muted).hover(s => s.bg(alpha(t.foreground, "08")).text_color(t.foreground)).cursor_pointer()
      .on_click(action).child(svg(`mods/workspace-chrome/${icon}.svg`).size(13))
      .child(label);
    const ready = div().size(5).rounded_full().bg(t.accent);
    return v_flex().size_full().px(8).pt(6).pb(7).text_size(11.5)
      .border_t(1).border_color(alpha(t.foreground, "0a"))
      .child(row("settings", "settings", "Settings", false, () => run("app.settings"))
        .when(Boolean(updates().app.ready), el => el.child(ready)))
      .child(row("machine", "plus", "Add machine", true, () => run("mod.open", { name: "machine-add" })));
  }
  render() {
    const t = theme();
    if (props()?.footer) return this.footer(t);
    // Nothing over the chrome but the drag surface itself: the sidebar column
    // already paints the chrome, and no line runs under the traffic lights.
    return h_flex().size_full();
  }
}
