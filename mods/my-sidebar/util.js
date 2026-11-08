// Shared by spaces.js and agents.js: the same background-tick throttle, so both
// halves of the sidebar stay in step.

import { window } from "herdr";

// Four looks a second matter only in front; in the background one is enough to
// catch up within a second of the window coming forward.
export function backgroundTick(view) {
  if (window()?.active) {
    view.idleTicks = 0;
    return true;
  }
  return ++view.idleTicks % 4 === 0;
}
