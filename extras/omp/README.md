# omp

`install.sh` registers Herdr's program entry for the
[omp](https://github.com/can1357/oh-my-pi) coding agent, so Herdr labels its
terminals with the omp name and icon instead of the generic agent icon once the CLI
is installed. It does not install the omp CLI itself; registration is unconditional
unless `LIKEME_OMP=0`. Registration only adds a `programs.omp` entry when one is
absent; it never overwrites an existing entry.

likeme only adds this Herdr entry and never installs the omp CLI; use an upstream
method (see the [upstream README](https://github.com/can1357/oh-my-pi); its installer
verifies the binary SHA-256).

- `omp.svg` — the upstream brand mark, copied unchanged from
  <https://raw.githubusercontent.com/can1357/oh-my-pi/main/packages/collab-web/public/favicon.svg>.
- `LICENSE` — the upstream MIT license, copied unchanged from
  <https://raw.githubusercontent.com/can1357/oh-my-pi/main/LICENSE>
  (© 2025 Mario Zechner, © 2025-2026 Can Bölük, © 2026 Stencil Labs, Inc.).
- `programs.json` — the Herdr program-table fragment. The installer copies it as
  `$HERDR_APP_HOME/programs.json` when that file does not exist, staging it in the
  same directory and moving it into place. Otherwise it merges the `programs.omp`
  entry with `python3` when `python3 -c ""` runs, else `jq`, preserving every other
  key. It leaves the file untouched when `programs.omp` is present, the JSON is
  invalid, `programs` is not an object, or `programs.json` is a symlink.
- `install.sh` — the standalone installer. `install.sh [DST]` defaults `DST` to
  `${HERDR_APP_HOME:-$HOME/.config/herdr-app}`; `LIKEME_OMP=0` skips it. It exits 0
  for expected skips (symlink, invalid JSON, non-object shapes, no merge tool) so
  it never fails the layout install.

The icon lands at `my-icons/likeme-omp.svg` in the Herdr app home, deliberately
namespaced so it never clobbers a user's own `my-icons/omp.svg`.
