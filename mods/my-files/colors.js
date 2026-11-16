// Shared by all six mods: neutral surfaces, readable type and common dimensions.
// Each mod carries the same file; `check.sh` checks that the copies stay in sync.
// The values follow VS Code's 2026 themes, Dark and Light, which likeme ships.

// Fallbacks for a theme that does not name an ANSI colour. A current theme
// supplies ansi0..ansi15, and those are preferred, so a space takes the hue the
// terminal already uses. These are VS Code's own dark terminal colours; a light
// theme names its own brighter table, so this fallback rarely shows there.
export const MARK = { ansi6: "#11a8cd", ansi3: "#e5e510", ansi4: "#2472c8", ansi5: "#bc3fbc", ansi2: "#0dbc79", ansi1: "#cd3131" };

// 2026's editor syntax colours. These belong to the editor's token palette, not
// to the terminal's ANSI table, so a preview reads like VS Code whatever the
// shell palette is. A light theme gets 2026 Light's GitHub-light tokens instead
// of dark ink on a white page.
const SYNTAX_DARK = {
  keyword: "#ff7b72",
  string: "#a5d6ff",
  comment: "#8b949e",
  function: "#d2a8ff",
  type: "#79c0ff",
  number: "#79c0ff",
  constant: "#79c0ff",
};

const SYNTAX_LIGHT = {
  keyword: "#cf222e",
  string: "#0a3069",
  comment: "#6e7781",
  function: "#8250df",
  type: "#0550ae",
  number: "#0550ae",
  constant: "#0550ae",
};

// The dark table stays the default export so callers that have no theme at hand
// keep working; the mods call syntaxColors(theme()) so a theme switch re-inks
// the preview.
export const SYNTAX = SYNTAX_DARK;

// 2026's source-control and diff colours: git decoration ink and the gutter and
// line washes. They are editor UI colours, not ANSI, so an added file and an
// added line keep the same green in Files and Changes. 2026 Light's inks are
// darker greens, olives and reds, so they stay legible on white.
const SCM_DARK = {
  added: "#73c991",
  modified: "#e5ba7d",
  deleted: "#f48771",
  untracked: "#73c991",
  diffAdd: "#347d39",
  diffDel: "#c93c37",
};

const SCM_LIGHT = {
  added: "#587c0c",
  modified: "#667309",
  deleted: "#ad0707",
  untracked: "#587c0c",
  diffAdd: "#587c0c",
  diffDel: "#ad0707",
};

// The dark table stays the default for the same reason as SYNTAX; the mods call
// scmColors(theme()).
export const SCM = SCM_DARK;

const HEX = /^#[0-9a-f]{6}([0-9a-f]{2})?$/i;

const rgb = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));

// Whether the active theme is light, read from its own background. A theme that
// names no background (a partial override, a test fixture) stays on the dark
// tables, which is what the mods showed before the light theme existed.
export function isLight(t) {
  const c = [t?.background, t?.canvas, t?.surface, t?.chrome].find((v) => typeof v === "string" && HEX.test(v));
  if (!c) return false;
  const [r, g, b] = rgb(hex6(c)).map((v) => {
    v /= 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.5;
}

// The token, diff and git palettes for the theme on screen.
export function syntaxColors(t) {
  return isLight(t) ? SYNTAX_LIGHT : SYNTAX_DARK;
}

export function scmColors(t) {
  return isLight(t) ? SCM_LIGHT : SCM_DARK;
}

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
// on the chrome (sidebar, tab bar) and on the terminal's background. The steps
// are matched to 2026 Dark's greys — `hover` lands on #2B2C2D, `active` on
// #37383A, `line` on #2A2B2C and the quietest hairline on #242526 — and to
// 2026 Light's: #E2E2E5, #D3D3D5, #E4E4E7 and #EDEDF0 over its #FAFAFD chrome.
//
// The scale climbs in even steps — a chip, a hover, a selection — and the three
// line weights descend from a region hairline through field outlines to a quiet
// separator. `badge` is the wash under a status pill and `diff` the wash under
// an added/removed line; `tile` is the larger wash behind a focused agent's
// icon; `dot` and `dotSoft` are state dots, and `ring` outlines a focused field.
// A space's colour is used as a mark, never as a line: `tint` behind its
// letter while resting, `tintEdge` around it, and — once selected — a solid
// fill on the monogram or a tinted tile behind the agent's program icon.
// Selection is the theme's raised neutral `selected` fill plus a mark that comes
// alive; there is no rail or underline anywhere.
export const UI = {
  subtle: "0f",
  hover: "1c",
  active: "2e",
  line: "1a",
  field: "12",
  lineSoft: "0f",
  tint: "1e",
  tintEdge: "38",
  badge: "1f",
  diff: "26",
  tile: "26",
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
// tree's marks, so the same state uses the same hue in both views: the active
// theme's git decoration inks. Without a theme it keeps 2026 Dark's table.
export function changeColor(status, t) {
  const scm = scmColors(t);
  return status === "A" ? scm.added : status === "D" ? scm.deleted : status === "U" ? scm.untracked : scm.modified;
}

// Choose the more legible ink for a solid fill, including custom colours.
export function inkOn(color) {
  const c = markColor(color);
  if (!c) return "#121314";
  const luminanceOf = (hex) => rgb(hex).map(v => {
    v /= 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  const [r, g, b] = luminanceOf(c);
  const luminance = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const darkLuminance = 0.0061; // #121314
  return (luminance + 0.05) / (darkLuminance + 0.05) >= 1.05 / (luminance + 0.05) ? "#121314" : "#ffffff";
}

// A space monogram's letter takes the ink that contrasts with its solid fill.
export function markInk(color) {
  return inkOn(color);
}

// Text on a selected row: the same contrast rule as a monogram, so the raised
// neutral fill takes white in a dark theme and 2026 Light's near-black in a
// light one. A theme that names no selection keeps the dark-theme white.
export function selectedInk(t) {
  const c = t?.selected;
  return HEX.test(c ?? "") ? inkOn(c) : "#ffffff";
}
