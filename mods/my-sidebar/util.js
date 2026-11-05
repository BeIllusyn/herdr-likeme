// Shared by spaces.js and agents.js: the same layout lookup, rail threshold and
// background-tick throttle, so both halves of the sidebar stay in step.

import { window } from "herdr";

export function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

// The sidebar's rail goes by its width, not a flag: dragging its edge narrows it too.
export const RAIL = 160;
export const isRail = (width) => (width ?? Infinity) < RAIL;

// Four looks a second matter only in front; in the background one is enough to
// catch up within a second of the window coming forward.
export function backgroundTick(view) {
  if (window()?.active) {
    view.idleTicks = 0;
    return true;
  }
  return ++view.idleTicks % 4 === 0;
}
