# Likeme

A Herdr layout built on top of the shipped `main` layout: every space and agent row
is an icon with two lines of text beside it, tabs always keep their border and close
button, and the working spinner is larger and slower.

Built from Herdr `main` @ 0.1.12 (`cloned_from` in `layouts/likeme.json`).

![Likeme](preview.png)

_Workspace text in the screenshot is blurred; the two-line rows, tab borders and close
buttons, and the 16 px spinner are the real UI._

## What changes

| Area | Change |
|---|---|
| **Spaces** | Icon on the left; on the right the project name on top, the current git branch (plus ahead/behind) underneath. |
| **Agents** | Same two-line row: the space's name on top, the agent's own title underneath. |
| **Tabs** | Every tab always shows a 1 px border and a close button, active or not. The working spinner is 16 px and turns once every 1400 ms. |

Everything else — brand bar, pane frames, Files/Changes panel, status bar, menus —
is Herdr's `main` layout unchanged.

## Requirements

- Herdr 0.1.12 or newer.
- Herdr's shipped mods and assets that this layout references:
  `workspace-chrome`, `pane`, `files`, `changes`, `workspace-status`, `menu`,
  `new-menu`, and the usual dialog/overlay mods.

## Install

```sh
git clone https://github.com/BeIllusyn/herdr-likeme.git
cd herdr-likeme
./install.sh
```

`install.sh` copies `layouts/likeme.json` and the three mods into
`${HERDR_APP_HOME:-~/.config/herdr-app}`, runs `herdr-app check` on every mod, and
switches to the layout. Herdr reloads the files within a second.

Manual install:

```sh
DST=~/.config/herdr-app

cp layouts/likeme.json "$DST/layouts/"
cp -R mods/my-spaces mods/my-agents mods/my-tabs "$DST/mods/"

herdr-app check "$DST/mods/my-spaces"
herdr-app check "$DST/mods/my-agents"
herdr-app check "$DST/mods/my-tabs"
herdr-app do layout.switch '{"name":"likeme"}'
```

Never overwrite a layout or mod you already have: rename the new one and update the
matching `"mod"` references in `likeme.json`.

- Update: `git pull && ./install.sh`
- Uninstall: delete `layouts/likeme.json`, `layouts/likeme.png` (if present) and the
  `mods/my-spaces`, `mods/my-agents`, `mods/my-tabs` folders.

## What the mods do

Herdr mods are trusted code: they can run programs, use the network and read files.
These three are small and meant to be read:

- **`my-spaces`** runs `git --no-optional-locks status --porcelain=v2 --branch` and
  `git rev-parse` in each space's live folder via `exec`, calls `hc machine ls` every
  15 s, and watches local git repos with `watchFolder`. It reads git metadata only and
  sends nothing over the network.
- **`my-agents`** uses Herdr's live agent/terminal data and shipped SVGs. No `exec`,
  no network.
- **`my-tabs`** uses Herdr's live tab/pane data and shipped SVGs. No `exec`, no
  network.

`RECIPE.md` has the full build notes, including the exact layout tree, the two-line
row structure, and what a fresh build would get wrong.
