#!/usr/bin/env bash
# Install or update the "likeme" Herdr layout and its three mods.
set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DST="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
LAYOUT="likeme"
MODS=(my-spaces my-agents my-tabs)

if ! command -v herdr-app >/dev/null 2>&1; then
  echo "herdr-app is not in PATH" >&2
  exit 1
fi

mkdir -p "$DST/layouts" "$DST/mods"

install -m 644 "$SRC/layouts/$LAYOUT.json" "$DST/layouts/$LAYOUT.json"
if [ -f "$SRC/layouts/$LAYOUT.png" ]; then
  install -m 644 "$SRC/layouts/$LAYOUT.png" "$DST/layouts/$LAYOUT.png"
fi

for m in "${MODS[@]}"; do
  mkdir -p "$DST/mods/$m"
  # --delete keeps stale files out of an update; the generated type files stay.
  rsync -a --delete --exclude gpui-kit.d.ts --exclude jsconfig.json \
    "$SRC/mods/$m/" "$DST/mods/$m/"
  herdr-app check "$DST/mods/$m"
done

herdr-app do layout.switch "{\"name\":\"$LAYOUT\"}" >/dev/null 2>&1 || true

echo "Installed \"$LAYOUT\" into $DST."
echo "Switch anytime with: herdr-app do layout.switch '{\"name\":\"$LAYOUT\"}'"
