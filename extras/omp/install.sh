#!/usr/bin/env bash
# Register Herdr's omp program entry (name/icon) unless LIKEME_OMP=0.
# Does not install the omp CLI itself; opt out with LIKEME_OMP=0.
set -euo pipefail

DST="${1:-${HERDR_APP_HOME:-$HOME/.config/herdr-app}}"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRAGMENT="$DIR/programs.json"
ICON="$DIR/omp.svg"
TARGET="$DST/programs.json"

if [ "${LIKEME_OMP:-1}" = "0" ]; then
  echo "omp registration skipped (LIKEME_OMP=0)"
  exit 0
fi

# Writing through a symlink would replace the link or edit a file outside the
# app home; both are the user's call, so only report it.
if [ -L "$TARGET" ]; then
  echo "programs.json is a symlink; left untouched (add programs.omp by hand)" >&2
  exit 0
fi

mkdir -p "$DST/my-icons"
install -m 644 "$ICON" "$DST/my-icons/likeme-omp.svg"

if [ ! -e "$TARGET" ]; then
  # Stage in the same directory so Herdr's live reload never reads a partial
  # file, then move it into place atomically.
  if ! tmp="$(mktemp "${TARGET}.XXXXXX")"; then
    echo "programs.json: could not create a temp file; left untouched" >&2
    exit 0
  fi
  if ! install -m 644 "$FRAGMENT" "$tmp"; then
    echo "programs.json: could not stage the fragment; left untouched" >&2
    rm -f "$tmp"
    exit 0
  fi
  if ! mv -n "$tmp" "$TARGET" || [ -e "$tmp" ]; then
    rm -f "$tmp"
    echo "programs.json appeared while installing; left untouched" >&2
    exit 0
  fi
  echo "Registered omp in $TARGET"
  exit 0
fi

# Merge programs.omp only when it is absent. Any expected failure leaves the
# file byte-identical and exits 0, so the layout install is never aborted.
merge_python() {
  python3 - "$TARGET" "$FRAGMENT" <<'PY'
import json, os, sys, tempfile

target, fragment_path = sys.argv[1], sys.argv[2]

def warn(message):
    print(f"programs.json: {message}; left untouched", file=sys.stderr)

try:
    with open(target, "r", encoding="utf-8") as handle:
        data = json.load(handle)
except Exception as exc:
    warn(f"invalid JSON ({exc})")
    sys.exit(0)

if not isinstance(data, dict):
    warn("top level is not a JSON object")
    sys.exit(0)

if "programs" not in data:
    programs = {}
else:
    programs = data["programs"]
    if not isinstance(programs, dict):
        warn("programs is not a JSON object")
        sys.exit(0)

if "omp" in programs:
    print("programs.json already has programs.omp; left untouched")
    sys.exit(0)

tmp = None
try:
    with open(fragment_path, "r", encoding="utf-8") as handle:
        fragment = json.load(handle)
    data["programs"] = programs
    programs["omp"] = fragment["programs"]["omp"]

    mode = os.stat(target).st_mode & 0o7777
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(os.path.abspath(target)),
                               prefix=".programs.", suffix=".json")
    with os.fdopen(fd, "w", encoding="utf-8") as handle:
        handle.write(json.dumps(data, indent=2, ensure_ascii=False, allow_nan=False) + "\n")
    os.chmod(tmp, mode)
    os.replace(tmp, target)
except Exception as exc:
    if tmp:
        try:
            os.unlink(tmp)
        except OSError:
            pass
    warn(f"could not write the merged JSON ({exc})")
    sys.exit(0)

print("Added programs.omp to programs.json")
PY
}

merge_jq() {
  local error mode tmp
  if ! error="$(jq empty "$TARGET" 2>&1 >/dev/null)"; then
    echo "programs.json: invalid JSON ($error); left untouched" >&2
    return 0
  fi
  if jq -e 'if ((.programs // {}) | type) == "object" then ((.programs // {}) | has("omp")) else false end' "$TARGET" >/dev/null 2>&1; then
    echo "programs.json already has programs.omp; left untouched"
    return 0
  fi
  if ! jq -e 'type == "object" and (if has("programs") then ((.programs | type) == "object") else true end)' "$TARGET" >/dev/null 2>&1; then
    echo "programs.json: top level or programs is not an object; left untouched" >&2
    return 0
  fi
  mode="$(stat -f '%Lp' "$TARGET" 2>/dev/null || stat -c '%a' "$TARGET")"
  if ! tmp="$(mktemp "${TARGET}.XXXXXX")"; then
    echo "programs.json: could not create a temp file; left untouched" >&2
    return 0
  fi
  if ! jq --slurpfile fragment "$FRAGMENT" '.programs = ((.programs // {}) + $fragment[0].programs)' "$TARGET" >"$tmp"; then
    echo "programs.json: the jq merge failed; left untouched" >&2
    rm -f "$tmp"
    return 0
  fi
  if ! chmod "$mode" "$tmp"; then
    echo "programs.json: could not set the merged file's mode; left untouched" >&2
    rm -f "$tmp"
    return 0
  fi
  if ! mv "$tmp" "$TARGET"; then
    echo "programs.json: could not replace the file; left untouched" >&2
    rm -f "$tmp"
    return 0
  fi
  echo "Added programs.omp to programs.json"
}

if command -v python3 >/dev/null 2>&1 && python3 -c "" >/dev/null 2>&1; then
  merge_python || echo "programs.json: python3 merge failed; left untouched" >&2
elif command -v jq >/dev/null 2>&1; then
  merge_jq
else
  echo "programs.json exists and neither python3 nor jq is available; left untouched." >&2
  echo "Add the programs.omp entry from $FRAGMENT by hand:" >&2
  printf '  %s\n' "$(tr -d '\n' < "$FRAGMENT" | tr -s ' ')" >&2
fi

exit 0
