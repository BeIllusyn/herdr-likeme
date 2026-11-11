// Shared by all six mods: neutral surfaces, readable type and common dimensions.
// Each mod carries the same file; `check.sh` checks that the copies stay in sync.

// Fallbacks for a theme that does not name an ANSI colour. A current theme
// supplies ansi0..ansi15, and those are preferred, so a space takes the hue the
// terminal already uses and a light theme gets the light palette's own colours.
export const MARK = { ansi6: "#56b6c2", ansi3: "#e5c07b", ansi4: "#61afef", ansi5: "#c678dd", ansi2: "#98c379", ansi1: "#e06c75" };

const HEX = /^#[0-9a-f]{6}([0-9a-f]{2})?$/i;

const rgb = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));

// A stored colour name (ansi6, …) or a hex of its own as a 6-digit colour, or
// null when it names nothing.
export function markColor(color, t) {
  const c = typeof color === "string" && color.startsWith("#") ? color : t?.[color] ?? MARK[color];
  return HEX.test(c ?? "") ? c.slice(0, 7) : null;
}

// `k` of `b` over `a`: an opaque blend, for a tint that must not depend on what
// sits behind it.
export function mix(a, b, k) {
  if (!HEX.test(a ?? "") || !HEX.test(b ?? "")) return a || b;
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
// The scale climbs in even steps — a chip, a hover, a selection — and the three
// line weights descend from a region hairline through field outlines to a quiet
// separator. `badge` is the wash under a status pill and `diff` the wash under
// an added/removed line; `tile` is the larger wash behind a focused agent's
// icon; `dot` and `dotSoft` are state dots, and `ring` outlines a focused field.
// A space's colour is used as a mark, never as a line: `tint` behind its
// letter while resting, `tintEdge` around it, and — once selected — a solid
// fill on the monogram or a tinted tile behind the agent's program icon.
// Selection is the neutral fill plus a mark that comes alive; there is no rail
// or underline anywhere.
export const UI = {
  subtle: "08",
  hover: "0d",
  active: "17",
  line: "14",
  field: "10",
  lineSoft: "0c",
  tint: "1e",
  tintEdge: "38",
  badge: "1f",
  diff: "2e",
  tile: "2e",
  dot: "cc",
  dotSoft: "99",
  ring: "b3",
};

// The type scale, in px. Labels are uppercase; meta is the quiet
// second line; body is the name in a row.
export const TYPE = {
  label: 10,
  meta: 11,
  small: 12,
  body: 13,
  title: 13,
};

export const SIZE = {
  bar: 44,
  header: 36,
  section: 32,
  row: 44,
  worktreeRow: 40,
  childRow: 26,
  listRow: 28,
  diffRow: 22,
  button: 28,
  control: 24,
  mark: 26,
  radius: 7,
  inset: 8,
};

// One colour per change kind, shared by Changes' status tiles and the file
// tree's marks, so the same state uses the same hue in both views.
export function changeColor(status, t) {
  const c = status === "A" ? t?.ansi2 : status === "D" ? t?.ansi1 : status === "U" ? t?.ansi5 : t?.ansi3;
  return c ?? t?.muted;
}

// Choose the more legible ink for a solid space mark, including custom colours.
export function markInk(color) {
  const c = markColor(color);
  if (!c) return "#101114";
  const luminanceOf = (hex) => rgb(hex).map(v => {
    v /= 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  const [r, g, b] = luminanceOf(c);
  const luminance = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const darkLuminance = 0.0056; // #101114
  return (luminance + 0.05) / (darkLuminance + 0.05) >= 1.05 / (luminance + 0.05) ? "#101114" : "#ffffff";
}
