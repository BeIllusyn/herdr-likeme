# Likeme

A Herdr layout built on top of the shipped `main` layout: every space and agent row
is an icon with two lines of text beside it, the active item is a raised balloon tinted
with its space's colour (the active tab too), and the working spinner is a gold braille
character instead of a rotating ring.

Built from Herdr `main` @ 0.1.12 (`cloned_from` in `layouts/likeme.json`).

![Likeme](preview.png)

_Workspace text in the screenshot is blurred; the two-line rows, the balloon selection
and tab close buttons, and the braille spinner are the real UI._

## What changes

| Area | Change |
|---|---|
| **Sidebar** | Spaces and agents share one scrolling column; the Agents section follows the spaces content instead of starting at the sidebar's midpoint, and the whole column scrolls together. |
| **Spaces** | A 20 px tinted monogram with a dark letter; the project name (13 px) over the current git branch (11 px, muted, plus ahead/behind). Resting rows lie flat under a whisper of the space's colour; the active space is a raised balloon — an opaque tinted pill with a hairline and shadow — and rows keep a 4 px gap; worktrees hang from a 1 px tree line under their checkout; with fewer than three spaces a dashed "New space" row fills the gap. |
| **Agents** | The same two-line row (space name over the agent's own title) with a whisper of its space's colour; the focused agent is the same raised balloon instead of an accent bar. The column watches its data on a 250 ms timer and redraws when it changes, so focus and status turns show without hovering; an idle agent shows no status mark. The elapsed time and pin share a fixed slot, so hovering never shifts the text. A single group hides its redundant header, and the sort button uses an up/down icon. |
| **Tabs** | The active tab is the same raised balloon as a selected sidebar row, tinted with the space's colour; the others lie flat and keep a close button (dimmer when inactive). A default-numbered tab shows what it runs — the folder name, or the program when two tabs share it — and `+` sits right after the last tab. A zoomed tab gets a small zoom glyph instead of a trailing `Z`. The working spinner is a gold braille character (`⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏`, 80 ms per frame). |
| **Panes** | A 12 px radius, 10 px gap and padding, a slightly lifted card surface (`#1a1d22`), a cloned header on that same surface, and 12/10 px terminal padding. The split/zoom/close buttons are always visible; the status mark appears for working, blocked and done (nothing while idle). The header's working spinner is the same gold braille character as the tabs and agents. |
| **Status bar** | "1 agent" instead of "1 agents", a dot colored by the most urgent agent, and the palette shortcut drawn as a keycap. |

Everything else — brand bar, Files/Changes panel, menus — is Herdr's `main` layout
unchanged.

## Requirements

- Herdr 0.1.12 or newer.
- Herdr's shipped mods and assets that this layout references:
  `workspace-chrome`, `pane` (the tab bar borrows its close/zoom icons), `files`,
  `changes`, `menu`, `new-menu`, and the usual dialog/overlay mods.

## Install

One command, straight from `main` (it always downloads the latest, so it is also the
update command):

```sh
curl -fsSL https://raw.githubusercontent.com/BeIllusyn/herdr-likeme/main/install.sh | bash
```

Or from a checkout (`git pull` first to update):

```sh
git clone https://github.com/BeIllusyn/herdr-likeme.git
cd herdr-likeme
./install.sh
```

`install.sh` copies `layouts/likeme.json` and the four mods into
`${HERDR_APP_HOME:-~/.config/herdr-app}`, runs `herdr-app check` on every mod, and
switches to the layout. Herdr reloads the files within a second.

It **overwrites** `layouts/likeme.json` and the `mods/my-*` folders on every run
(`rsync --delete`), so edits made directly in `~/.config/herdr-app` are replaced —
copy them back to the repo first. It never touches your other layouts, mods, spaces
or terminals. The one-line form always fetches the current `REF` (default `main`);
the checkout form uses the files in that checkout.

Manual install:

```sh
DST=~/.config/herdr-app

cp layouts/likeme.json "$DST/layouts/"
cp -R mods/my-sidebar mods/my-tabs mods/my-pane mods/my-status "$DST/mods/"

herdr-app check "$DST/mods/my-sidebar"
herdr-app check "$DST/mods/my-tabs"
herdr-app check "$DST/mods/my-pane"
herdr-app check "$DST/mods/my-status"
herdr-app do layout.switch '{"name":"likeme"}'
```

Never overwrite a layout or mod you already have: rename the new one and update the
matching `"mod"` references in `likeme.json`.

- Update: run the one-liner again, or `git pull && ./install.sh`
- Uninstall: delete `layouts/likeme.json`, `layouts/likeme.png` (if present) and the
  `mods/my-sidebar`, `mods/my-tabs`, `mods/my-pane`, `mods/my-status` folders. If you
  upgraded from a version before the merged sidebar, also delete the old
  `mods/my-spaces` and `mods/my-agents` folders; their code now lives inside
  `mods/my-sidebar`.

## What the mods do

Herdr mods are trusted code: they can run programs, use the network and read files.
These four are meant to be read:

- **`my-sidebar`** is one mod with two retained child views (`spaces.js` and
  `agents.js`) in one scroll column. The spaces half runs
  `git --no-optional-locks status --porcelain=v2 --branch` and `git rev-parse` in each
  space's live folder via `exec`, calls `hc machine ls` every 15 s, and watches local
  git repos with `watchFolder`. The agents half uses Herdr's live agent/terminal data.
  Both use shipped SVGs; it reads git metadata and the local machine list and sends
  nothing over the network.
- **`my-tabs`** uses Herdr's live tab/pane data and shipped SVGs. No `exec`, no
  network.
- **`my-pane`** is a clone of the shipped pane header; it reads the same live pane
  data and carries its own split/zoom/close SVGs. No `exec`, no network.
- **`my-status`** is a clone of the shipped workspace status bar; it reads live
  space/agent data and the palette binding. No `exec`, no network.

`RECIPE.md` has the full build notes, including the exact layout tree, the two-line
row structure, and what a fresh build would get wrong.

## License

MIT. See [LICENSE](LICENSE).
