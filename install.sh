#!/usr/bin/env bash
# Install or update the "likeme" Herdr layout and its mods.
#
# From a checkout (uses the files right here):
#   ./install.sh
#
# One command, always the latest main (also the update command):
#   curl -fsSL https://raw.githubusercontent.com/BeIllusyn/herdr-likeme/main/install.sh | bash
#
# Environment: HERDR_APP_HOME, REPO, REF.
set -euo pipefail

REPO="${REPO:-BeIllusyn/herdr-likeme}"
REF="${REF:-main}"
DST="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
LAYOUT="likeme"
MODS=(my-sidebar my-tabs my-pane my-status my-files my-changes)

if ! command -v herdr-app >/dev/null 2>&1; then
  echo "herdr-app is not in PATH" >&2
  exit 1
fi
if ! command -v rsync >/dev/null 2>&1; then
  echo "rsync is required (macOS ships it; on Linux install your distro's rsync)" >&2
  exit 1
fi

# Run from a checkout: use those files. Piped or run elsewhere: fetch REF.
SRC=""
if [ -n "${BASH_SOURCE[0]:-}" ] && [ -f "${BASH_SOURCE[0]}" ]; then
  CANDIDATE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  if [ -f "$CANDIDATE/layouts/$LAYOUT.json" ]; then
    SRC="$CANDIDATE"
  fi
fi

TMP=""
if [ -z "$SRC" ]; then
  TMP="$(mktemp -d)"
  trap 'rm -rf "$TMP"' EXIT
  echo "Downloading $REPO@$REF..."
  curl -fsSL "https://codeload.github.com/$REPO/tar.gz/refs/heads/$REF" \
    | tar -xz -C "$TMP" --strip-components=1
  SRC="$TMP"
fi

mkdir -p "$DST/layouts" "$DST/mods"

install -m 644 "$SRC/layouts/$LAYOUT.json" "$DST/layouts/$LAYOUT.json"
if [ -f "$SRC/layouts/$LAYOUT.png" ]; then
  install -m 644 "$SRC/layouts/$LAYOUT.png" "$DST/layouts/$LAYOUT.png"
fi

for m in "${MODS[@]}"; do
  mkdir -p "$DST/mods/$m"
  # --delete drops files that left the repo; generated type files stay.
  rsync -a --delete --exclude gpui-kit.d.ts --exclude jsconfig.json \
    "$SRC/mods/$m/" "$DST/mods/$m/"
  herdr-app check "$DST/mods/$m"
done

herdr-app do layout.switch "{\"name\":\"$LAYOUT\"}" >/dev/null 2>&1 || true

echo "Installed \"$LAYOUT\" into $DST."
echo "Switch anytime with: herdr-app do layout.switch '{\"name\":\"$LAYOUT\"}'"
