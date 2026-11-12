#!/usr/bin/env bash
# Install or update the "likeme" Herdr layout and its mods.
#
# From a checkout (uses the files right here):
#   ./install.sh
#
# One command, always the latest main (also the update command):
#   curl -fsSL https://raw.githubusercontent.com/BeIllusyn/herdr-likeme/main/install.sh | bash
#
# Environment: HERDR_APP_HOME, REPO, REF, LIKEME_OMP.
set -euo pipefail

REPO="${REPO:-BeIllusyn/herdr-likeme}"
REF="${REF:-main}"
DST="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
LAYOUT="likeme"
MODS=(my-sidebar my-tabs my-pane my-files my-changes my-brand)

if ! command -v herdr-app >/dev/null 2>&1; then
  echo "herdr-app is not in PATH" >&2
  exit 1
fi

# The mods are built against 0.1.12's host API. A newer app is fine; an older one
# would fail later with a less useful error from `check`.
HAVE="$(herdr-app --version | awk '{print $NF}')"
HAVE="${HAVE#v}"
if [ -n "$HAVE" ] && [ "$(printf '%s\n%s\n' "0.1.12" "$HAVE" | sort -V | head -n1)" != "0.1.12" ]; then
  echo "herdr-app $HAVE is older than the required 0.1.12; update Herdr first" >&2
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

# Register Herdr's omp recognition by default; LIKEME_OMP=0 opts out. It never
# touches other program entries. The helper exits 0 for expected skips; the guard
# keeps an unexpected failure from aborting the layout install.
if ! LIKEME_OMP="${LIKEME_OMP:-1}" bash "$SRC/extras/omp/install.sh" "$DST"; then
  echo "omp registration failed; continuing with the layout install" >&2
fi

if ! herdr-app do layout.switch "{\"name\":\"$LAYOUT\"}" >/dev/null; then
  echo "Files are in place, but Herdr could not switch to \"$LAYOUT\":" >&2
  herdr-app status >&2 || true
  exit 1
fi

echo "Installed \"$LAYOUT\" into $DST."
echo "Switch anytime with: herdr-app do layout.switch '{\"name\":\"$LAYOUT\"}'"
