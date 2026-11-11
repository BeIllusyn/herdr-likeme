# Likeme

A Herdr layout built on top of the shipped `main` layout with a **Glassmorphism** design:
every space and agent row is an icon with two lines of text beside it, rows and tabs are
frosted glass cards with subtle borders and transparency, the active item glows with its
space's colour (the active tab too), panes fill the work area edge to edge, and the
working spinner is a gold braille character instead of a rotating ring.

Built from Herdr `main` @ 0.1.12 (`cloned_from` in `layouts/likeme.json`).

![Likeme](preview.png)

_A live capture: the two-line rows, the rounded card selection, the tab close buttons
and the braille spinner are the real UI._

## What changes

| Area | Change |
|---|---|
| **Sidebar** | Spaces and agents share one scrolling column; the Agents section follows the spaces content instead of starting at the sidebar's midpoint, and the whole column scrolls together — its scrollbar shows itself only while the pointer is over it, so the column reads clean when nothing is scrolling. Both halves watch their data on a 250 ms timer while the window is in front, and take one look in four (1 s) while it is in the background; a redraw happens only when what they draw actually changed. |
| **Spaces** | A 32 px tinted monogram with a dark letter; the project name (13 px) over the current git branch (11 px, muted, plus ahead/behind). Rows are separate 12 px-radius glass cards with 6 px side insets and a 4 px gap; a resting card is a whisper of the space's colour with a soft edge, and the active space fills with the same colour and brightens its edge — the glass scale every card in the layout shares; worktrees hang from a 1 px tree line under their checkout; with fewer than three spaces a muted glass "New space" card fills the gap. |
| **Agents** | The same rounded two-line card, led by the agent's own generated title with its space (project) name underneath, falling back to the space name over the title when the agent has none, with a whisper of its space's colour and a 4 px gap between cards; the focused agent takes the same active glass fill as the selected space row, and sub-agent rows sit one step quieter — a fainter wash of the same colour under their parent's card. The column watches its data on a 250 ms timer (1 s while the window is in the background) and redraws when it changes, so focus and status turns show without hovering; every agent keeps a status mark visible — the working spinner, a "Needs you" badge, the done dot and a faint idle ring. The elapsed time and pin share a fixed slot, so hovering never shifts the text. Priority view keeps its section headers (Needs you / Done / Working / Idle) visible at all times, so an all-idle list still reads as "Idle"; a lone space group hides its redundant header, and the sort button uses an up/down icon. |
| **Tabs** | Tabs are 30 px rounded glass cards (10 px radius) with a 4 px gap, centred in the 42 px bar; the active tab fills with the space's colour at the same active glass step as a selected sidebar row, while the others lie flat on a whisper of it and keep a close button (dimmer when inactive). The `+` and the four quick starts are the same card language on the theme's own colours, each with a tooltip. `Files`／`Changes` 固定在标签栏最右侧、不随标签滚动，使用相同的 30 px 圆角块；点击直接切换整个工作区的内容，不创建新的 Tab，当前入口使用选中态底色，再次点击或选择普通 Tab 即返回终端。 Dragging a tab shows the accent line it will land on. A default-numbered tab shows what it runs — the folder name, or the program when two tabs share it — and `+` follows the ordinary tabs; the fixed Files/Changes entries sit on the bar's right edge. A zoomed tab gets a small zoom glyph instead of a trailing `Z`. Four one-click starts sit right after the `+` — Claude Code (with `--dangerously-skip-permissions`), Pi, Lazygit and Neovim — each opening a tab in the focused folder and using Herdr's own program icon (Claude keeps its orange, the other three are tinted glyphs). The working spinner is a gold braille character (`⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏`, 80 ms per frame). |
| **Panes** | Square corners and no padding or terminal padding — a lone pane fills the work area edge to edge, and split panes keep a 1 px gap where the layout's `canvas` shows through instead of a drawn border — a card surface named by the theme (`surface`), and a cloned header on that same surface. Only the focused header wears the space's colour: a ~20 % tint of it over the theme's `surface` (or the theme's `raised` when the space has no colour) with a matching edge along its bottom hairline — the same colour language as the active tab and the selected sidebar row, one glass step quieter because a header is much larger; inactive headers stay plain `surface` with a hairline under them. It is a flat colour — no gradient, no animation — and it follows the theme, so a light theme gets a light header. The split/zoom/close buttons are always visible; the status mark appears for working, blocked and done (nothing while idle). The header's working spinner is the same gold braille character as the tabs and agents. |
| **Files / Changes** | 从 Herdr 的 `files` 和 `changes` Mod 克隆，作为工作区 stack 的固定视图显示，根目录跟随当前终端；入口固定在标签栏最右侧，不重复显示为普通 Tab。旧版已打开的独立工具 Tab 会由固定入口复用，不关闭其编辑器。The body splits left/right: the file tree or the changed-file list (with the commit box under it) on the left, the preview or the diff on the right, on the terminal's `background`, so the regions separate by colour alone. The diff covers the whole file — unchanged lines are included as context — and the row above it names the file with `↑`／`↓` buttons that jump between change blocks and a `Files` button that opens the same file in the Files view (a file outside that view's folder is previewed from the repository root without changing its tree). The file preview is an editor: edits save themselves after a pause (and on blur, a file switch or closing the view), writing only while the file still matches the text it read; the path row says Saved / Saving… / Save failed, and a file too large to round-trip stays read-only. A `Diff` toggle turns the preview into a side-by-side before/after comparison against HEAD — deleted lines tinted red on the left, added lines green on the right, untracked files read as all additions — and toggles back to the editor. The open file and the selected change are tinted in their list. Diff rows tint additions and deletions at 20 % and carry a coloured `+`／`−` sign beside the line number, so the two stay apart on a dark theme (and without relying on hue alone). The file and changed-file rows are 6 px cards, the changed-file count badge 5 px and the commit field and button 8 px. Both lists are virtualized, so a large tree or a thousand changed files only builds the rows on screen. 切换视图会保留文件树展开状态和分栏宽度；关闭布局时结束计时器和目录监听。 |
| **Brand bar** | Cloned from `workspace-chrome` with its sidebar toggle, logo and search button removed: the sidebar stays open, and the top-left block is an empty window-drag surface (the macOS traffic lights still sit there). The same clone draws the sidebar footer (Settings / Add machine) without its top border, so the chrome column has no rule above it. |

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

After editing a mod, run `./check.sh`: it loads all six mods and fails if the three
`colors.js` copies drift.

工作区入口的回归测试使用 Node.js 内置测试运行器：

```sh
node --test tests/workspace-panels.test.mjs
```

Never overwrite a layout or mod you already have: rename the new one and update the
matching `"mod"` references in `likeme.json`.

- Update: run the one-liner again, or `git pull && ./install.sh`
- Uninstall: delete `layouts/likeme.json`, `layouts/likeme.png` (if present) and the
  `mods/my-sidebar`, `mods/my-tabs`, `mods/my-pane`, `mods/my-files`, `mods/my-changes`
  folders. If you
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
  data, tints the focused header with the space's colour, and carries its own
  split/zoom/close SVGs. No `exec`, no network.
- **`my-files`** is a lazy file browser for the tab's terminal folder. It lists
  directories with `sh` (or PowerShell on Windows), previews and edits files with
  `readTextFile` / `writeTextFile` (a write only lands while the file still matches
  the text it read), and watches folders with `watchFolder`. The workspace copy also
  answers Changes' `shared("files.open")` request, opening the file and expanding its
  folders; a file outside its tree is read from the repository root. No network.
- **`my-changes`** is a clone of the shipped changes panel. It runs read-only git
  commands (`status`, `diff`, `rev-parse`) via `exec`, asks for full-file context, and
  watches the worktree. Its header jumps between change blocks and hands the selected
  file to Files (`setShared` + `layout.select`). No network.
- **`my-brand`** is a clone of the shipped brand bar and sidebar footer with the
  sidebar toggle, logo and search button removed, and the footer's top border gone. No
  `exec`, no network.

`RECIPE.md` has the full build notes, including the exact layout tree, the two-line
row structure, and what a fresh build would get wrong.

## License

MIT. See [LICENSE](LICENSE).
