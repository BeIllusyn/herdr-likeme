#!/usr/bin/env bash
# Load every mod once and make sure the shared colour helpers stay identical.
# Run this after editing a mod; install.sh runs the same `herdr-app check` loop.
set -euo pipefail
cd "$(dirname "$0")"

for m in my-sidebar my-tabs my-pane my-files my-changes my-brand; do
  herdr-app check "mods/$m"
done

for m in my-tabs my-pane my-files my-changes my-brand; do
  if ! diff -q mods/my-sidebar/colors.js "mods/$m/colors.js" >/dev/null; then
    echo "mods/$m/colors.js differs from mods/my-sidebar/colors.js" >&2
    echo "Copy the sidebar copy over it; all six must stay identical." >&2
    exit 1
  fi
done

echo "All mods load; the colour helpers are in sync."
