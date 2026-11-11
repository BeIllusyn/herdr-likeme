# Likeme

A Herdr layout built on `main` with a **Glassmorphism** design: each space and agent
row is an icon on the left with two lines of text beside it, rows and tabs are frosted
glass cards with subtle borders and transparency, panes fill the work area edge to edge,
resting items lie flat under a whisper of their space's colour with a delicate glass
border, the selected one glows with a brighter semi-transparent tint (the active tab
too), and the working spinner is a gold braille text spinner instead of a rotating ring.

![Likeme](preview.png)

_Workspace text in the screenshot is blurred; the layout shapes, the two-line rows,
the rounded card selection, the tab close buttons and the spinner are the real UI._

## What you see

The window is Herdr's `main` layout with six mods replaced. No system title bar
(`"titlebar": "none"`); on macOS the traffic lights sit at `[12, 16]`. Background is
the theme's `canvas`; the sidebar sits on the theme's `chrome`, and the tab bar is the
same `chrome` at 75 % over the root `canvas` — the frosted layer the glass cards float
on. Regions meet with no dividers or separator borders: their backgrounds do the
separating.

**Sidebar (268 px, min 222, max 480, not resizable).** A 46 px empty brand block
(`my-brand`, an empty window-drag surface), then one `sidebar-list` block (`my-sidebar`, `weight: 1`,
`min: 90`), then a 69 px footer (`my-brand` with `props.footer`, no top border). The block is
one scrolling column: Spaces header → space rows → "New space" hint → Agents header →
agent rows, with a scrollbar that shows itself only while the pointer is over it. The
Agents header follows the spaces content (10 px top padding, no top
border), so the two sections no longer split the sidebar in half.

**Spaces.** A 31 px header ("Spaces", 14 px medium, `muted`, + button 26 px). Rows are
44 px (42 px for worktree children), each its own 12 px-radius glass card inset 6 px from
the sidebar's edges and separated by a 4 px gap. A resting card lies flat under a whisper
of its space's colour (`GLASS.rest`, ~7 %) with a soft edge (`GLASS.restEdge`, ~15 %);
the active space fills with the same colour (`GLASS.active`, ~30 %) and brightens its
edge, so the selection reads without a left accent bar. The pointer lifts a resting card
one step in the same colour (`GLASS.hover`). Every card in the layout — agent rows,
tabs, panel buttons — lifts and glows by this one scale, kept in `colors.js`.
Each row:

- left: a 20 px rounded tile filled with the space's first letter in a dark ink
  (`#101114`) — the tile colors are mid-tone, so the dark letter reads on all six;
  worktree rows instead draw a 1 px tree line in `input` under the checkout's avatar,
  with a 6 px right-turning stub on the last child, then the 13 px `branch.svg` in
  `muted`;
- right, a `v_flex` with two lines: the space name at 13 px (`line-height` 16 px) in
  `foreground`, and below it the current git branch at 11 px (`line-height` 14 px) in
  `muted`. `detached` when the branch is unknown; `↑n` in `ansi2` / `↓n` in `ansi1`
  for ahead/behind. Spaces that are not a git repo show only the name.
- with fewer than three spaces, a muted 38 px "New space" glass card ends the list.

A machine header (28 px, its own 8 px-radius card) appears once more than one machine
is known. The sidebar stays at its expanded width: there is no compact rail.

**Agents.** A 41 px header ("Agents", 14 px medium `muted`, up/down sort icon). It
follows the spaces content instead of a fixed half; group headers are 28 px. In the
Priority view the section headers (Needs you / Done / Working / Idle) always show, so
an all-idle list still says "Idle"; in the grouped view a lone space group hides its
redundant header. Agent rows are 44 px 12 px-radius glass cards with the same 6 px inset
and 4 px gap as the spaces:

- 16 px program icon (agent's own report, else the program), clickable to fold
  sub-agents;
- right, the agent's own generated title at 13 px (`line-height` 16 px) when it
  reports one, with the space (project) name at 11 px (`line-height` 14 px) in
  `muted` underneath; without a title the space name leads and the tab's title sits
  below. An automatic tab number is suppressed, so a row says nothing rather than "1";
- end of row: sub-agent fold chevron, a fixed 32 px slot for the pin (hover) or the
  elapsed time (11 px, `muted`), and the status glyph. The fixed slot means hovering
  never reflows the row. Sub-agent rows are 26 px cards with tree lines, sitting one
  glass step quieter than their parent: a fainter wash of the same colour
  (`GLASS.wash`, ~4 %) with no edge of their own;
- every agent card carries a whisper of its space's colour (`GLASS.rest`, the same
  colour its space row uses), so a row keeps its space's identity even in Priority
  view; the focused agent takes the same active glass fill as the active space.
  No left accent bar.

**Tabs.** 30 px rounded glass cards (10 px radius, `px 10`, `gap 8`) with a 4 px gap,
centred in the 42 px bar with 8 px side padding. Every tab keeps a 16 px close button;
the close fades to 0.4 on inactive tabs and returns on hover. The active tab fills with
the space's colour at the same active glass step as a selected sidebar row
(`GLASS.active`, ~30 %, with its `GLASS.activeEdge` edge). The others lie flat under a
whisper of it (`GLASS.rest`), and the pointer lifts them one step in the same colour. The
`+` and the four quick starts are the same card language on the theme's own colours
(neutral glass), each with a tooltip. Program icon 16 px, name up to 170 px
truncated; a zoomed tab shows a small `zoom.svg` instead of a trailing `Z`. A tab still
named by its number shows what it runs: the folder name, or the program name when two
tabs share a folder (then the number is appended if the programs also collide). The
普通 Tab 后依次是 `+` 和四个快捷启动，都在可滚动区域内；`Files`、`Changes` 两个固定
入口不随标签滚动，贴在标签栏最右侧。

**Panes.** Square and edge to edge: no padding, terminal padding or frame border —
the terminal and the header meet their neighbours directly, and the faint hairline
under the header is the only line anywhere; otherwise the backgrounds tell the
regions apart. Split panes keep a 1 px `gap`, so the layout's
`canvas` shows between them instead of a drawn border; a lone pane fills its tab edge
to edge. The pane background is the theme's `surface`; the
30 px header from the cloned `my-pane` mod (`reveal: always`) is painted on that same
`surface`. The focused header carries the focus mark: the space's
colour at the quieter `GLASS.header` strength (~20 %) over `surface` (the theme's
`raised` when the space has no colour), with a matching edge along the header's bottom
hairline, the same
colour language as the active tab and the selected sidebar row, a step quieter
because a header is much larger than a tab. It is a flat fill — no gradient or
animation — so a space's header colour changes with the space, and light and
dark themes each get their own surface. Inactive headers stay plain `surface` with a
faint hairline under them. The title is 12.5 px
`medium`, the folder 11.5 px `muted`, and the working state is the same gold braille
character as the tabs and agents. Files／Changes 不是侧栏，也不是新建的 Tab，而是
`work-body` stack 中的固定视图。点击标签栏最右侧的入口通过 `layout.select` 切换整个工作区，
目录跟随当前终端。视图内部仍然左右分栏：文件树，或带有提交框的修改列表，使用 `surface`；the
file preview or the diff on the right, on the terminal's `background`; neither the pane
nor its sections draw a rule. The open file and the selected change are tinted in the
list. The file preview is editable: a burst of keystrokes writes once after a pause (and
on blur, a file switch or closing the view) through `writeTextFile`, with the text it read
as `expected`; the path row says Saved / Saving… / Save failed, and a file too large to
round-trip stays read-only. 隐藏的 stack 子视图会保留实例、展开的目录和分栏宽度；
切换目录时，Files 先把未保存的编辑写回旧目录，再载入新目录。

## How it behaves

- **Agent status.** Working: a gold braille character cycling through
  `⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏` every 80 ms. Blocked: a
  "Needs you" pill (a bare `!` inside a group whose header already says it). Idle:
  nothing — a ring beside every quiet row read as something to act on. Done: a filled
  dot. A space's and a tab's status is their most urgent agent's.
- **Spaces.** Click selects. Drag a row to reorder inside its machine; the accent line
  shows where it lands. Right-click opens Herdr's `menu` with the `space` context.
  Worktrees sort under their checkout and hang from a 1 px tree line; the last child
  turns into its row instead of continuing. The + button creates a space.
- **Sidebar.** Spaces and agents share one scroll: the Agents header follows the spaces
  content instead of a fixed half. Each section keeps its own folds and hover states.
- **Agents.** Click focuses that agent's pane. Hover reveals the pin (pins survive on
  the terminal label). The chevron folds sub-agents. The header icon opens the sort
  popup (Priority / Grouped by space). Group headers and machine headers fold; Priority's
  section headers stay visible even when only one section has agents.
- **Tabs.** Click selects, drag reorders (`tab.move`) with an accent line on the edge
  it will land on, double-click renames, right-click opens the tab menu, every close
  button closes its own tab. A tab still named by its number is shown by what it runs,
  so "1" becomes the folder or program name; renaming a tab always wins. The `+` opens
  Herdr's `new-menu` popup, and four one-click starts follow it (Claude Code, Pi,
  Lazygit, Neovim): each runs `tab.new` with its `argv`, so Herdr opens a tab in the
  focused folder, and each uses the program table's own icon (`icons/claude.svg` as a
  full-colour image, the rest as tinted glyphs). Claude starts with
  `--dangerously-skip-permissions`, so it never stops for a permission prompt.
- **Pane header.** Click focuses the pane. Only the focused header is tinted with the
  space's colour; inactive headers stay plain.
  The split-right, split-down, zoom/unzoom and
  close buttons are always visible, and the status indicator keeps its place when there
  is one (working spinner, "Needs you", done dot); an idle agent shows nothing. Each
  button acts on its own pane (`props().pane`), not the focused one. Working shows the
  same braille character as the tabs and agents.
- **Files / Changes.** 两个固定入口位于标签栏最右侧，不随标签滚动。点击切换整个工作区，
  不新建 Tab；选中的入口使用选中态底色，再次点击或选择普通 Tab 就返回终端。
  Diff 覆盖整个文件（`git diff -U1000000`，未改动的行也作为上下文，最多 20,000 行）；
  右侧标题行显示文件路径，`↑`／`↓` 在连续的新增/删除块之间跳转，`Files` 把同一个文件
  交给 Files 视图（`shared("files.open")` 传仓库根和相对路径；终端停在子目录时 Files
  仍按仓库根预览，不改变自己的树根）。Diff 的新增/删除行用 20% 的 ansi 色铺底，
  行号右侧再放一个同色的 `+`／`−` 标记：9% 的底色在深色主题下混出来几乎一样，
  标记也让色觉差异的人不必只靠颜色分辨。
  快捷键、侧栏或新建 Tab 改变当前终端时，也会退出工具视图。
  旧版已存在的单独工具 Tab 从普通列表中隐藏，由固定入口复用，避免丢失编辑和分栏状态。
  Files 预览标题行的 `Diff` 把编辑器切成“变更前／变更后”两栏：左侧旧文件、右侧工作区
  文件，删除/新增各占半边并带底色，未跟踪文件整份算新增；再点一次回到编辑器。
- Everything else (the palette, dialogs and notifications) is unchanged from `main`.

## Built from

**Layout tree** (`layouts/likeme.json`, `cloned_from {name: "main", version:
"0.1.12"}`):

```
root row (canvas, titlebar none, traffic_lights [12,16], terminal_padding [0,0], no divider)
├─ sidebar column (268px, min 222, max 480, background chrome, resizable false)
│  ├─ brand block (46px, my-brand, window_drag; empty drag surface)
│  ├─ sidebar-list block (weight 1, min 90, mod my-sidebar)
│  │  └─ one scroll: Spaces section (spaces.js) + Agents section (agents.js)
│  └─ sidebar-footer block (69px, my-brand, props {footer: true})
└─ work column (resizable false)
   ├─ tabs block (42px, mod my-tabs, window_drag)
   └─ work-body stack (padding 0, active main)
      ├─ main block {tab: active, pane: {gap 1, radius 0, background surface,
      │             lone true, header {mod my-pane, height 30, reveal always}}}
      ├─ files block (my-files, props {workspace: true})
      └─ changes block (my-changes, props {workspace: true})
```

Files／Changes 直接属于布局，不调用 `tab.new`。固定入口通过
`layout.select {stack: "work-body", child: "files" | "changes" | "main"}` 切换内容，
Herdr 保留隐藏的子视图实例，并保存 stack 的选择。
`props.workspace` 让两种工具跟随当前终端目录；旧版独立工具 Tab 不带此标志，仍保留原目录，
入口会优先复用它们而不强行关闭。

**Mods.**

| Mod | Role |
|---|---|
| `my-sidebar` | One mod, two retained child views (`spaces.js` and `agents.js`) composed in a single hover-scrollbar column (`main.js`); `colors.js` holds the shared `MARK` table, `markColor()`, `withAlpha()` and the `GLASS` scale every card lifts and glows by, and `util.js` the background-tick throttle. It keeps the spaces logic (git lookup via `exec`, `hc machine ls`, `watchFolder`, drag-reorder) and the agents logic (live agent data, pins, groups, sub-agent trees) unchanged. Changed: the two sections share one scroll (no 50/50 split), the Agents header follows the spaces content without a top border, the worktree rows draw a real 1 px tree line, rows are rounded cards with a soft opaque selection and a 4 px gap, and both retain the row/type/active-state changes from the earlier passes. The sort popup mounts a second copy of this mod (`props.sortMenu`) and returns only the agents view. |
| `my-tabs` | The tab bar. Clone of the shipped `tabs`. Changed: 30 px rounded glass tabs (10 px radius), `px 10`/`gap 8`, 16 px icons, distinct labels for default-numbered tabs, `+` and four quick-start icons after ordinary tabs (Claude Code, Pi, Lazygit, Neovim via `tab.new`), close button fades to 0.4 when inactive, the active tab at the shared active glass step in the space's colour, a drag-to-reorder line, zoom glyph, spinner `frames([...], 80)`. Files／Changes 固定在标签栏最右侧、不随标签滚动，使用 `layout.select` 切换工作区 stack，不创建额外 Tab；选中的入口使用选中态底色，再次点击返回终端。旧工具 Tab 由固定入口复用，不再重复显示。 |
| `my-pane` | The pane header. Clone of the shipped `pane`. Changed: header surface is the theme's `surface`, 12.5 px title / 11.5 px `muted` folder, a flat space-colour tint on the focused header (`GLASS.header` over `surface`, no animation), braille working spinner instead of the rotating SVG, always-visible `muted` buttons, and it keeps the split/zoom/close buttons. |

Herdr functions used: `spaces`, `agents`, `terminals`, `panes`, `focused`, `layout`,
`theme`, `window`, `settings`, `keys`, `home`, `shared` / `setShared`, `setAgentOrder`,
`run`, `openOverlay` / `closeOverlay`, `props`, `exec`, `readTextFile`,
`writeTextFile`, `hc`, `watchFolder`, `localStorage`.

Commands used: `space.select`, `space.move`, `space.new`, `tab.new`, `tab.select`,
`tab.move`, `tab.close`, `tab.rename`, `pane.focus`, `pane.split`,
`pane.zoom`, `pane.close`, `terminal.pin`, `terminal.peek`, `window.minimize`,
`window.maximize`, `window.close`, `app.palette`.

Programs run: `git` (via `exec`), `hc machine ls` (via `hc`). The quick starts ask
Herdr to run `claude --dangerously-skip-permissions`, `pi`, `lazygit` and `nvim`
(`tab.new`'s `argv`); the mod never spawns them itself.

Art: Herdr's shipped `mods/workspace-chrome/*.svg` (branch, plus, chevron-down/right,
pin, pin-off, server, monitor, check, layers, settings), `icons/claude.svg`, `icons/pi.svg`,
`icons/lazygit.svg` and `icons/nvim.svg` (the quick starts), `mods/pane/close.svg` and
`zoom.svg` (used by `my-tabs`), `mods/files/file.svg`, `mods/changes/changes.svg`;
`my-sidebar` carries its own `sort.svg`; `my-pane` carries its own
`close/split/zoom` SVGs; `my-tabs` carries its own `win-min/max/restore/close.svg`
copies for Windows.

## Watch out

- **Clones never update.** Herdr replaces its shipped
  `spaces`/`agents`/`tabs`/`pane` on every start; these four sources
  are frozen at 0.1.12. After a Herdr upgrade, diff each shipped `main.js` against its
  copy and port whatever changed (`spaces`→`my-sidebar/spaces.js`,
  `agents`→`my-sidebar/agents.js`, `tabs`→`my-tabs`, `pane`→`my-pane`).
- `my-sidebar` is a composition, not a clone: `main.js` mounts two retained child
  views with `cx.new(..., { embedded: true })`. The child reads `embedded` from its
  `init(props)` argument, **not** from the global `props()` (which is the host mod's
  props). Without that flag each child paints `size_full` and the 50/50 split returns.
  The sort popup mounts a second copy of `my-sidebar` with `props.sortMenu` and renders
  only the agents entity.
- A retained child does **not** get the host mod's live-data redraws. `Agents` watches
  what the list shows on a 250 ms timer — status, focus, pin, names, space colours,
  the sort, the current minute (the elapsed time under each row) — and redraws only when
  that signature changes. Without it a status turn or a focus change waited for the
  next hover (which redraws) or 30 s. `Spaces` polls at 250 ms for git. Both timers
  take only one look in four while the window is in the background, and catch up
  within a second of it coming forward. Keep both when porting a shipped clone into
  the composition.
- If you upgrade from a version before the merge, delete the old
  `~/.config/herdr-app/mods/my-spaces` and `my-agents` folders by hand; `install.sh`
  never removes mods it did not install this run.
- The mods read shipped assets by path (`mods/workspace-chrome/...`,
  `mods/pane/close.svg` in `my-tabs`). If Herdr renames them, update the paths.
  `my-pane` uses its own `mods/my-pane/*.svg` copies instead.
- The focused header's tint is `withAlpha(fill, GLASS.header)` over the theme's
  `surface`, drawn by the mod on its own header surface. `colors.js` (the shared
  `MARK`, `markColor`, `withAlpha` and `GLASS` scale) is one file copied into
  `my-sidebar`, `my-tabs` and `my-pane`; `check.sh` fails when they drift. The
  colour comes from `shared("space.colors")[space.id]` for the active space; a space
  with no colour falls back to the theme's `raised`. It is a solid fill because Herdr's pane frame
  exposes only a solid `border`/`focus` colour and `pane.background` ignores `gradient`
  and `image`; a layout-node background image with `terminal_opacity` below 1 shows
  ghosting. Layout `focus`/`background` changes apply when the layout loads, not on a
  live save: run `herdr-app do layout.switch '{"name":"likeme"}'` after editing. Mod
  edits hot reload.
- The header is the only surface that can take the space tint: a mod draws it, while
  the pane frame around the terminal can only be a solid colour. Do not try to move the
  tint onto the pane `background` — it would colour every pane, focused or not.
- **Performance rules for these mods.** Every `spaces()`, `panes()`, `agents()` or
  `terminals()` call copies the whole host list into JS, so read each one once per
  render/tick and pass the snapshot down (the agents view used to call `panes()` once
  per row). `setShared` re-renders every mod, so never call it from `render`:
  `Spaces` assigns colours from `init` and its tick. `run()`/`migratePins()` also stay
  out of render. Place keys are `machine + "\u0000" + folder`, not JSON, so the
  250 ms tick does no parsing; `git status` adds `-uno --no-renames` because only its
  branch lines are read, and the two `rev-parse` answers come from one process.
  A git look that finds nothing new no longer redraws the list.
- **Do not build a row per file.** The Files tree and the changed-file list use
  `v_virtual_list`; a renderer may not register handlers or retain state, so the row
  helpers are pure and the click is the list's `on_item_click` (keyed by path). A
  non-virtualized tree built up to 5,000 elements on every render.
- **The diff is the whole file.** `git diff -U1000000` makes every unchanged line
  context, cut at 20,000 rows and 4,000 characters per line. The header's `↑`／`↓`
  walk the contiguous `+`／`-` blocks (`changeStarts`); `v_virtual_list` is driven by a
  `VirtualListScrollHandle` created in `init`. The Files button writes
  `shared("files.open") = { root, path, at }` and selects the `files` stack view;
  `my-files` accepts the request only in the workspace copy and ignores anything older
  than 30 s, because `shared.json` survives a restart. Files' own `Diff` toggle runs
  the same full-context diff against HEAD and pairs the unified rows into a left/right
  table (`diffPairs`: a run of deletions paired with the following run of additions,
  context rows on both sides); untracked files are read as all additions.
- **Saving is optimistic and whole-file.** `writeTextFile(path, text, expected)`
  replaces the file only while it still holds `expected` (the text the copy read or last
  wrote), so a file changed elsewhere says "Save failed" instead of being overwritten;
  reopening the file loads the new content. A preview over 400,000 characters is cut for
  display and stays read-only, so the cut text never goes back to disk. There is no
  range API: every save writes the whole file. The editor writes on a 700 ms debounce
  and again on blur, submit, a file switch and `close`; `set_value` keeps the change
  listener out of the keystroke path.
- Heights are fixed: 44 px agent/space rows, 42 px worktree rows, 26 px sub-agent rows,
  30 px tabs in a 42 px bar. A larger font will clip rather than grow.
- The glass cards are alpha layers (`withAlpha`), not opaque blends: every one of
  them sits on the same surface (the sidebar's `chrome`, the bar's frosted `chrome`),
  so the steps read identically wherever a card lands. The tab status slot is always
  18 px, so a state turn never changes a tab's width.
- The spinner is `frames([...], 80)`, not `spin()`: a native SVG rotation runs at
  about 30 fps and reads as steppy at 12–16 px. `frames` swaps text natively on one
  shared clock.
- Mod names (`my-sidebar`, `my-tabs`, `my-pane`, `my-files`, `my-changes`, `my-brand`)
  are deliberately generic. Rename them on install if they clash, and update the
  `"mod"` fields in `likeme.json`.
- Files／Changes 是 `work-body` stack 的子节点，选择由 Herdr 保存，不需要额外的
  `localStorage`。隐藏视图仍保留实例。`my-tabs` 不创建工具 Tab；只为兼容升级，
  按唯一 Mod pane 识别旧工具 Tab，将其从普通列表隐藏，并复用原实例。
- Space avatar colors are shared through `"space.colors"`; every layout sees them.
- Only this layout is customized. `terminals` and `win98` keep Herdr's look.
- On macOS the empty brand block leaves room for the traffic lights; the tab bar does
  not need to, because the sidebar is always expanded.
- The pane and header surface is the theme's `surface`, and the focused header's tint
  mixes against it, so the layout follows both light and dark themes; `raised` is the
  fallback for a focused space with no colour.
- `line_height` takes a bare number as a multiplier (`1.45`), not pixels. The two-line
  rows use `"16px"` / `"14px"`; `line_height(16)` would make each line 16× tall.
- A hand-named tab always keeps its name (`TabInfo.named`); only unnamed tabs are
  labelled by the folder or program. The `+` lives inside the scrolling strip, so it
  scrolls with the tabs.

## Done when

- `./check.sh` passes: all six mods load and the three `colors.js` copies are identical.
- `herdr-app do layout.switch '{"name":"likeme"}'` shows the layout and `herdr-app
  status` reports no errors.
- Each space row shows a 20 px tinted monogram, a 13 px name and an 11 px muted branch,
  under a whisper of its space's colour.
- The active space is the active glass fill, clearly apart from the resting washes and
  their hover lift; rows are 12 px-radius glass cards with a 6 px inset and a 4 px gap; a
  list shorter than three spaces ends with a muted glass "New space" card.
- Each agent row shows two lines on a whisper of its space's colour; the focused agent
  takes the same active glass fill, sub-agent rows sit on a fainter wash of it, and the
  selection changes within 250 ms of the focus
  moving. Priority keeps its section headers visible even when only one section has
  agents; a lone space group in the grouped view has no header.
- 默认编号的 Tab 显示目录或程序名；普通 Tab 后依次是 `+` 和四个快捷启动，
  Files、Changes 两个入口固定在标签栏最右侧。
- Every tab draws an X close button (dimmed when inactive); the active tab is the
  active glass fill, the others lie flat on their whisper, and no top highlight line is
  drawn.
- A working agent shows the braille spinner in its agent row, its tab, and the pane
  header; an idle agent keeps a faint ring in its agent row, so every row shows where
  its agent stands.
- The pane header uses the theme's `surface` and a 12.5 px title / 11.5 px muted
  folder; only the focused header is tinted with the space's colour, inactive ones stay
  plain; in a light theme the header is light too; its always-visible buttons still
  split, zoom and close the pane they belong to.
- Files／Changes 在标签栏最右侧各显示一个固定入口，不随标签滚动；点击只切换工作区，
  不增加 Tab。再次点击、选择普通 Tab，或通过快捷键和侧栏切换终端，都返回终端视图。
  隐藏视图保留文件树和分栏宽度；旧工具 Tab 仍能通过固定入口访问，且不会被强行关闭。
  两种工具都左右分栏：左侧是文件树或修改列表（以及提交框），右侧是预览或 diff，
  选中的文件或修改项带底色。Diff 从文件第一行显示到最后一行（未改动的行也是上下文），
  标题行的 `↑`／`↓` 一次跳过一个变动块，`Files` 把当前文件交给 Files 视图并定位到它；
  深色主题下红/绿行靠 20% 底色和行号旁的 `+`／`−` 标记区分。
- A file opened in Files can be typed into and saves itself after a pause (or on blur,
  a file switch and closing the view); the path row says Saved / Saving… / Save failed,
  and the file on disk changes. A file edited elsewhere rejects the write instead of
  being overwritten, and a truncated (>400,000 characters) preview stays read-only.
- Files 预览的 `Diff` 开关把编辑器切成左右两栏：左侧旧版本、右侧工作区版本，
  删除/新增行分别带红/绿底色；未跟踪文件整份显示为新增，没有变化的文件给出提示。
- Spaces and agents live in one scroll: the Agents header follows the spaces content
  with no 50/50 boundary, and scrolling moves both sections together.
- A worktree space appears under its checkout with a 1 px tree line; the last child
  turns into its row instead of continuing down.
- Deleting `layouts/likeme.json` and the five `mods/my-*` folders returns the app to
  the shipped layouts.
