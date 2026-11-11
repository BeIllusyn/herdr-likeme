// The sidebar: spaces and agents in one scrolling column, each section a retained
// view of its own. The layout has one block for both, so the split follows the
// content instead of a fixed half of the sidebar.
import { View } from "gpui-kit";
import { v_flex } from "gpui-base";
import { props, theme } from "herdr";
import { withAlpha, UI } from "./colors.js";
import Spaces from "./spaces.js";
import Agents from "./agents.js";

export default class Sidebar extends View {
  init(_props, cx) {
    const sortMenu = Boolean(props()?.sortMenu);
    // The sort popup is a copy of this mod: only the agents view is needed.
    if (!sortMenu) this.spaces = cx.new(Spaces, { embedded: true });
    this.agents = cx.new(Agents, { embedded: true, sortMenu, overlay: props()?.overlay });
  }

  render() {
    if (props()?.sortMenu) return this.agents;
    // The bar shows itself when the pointer is over the list instead of sitting
    // there always: the column reads cleaner when nothing is scrolling.
    return v_flex().size_full().min_h(0)
      .border_r(1).border_color(withAlpha(theme().foreground, UI.lineSoft))
      .overflow_y_scrollbar().mode("hover")
      .child(this.spaces)
      .child(this.agents);
  }
}
