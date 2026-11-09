// The brand bar and sidebar footer, cloned from the shipped workspace-chrome
// (0.1.12): its sidebar toggle is gone (the layout's sidebar is fixed open), and
// the footer drops its top border so the chrome column runs into the sidebar
// list with no line. The logo, search button and footer rows are unchanged.
import { View, div, image, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { theme, run, window, props, updates } from "herdr";

export default class Brand extends View {
  button(t, id, label, action) {
    return div().id(id).size(26).flex_none().flex().items_center().justify_center().rounded(6).text_color(t.muted).hover(s => s.bg(t.hover).text_color(t.foreground))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation()).on_click(action).child(label);
  }
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
    const t = theme(), w = window();
    if (props()?.footer) return this.footer(t);
    return h_flex().size_full().bg(t.chrome).pl(14).pr(10).gap(4).items_center().text_size(13.5)
      .when(w?.platform === "macos" && !w?.fullscreen, el => el.pl(76))
      .child(h_flex().flex_1().gap(8).items_center().child(image("frame/welcome/herdr.png").size(20).rounded(5)).child(div().font_semibold().text_color(t.foreground).child("Herdr")))
      .child(this.button(t, "search", svg("mods/workspace-chrome/search.svg").size(15), () => run("mod.open", { name: "picker" })));
  }
}
