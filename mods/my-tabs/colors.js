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

// `k` of `b` over `a`: an opaque blend. A selected row's balloon is mixed against
// `raised` rather than laid on as alpha, so it stays the same pill over chrome,
// hover and the cards behind it.
export function mix(a, b, k) {
  if (!/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(a ?? "") || !/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(b ?? "")) return a || b;
  const rgb = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const [x, y] = [rgb(a), rgb(b)];
  return "#" + x.map((v, i) => Math.round(v * (1 - k) + y[i] * k).toString(16).padStart(2, "0")).join("");
}
