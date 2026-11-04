# Likeme

A Herdr layout built on `main`: each space and agent row is an icon on the left with
two lines of text beside it, tabs always keep a border and a close button, and the
working spinner is a gold braille text spinner instead of a rotating ring.

![Likeme](preview.png)

_Workspace text in the screenshot is blurred; the layout shapes, the two-line rows,
the tab borders/close buttons and the spinner are the real UI._

## What you see

The window is Herdr's `main` layout with four mods replaced. No system title bar
(`"titlebar": "none"`); on macOS the traffic lights sit at `[12, 16]`. Background is
the theme's `canvas`, with 1 px `border` dividers.

**Sidebar (268 px, min 44, max 480, not resizable).** A 46 px brand block
(`workspace-chrome`), then one `sidebar-list` block (`my-sidebar`, `weight: 1`,
`min: 90`), then a 69 px footer (`workspace-chrome` with `props.footer`). The block is
one scrolling column: Spaces header → space rows → "New space" hint → Agents header →
agent rows. The Agents header follows the spaces content (10 px top padding, no top
border), so the two sections no longer split the sidebar in half.

**Spaces.** A 31 px header ("Spaces", 11 px medium, `muted`, + button 26 px). Rows are
44 px (42 px for worktree children), 8 px radius, `selected` background plus a 2 px
`accent` bar when active, `hover` otherwise. Each row:

- left: a 20 px rounded tile filled with the space's first letter in a dark ink
  (`#101114`) — the tile colors are mid-tone, so the dark letter reads on all six;
  worktree rows instead draw a 1 px tree line in `input` under the checkout's avatar,
  with a 6 px right-turning stub on the last child, then the 13 px `branch.svg` in
  `muted`;
- right, a `v_flex` with two lines: the space name at 13 px (`line-height` 16 px) in
  `foreground`, and below it the current git branch at 11 px (`line-height` 14 px) in
  `muted`. `detached` when the branch is unknown; `↑n` in `ansi2` / `↓n` in `ansi1`
  for ahead/behind. Spaces that are not a git repo show only the name.
- with fewer than three spaces, a dashed 34 px "New space" row ends the list.

A machine header (26 px) appears once more than one machine is known. Below 160 px of
sidebar width the sidebar switches to its compact rail; both sections render their
one-line rail inside the same scroll.

**Agents.** A 41 px header ("Agents", 11 px medium `muted`, up/down sort icon). It
follows the spaces content instead of a fixed half; group headers are 28 px and are
hidden entirely when there is only one group. Agent rows are 44 px:

- 16 px program icon (agent's own report, else the program), clickable to fold
  sub-agents;
- right, the space (project) name at 13 px (`line-height` 16 px), and the agent's own
  title at 11 px (`line-height` 14 px) in `muted`; an automatic tab number is
  suppressed, so a row says nothing rather than "1";
- end of row: sub-agent fold chevron, a fixed 32 px slot for the pin (hover) or the
  elapsed time (11 px, `muted`), and the status glyph. The fixed slot means hovering
  never reflows the row. Sub-agent rows are 26 px with tree lines;
- a focused agent gets a 2 px `accent` bar, not a filled row: the space above already
  owns the filled selection.

**Tabs.** 29 px pills, 8 px radius, `px 12`, `gap 8`. Every tab keeps a 1 px `border`
and a 16 px close button; the close fades to 0.4 on inactive tabs and returns on hover.
The active tab uses `raised` background, a lighter border and a 1 px top highlight; the
others use `chrome`. Program icon 16 px, name up to 170 px truncated; a zoomed tab shows
a small `zoom.svg` instead of a trailing `Z`. A tab still named by its number shows what
it runs: the folder name, or the program name when two tabs share a folder (then the
number is appended if the programs also collide). The `+` sits right after the last tab,
inside the scrolling strip.

**Panes.** Cards: 10 px gap and padding, 12 px radius, 1 px `border`, `accent` border
while focused, and a slightly lifted `#1a1d22` surface (the terminal itself keeps its
own background). 30 px header from the cloned `my-pane` mod (`reveal: always`), painted
on the same `#1a1d22` surface, with a 1 px bottom hairline. The title is 12.5 px
`medium`, the folder 11.5 px `muted`, and the working state is the same gold braille
character as the tabs and agents. The Files/Changes panel (368 px, hidden by default)
is Herdr's `files`/`changes` stack. A 28 px `my-status` bar sits at the bottom.

**Status bar.** 11.5 px `muted`: the machine (server/monitor icon), the space's branch,
and the agent count with a 6 px dot colored by the most urgent agent. The count is
singular when it is one ("1 agent"); a blocked count adds "· N needs you" in `blocked`.
The palette chord on the right is a small keycap (`raised`, 1 px `border`, 18 px high)
followed by "commands".

## How it behaves

- **Agent status.** Working: a gold braille character cycling through
  `⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏` every 80 ms. Blocked: a
  "Needs you" pill (a bare `!` inside a group whose header already says it). Idle: a
  small ring. Done: a filled dot. A space's and a tab's status is their most urgent
  agent's.
- **Spaces.** Click selects. Drag a row to reorder inside its machine; the accent line
  shows where it lands. Right-click opens Herdr's `menu` with the `space` context.
  Worktrees sort under their checkout and hang from a 1 px tree line; the last child
  turns into its row instead of continuing. The + button creates a space.
- **Sidebar.** Spaces and agents share one scroll: the Agents header follows the spaces
  content instead of a fixed half. Each section keeps its own folds and hover states.
- **Agents.** Click focuses that agent's pane. Hover reveals the pin (pins survive on
  the terminal label). The chevron folds sub-agents. The header icon opens the sort
  popup (Priority / Grouped by space). Group headers and machine headers fold.
- **Tabs.** Click selects, drag reorders (`tab.move`), double-click renames, right-click
  opens the tab menu, the wheel switches tabs, every close button closes its own tab.
  A tab still named by its number is shown by what it runs, so "1" becomes the folder
  or program name; renaming a tab always wins. The `+` opens Herdr's `new-menu` popup.
- **Pane header.** Click focuses the pane. Hover reveals split-right, split-down,
  zoom/unzoom and close; each acts on its own pane (`props().pane`), not the focused
  one. Working shows the same braille character as the tabs and agents.
- **Status bar.** The dot is the most urgent agent state (blocked > done > working >
  idle > dim), the count is singular or plural, and the keycap chord opens the
  palette (`app.palette`).
- Everything else (Files/Changes, palette, dialogs and notifications) is unchanged
  from `main`.

## Built from

**Layout tree** (`layouts/likeme.json`, `cloned_from {name: "main", version:
"0.1.12"}`):

```
root row (canvas, titlebar none, traffic_lights [12,16], terminal_padding [12,10], 1px divider)
├─ sidebar column (268px, min 44, max 480, background chrome, resizable false)
│  ├─ brand block (46px, workspace-chrome, window_drag)
│  ├─ sidebar-list block (weight 1, min 90, mod my-sidebar)
│  │  └─ one scroll: Spaces section (spaces.js) + Agents section (agents.js)
│  └─ sidebar-footer block (69px, workspace-chrome, props {footer: true})
└─ work column (resizable false)
   ├─ tabs block (42px, mod my-tabs, window_drag)
   ├─ work-body row (padding 10, gap 10)
   │  ├─ main block {tab: active, pane: {gap 10, radius 12, background #1a1d22, border 1/border,
   │  │              focus 1/accent, lone true, header {mod my-pane, height 30, reveal always}}}
   │  └─ panel column (368px, min 280, max 900, hidden) → panel-body stack
   │     {active files} → files block, changes block
   └─ status block (28px, my-status)
```

**Mods.**

| Mod | Role |
|---|---|
| `my-sidebar` | One mod, two retained child views (`spaces.js` and `agents.js`) composed in a single scrolling column (`main.js`). It keeps the spaces logic (git lookup via `exec`, `hc machine ls`, `watchFolder`, drag-reorder) and the agents logic (live agent data, pins, groups, sub-agent trees) unchanged. Changed: the two sections share one scroll (no 50/50 split), the Agents header follows the spaces content without a top border, the worktree rows draw a real 1 px tree line, and both retain the row/type/active-state changes from the earlier passes. The sort popup mounts a second copy of this mod (`props.sortMenu`) and returns only the agents view. |
| `my-tabs` | The tab bar. Clone of the shipped `tabs`. Changed: 8 px radius, `px 12`/`gap 8`, 16 px icons, distinct labels for default-numbered tabs, `+` after the last tab, close button fades to 0.4 when inactive, active border/top highlight, zoom glyph, spinner `frames([...], 80)`. |
| `my-pane` | The pane header. Clone of the shipped `pane`. Changed: header surface `#1a1d22`, 12.5 px title / 11.5 px `muted` folder, braille working spinner instead of the rotating SVG, `muted` hover buttons; keeps the 1 px bottom hairline and the split/zoom/close buttons. |
| `my-status` | The status bar. Clone of the shipped `workspace-status`. Changed: 11.5 px text, singular/plural agent count, 6 px dot colored by the most urgent agent, palette chord in an 18 px keycap. |

Herdr functions used: `spaces`, `agents`, `terminals`, `panes`, `focused`, `layout`,
`theme`, `window`, `settings`, `keys`, `home`, `shared` / `setShared`, `setAgentOrder`,
`run`, `openOverlay` / `closeOverlay`, `props`, `exec`, `hc`, `watchFolder`,
`localStorage`.

Commands used: `space.select`, `space.move`, `space.new`, `tab.select`, `tab.move`,
`tab.close`, `tab.rename`, `tab.next`, `tab.prev`, `pane.focus`, `pane.split`,
`pane.zoom`, `pane.close`, `layout.resize`, `layout.select`, `layout.show`,
`layout.hide`, `terminal.pin`, `terminal.peek`, `window.minimize`, `window.maximize`,
`window.close`, `app.palette`.

Programs run: `git` (via `exec`), `hc machine ls` (via `hc`).

Art: Herdr's shipped `mods/workspace-chrome/*.svg` (branch, plus, chevron-down/right,
pin, pin-off, server, monitor, check, layers), `mods/pane/close.svg` and `zoom.svg`
(used by `my-tabs`), `mods/files/file.svg`, `mods/changes/changes.svg`; `my-sidebar`
carries its own `sort.svg`; `my-pane` carries its own `close/split/zoom` SVGs;
`my-tabs` carries its own `win-min/max/restore/close.svg` copies for Windows.

## Watch out

- **Clones never update.** Herdr replaces its shipped
  `spaces`/`agents`/`tabs`/`pane`/`workspace-status` on every start; these five sources
  are frozen at 0.1.12. After a Herdr upgrade, diff each shipped `main.js` against its
  copy and port whatever changed (`spaces`→`my-sidebar/spaces.js`,
  `agents`→`my-sidebar/agents.js`, `tabs`→`my-tabs`, `pane`→`my-pane`,
  `workspace-status`→`my-status`).
- `my-sidebar` is a composition, not a clone: `main.js` mounts two retained child
  views with `cx.new(..., { embedded: true })`. The child reads `embedded` from its
  `init(props)` argument, **not** from the global `props()` (which is the host mod's
  props). Without that flag each child paints `size_full` and the 50/50 split returns.
  The sort popup mounts a second copy of `my-sidebar` with `props.sortMenu` and renders
  only the agents entity.
- If you upgrade from a version before the merge, delete the old
  `~/.config/herdr-app/mods/my-spaces` and `my-agents` folders by hand; `install.sh`
  never removes mods it did not install this run.
- The mods read shipped assets by path (`mods/workspace-chrome/...`,
  `mods/pane/close.svg` in `my-tabs`). If Herdr renames them, update the paths.
  `my-pane` uses its own `mods/my-pane/*.svg` copies instead.
- Heights are fixed: 44 px agent/space rows, 42 px worktree rows, 26 px sub-agent rows,
  29 px tabs. A larger font will clip rather than grow.
- The spinner is `frames([...], 80)`, not `spin()`: a native SVG rotation runs at
  about 30 fps and reads as steppy at 12–16 px. `frames` swaps text natively on one
  shared clock.
- Below 160 px of sidebar width the sidebar becomes a compact rail; both sections
  render one line (index + status) inside the same scroll.
- Mod names (`my-sidebar`, `my-tabs`, `my-pane`, `my-status`) are deliberately
  generic. Rename them on install if they clash, and update the `"mod"` fields in
  `likeme.json`.
- The Files/Changes choice is remembered per space by `my-tabs` in `localStorage`
  (`panels`), not in the layout.
- Space avatar colors are shared through `"space.colors"`; every layout sees them.
- Only this layout is customized. `terminals` and `win98` keep Herdr's look.
- On macOS the tab bar reserves room for the traffic lights using the layout's
  `sidebar` size, `traffic_lights` and the current zoom.
- The pane surface `#1a1d22` and the active/inactive tab border hexes are dark-theme
  choices. On a light theme, switch them back to tokens (`background`, `border`) or
  add a per-appearance theme.
- `line_height` takes a bare number as a multiplier (`1.45`), not pixels. The two-line
  rows use `"16px"` / `"14px"`; `line_height(16)` would make each line 16× tall.
- A hand-named tab keeps its name; only numeric/id-like default names are replaced by
  the folder or program. The `+` lives inside the scrolling strip, so it scrolls with
  the tabs.

## Done when

- `herdr-app check mods/my-sidebar`, `.../my-tabs`, `.../my-pane`, `.../my-status` all
  pass.
- `herdr-app do layout.switch '{"name":"likeme"}'` shows the layout and `herdr-app
  status` reports no errors.
- Each space row shows a 20 px tinted monogram, a 13 px name and an 11 px muted branch.
- The active space row has a 2 px accent bar; a list shorter than three spaces ends
  with a dashed "New space" row.
- Each agent row shows two lines; the focused row has a 2 px accent bar; a single group
  has no header.
- A default-numbered tab shows its folder or program, and `+` sits after the last tab.
- Every tab, active or not, draws a border and an X close button (dimmed when inactive).
- A working agent shows the braille spinner in its agent row, its tab, and the pane
  header.
- The pane header uses the `#1a1d22` surface and a 12.5 px title / 11.5 px muted
  folder; its hover buttons still split, zoom and close the pane they belong to.
- The status bar says "1 agent", colors its dot by the most urgent agent, and shows
  the palette chord in a keycap.
- Spaces and agents live in one scroll: the Agents header follows the spaces content
  with no 50/50 boundary, and scrolling moves both sections together.
- A worktree space appears under its checkout with a 1 px tree line; the last child
  turns into its row instead of continuing down.
- Deleting `layouts/likeme.json` and the four `mods/my-*` folders returns the app to
  the shipped layouts.
