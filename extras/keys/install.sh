#!/usr/bin/env bash
# Bind Cmd+T to my-tabs.newTab while the likeme layout is shown.
# The mod creates the terminal in the shown space's folder; Herdr's own
# tab.new falls back to the focused terminal's directory (or home when no
# terminal is focused). A binding the person already made is left alone.
set -euo pipefail

DST="${1:-${HERDR_APP_HOME:-$HOME/.config/herdr-app}}"
TARGET="$DST/keys.json"
SECTION="layout:likeme"
COMMAND="my-tabs.newTab"

if [ ! -e "$TARGET" ]; then
  echo "keys.json is not there yet; bind $SECTION.cmd-t to $COMMAND by hand if needed" >&2
  exit 0
fi

# Writing through a symlink would replace the link or edit a file outside the
# app home; both are the person's call, so only report it.
if [ -L "$TARGET" ]; then
  echo "keys.json is a symlink; left untouched (bind $SECTION.cmd-t to $COMMAND by hand)" >&2
  exit 0
fi

merge_python() {
  python3 - "$TARGET" "$SECTION" "$COMMAND" <<'PY'
import json, os, sys, tempfile

target, section_name, command = sys.argv[1:]

def warn(message):
    print(f"keys.json: {message}; left untouched", file=sys.stderr)

try:
    with open(target, encoding="utf-8") as handle:
        data = json.load(handle)
except Exception as exc:
    warn(f"invalid JSON ({exc})")
    sys.exit(0)

if not isinstance(data, dict):
    warn("top level is not a JSON object")
    sys.exit(0)

section = data.get(section_name)
if section is None:
    section = {}
elif not isinstance(section, dict):
    warn(f"{section_name} is not a JSON object")
    sys.exit(0)

bound = section.get("cmd-t")
if bound == command:
    print(f"keys.json already binds {section_name}.cmd-t to {command}")
    sys.exit(0)
if bound is not None and bound != "tab.new":
    print(f"keys.json binds {section_name}.cmd-t to {bound}; left untouched")
    sys.exit(0)

section["cmd-t"] = command
data[section_name] = section
tmp = None
try:
    mode = os.stat(target).st_mode & 0o7777
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(os.path.abspath(target)),
                               prefix=".keys.", suffix=".json")
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

print(f"Bound {section_name}.cmd-t to {command}")
PY
}

merge_jq() {
  local bound error mode tmp
  if ! error="$(jq empty "$TARGET" 2>&1 >/dev/null)"; then
    echo "keys.json: invalid JSON ($error); left untouched" >&2
    return 0
  fi
  if jq -e --arg s "$SECTION" 'type == "object" and (if has($s) then (.[$s] | type == "object") else true end)' "$TARGET" >/dev/null 2>&1; then
    :
  else
    echo "keys.json: top level or $SECTION is not a JSON object; left untouched" >&2
    return 0
  fi
  bound="$(jq -r --arg s "$SECTION" '.[$s]["cmd-t"] // empty' "$TARGET")"
  if [ "$bound" = "$COMMAND" ]; then
    echo "keys.json already binds $SECTION.cmd-t to $COMMAND"
    return 0
  fi
  if [ -n "$bound" ] && [ "$bound" != "tab.new" ]; then
    echo "keys.json binds $SECTION.cmd-t to $bound; left untouched"
    return 0
  fi
  mode="$(stat -f '%Lp' "$TARGET" 2>/dev/null || stat -c '%a' "$TARGET")"
  if ! tmp="$(mktemp "${TARGET}.XXXXXX")"; then
    echo "keys.json: could not create a temp file; left untouched" >&2
    return 0
  fi
  if ! jq --arg s "$SECTION" --arg c "$COMMAND" '.[$s] = ((.[$s] // {}) + {"cmd-t": $c})' "$TARGET" >"$tmp"; then
    echo "keys.json: the jq merge failed; left untouched" >&2
    rm -f "$tmp"
    return 0
  fi
  if ! chmod "$mode" "$tmp" || ! mv "$tmp" "$TARGET"; then
    echo "keys.json: could not replace the file; left untouched" >&2
    rm -f "$tmp"
    return 0
  fi
  echo "Bound $SECTION.cmd-t to $COMMAND"
}

if command -v python3 >/dev/null 2>&1 && python3 -c "" >/dev/null 2>&1; then
  merge_python || echo "keys.json: python3 merge failed; left untouched" >&2
elif command -v jq >/dev/null 2>&1; then
  merge_jq
else
  echo "keys.json exists and neither python3 nor jq is available; left untouched." >&2
  echo "Bind $SECTION.cmd-t to $COMMAND by hand." >&2
fi

exit 0
