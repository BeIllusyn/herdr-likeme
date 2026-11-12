# Likeme

A Herdr layout built on top of the shipped `main` layout with a **Graphite** design: one
neutral, layered workspace where the only colour is each space's own and it appears as a
mark, never as a line — a solid monogram on the selected space, a tinted tile behind the
focused agent's icon, a coloured glyph in the active tab and the focused pane, and a small
dot on an agent's space line. Rows are flat, section labels are uppercase micro-type, and
regions meet on hairlines instead of card borders. Panes fill the work area edge to edge,
and the working spinner is a gold braille character instead of a rotating ring.

Built from Herdr `main` @ 0.1.12 (`cloned_from` in `layouts/likeme.json`).

![Likeme](preview.png)

_A live capture: the flat rows with their space marks, the uppercase section captions,
the active tool view and its editor are the real UI._

## What changes

| Area | Change |
|---|---|
| **Sidebar** | One scrolling column for Spaces and Agents, with a scrollbar visible on hover. The 32 px section captions use 10 px labels and small neutral count chips; 44 px rows, 26 px marks and 3 px gaps give both lists the same rhythm. Both retained views check live data every 250 ms (1 s in the background) and redraw only when it changes. |
| **Spaces** | A tinted monogram, a 13 px project name and an 11 px branch with a small branch icon and ahead/behind counts. Selection uses a neutral fill and a solid space mark; its text automatically chooses dark or white ink for contrast. Worktrees sit under their checkout with a branch glyph that shares the checkout title's column, their own names stepping one glyph further in. A 32 px New space action ends the list. |
| **Agents** | The agent's title leads, with its space underneath and a small space-coloured dot. The focused row uses the same selection as Spaces and a tinted icon tile. Sub-agent rows are 26 px. Working, Needs you, Done and Idle remain visible; elapsed time and pin share a fixed slot. Priority keeps its section headers; Grouped hides a redundant single-space header. |
| **Tabs** | A 44 px bar with 32 px tabs, 12 px labels and 4 px gaps. Quick starts are grouped behind a short hairline after `+`: Claude Code (`--dangerously-skip-permissions`), Pi, Lazygit and Neovim. Files / Changes stay fixed at the right, switch the workspace without creating tabs, and collapse to icons with tooltips below 680 px of bar width. Existing standalone tool tabs are reused. Tabs keep drag, rename, zoom and close actions; close buttons brighten on hover. |
| **Panes** | Edge-to-edge terminals and 1 px split gaps. The 36 px header matches Files / Changes; focus adds a 6% space tint, a 13 px semibold title and a coloured program icon. Folder text is 11 px, the fixed status slot is 68 px, and split / zoom / close controls are grouped 24 px buttons with tooltips. Close actions use a red hover state. |
| **Files / Changes** | Matching 260 px initial list widths, 36 px headers and 28 px file rows. Filenames lead in Changes, with quieter directory context, one colour per A / D / U / M status across both views, tinted and edged status tiles, and full-path tooltips. File previews keep the editor and optimistic auto-save, with a fixed-width save indicator and a larger Edit / Diff switch. Full-file diffs and before/after comparisons use 12 px type, 22 px rows, the same 18% add/remove wash, and coloured `+` / `−` signs. The before/after divider drags to set each half's width, and each half scrolls horizontally on its own with line numbers and signs pinned, so a long line is read in full instead of being ellipsized. Change navigation is grouped in the header. Lists remain virtualized, and switching views preserves folders and split widths. Both views share the same empty-state styling; a clean worktree shows All caught up. A source row above the changed files switches between the working tree and another local or remote branch: the chosen branch is compared from its merge base to HEAD (committed changes only), drives the same list and whole-file diff, and replaces the commit box with a quiet note. |
| **Brand bar** | A 44 px empty window-drag surface, aligned with the tab bar, and a 76 px footer with 28 px Settings / Add machine rows. The footer, sidebar and brand share a continuous, faint right-hand divider. |

Everything else — menus — is Herdr's `main` layout unchanged.

## Requirements

- Herdr 0.1.12 or newer.
- Herdr's shipped mods and assets that this layout references:
  `workspace-chrome`, `pane` (the tab bar borrows its close/zoom icons),
  `menu`, `new-menu`, the program icons under `icons/` (the quick starts),
  and the usual dialog/overlay mods.

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

`install.sh` copies `layouts/likeme.json` and the six mods into
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
cp -R mods/my-sidebar mods/my-tabs mods/my-pane mods/my-files mods/my-changes mods/my-brand "$DST/mods/"

herdr-app check "$DST/mods/my-sidebar"
herdr-app check "$DST/mods/my-tabs"
herdr-app check "$DST/mods/my-pane"
herdr-app check "$DST/mods/my-files"
herdr-app check "$DST/mods/my-changes"
herdr-app check "$DST/mods/my-brand"
herdr-app do layout.switch '{"name":"likeme"}'
```

After editing a mod, run `./check.sh`: it loads all six mods and fails if their six
`colors.js` copies drift. Shared `UI`, `TYPE` and `SIZE` tokens keep colours, text and
component dimensions consistent.

工作区入口的回归测试使用 Node.js 内置测试运行器：

```sh
node --test tests/workspace-panels.test.mjs
```

Never overwrite a layout or mod you already have: rename the new one and update the
matching `"mod"` references in `likeme.json`.

- Update: run the one-liner again, or `git pull && ./install.sh`
- Uninstall: delete `layouts/likeme.json`, `layouts/likeme.png` (if present) and the
  `mods/my-sidebar`, `mods/my-tabs`, `mods/my-pane`, `mods/my-files`, `mods/my-changes`,
  `mods/my-brand` folders. If you
  upgraded from a version before the merged sidebar, also delete the old
  `mods/my-spaces` and `mods/my-agents` folders; their code now lives inside
  `mods/my-sidebar`.

## What the mods do

Herdr mods are trusted code: they can run programs, use the network and read files.
These six are meant to be read:

- **`my-sidebar`** is one mod with two retained child views (`spaces.js` and
  `agents.js`, sharing `util.js`'s background-tick throttle)
  in one hover-scrollbar column. The spaces half runs
  `git --no-optional-locks status --porcelain=v2 --branch -uno --no-renames` and one
  `git rev-parse` in each space's live folder via `exec`, calls `hc machine ls` every
  15 s, and watches local git repos with `watchFolder`. The agents half uses Herdr's
  live agent/terminal data. Both use shipped SVGs; it reads git metadata and the local
  machine list and sends nothing over the network.
- **`my-tabs`** uses Herdr's live tab/pane data and shipped SVGs. Its four quick
  starts ask Herdr (`tab.new`) to open Claude Code, Pi, Lazygit or Neovim in a new
  tab。Files／Changes 固定入口使用 `layout.select` 切换工作区内容，不创建或关闭
  Tab；升级前已存在的工具 Tab 会保留并由固定入口复用。Mod 不运行 `exec`，也不使用网络。
- **`my-pane`** is a clone of the shipped pane header; it reads the same live pane
  data, mixes 6 % of the space's colour into the focused header and colours its icon,
  and carries its own split/zoom/close SVGs. No `exec`, no network.
- **`my-files`** is a lazy file browser for the tab's terminal folder. It lists
  directories with `sh` (or PowerShell on Windows), previews and edits files with
  `readTextFile` / `writeTextFile` (a write only lands while the file still matches
  the text it read), and watches folders with `watchFolder`. The workspace copy also
  answers Changes' `shared("files.open")` request, opening the file and expanding its
  folders; a file outside its tree is read from the repository root. No network.
- **`my-changes`** is a clone of the shipped changes panel. It runs read-only git
  commands (`status`, `diff`, `rev-parse`, `merge-base`, `for-each-ref`) via `exec`,
  asks for full-file context, and watches the worktree. Its header jumps between
  change blocks and hands the selected file to Files (`setShared` + `layout.select`).
  A source row can compare the current branch with another local or remote branch;
  that list comes from `for-each-ref` and the diff runs from their merge base to HEAD,
  so uncommitted edits never enter a branch comparison. No network.
- **`my-brand`** is a clone of the shipped brand bar and sidebar footer with the
  sidebar toggle, logo and search button removed; the footer is 28 px quiet rows over a
  hairline. No `exec`, no network.

`RECIPE.md` has the full build notes, including the exact layout tree, the two-line
row structure, and what a fresh build would get wrong.

## License

MIT. See [LICENSE](LICENSE).
