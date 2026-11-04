import { View, div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, agents, theme, run, window, keys } from "herdr";

const RANK = { blocked: 4, done: 3, working: 2, idle: 1 };

export default class WorkspaceStatus extends View {
  // The palette key as actually bound, not a hardcoded one; without a
  // binding the hint stays useful ("commands") instead of lying.
  hint() {
    const mac = window()?.platform === "macos";
    const mod = { cmd: mac ? "⌘" : "Ctrl+", ctrl: mac ? "⌃" : "Ctrl+", shift: mac ? "⇧" : "Shift+", alt: mac ? "⌥" : "Alt+", option: mac ? "⌥" : "Alt+" };
    const b = keys().find((k) => k.section === "global" && k.action === "app.palette");
    const parts = b && b.keys.endsWith("--") ? [...b.keys.slice(0, -2).split("-"), "-"] : b?.keys.split("-");
    return parts ? parts.map((p) => mod[p.toLowerCase()] ?? p.toUpperCase()).join("") : "";
  }

  // A small keycap: the chord reads as a key, not as part of the sentence.
  kbd(t, key) {
    return h_flex().h(18).px(5).items_center().rounded(4).border(1).border_color(t.border)
      .bg(t.raised).text_size(10.5).text_color(t.muted).child(key);
  }

  render() {
    const t = theme();
    const space = spaces().find(s => s.active);
    const list = agents();
    const needs = list.filter(a => a.status === "blocked").length;
    // The dot is the most urgent state, so the bar says "working" before the text does.
    const top = list.reduce((m, a) => ((RANK[a.status] ?? 0) > (RANK[m] ?? 0) ? a.status : m), null);
    const count = `${list.length} agent${list.length === 1 ? "" : "s"}`;
    const label = (icon, text) => h_flex().gap(6).items_center().child(svg(`mods/workspace-chrome/${icon}.svg`).size(13)).child(text);
    const key = this.hint();
    return h_flex().size_full().px(14).gap(16).items_center().bg(t.chrome).border_t(1).border_color(t.border).text_size(11.5).text_color(t.muted)
      .child(label(space?.machine ? "server" : "monitor", space?.machine ?? "This computer"))
      .when(Boolean(space?.branch), el => el.child(label("branch", space.branch)))
      .child(h_flex().gap(6).items_center()
        .child(div().size(6).rounded(3).bg(top ? (t[top] ?? t.dim) : t.dim))
        .child(count)
        .when(needs > 0, el => el.child(div().text_color(t.blocked).child(`· ${needs} needs you`))))
      .child(div().flex_1())
      .child(h_flex().id("palette").gap(6).items_center().cursor_pointer().on_click(() => run("app.palette"))
        .when(Boolean(key), el => el.child(this.kbd(t, key)))
        .child(div().text_color(t.muted).child("commands")));
  }
}
