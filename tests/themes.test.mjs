import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (file) => JSON.parse(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"));

const HEX = /^#[0-9a-f]{6}$/i;

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    let v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const KEYS = [
  "background", "foreground", "surface", "canvas", "chrome", "popover", "raised",
  "hover", "selected", "border", "input", "muted", "dim", "accent", "accent_foreground",
  "solid", "solid_foreground", "selection", "working", "blocked", "done", "idle",
  "unknown",
];

test("likeme 布局成对声明 2026 Dark 与 2026 Light", () => {
  const layout = read("layouts/likeme.json");
  assert.deepEqual(layout.theme, { light: "vscode-2026-light", dark: "vscode-2026-dark" });

  const dark = read(`themes/${layout.theme.dark}.json`);
  const light = read(`themes/${layout.theme.light}.json`);
  for (const theme of [dark, light]) {
    assert.equal(theme.ansi.length, 16);
    for (const key of KEYS) assert.ok(theme.colors[key], `${key} is missing`);
    const values = [theme.background, theme.foreground, theme.selection, theme.cursor,
      ...theme.ansi, ...Object.values(theme.colors)];
    for (const value of values) assert.match(value, HEX);
  }

  // Herdr and colors.js read a theme's lightness from its background: the dark
  // half must stay dark, the light half light, or the wrong ink table is picked.
  assert.ok(luminance(dark.background) < 0.2);
  assert.ok(luminance(light.background) > 0.8);
  // The light theme's text must stay readable on its terminals and chrome.
  assert.ok(luminance(light.foreground) < 0.1);
  assert.ok(luminance(light.colors.surface) > 0.9);
});
