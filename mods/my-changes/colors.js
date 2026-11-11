// Shared by the sidebar, the tab bar and the pane header: one palette and one
// scale of neutral surfaces keeps every part of the window in the same visual
// system. The same file lives in my-sidebar, my-tabs and my-pane; `check.sh`
// fails when the three copies drift.

// Fallbacks for a theme that does not name an ANSI colour. A current theme
// supplies ansi0..ansi15, and those are preferred, so a space takes the hue the
// terminal already uses and a light theme gets the light palette's own colours.
export const MARK = { ansi6: "#56b6c2", ansi3: "#e5c07b", ansi4: "#61afef", ansi5: "#c678dd", ansi2: "#98c379", ansi1: "#e06c75" };

// A stored colour name (ansi6, …) or a hex of its own as a 6-digit colour, or
// null when it names nothing.
export function markColor(color, t) {
  const c = color?.startsWith("#") ? color : t?.[color] ?? MARK[color];
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

// `c` at `a` (two hex digits): an alpha layer over the surface behind it.
export function withAlpha(c, a) {
  const h = hex6(c);
  return h ? h + a : c;
}

// The neutral scale every surface shares. It is drawn in the foreground colour
// at low alpha, so it follows both light and dark themes and reads identically
// on the chrome (sidebar, tab bar) and on the terminal's background.
//
// `hover` lifts a row under the pointer; `active` is the selected row or tab;
// `line` is the hairline that separates regions. A space's colour is used as a
// mark, never as a line: `tint` behind its letter while resting, `tintEdge`
// around it, and — once selected — a solid fill on the monogram or a tinted
// tile behind the agent's program icon. Selection is the neutral fill plus a
// mark that comes alive; there is no rail or underline anywhere.
export const UI = {
  hover: "08",
  active: "14",
  line: "12",
  tint: "1c",
  tintEdge: "3a",
};

// The type scale, in px. Labels are uppercase and tracked; meta is the quiet
// second line; body is the name in a row.
export const TYPE = {
  label: 9.5,
  meta: 10.5,
  small: 11.5,
  body: 12.5,
  title: 12.5,
};
