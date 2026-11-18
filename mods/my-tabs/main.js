import { View, div, svg, image } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { spaces, panes, props, run, openOverlay, closeOverlay, theme, window, shared, setShared, layout, settings, exec, knownAgents } from "herdr";
import { markColor, selectedInk, withAlpha, UI, TYPE, SIZE } from "./colors.js";

// Agents that keep the first slots, and the one start that wants its own
// arguments rather than the program table's `run`.
const TOOL_TABS = {
  "my-files": { name: "Files", icon: "mods/my-files/file.svg", tint: true },
  "my-changes": { name: "Changes", icon: "mods/my-changes/changes.svg", tint: true },
};
const LEADING = ["claude", "pi"];
const ARGV = { claude: ["claude", "--dangerously-skip-permissions"] };

// Tools Herdr does not list with a `run`, so `knownAgents` cannot answer for
// them: the bar checks their command on PATH instead.
const TOOLS = [
  { key: "lazygit", label: "Lazygit", icon: "icons/lazygit.svg", tint: true, command: "lazygit", argv: ["lazygit"] },
  { key: "nvim", label: "Neovim", icon: "icons/nvim.svg", tint: true, command: "nvim", argv: ["nvim"] },
];

// Until `knownAgents` answers (or when it cannot), the PATH check still keeps
// the original four starts honest.
const FALLBACK = [
  { key: "claude", label: "Claude Code", icon: "icons/claude.svg", tint: false, command: "claude", argv: ARGV.claude },
  { key: "pi", label: "Pi", icon: "icons/pi.svg", tint: true, command: "pi", argv: ["pi"] },
  ...TOOLS,
];

// What the bar shows now, so a check only redraws when it changed.
function signature(agents, hidden) {
  return JSON.stringify([
    agents ? [...agents.values()].map(a => [a.key, a.name, a.icon, a.tint, a.run]) : null,
    [...hidden].sort(),
  ]);
}

// Which of `commands` this machine can start. `command -v` also sees shell
// functions, and Herdr's `exec` carries the user's login PATH, so a Homebrew or
// npm install is found. Windows has no `sh`: ask `where`, one command at a time.
// Throws when the check itself cannot run; the caller keeps its last answer.
async function installed(commands) {
  const found = new Set();
  if (window()?.platform === "windows") {
    for (const command of commands) {
      if ((await exec("where", [command])).code === 0) found.add(command);
    }
    return found;
  }
  const script = `for c in ${commands.join(" ")}; do command -v "$c" >/dev/null 2>&1 && echo "$c"; done`;
  const r = await exec("sh", ["-c", script]);
  for (const line of r.stdout.split("\n")) {
    const name = line.trim();
    if (commands.includes(name)) found.add(name);
  }
  return found;
}

// The bar reads the sidebar node out of `layout()` (the whole layout document);
// the traffic lights and window facts come from the root and `window()`.
function findMany(root, ids) {
  const wanted = new Set(ids), found = {};
  const stack = [root];
  while (stack.length) {
    const node = stack.pop();
    if (!node) continue;
    if (wanted.has(node.id)) found[node.id] = node;
    for (const child of node.children ?? []) stack.push(child);
  }
  return found;
}

function folderPanes(tab) {
  return panes().filter(p => p.tab === tab && p.pane && p.terminal && p.cwd);
}

function openTabMenu(target) {
  openOverlay({ mod: "menu", kind: "popup", width: 200, props: { tab: "tab", target } });
}

export default class Tabs extends View {
  init(_props, cx) {
    if (props()?.folderMenu) return;
    this.pressed = null;
    this.over = null;
    // The agents this machine has (`knownAgents`, null until it answers) and
    // the tool commands PATH is missing. Both start empty, so the bar never
    // drops a button the first check has not covered yet.
    this.agents = null;
    this.hidden = new Set();
    this.checking = false;
    this.ready = this.check(cx);
    // Installing one while Herdr runs brings it in without a restart.
    cx.timer.every(60000, cx => this.check(cx));
  }

  async check(cx) {
    if (this.checking) return;
    this.checking = true;
    try {
      const before = signature(this.agents, this.hidden);
      try {
        // Herdr's own answer, for every agent its program table can start:
        // the same list (and the same login-shell check) its menus use.
        if (typeof knownAgents === "function") {
          const list = await knownAgents();
          this.agents = new Map(list.filter(a => a.installed).map(a => [a.key, a]));
        }
      } catch {
        // Keep the last answer; while there is none, the PATH fallback below
        // still decides the original four.
      }
      try {
        const found = await installed(FALLBACK.map(s => s.command));
        this.hidden = new Set(FALLBACK.filter(s => !found.has(s.command)).map(s => s.command));
      } catch {
        // Herdr does not cache a failed check, so the next one asks again.
        // Until it answers, keep showing what the last one (or the bar) offered.
      }
      if (signature(this.agents, this.hidden) !== before) cx.notify();
    } finally {
      this.checking = false;
    }
  }

  openFolderMenu(target) {
    if (!folderPanes(target.id).length) return openTabMenu(target);
    openOverlay({ mod: "my-tabs", kind: "popup", width: 310, height: 248, props: { folderMenu: target } });
  }

  folderMenu(target, overlay, t) {
    const picks = folderPanes(target.id);
    const close = () => closeOverlay(overlay);
    const choose = (pane) => {
      const space = spaces().find(s => s.id === target.space && s.tabs.some(tab => tab.id === target.id));
      const current = folderPanes(target.id).find(p => p.pane === pane);
      if (space && current) {
        const folders = shared("likeme.spaceFolders") ?? {};
        setShared("likeme.spaceFolders", { ...folders, [space.id]: current.cwd });
      }
      close();
    };
    const item = (id, action) => h_flex().id(id).h(29).px(8).gap(8).flex_none().min_w(0).rounded(5).items_center()
      .text_color(t.foreground).cursor_pointer().hover(s => s.bg(t.hover)).on_click(action);
    return v_flex().w_full().p(5).bg(t.popover).text_size(TYPE.small)
      .child(div().px(8).pt(4).pb(6).text_size(TYPE.meta).font_semibold().text_color(t.muted).child("Set space folder from pane"))
      .child(v_flex().min_w(0).when(picks.length > 6, el => el.h(174).overflow_y_scrollbar().mode("hover"))
        .children(picks.map((p, i) => item(`space-folder-${p.pane}`, () => choose(p.pane)).tooltip(p.cwd)
          .when(picks.length > 1, el => el.child(div().flex_none().text_color(t.muted).child(`Pane ${i + 1}`)))
          .child(div().flex_1().min_w(0).truncate().child(p.cwd)))))
      .when(!picks.length, el => el.child(div().px(8).py(4).text_color(t.muted).child("No terminal folder available")))
      .child(div().h(1).my(4).bg(withAlpha(t.foreground, UI.line)))
      .child(item("more-tab-actions", () => { close(); openTabMenu(target); }).child("More tab actions…"));
  }

  openTool(mod) {
    const space = spaces().find(s => s.active);
    if (!space) return;
    const all = panes();
    const tab = space.tabs.find(tab => all.some(p => p.tab === tab.id && p.mod === mod));
    if (tab) {
      if (!tab.active) run("tab.select", { id: tab.id });
      return;
    }
    run("tab.new", {
      space: space.id, mod, name: TOOL_TABS[mod].name,
      props: { cwd: shared("likeme.spaceFolders")?.[space.id] ?? space.folder, on: space.machine ?? null, space: space.id },
    });
  }

  render() {
    const t = theme();
    const args = props();
    if (args?.folderMenu) return this.folderMenu(args.folderMenu, args.overlay, t);
    const space = spaces().find(p => p.active);
    const tabs = space?.tabs ?? [];
    const root = layout(), w = window();
    const sidebar = findMany(root, ["sidebar"]).sidebar;
    const stop = (_e, cx) => cx.stop_propagation();
    const button = (id, label, action) => div().id(id).size(24).rounded(6).flex_none().flex().items_center().justify_center().text_color(t.muted)
      .hover(s => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop).on_click(action).child(label);
    const panesByTab = new Map();
    for (const p of panes()) {
      let mine = panesByTab.get(p.tab);
      if (!mine) panesByTab.set(p.tab, mine = []);
      mine.push(p);
    }
    const entries = tabs.map((c, i) => {
      const mine = panesByTab.get(c.id) ?? [];
      const pane = mine.find(p => p.program?.agent) ?? mine.find(p => p.terminal) ?? mine[0];
      const tool = TOOL_TABS[pane?.mod];
      const program = tool ?? pane?.program;
      const auto = !c.named;
      const dir = pane?.cwd?.replace(/\/+$/, "").split("/").pop();
      return { c, i, program, auto, base: tool?.name ?? (dir && dir !== "~" ? dir : program?.name ?? "Terminal") };
    });
    const programName = (e) => e.program?.name ?? "Terminal";
    // One count per base and program, not a filter of all entries per entry.
    const baseUse = new Map(), programUse = new Map();
    for (const e of entries) {
      baseUse.set(e.base, (baseUse.get(e.base) ?? 0) + 1);
      const p = programName(e);
      programUse.set(p, (programUse.get(p) ?? 0) + 1);
    }
    const labels = new Map(entries.map((e) => {
      if (!e.auto) return [e.c.id, e.c.name];
      if (baseUse.get(e.base) === 1) return [e.c.id, e.base];
      const p = programName(e);
      if (programUse.get(p) === 1) return [e.c.id, p];
      return [e.c.id, `${p} ${e.i + 1}`];
    }));
    // A tab is a quiet pill, not a card: the selected one takes the same raised
    // neutral fill as a selected row, with contrasting ink, a heavier name and
    // its tinted program icon in the space's colour — the same "selection by
    // mark" language as the rows. Using the editor background here left the
    // selected tab nearly invisible on 2026 Light's #FAFAFD chrome.
    const fillRaw = markColor((shared("space.colors") ?? {})[space?.id], t);
    const fill = fillRaw ? fillRaw.slice(0, 7) : null;
    const item = ({ c, i, program }) => {
      const name = labels.get(c.id), active = c.active;
      return h_flex().id(`tab-${c.id}`).relative().h(32).rounded(SIZE.radius).px(10).gap(7).items_center().flex_none().text_size(TYPE.small).cursor_pointer()
        .when(active, el => el
          .bg(t.selected)
          .text_color(selectedInk(t)))
        .when(!active, el => el
          .text_color(t.muted)
          .hover(s => s.bg(t.hover).text_color(t.foreground)))
        .on_mouse_down("left", (e, cx) => { cx.stop_propagation(); this.pressed = i; this.over = i; if (e.click_count === 2) run("tab.rename", { id: c.id }); })
        .on_mouse_move((_e, cx) => {
          if (this.pressed === null || this.over === i) return;
          this.over = i;
          cx.notify();
        })
        .on_mouse_up("left", (_e, cx) => {
          const from = this.pressed, over = this.over;
          this.pressed = null; this.over = null;
          // A press that started on the close button (which stops the mouse-down)
          // is not a tab press: don't select the tab being closed.
          if (from === null) return;
          if (tabs[from] && over === i && from !== i) run("tab.move", { id: tabs[from].id, index: i + 1 });
          else if (from === i) run("tab.select", { id: c.id });
          cx.notify();
        })
        .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); this.openFolderMenu({ id: c.id, space: space.id }); })
        // The drop line sits on the edge the tab would move past.
        .when(this.pressed !== null && this.pressed !== i && this.over === i, el => el.child(
          div().absolute().top(5).bottom(5).w(2).rounded(1).bg(t.accent)
            .when(this.pressed < i, line => line.right(0))
            .when(this.pressed > i, line => line.left(0)),
        ))
        .when(Boolean(program?.icon), el => el.child(program.tint
          ? svg(program.icon).size(15).flex_none().text_color(active ? (fill ?? t.foreground) : t.muted)
          : image(program.icon).size(15)))
        .child(div().max_w(170).truncate().tooltip(name).font_weight(active ? 600 : 500).child(name))
        .when(c.zoomed, el => el.child(svg("mods/pane/zoom.svg").size(10).flex_none().text_color(t.muted)))
        // The status slot is always there, so a state turn never changes the tab's width.
        .child(div().w(16).h_full().flex_none().flex().items_center().justify_center()
          .when(c.status === "working", el => el.child(div().text_size(14).line_height("14px").text_color(t.working).frames(["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"], 80)))
          .when(c.status === "blocked" || c.status === "done", el => el.child(div().size(5).rounded_full().bg(t[c.status]))))
        .child(div().id(`close-${c.id}`).size(14).flex().flex_none().items_center().justify_center().rounded(3).text_color(t.muted)
          .opacity(active ? 0.7 : 0.4).tooltip("Close tab").hover(s => s.bg(withAlpha(t.blocked, UI.hover)).text_color(t.blocked).opacity(1))
          .on_mouse_down("left", stop).on_click((_e, cx) => { cx.stop_propagation(); run("tab.close", { id: c.id }); }).child(svg("mods/pane/close.svg").size(10)));
    };
    // macOS draws the traffic lights over the window's top-left corner. While the
    // sidebar is open it covers that corner; once it's hidden (cmd+b) the tab bar
    // reaches x=0, so leave the buttons their room and start the tabs after them.
    const lights = w?.platform === "macos" && w.titlebar === "none" && !w.fullscreen && root?.traffic_lights;
    const left = lights
      ? Math.max(8, (root.traffic_lights[0] + 64) / (settings().zoom ?? 1) - (sidebar?.hidden ? 0 : sidebar?.size?.px ?? 0))
      : 8;
    // The + and the quick starts are quiet toolbar buttons: no cards, no
    // borders; only the pointer lifts them out of the bar.
    const ghostAction = (id, tip, child, action) => div().id(id).size(SIZE.button).rounded(6).flex_none().flex().items_center().justify_center()
      .cursor_pointer().text_color(t.muted).tooltip(tip)
      .hover(s => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
      .on_click(action)
      .child(child);
    const newTab = ghostAction("tab-new", "New tab", div().text_size(17).line_height("18px").child("+"), () => openOverlay({ mod: "new-menu", kind: "popup", width: 250, height: 512 }));
    // One-click starts beside the +, using the program table's own icons: the
    // shipped tinted glyphs inherit the button's colour, Claude's stays orange.
    const launch = (key, label, icon, tint, argv) => ghostAction(`start-${key}`, label, tint ? svg(icon).size(14).flex_none() : image(icon).size(14), () => {
      // Without an explicit folder, Herdr inherits the focused terminal's cwd.
      const target = spaces().find(s => s.active);
      const folder = shared("likeme.spaceFolders")?.[target?.id] ?? target?.folder;
      run("tab.new", { space: target?.id, folder, argv });
    });
    const launches = [];
    if (this.agents) {
      // Every agent Herdr can start, installed only. The leading two keep
      // their slots; the rest arrive in Herdr's own (most picked first) order.
      const add = (a) => launches.push(launch(a.key, a.name, a.icon ?? "icons/agent.svg", a.icon ? a.tint : true, ARGV[a.key] ?? a.run));
      for (const key of LEADING) {
        const a = this.agents.get(key);
        if (a) add(a);
      }
      for (const a of this.agents.values()) if (!LEADING.includes(a.key)) add(a);
    } else {
      for (const s of FALLBACK) if (!this.hidden.has(s.command)) launches.push(launch(s.key, s.label, s.icon, s.tint, s.argv));
    }
    // Lazygit and Neovim have no `run` in the program table, so `knownAgents`
    // never lists them: PATH decides. (The fallback above already added them.)
    if (this.agents) for (const s of TOOLS) {
      if (!this.agents.has(s.key) && !this.hidden.has(s.command)) launches.push(launch(s.key, s.label, s.icon, s.tint, s.argv));
    }
    const enabled = shared("workspace.panels") ?? ["files", "changes"];
    launches.push(...Object.entries(TOOL_TABS).filter(([mod]) => enabled.includes(mod.slice(3)))
      .map(([mod, tool]) => ghostAction(`start-${mod.slice(3)}`, tool.name, svg(tool.icon).size(14).flex_none(), () => this.openTool(mod))));
    return h_flex().id("tabs-bar").size_full().min_w(0).gap(8).pl(left).pr(8).items_center()
      .bg(t.chrome)
      .border_b(1).border_color(withAlpha(t.foreground, UI.line))
      .on_mouse_up("left", () => { this.pressed = null; this.over = null; })
      .child(h_flex().id("tab-scroll").flex_1().min_w(0).h_full().items_center().gap(4).overflow_x_scrollbar().mode("hover")
        .children([...entries.map(item), newTab])
        .child(h_flex().id("tab-launches").flex_none().h(SIZE.button).items_center().gap(2).ml(4).pl(8)
          .border_l(1).border_color(withAlpha(t.foreground, UI.line)).children(launches)))
      .when(w?.buttons, el => el.child(button("minimize", w.platform === "windows" ? svg("mods/my-tabs/win-min.svg").size(16) : "−", () => run("window.minimize")))
        .child(button("maximize", w.platform === "windows" ? svg(`mods/my-tabs/${w.maximized ? "win-restore" : "win-max"}.svg`).size(16) : "□", () => run("window.maximize")))
        .child(button("close-window", w.platform === "windows" ? svg("mods/my-tabs/win-close.svg").size(16) : svg("mods/pane/close.svg").size(13), () => run("window.close"))));
  }
}
