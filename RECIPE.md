# Likeme

A Herdr layout built on `main` with a **Graphite** design: a neutral, layered workspace
where each space's colour appears only as a mark — a solid monogram on the selected space,
a tinted tile behind the focused agent's icon, a coloured glyph in the active tab and the
focused pane, a dot on an agent's space line. Rows are flat, section labels are uppercase
micro-type, and regions meet on hairlines instead of card borders. Panes fill the work area
edge to edge, and the working spinner is a gold braille text spinner instead of a rotating
ring.

![Likeme](preview.png)

_A live capture: the flat rows and their space marks, the uppercase captions, the active
tool view and its editor are the real UI._

## What you see

The window uses the theme's `canvas` behind the layout, `chrome` for the sidebar
and tab bar, `surface` for headers and file lists, and `background` for terminals
and previews. Regions meet on faint 1 px hairlines. All colours follow the active
light or dark theme, including space marks from the theme's ANSI palette.

The design system is `colors.js`, copied identically into all six mods. `UI` holds
the neutral ladder — subtle 3.1%, hover 5.1%, active 9%, line 7.8%, field 6.3%,
soft line 4.7% — and the semantic washes: tint 11.8% with a 22% edge, badge 12.2%,
diff 18%, focused tile 18%, dots at 80% / 60%, and a 70% focus ring. `changeColor()`
gives A / D / U / M one hue in both Files and Changes. `TYPE` sets labels to 10 px,
metadata to 11 px, small text to 12 px and row / pane titles to 13 px. `SIZE` sets
the shared dimensions:

| Element | Size |
|---|---|
| Brand surface / tab bar | 44 px |
| Pane / Files / Changes header | 36 px |
| Sidebar section caption | 32 px |
| Space / agent row | 44 px |
| Worktree / sub-agent row | 40 / 26 px |
| File / changed-file row | 28 px |
| Diff / comparison row | 22 px |
| Toolbar / header control | 28 / 24 px |
| Space mark / agent icon tile | 26 px |
| List radius / inset | 7 / 8 px |

The layout JSON repeats the 44 px bar and 36 px pane-header dimensions because
layout documents cannot import JavaScript tokens.

**Sidebar.** The fixed 268 px column has a 44 px empty brand surface, one scroll
containing Spaces then Agents, and a 76 px footer. Section labels start 16 px from
the edge, with neutral count chips and 24 px action buttons. Rows are inset 8 px
with 3 px gaps. A 1 px hairline and a little breathing room separate the sections.
The right divider continues through the brand, list and footer.

**Spaces.** A 26 px rounded monogram sits before a 13 px project name and an 11 px
branch line. The branch icon, ahead and behind counts stay quiet. A selected row
uses the neutral active fill and a solid monogram; `markInk()` chooses dark or
white lettering from the fill's luminance. Worktrees retain their tree lines.
The New space action is a 32 px ghost row.

**Agents.** The same 44 px row and 26 px mark column. The generated title leads
when present; its project and a 4 px space dot sit on the second line. A focused
agent has a semibold title and a tinted icon tile. Idle text is muted. Sub-agent
rows are 26 px with 12 px names. Group captions retain a 5 px status / space dot.
The 30 px elapsed-time / pin slot stays fixed, as does the status area.

**Tabs.** Tabs are 32 px high with a 7 px radius, 10 px horizontal padding, 12 px
labels and 4 px gaps. Selection is the shared neutral fill and a semibold name.
Close buttons rest at 40% opacity (70% active), with red hover feedback. The 28 px
New tab button follows the tabs, then four quick starts in a group behind a short
hairline. Files / Changes stay fixed at the right with 14 px icons. Below 680 px of
bar width, their labels collapse; tooltips and actions remain available. Size
notifications redraw only when crossing that threshold. The scroll thumb appears
on hover. Status slots remain 16 px so status turns do not change tab widths.

**Panes.** Square, edge to edge, with 1 px split gaps and no terminal padding.
The 36 px header uses `surface`; focus mixes in 6% of the space colour, brightens
the title and tints its 14 px program icon. With no space colour the focus tint is
2.5% foreground, and the icon uses the theme accent. The folder uses 11 px type.
A 68 px status slot precedes four grouped 24 px buttons, each with a tooltip.
The close control uses red hover feedback. A soft hairline ends the header.

**Files / Changes.** Both start with a 260 px list panel (minimum 200 px), a 36 px
header and 28 px rows. Files keeps its tree indentation and colours the selected
file's icon. Changes leads with filenames, followed by muted directory context,
and uses 18 px tinted status tiles edged in the same hue. Full paths are available
in tooltips. The commit field and button are 32 px with a 7 px radius. Changes also
carries a 28 px source row between its header and the list: a branch icon, the mode
label (Working tree or the chosen branch), the current branch in 10 px type on the
right and a chevron. Clicking it gives the changed-file list's place to the branch
list: 10 px COMPARE WITH / LOCAL / REMOTE captions, 28 px rows and a check on the
active entry, with a quiet merge-base note at the bottom. The list is inline rather
than an anchored surface, so a branch press is an ordinary row press.

Preview headers share a breadcrumb, a coloured icon and quiet controls. Edit / Diff
uses 24 px segments in a 28 px track; save status keeps a 76 px slot with a small
status dot. Changes groups its previous / next controls. Both diff views use 12 px
monospace text and 22 px rows, with room for five-digit line numbers and coloured
addition / deletion signs. Both diff views use the same 18% wash; the side-by-side
comparison keeps it on the changed half under 28 px BEFORE / AFTER captions.

Empty previews share a 40 px rounded icon tile, a 13 px title and 11 px guidance.
Changes shows All caught up only after a successful refresh finds a clean tree.
The lists remain virtualized. Switching views keeps folders and split widths;
closing the layout ends its timers and directory watches.

## How it behaves

- **Agent status.** Working: a gold braille character cycling through
  `⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏` every 80 ms. Blocked: a `NEEDS YOU` pill edged in its own
  colour (a bare `!` inside a group whose header already says it). Idle: a quiet 6 px
  ring. Done: a 5 px dot. A space's and a tab's status is their most urgent agent's.
- **Spaces.** Click selects: the active row takes a 9 % neutral fill and its monogram
  fills solid, while a resting row lifts to 5.1 % under the pointer. Drag a row to
  reorder inside its machine; the accent line shows where it lands. Right-click opens
  Herdr's `menu` with the `space` context. Worktrees sort under their checkout and hang
  from a 1 px tree line; the last child turns into its row instead of continuing. The +
  button creates a space; the quiet "New space" row does the same.
- **Sidebar.** Spaces and agents share one scroll: the Agents header follows the spaces
  content instead of a fixed half. Each section keeps its own folds and hover states.
- **Agents.** Click focuses that agent's pane. Hover reveals the pin (pins survive on
  the terminal label). The chevron folds sub-agents. The header icon opens the sort
  popup (Priority / Grouped by space). Group headers and machine headers fold; Priority's
  section headers stay visible even when only one section has agents.
- **Tabs.** Click selects; the active tab is a 9 % neutral pill with a 600 name and its
  tinted program icon in the space's colour. Drag reorders (`tab.move`) with an accent line on the edge it
  will land on, double-click renames, right-click opens the tab menu, every close
  button closes its own tab. A tab still named by its number is shown by what it runs,
  so "1" becomes the folder or program name; renaming a tab always wins. The `+` opens
  Herdr's `new-menu` popup, and four one-click starts follow it (Claude Code, Pi,
  Lazygit, Neovim): each runs `tab.new` with its `argv`, so Herdr opens a tab in the
  focused folder, and each uses the program table's own icon (`icons/claude.svg` as a
  full-colour image, the rest as tinted glyphs). Claude starts with
  `--dangerously-skip-permissions`, so it never stops for a permission prompt.
- **Pane header.** Click focuses the pane. Only the focused header is mixed with 6 % of
  the space's colour, brightens its title to `foreground`/600 and takes the space colour
  on its icon; inactive headers stay plain `surface` with a `muted`/500 title. The split-right, split-down, zoom/unzoom and close buttons are always
  visible, and the status slot keeps its width when there is one (working spinner,
  `NEEDS YOU`, done dot); an idle agent shows nothing. Each button acts on its own pane
  (`props().pane`), not the focused one. Working shows the same braille character as the
  tabs and agents.
- **Files / Changes.** 两个固定入口位于标签栏最右侧，不随标签滚动。点击切换整个工作区，
  不新建 Tab；选中的入口使用选中态底色，再次点击或选择普通 Tab 就返回终端。
  Diff 覆盖整个文件（`git diff -U1000000`，未改动的行也作为上下文，最多 20,000 行）；
  右侧标题行显示文件路径，`↑`／`↓` 在连续的新增/删除块之间跳转，`Files` 把同一个文件
  交给 Files 视图（`shared("files.open")` 传仓库根和相对路径；终端停在子目录时 Files
  仍按仓库根预览，不改变自己的树根）。Diff 的新增/删除行用 18% 的 ansi 色铺底，
  行号右侧再放一个同色的 `+`／`−` 标记，不靠颜色也能分辨。
  Header 下的来源行在 Working tree 与另一个分支之间切换：分支列表来自
  `git for-each-ref`（本地在前、远端在后，隐藏当前分支和 `origin/HEAD` 这类符号引用），
  对比使用 `git merge-base` 到 HEAD 的两点 diff，只包含已提交的历史，未提交的编辑留在
  Working tree 模式。进入分支对比后，提交框换成一行 “Committed changes only” 注释，
  `Files` 入口隐藏（被比较的文件可能在工作区已不存在）；两边没有共同祖先时退回比较两个
  分支尖端并在注释里说明。切换目录会回到 Working tree；分支消失或无 HEAD 时在列表里
  显示原因，而不是留着上一份文件。
  快捷键、侧栏或新建 Tab 改变当前终端时，也会退出工具视图。
  旧版已存在的单独工具 Tab 从普通列表中隐藏，由固定入口复用，避免丢失编辑和分栏状态。
  Files 预览标题行的 `Edit｜Diff` 分段开关把编辑器切成“变更前／变更后”两栏：左侧旧文件、
  右侧工作区文件，删除/新增各占半边并带底色，未跟踪文件整份算新增；点 `Edit` 回到编辑器。
- Everything else (the palette, dialogs and notifications) is unchanged from `main`.

## Built from

**Layout tree** (`layouts/likeme.json`, `cloned_from {name: "main", version:
"0.1.12"}`):

```
root row (canvas, titlebar none, traffic_lights [12,16], terminal_padding [0,0], no divider)
├─ sidebar column (268px, min 222, max 480, background chrome, resizable false)
│  ├─ brand block (44px, my-brand, window_drag; empty drag surface)
│  ├─ sidebar-list block (weight 1, min 90, mod my-sidebar)
│  │  └─ one scroll: Spaces section (spaces.js) + Agents section (agents.js)
│  └─ sidebar-footer block (76px, my-brand, props {footer: true})
└─ work column (resizable false)
   ├─ tabs block (44px, mod my-tabs, window_drag)
   └─ work-body stack (padding 0, active main)
      ├─ main block {tab: active, pane: {gap 1, radius 0, background surface,
      │             lone true, header {mod my-pane, height 36, reveal always}}}
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
| `my-sidebar` | Retained Spaces and Agents views in one scroll. Uses the shared 44 px row and 26 px mark scale, count chips, a neutral selection, worktree / sub-agent trees and a sort popup. Git and background polling behaviour is unchanged. |
| `my-tabs` | 32 px tabs in a 44 px bar, a grouped quick-start toolbar, fixed Files / Changes entries and a 680 px compact breakpoint. Retains tab rename, drag, close, legacy tool-tab reuse and native braille status animation. |
| `my-pane` | A 36 px header with 6% space tint on focus, shared typography, a fixed 68 px status slot and grouped 24 px split / zoom / close controls with tooltips. Each action targets its own pane. |

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

Art: Herdr's shipped `mods/workspace-chrome/*.svg` (branch, git-compare, plus,
chevron-down/right, pin, pin-off, server, monitor, check, layers, settings),
`icons/claude.svg`, `icons/pi.svg`,
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
- The focused header is `mix(t.surface, fill, 0.06)` with a brighter title and a
  space-coloured icon, drawn by the mod on its own header surface. `colors.js` (the
  shared `MARK`, `markColor`, `changeColor`, `markInk`, `mix`, `withAlpha`, `UI`,
  `TYPE` and `SIZE`) is one file copied into all six mods; `check.sh` fails when
  they drift. The colour
  comes from `shared("space.colors")[space.id]`; `markColor` prefers the theme's own
  `ansiN` colour and falls back to `MARK`, so a light theme gets its own palette.
  `changeColor` does the same for the A / D / U / M change kinds, so the file tree and
  the Changes list never disagree about a state's hue. A
  space with no colour falls back to the theme's `accent` for its icon and a 2.5% foreground tint for
  the header mix. It is a solid fill because Herdr's pane frame exposes only a solid
  `border`/`focus` colour and `pane.background` ignores `gradient` and `image`; a
  layout-node background image with `terminal_opacity` below 1 shows ghosting. Layout
  `focus`/`background` changes apply when the layout loads, not on a live save: run
  `herdr-app do layout.switch '{"name":"likeme"}'` after editing. Mod edits hot reload.
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
  A git look that finds nothing new no longer redraws the list. Changes skips the
  worktree scan entirely in branch-compare mode: HEAD, the ref list and the two
  tree diffs are all it needs there.
- **Async work starts from the callback's own `cx`.** A branch row used to capture the
  render frame's `cx` in its `on_click`; the fields changed, but `refresh`'s
  `cx.spawn` belonged to a frame that was already gone, so the list cleared and stayed
  on Loading with no error. Pass the click event's `cx` into any action that calls
  `refresh` or `spawn`.
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
  context rows on both sides); untracked files are read as all additions. The
  `Edit｜Diff` segmented control in the preview header switches modes.
- **Saving is optimistic and whole-file.** `writeTextFile(path, text, expected)`
  replaces the file only while it still holds `expected` (the text the copy read or last
  wrote), so a file changed elsewhere says "Save failed" instead of being overwritten;
  reopening the file loads the new content. A preview over 400,000 characters is cut for
  display and stays read-only, so the cut text never goes back to disk. There is no
  range API: every save writes the whole file. The editor writes on a 700 ms debounce
  and again on blur, submit, a file switch and `close`; `set_value` keeps the change
  listener out of the keystroke path.
- Heights are fixed by `SIZE`: 44 px agent/space rows, 40 px worktree rows, 26 px
  sub-agent rows, 32 px tabs in a 44 px bar, 28 px file rows and 22 px diff rows.
  Update the virtual list row height along with its renderer when changing density.
- The neutral steps are the foreground colour at low alpha (`UI.subtle` 3.1 %,
  `hover` 5.1 %, `active` 9 %, `line` 7.8 %, `field` 6.3 %, `lineSoft` 4.7 %), so they read
  identically on `chrome`, `surface` and `background` and follow a light theme. The
  semantic washes — `tint` 11.8 % (with a 22 % `tintEdge`), `badge` 12.2 %, `diff` 18 %
  and `tile` 18 % — are declared once as well, so a status tile, a `NEEDS YOU` pill and
  an added or removed line all take their tint from the same table. A space colour only
  ever appears as a solid monogram, a tinted icon tile, a coloured glyph, a resting tint
  or a dot — never as a full row fill and never as a rail or underline. The tab status
  slot is always 16 px, so a state turn never changes a tab's width.
- The spinner is `frames([...], 80)`, not `spin()`: a native SVG rotation runs at
  about 30 fps and reads as steppy at 12–16 px. `frames` swaps text natively on one
  shared clock.
- Mod names (`my-sidebar`, `my-tabs`, `my-pane`, `my-files`, `my-changes`, `my-brand`)
  are deliberately generic. Rename them on install if they clash, and update the
  `"mod"` fields in `likeme.json`.
- Files／Changes 是 `work-body` stack 的子节点，选择由 Herdr 保存，不需要额外的
  `localStorage`。隐藏视图仍保留实例。`my-tabs` 不创建工具 Tab；只为兼容升级，
  按唯一 Mod pane 识别旧工具 Tab，将其从普通列表隐藏，并复用原实例。
- Space colours are shared through `"space.colors"`; every layout sees the stored
  names. `markColor` resolves a name against the current theme's ANSI palette first,
  so this layout follows the terminal theme while the shipped spaces keep their own
  table.
- Only this layout is customized. `terminals` and `win98` keep Herdr's look.
- On macOS the empty brand block leaves room for the traffic lights; the tab bar does
  not need to, because the sidebar is always expanded.
- The pane and header surface is the theme's `surface`, and the focused header's tint
  mixes against it, so the layout follows both light and dark themes; a 2.5% foreground tint is
  the fallback for a focused space with no colour.
- `line_height` takes a bare number as a multiplier (`1.45`), not pixels. The two-line
  rows use `"15px"` / `"14px"`; `line_height(16)` would make each line 16× tall.
- A hand-named tab always keeps its name (`TabInfo.named`); only unnamed tabs are
  labelled by the folder or program. The `+` lives inside the scrolling strip, so it
  scrolls with the tabs.

## Done when

- `./check.sh` passes: all six mods load and all six `colors.js` copies match.
- `node --test tests/workspace-panels.test.mjs` passes, including compact toolbar
  behaviour, mark contrast, workspace switching, legacy tabs, diff parsing, branch
  parsing and saving.
- The running Likeme layout reports no errors in `herdr-app status`.
- Brand and tab bar align at 44 px. Pane / Files / Changes headers align at 36 px.
- Spaces and Agents use 44 px rows, 26 px marks, 3 px gaps and 8 px insets.
  Worktree and sub-agent rows use 40 px and 26 px respectively.
- Hover, selection, count chips, muted metadata and tooltips remain readable in
  dark and light themes. Solid monograms choose contrasting dark or white text.
- Files and Changes stay fixed at the right of the tab bar, collapse to icons
  below 680 px of bar width and keep working without creating or closing tabs.
- Working, blocked, done and idle marks remain visible in the relevant lists;
  fixed status / pin slots prevent text from shifting.
- Pane buttons split, zoom and close their own pane; closing has red hover feedback.
- File lists use 28 px rows; diff and comparison renderers and virtual lists both
  use 22 px. Additions / deletions show colour and a sign, with readable line numbers.
- Edits still auto-save optimistically; conflicts fail without replacing external
  changes, and truncated previews remain read-only.
- Switching views preserves the file tree and split widths. Changes can open the
  same file in Files, including a file outside the current terminal directory.
- Changes switches between Working tree and a branch comparison from its source row.
  The list and whole-file diff are the merge-base→HEAD committed differences, the
  picker lists local and remote branches with the current one hidden, and a missing
  branch, unborn HEAD or unrelated history reports a reason instead of stale rows.
- Empty states are consistent; a clean worktree shows All caught up, an unchanged
  branch comparison shows No differences.
- Removing `layouts/likeme.json` and the six installed `mods/my-*` folders leaves
  the shipped layouts available.
