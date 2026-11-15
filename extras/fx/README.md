# fx

`install.sh` registers Herdr's program entry for the
[fx](https://github.com/vercel-labs/fx) coding agent, so Herdr labels its
terminals with the fx name and icon instead of the generic agent icon once the CLI
is installed. It does not install the fx CLI itself; registration is unconditional
unless `LIKEME_FX=0`. Registration only adds a `programs.fx` entry when one is
absent; it never overwrites an existing entry.

likeme only adds this Herdr entry and never installs the fx CLI; use the upstream
installer instead:

```sh
curl -fsSL https://fx.sh/setup.sh | bash
```

- `fx.svg` — the upstream brand glyph, taken from the fx 0.0.16 binary's embedded
  OAuth page. The black tile is dropped and the viewBox is trimmed to the glyph, so
  Herdr draws it as a crisp one-colour `tint` icon at the small launcher size
  instead of scaling the tile's rounded edge down to a few pixels.
- `LICENSE` — the upstream Apache-2.0 license, copied unchanged from
  <https://raw.githubusercontent.com/vercel-labs/fx/main/LICENSE>.
- `programs.json` — the Herdr program-table fragment. The installer copies it as
  `$HERDR_APP_HOME/programs.json` when that file does not exist, staging it in the
  same directory and moving it into place. Otherwise it merges the `programs.fx`
  entry with `python3` when `python3 -c ""` runs, else `jq`, preserving every other
  key. It leaves the file untouched when `programs.fx` is present, the JSON is
  invalid, `programs` is not an object, or `programs.json` is a symlink.
- `install.sh` — the standalone installer. `install.sh [DST]` defaults `DST` to
  `${HERDR_APP_HOME:-$HOME/.config/herdr-app}`; `LIKEME_FX=0` skips it. It exits 0
  for expected skips (symlink, invalid JSON, non-object shapes, no merge tool) so
  it never fails the layout install.

The icon lands at `my-icons/likeme-fx.svg` in the Herdr app home, deliberately
namespaced so it never clobbers a user's own `my-icons/fx.svg`.
