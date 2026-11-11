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

// === Glassmorphism helpers ===

// Convert hex + alpha to #rrggbbaa format
export function alpha(hex, alphaHex) {
  if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return hex;
  return hex + alphaHex;
}

// Glass surface for panels (sidebar, tab bar) - semi-transparent
export function glassSurface(t) {
  return t.chrome + "c0"; // 75% opacity
}

// Glass card background with border
export function glassCard(t, tint = null, active = false) {
  const base = tint || t.surface;
  const alphaHex = active ? "59" : "26"; // 35% or 15%
  const borderAlpha = active ? "66" : "26"; // 40% or 15%
  return {
    bg: base + alphaHex,
    borderColor: t.foreground + borderAlpha,
  };
}

// Active glass: brighter, more opaque
export function glassActive(t, tint) {
  return {
    bg: (tint || t.raised) + "66", // 40%
    borderColor: (tint || t.foreground) + "80", // 50%
  };
}

// Hover glass: slightly brighter
export function glassHover(t, tint) {
  return {
    bg: (tint || t.hover) + "40", // 25%
    borderColor: t.foreground + "40", // 25%
  };
}
