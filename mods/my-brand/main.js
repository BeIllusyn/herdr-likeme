// An empty window-drag surface above a footer in the sidebar's shared rhythm.
import { View, div, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { theme, run, props, updates } from "herdr";
import { withAlpha, UI, TYPE, SIZE } from "./colors.js";

export default class Brand extends View {
  footer(t) {
    const row = (id, icon, label, action) => h_flex().id(id).h(SIZE.button).px(8).gap(8).items_center().rounded(SIZE.radius)
      .text_color(t.muted).hover(s => s.bg(withAlpha(t.foreground, UI.hover)).text_color(t.foreground)).cursor_pointer()
      .on_click(action).child(svg(`mods/workspace-chrome/${icon}.svg`).size(14).flex_none()).child(label);
    return v_flex().size_full().p(SIZE.inset).gap(4).text_size(TYPE.small)
      .border_t(1).border_r(1).border_color(withAlpha(t.foreground, UI.lineSoft))
      .child(row("settings", "settings", "Settings", () => run("app.settings"))
        .when(Boolean(updates().app.ready), el => el.child(div().flex_1())
          .child(div().size(5).rounded_full().bg(t.accent).tooltip("Update available"))))
      .child(row("machine", "plus", "Add machine", () => run("mod.open", { name: "machine-add" })));
  }

  render() {
    const t = theme();
    if (props()?.footer) return this.footer(t);
    return h_flex().size_full().border_b(1).border_r(1).border_color(withAlpha(t.foreground, UI.lineSoft));
  }
}
