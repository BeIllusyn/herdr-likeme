# Likeme

A Herdr layout built on `main`: each space and agent row is an icon on the left with
two lines of text beside it, tabs always keep a border and a close button, and the
working spinner is a gold braille text spinner instead of a rotating ring.

![Likeme](preview.png)

_Workspace text in the screenshot is blurred; the layout shapes, the two-line rows,
the tab borders/close buttons and the spinner are the real UI._

## What you see

The window is Herdr's `main` layout with three mods replaced. No system title bar
(`"titlebar": "none"`); on macOS the traffic lights sit at `[12, 16]`. Background is
the theme's `canvas`, with 1 px `border` dividers.

**Sidebar (268 px, min 44, max 480, not resizable).** A 46 px brand block
(`workspace-chrome`), then a column shared by Spaces and Agents (each `weight: 1`,
`min: 90`), then a 69 px footer (`workspace-chrome` with `props.footer`).

**Spaces.** A 31 px header ("Spaces", 11.5 px dim, + button 26 px). Rows are 44 px
(42 px for worktree children), 8 px radius, `selected` background when active, `hover`
otherwise. Each row:

- left: an 18 px rounded tile filled with the space's first letter (color from shared
  `space.colors`); worktree rows instead indent 22 px and draw a 13 px `branch.svg`;
- right, a `v_flex` with two lines: the space name at 12.5 px in `foreground`, and
  below it the current git branch at 10.5 px in `dim`.
  `detached` when the branch is unknown; `↑n` in `ansi2` / `↓n` in `ansi1` for
  ahead/behind. Spaces that are not a git repo show only the name.

A machine header (26 px) appears once more than one machine is known. Below 160 px of
sidebar width both sidebar mods switch to their compact rail.

**Agents.** A 41 px header ("Agents", sort icon). Group headers are 30 px. Agent rows
are 44 px:

- 16 px program icon (agent's own report, else the program), clickable to fold
  sub-agents;
- right, the space (project) name at 12.5 px, and the agent's own title at 10.5 px in
  `dim`; an automatic tab number is suppressed, so a row says nothing rather than "1";
- end of row: sub-agent fold chevron, pin button on hover, elapsed time (11 px, when
  not hovered) and the status glyph. Sub-agent rows are 26 px with tree lines.

**Tabs.** 29 px pills, 7 px radius, `px 10`, `gap 7`. Every tab keeps a 1 px `border`
and a 16 px close button, active or not; the active tab uses `raised` background, the
others `chrome`. Program icon 14 px, name up to 170 px truncated (`name Z` when
zoomed), working spinner (a gold braille character), blocked/done dot 6 px.

**Panes.** Cards: 8 px gap, 10 px radius, 1 px `border`, `accent` border while focused,
30 px header from the shipped `pane` mod (`reveal: always`). The Files/Changes panel
(368 px, hidden by default) is Herdr's `files`/`changes` stack. A 28 px
`workspace-status` bar sits at the bottom.

## How it behaves

- **Agent status.** Working: a gold braille character cycling through
  `⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏` every 80 ms. Blocked: a
  "Needs you" pill (a bare `!` inside a group whose header already says it). Idle: a
  small ring. Done: a filled dot. A space's and a tab's status is their most urgent
  agent's.
- **Spaces.** Click selects. Drag a row to reorder inside its machine; the accent line
  shows where it lands. Right-click opens Herdr's `menu` with the `space` context.
  Worktrees sort under their checkout. The + button creates a space.
- **Agents.** Click focuses that agent's pane. Hover reveals the pin (pins survive on
  the terminal label). The chevron folds sub-agents. The header icon opens the sort
  popup (Priority / Grouped by space). Group headers and machine headers fold.
- **Tabs.** Click selects, drag reorders (`tab.move`), double-click renames, right-click
  opens the tab menu, the wheel switches tabs, every close button closes its own tab.
  The `+` opens Herdr's `new-menu` popup.
- Everything else (pane split/zoom headers, Files/Changes, palette, dialogs and
  notifications) is unchanged from `main`.

## Built from

**Layout tree** (`layouts/likeme.json`, `cloned_from {name: "main", version:
"0.1.12"}`):

```
root row (canvas, titlebar none, traffic_lights [12,16], terminal_padding [14,12], 1px divider)
├─ sidebar column (268px, min 44, max 480, background chrome, resizable false)
│  ├─ brand block (46px, workspace-chrome, window_drag)
│  ├─ sidebar-lists column
│  │  ├─ spaces block (weight 1, min 90, mod my-spaces)
│  │  └─ agents block (weight 1, min 90, mod my-agents)
│  └─ sidebar-footer block (69px, workspace-chrome, props {footer: true})
└─ work column (resizable false)
   ├─ tabs block (42px, mod my-tabs, window_drag)
   ├─ work-body row (padding 8, gap 8)
   │  ├─ main block {tab: active, pane: {gap 8, radius 10, background, border 1/border,
   │  │              focus 1/accent, lone true, header {mod pane, height 30, reveal always}}}
   │  └─ panel column (368px, min 280, max 900, hidden) → panel-body stack
   │     {active files} → files block, changes block
   └─ status block (28px, workspace-status)
```

**Mods.**

| Mod | Role |
|---|---|
| `my-spaces` | The spaces list. Clone of the shipped `spaces`: git lookup (`exec` git status/rev-parse), machine list (`hc machine ls`), `watchFolder` on local repos, drag-reorder. Changed: row height 44/42, two-line row (name over branch). |
| `my-agents` | The agents list. Clone of the shipped `agents`. Changed: row height 44, two-line row (space name over agent title), pin/duration/fold kept on the row end, spinner `frames([...], 80)`. |
| `my-tabs` | The tab bar. Clone of the shipped `tabs`. Changed: `border_color` always `border`, close button always rendered (16 px, hover highlight), spinner `frames([...], 80)`. |

Herdr functions used: `spaces`, `agents`, `terminals`, `panes`, `focused`, `layout`,
`theme`, `window`, `settings`, `shared` / `setShared`, `setAgentOrder`, `run`,
`openOverlay` / `closeOverlay`, `props`, `exec`, `hc`, `watchFolder`, `localStorage`.

Commands used: `space.select`, `space.move`, `space.new`, `tab.select`, `tab.move`,
`tab.close`, `tab.rename`, `tab.next`, `tab.prev`, `pane.focus`, `pane.split`,
`layout.resize`, `layout.select`, `layout.show`, `layout.hide`, `terminal.pin`,
`terminal.peek`, `window.minimize`, `window.maximize`, `window.close`.

Programs run: `git` (via `exec`), `hc machine ls` (via `hc`).

Art: Herdr's shipped `mods/workspace-chrome/*.svg` (branch, plus, chevron-down/right,
spinner, pin, pin-off, server, monitor, check, clock, layers), `mods/pane/close.svg`,
`mods/files/file.svg`, `mods/changes/changes.svg`; `my-tabs` carries its own
`win-min/max/restore/close.svg` copies for Windows.

## Watch out

- **Clones never update.** Herdr replaces its shipped `spaces`/`agents`/`tabs` on every
  start; these three are frozen at 0.1.12. After a Herdr upgrade, diff
  `~/.config/herdr-app/mods/spaces/main.js` against `mods/my-spaces/main.js` (and the
  other two) and port whatever changed.
- The mods read shipped assets by path (`mods/workspace-chrome/...`,
  `mods/pane/close.svg`). If Herdr renames them, update the paths.
- Heights are fixed: 44 px agent/space rows, 42 px worktree rows, 26 px sub-agent rows,
  29 px tabs. A larger font will clip rather than grow.
- The spinner is `frames([...], 80)`, not `spin()`: a native SVG rotation runs at
  about 30 fps and reads as steppy at 12–16 px. `frames` swaps text natively on one
  shared clock.
- Below 160 px of sidebar width the lists become compact rails; that path was not
  restyled and still shows one line (index + status).
- Mod names (`my-spaces`, `my-agents`, `my-tabs`) are deliberately generic. Rename them
  on install if they clash, and update the `"mod"` fields in `likeme.json`.
- The Files/Changes choice is remembered per space by `my-tabs` in `localStorage`
  (`panels`), not in the layout.
- Space avatar colors are shared through `"space.colors"`; every layout sees them.
- Only this layout is customized. `terminals` and `win98` keep Herdr's look.
- On macOS the tab bar reserves room for the traffic lights using the layout's
  `sidebar` size, `traffic_lights` and the current zoom.

## Done when

- `herdr-app check mods/my-spaces`, `.../my-agents`, `.../my-tabs` all pass.
- `herdr-app do layout.switch '{"name":"likeme"}'` shows the layout and `herdr-app
  status` reports no errors.
- Each space row shows two lines: project name over the current branch.
- Each agent row shows two lines: space name over the agent's title.
- Every tab, active or not, draws a border and an X close button.
- A working agent shows the braille spinner in its agent row and in its tab.
- Deleting `layouts/likeme.json` and the three `mods/my-*` folders returns the app to
  the shipped layouts.
