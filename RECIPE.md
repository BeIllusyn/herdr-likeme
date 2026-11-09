# Likeme

A Herdr layout built on `main`: each space and agent row is an icon on the left with
two lines of text beside it, resting items lie flat under a whisper of their space's
colour and the selected one is a flat, opaque square tint (the active tab too), and the
working spinner is a gold braille text spinner instead of a rotating ring.

![Likeme](preview.png)

_Workspace text in the screenshot is blurred; the layout shapes, the two-line rows,
the flat square selection, the tab close buttons and the spinner are the real UI._

## What you see

The window is Herdr's `main` layout with six mods replaced. No system title bar
(`"titlebar": "none"`); on macOS the traffic lights sit at `[12, 16]`. Background is
the theme's `canvas`, and regions meet with no dividers or separator borders: their
backgrounds do the separating.

**Sidebar (268 px, min 222, max 480, not resizable).** A 46 px brand block
(`workspace-chrome`), then one `sidebar-list` block (`my-sidebar`, `weight: 1`,
`min: 90`), then a 69 px footer (`my-brand` with `props.footer`, no top border). The block is
one scrolling column: Spaces header → space rows → "New space" hint → Agents header →
agent rows. The Agents header follows the spaces content (10 px top padding, no top
border), so the two sections no longer split the sidebar in half.

**Spaces.** A 31 px header ("Spaces", 14 px medium, `muted`, + button 26 px). Rows are
44 px (42 px for worktree children), square and full-bleed, sitting flush against each
other with no gap. A resting row lies flat under a whisper of its space's colour (5 %);
the active space is a flat opaque tint mixed from `raised` and its colour (32 %), with
no border or shadow, so the selection reads without a left accent bar. Hover on a
resting row is the neutral `hover`, never a stronger colour. Each row:

- left: a 20 px rounded tile filled with the space's first letter in a dark ink
  (`#101114`) — the tile colors are mid-tone, so the dark letter reads on all six;
  worktree rows instead draw a 1 px tree line in `input` under the checkout's avatar,
  with a 6 px right-turning stub on the last child, then the 13 px `branch.svg` in
  `muted`;
- right, a `v_flex` with two lines: the space name at 13 px (`line-height` 16 px) in
  `foreground`, and below it the current git branch at 11 px (`line-height` 14 px) in
  `muted`. `detached` when the branch is unknown; `↑n` in `ansi2` / `↓n` in `ansi1`
  for ahead/behind. Spaces that are not a git repo show only the name.
- with fewer than three spaces, a muted 34 px "New space" row ends the list.

A machine header (26 px) appears once more than one machine is known. The sidebar stays
at its expanded width: there is no compact rail.

**Agents.** A 41 px header ("Agents", 14 px medium `muted`, up/down sort icon). It
follows the spaces content instead of a fixed half; group headers are 28 px. In the
Priority view the section headers (Needs you / Done / Working / Idle) always show, so
an all-idle list still says "Idle"; in the grouped view a lone space group hides its
redundant header. Agent rows are 44 px, square and full-bleed, flush against each
other with no gap:

- 16 px program icon (agent's own report, else the program), clickable to fold
  sub-agents;
- right, the space (project) name at 13 px (`line-height` 16 px), and the agent's own
  title at 11 px (`line-height` 14 px) in `muted`; an automatic tab number is
  suppressed, so a row says nothing rather than "1";
- end of row: sub-agent fold chevron, a fixed 32 px slot for the pin (hover) or the
  elapsed time (11 px, `muted`), and the status glyph. The fixed slot means hovering
  never reflows the row. Sub-agent rows are 26 px with tree lines;
- every agent row carries a 5 % wash of its space's colour (the same colour its space
  row uses), so a row keeps its space's identity even in Priority view; the focused
  agent is the same flat opaque tint as the active space, with no border or shadow.
  No left accent bar.

**Tabs.** Square blocks that fill the bar's height and sit flush against each other
with no gap (`px 12`, `gap 8`). Every tab keeps a 16 px close button; the close fades
to 0.4 on inactive tabs and returns on hover. The active tab is the same flat opaque
tint as a selected sidebar row: an opaque square mixed from `raised` and the space's
colour (30 %), with no border or shadow. The others lie flat under a 5 % tint of the
space's colour, with the neutral `hover` on the pointer. Program icon 16 px, name up to 170 px
truncated; a zoomed tab shows a small `zoom.svg` instead of a trailing `Z`. A tab still
named by its number shows what it runs: the folder name, or the program name when two
tabs share a folder (then the number is appended if the programs also collide). The
`+` sits right after the last tab, inside the scrolling strip.

**Panes.** Square, edge-to-edge cards: no padding, terminal padding, frame border or
header rule — the terminal and the header meet their neighbours directly, and the
backgrounds tell the regions apart. Split panes keep a 1 px `gap`, so the layout's
`canvas` shows between them instead of a drawn border; a lone pane still fills its
tab edge to edge. The pane background is the theme's `surface`; the
30 px header from the cloned `my-pane` mod (`reveal: always`) is painted on that same
`surface` with no bottom border. The focused header carries the focus mark: the space's
colour as an opaque 16% blend into `surface` (the theme's `raised` when the space has
no colour), the same
colour language as the active tab and the selected sidebar row, at a lower strength
because a header is much larger than a tab. It is a flat solid fill — no gradient,
animation or border — so a space's header colour changes with the space, and light and
dark themes each get their own surface. Inactive headers stay plain. The title is 12.5 px
`medium`, the folder 11.5 px `muted`, and the working state is the same gold braille
character as the tabs and agents. The Files/Changes panel (368 px, hidden by default)
is Herdr's `files`/`changes` stack painted on `chrome` like the sidebar, with the
Changes diff and the file preview on `background`; neither the panel nor its sections
draw a rule.

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
- Everything else (Files/Changes, palette, dialogs and notifications) is unchanged
  from `main`.

## Built from

**Layout tree** (`layouts/likeme.json`, `cloned_from {name: "main", version:
"0.1.12"}`):

```
root row (canvas, titlebar none, traffic_lights [12,16], terminal_padding [0,0], no divider)
├─ sidebar column (268px, min 222, max 480, background chrome, resizable false)
│  ├─ brand block (46px, my-brand, window_drag)
│  ├─ sidebar-list block (weight 1, min 90, mod my-sidebar)
│  │  └─ one scroll: Spaces section (spaces.js) + Agents section (agents.js)
│  └─ sidebar-footer block (69px, my-brand, props {footer: true})
└─ work column (resizable false)
   ├─ tabs block (42px, mod my-tabs, window_drag)
   ├─ work-body row (padding 0, gap 0)
   │  ├─ main block {tab: active, pane: {gap 1, radius 0, background surface,
   │  │              lone true, header {mod my-pane, height 30, reveal always}}}
   │  └─ panel column (368px, min 280, max 900, hidden) → panel-body stack
   │     {active files} → files block, changes block
```

**Mods.**

| Mod | Role |
|---|---|
| `my-sidebar` | One mod, two retained child views (`spaces.js` and `agents.js`) composed in a single scrolling column (`main.js`); `colors.js` holds the shared `MARK` table, `markColor()` and the `mix()` used for the flat tint, and `util.js` the background-tick throttle. It keeps the spaces logic (git lookup via `exec`, `hc machine ls`, `watchFolder`, drag-reorder) and the agents logic (live agent data, pins, groups, sub-agent trees) unchanged. Changed: the two sections share one scroll (no 50/50 split), the Agents header follows the spaces content without a top border, the worktree rows draw a real 1 px tree line, rows are square and full-bleed with a flat opaque selection, and both retain the row/type/active-state changes from the earlier passes. The sort popup mounts a second copy of this mod (`props.sortMenu`) and returns only the agents view. |
| `my-tabs` | The tab bar. Clone of the shipped `tabs`. Changed: full-height square tabs, `px 12`/`gap 8`, 16 px icons, distinct labels for default-numbered tabs, `+` after the last tab, four quick-start icons after the `+` (Claude Code, Pi, Lazygit, Neovim via `tab.new`), close button fades to 0.4 when inactive, a flat opaque active tab in the space's colour, a drag-to-reorder line, zoom glyph, spinner `frames([...], 80)`. |
| `my-pane` | The pane header. Clone of the shipped `pane`. Changed: header surface is the theme's `surface`, 12.5 px title / 11.5 px `muted` folder, a flat space-colour tint on the focused header (16% blend into `surface`, no animation), braille working spinner instead of the rotating SVG, always-visible `muted` buttons, and it keeps the split/zoom/close buttons. |

Herdr functions used: `spaces`, `agents`, `terminals`, `panes`, `focused`, `layout`,
`theme`, `window`, `settings`, `keys`, `home`, `shared` / `setShared`, `setAgentOrder`,
`run`, `openOverlay` / `closeOverlay`, `props`, `exec`, `hc`, `watchFolder`,
`localStorage`.

Commands used: `space.select`, `space.move`, `space.new`, `tab.new`, `tab.select`,
`tab.move`, `tab.close`, `tab.rename`, `pane.focus`, `pane.split`,
`pane.zoom`, `pane.close`, `layout.select`, `layout.show`,
`layout.hide`, `terminal.pin`, `terminal.peek`, `window.minimize`, `window.maximize`,
`window.close`, `app.palette`.

Programs run: `git` (via `exec`), `hc machine ls` (via `hc`). The quick starts ask
Herdr to run `claude --dangerously-skip-permissions`, `pi`, `lazygit` and `nvim`
(`tab.new`'s `argv`); the mod never spawns them itself.

Art: Herdr's shipped `mods/workspace-chrome/*.svg` (branch, plus, chevron-down/right,
pin, pin-off, server, monitor, check, layers, search, settings), `icons/claude.svg`, `icons/pi.svg`,
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
- The focused header's tint is a plain `.bg()` colour:
  `mix(t.surface, markColor(...), 0.16)`. `markColor`/`mix` are copies of the
  sidebar/tab helpers (`MARK`, opaque blends), so keep the three copies in sync. The
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
- Heights are fixed: 44 px agent/space rows, 42 px worktree rows, 26 px sub-agent rows,
  full-height tabs. A larger font will clip rather than grow.
- The selected row and tab are an opaque blend, not an alpha layer, so they look the
  same over chrome, hover and the pane behind them. The tab status slot is always
  18 px, so a state turn never changes a tab's width.
- The spinner is `frames([...], 80)`, not `spin()`: a native SVG rotation runs at
  about 30 fps and reads as steppy at 12–16 px. `frames` swaps text natively on one
  shared clock.
- Mod names (`my-sidebar`, `my-tabs`, `my-pane`, `my-files`, `my-changes`, `my-brand`)
  are deliberately generic. Rename them on install if they clash, and update the
  `"mod"` fields in `likeme.json`.
- The Files/Changes choice is remembered per space by `my-tabs` in `localStorage`
  (`likeme.panels`), not in the layout.
- Space avatar colors are shared through `"space.colors"`; every layout sees them.
- Only this layout is customized. `terminals` and `win98` keep Herdr's look.
- On macOS the brand block reserves room for the traffic lights (`pl(76)`); the tab bar
  does not need to, because the sidebar is always expanded.
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
- The active space is a flat opaque tint clearly apart from the flat rows and their
  neutral hover; rows are square, full-bleed and flush with no gap; a list shorter
  than three spaces ends with a muted "New space" row.
- Each agent row shows two lines on a whisper of its space's colour; the focused agent
  is the same flat opaque tint, and the selection changes within 250 ms of the focus
  moving. Priority keeps its section headers visible even when only one section has
  agents; a lone space group in the grouped view has no header.
- A default-numbered tab shows its folder or program, and `+` sits after the last tab.
- Every tab draws an X close button (dimmed when inactive); the active tab is the flat
  opaque tint, the others lie flat, and no top highlight line is drawn.
- A working agent shows the braille spinner in its agent row, its tab, and the pane
  header; an idle agent keeps a faint ring in its agent row, so every row shows where
  its agent stands.
- The pane header uses the theme's `surface` and a 12.5 px title / 11.5 px muted
  folder; only the focused header is tinted with the space's colour, inactive ones stay
  plain; in a light theme the header is light too; its always-visible buttons still
  split, zoom and close the pane they belong to.
- Spaces and agents live in one scroll: the Agents header follows the spaces content
  with no 50/50 boundary, and scrolling moves both sections together.
- A worktree space appears under its checkout with a 1 px tree line; the last child
  turns into its row instead of continuing down.
- Deleting `layouts/likeme.json` and the five `mods/my-*` folders returns the app to
  the shipped layouts.
