// Shared by the sidebar, the tab bar and the pane header: the same table paints a
// space's avatar and tints its rows, tabs and focused header, so every surface
// speaks the same colour language. The same file lives in my-sidebar, my-tabs and
// my-pane; `check.sh` fails when the three copies drift.

// What a stored color name looks like on an avatar (the same in every mod that
// draws space avatars): one strong color per hue, light and dark alike.
export const MARK = { ansi6: "#22a99a", ansi3: "#e3814f", ansi4: "#5b8def", ansi5: "#8b7cf6", ansi2: "#3fae6a", ansi1: "#d9649a" };

// A stored name (or a hex of its own) as a colour, or null when it names nothing.
export function markColor(color, t) {
  const c = color?.startsWith("#") ? color : MARK[color] ?? t[color];
  return /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(c ?? "") ? c.slice(0, 7) : null;
}

// `k` of `b` over `a`: an opaque blend, for a tint that must not depend on what
// sits behind it.
export function mix(a, b, k) {
  if (!/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(a ?? "") || !/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(b ?? "")) return a || b;
  const rgb = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const [x, y] = [rgb(a), rgb(b)];
  return "#" + x.map((v, i) => Math.round(v * (1 - k) + y[i] * k).toString(16).padStart(2, "0")).join("");
}

// A colour as a 6-digit hex, before anything is appended to it.
export function hex6(c) {
  return c && /^#[0-9a-f]{8}$/i.test(c) ? c.slice(0, 7) : c;
}

// `c` at `a` (two hex digits): the alpha layer of a glass card.
export function withAlpha(c, a) {
  const h = hex6(c);
  return h ? h + a : c;
}

// The glass scale every card shares, so the sidebar rows, the tabs, the panel
// buttons and the focused header lift and glow by the same steps. A resting
// card is a whisper of its space's colour with a soft edge; the pointer lifts
// it a step; selection fills it with the space's colour at a strength that
// reads as the same glow on every surface. `wash` is the fainter step for
// sub-agent rows under their parent's card, and `header` the quieter pair a
// whole pane header takes, being much larger than a row or a tab.
export const GLASS = {
  rest: "12", restEdge: "26",
  hover: "1f", hoverEdge: "40",
  active: "50", activeEdge: "82",
  wash: "0a",
  header: "33", headerEdge: "59",
};
