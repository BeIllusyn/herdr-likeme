// The brand bar and sidebar footer, cloned from the shipped workspace-chrome
// (0.1.12): its sidebar toggle is gone (the layout's sidebar is fixed open), the
// footer drops its top border so the chrome column runs into the sidebar list
// with no line, and the brand bar keeps only its window-drag surface — no logo,
// no search button.
import { View, div, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { theme, run, props, updates } from "herdr";

export default class Brand extends View {
  footer(t) {
    const row = (id, icon, label, dim, action) => h_flex().id(id).h(28).px(8).gap(9).items_center().rounded(8)
      .text_color(dim ? t.dim : t.muted).hover(s => s.bg(t.hover).text_color(t.foreground)).cursor_pointer()
      .on_click(action).child(svg(`mods/workspace-chrome/${icon}.svg`).size(14))
      .child(label);
    const ready = div().size(6).rounded_full().bg(t.accent);
    return v_flex().size_full().bg(t.chrome).px(8).pt(4).pb(8).text_size(13)
      .child(row("settings", "settings", "Settings", false, () => run("app.settings"))
        .when(Boolean(updates().app.ready), el => el.child(ready)))
      .child(row("machine", "plus", "Add machine", true, () => run("mod.open", { name: "machine-add" })));
  }
  render() {
    const t = theme();
    if (props()?.footer) return this.footer(t);
    return h_flex().size_full().bg(t.chrome);
  }
}
