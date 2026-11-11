import { View, div, svg, image } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, panes, focused, run, openOverlay, theme, window, shared, layout, settings } from "herdr";
import { markColor, withAlpha, UI, TYPE, SIZE } from "./colors.js";

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

export default class Tabs extends View {
  init() {
    this.pressed = null;
    this.over = null;
    this.compact = false;
  }

  render(cx) {
    const t = theme();
    const space = spaces().find(p => p.active);
    const tabs = space?.tabs ?? [];
    const root = layout(), w = window();
    const nodes = findMany(root, ["sidebar", "work-body"]);
    const body = nodes["work-body"], sidebar = nodes.sidebar;
    const stop = (_e, cx) => cx.stop_propagation();
    const button = (id, label, action) => div().id(id).size(24).flex_none().flex().items_center().justify_center().rounded(5).text_color(t.muted)
      .hover(s => s.bg(withAlpha(t.foreground, UI.hover)).text_color(t.foreground))
      .on_mouse_down("left", stop).on_click(action).child(label);
    // A tab still named by its number shows what it runs; a name the person gave
    // it always wins (`named`). Keep the labels distinct when two tabs share a
    // folder. `panes()` is one copy per render, grouped by tab once.
    const panesByTab = new Map();
    for (const p of panes()) {
      let mine = panesByTab.get(p.tab);
      if (!mine) panesByTab.set(p.tab, mine = []);
      mine.push(p);
    }
    // 旧版创建的独立工具 Tab 不再重复显示；仍保留原实例，避免丢失编辑。
    const shown = tabs.filter(tab => {
      const mine = panesByTab.get(tab.id) ?? [];
      return mine.length !== 1 || !["my-files", "my-changes"].includes(mine[0].mod);
    });
    const panelOpen = body?.active && body.active !== "main";
    const showMain = () => run("layout.select", { stack: "work-body", child: "main" });
    const focus = focused();
    const selection = `${space?.id}/${tabs.find(tab => tab.active)?.id}/${focus?.pane ?? focus?.terminal}`;
    // 快捷键、侧栏或新建 Tab 改变当前终端时，也退出工具视图。
    // 延迟到渲染之后执行布局命令，不在 render 中直接修改宿主状态。
    if (this.selection !== undefined && this.selection !== selection && panelOpen) {
      cx.timer.after(0, () => {
        const f = focused();
        if (`${f?.space}/${f?.tab}/${f?.pane ?? f?.terminal}` === selection) showMain();
      });
    }
    this.selection = selection;
    const entries = shown.map((c, i) => {
      const mine = panesByTab.get(c.id) ?? [];
      // A helper pane has no program: label the tab from its terminal, never
      // from the Files/Changes pane beside it.
      const pane = mine.find(p => p.program?.agent) ?? mine.find(p => p.terminal) ?? mine[0];
      const program = pane?.program;
      const auto = !c.named;
      const dir = pane?.cwd?.replace(/\/+$/, "").split("/").pop();
      return { c, i, program, auto, base: dir && dir !== "~" ? dir : program?.name ?? "Terminal" };
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
    // A tab is a quiet pill, not a card: the selected one takes a slightly
    // stronger neutral fill, a heavier name, and its tinted program icon takes
    // the space's colour — the same "selection by mark" language as the rows.
    const fillRaw = markColor((shared("space.colors") ?? {})[space?.id], t);
    const fill = fillRaw ? fillRaw.slice(0, 7) : null;
    const item = ({ c, i, program }) => {
      const name = labels.get(c.id), active = c.active && !panelOpen;
      return h_flex().id(`tab-${c.id}`).relative().h(32).rounded(SIZE.radius).px(10).gap(7).items_center().flex_none().text_size(TYPE.small).cursor_pointer()
        .when(active, el => el
          .bg(withAlpha(t.foreground, UI.active))
          .text_color(t.foreground))
        .when(!active, el => el
          .text_color(t.muted)
          .hover(s => s.bg(withAlpha(t.foreground, UI.hover)).text_color(t.foreground)))
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
          if (shown[from] && over === i && from !== i) run("tab.move", { id: shown[from].id, index: space.tabs.findIndex(x => x.id === c.id) + 1 });
          else if (from === i) { showMain(); run("tab.select", { id: c.id }); }
          cx.notify();
        })
        .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); openOverlay({ mod: "menu", kind: "popup", width: 200, props: { tab: "tab", target: { id: c.id, space: space.id } } }); })
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
          .opacity(active ? 0.7 : 0.4).tooltip("Close tab").hover(s => s.bg(withAlpha(t.ansi1, UI.hover)).text_color(t.ansi1).opacity(1))
          .on_mouse_down("left", stop).on_click((_e, cx) => { cx.stop_propagation(); run("tab.close", { id: c.id }); }).child(svg("mods/pane/close.svg").size(10)));
    };
    // macOS draws the traffic lights over the window's top-left corner. While the
    // sidebar is open it covers that corner; once it's hidden (cmd+b) the tab bar
    // reaches x=0, so leave the buttons their room and start the tabs after them.
    const lights = w?.platform === "macos" && w.titlebar === "none" && !w.fullscreen && root?.traffic_lights;
    const left = lights
      ? Math.max(8, (root.traffic_lights[0] + 64) / (settings().zoom ?? 1) - (sidebar?.hidden ? 0 : sidebar?.size?.px ?? 0))
      : 8;
    const enabled = shared("workspace.panels") ?? ["files", "changes"];
    const panelButton = (id, label, icon) => {
      const own = tabs.find(tab => {
        const mine = panesByTab.get(tab.id) ?? [];
        return mine.length === 1 && mine[0].mod === `my-${id}`;
      });
      const on = body?.active === id || (!panelOpen && Boolean(own?.active));
      const tint = on ? fill ?? t.accent : t.muted;
      return h_flex().id(`panel-${id}`).h(SIZE.button).rounded(6).px(this.compact ? 8 : 9).gap(6).flex_none().items_center()
        .cursor_pointer().tooltip(label).text_size(TYPE.small).font_weight(on ? 600 : 500)
        .when(on, el => el
          .bg(withAlpha(t.foreground, UI.active))
          .text_color(t.foreground)
          .hover(s => s.bg(withAlpha(t.foreground, UI.active))))
        .when(!on, el => el
          .text_color(t.muted)
          .hover(s => s.bg(withAlpha(t.foreground, UI.hover)).text_color(t.foreground)))
        .on_mouse_down("left", stop)
        .on_click(() => {
          // 点击时重读布局，连续点击也只切换视图，不创建或关闭 Tab。
          const current = findMany(layout(), ["work-body"])["work-body"];
          const tabs = spaces().find(p => p.active)?.tabs ?? [], all = panes();
          const helper = tab => {
            const mine = all.filter(p => p.tab === tab.id);
            return mine.length === 1 && ["my-files", "my-changes"].includes(mine[0].mod) ? mine[0].mod : null;
          };
          const legacy = tabs.find(tab => helper(tab) === `my-${id}`);
          // 升级时复用旧工具 Tab 中的编辑器和分栏状态，但入口只显示一次。
          if (legacy) {
            showMain();
            if (legacy.active && current?.active === "main") {
              const back = tabs.find(tab => tab.id === this.returnTab && !helper(tab)) ?? tabs.find(tab => !helper(tab));
              if (back) run("tab.select", { id: back.id });
            } else {
              const active = tabs.find(tab => tab.active && !helper(tab));
              if (active) this.returnTab = active.id;
              run("tab.select", { id: legacy.id });
            }
            return;
          }
          run("layout.select", { stack: "work-body", child: current?.active === id ? "main" : id });
        }).child(svg(icon).size(14).flex_none().text_color(tint))
        .when(!this.compact, el => el.child(label));
    };
    const panels = [];
    if (enabled.includes("files")) panels.push(panelButton("files", "Files", "mods/my-files/file.svg"));
    if (enabled.includes("changes")) panels.push(panelButton("changes", "Changes", "mods/my-changes/changes.svg"));
    // The + and the quick starts are quiet toolbar buttons: no cards, no
    // borders; only the pointer lifts them out of the bar.
    const ghostAction = (id, tip, child, action) => div().id(id).size(SIZE.button).rounded(6).flex_none().flex().items_center().justify_center()
      .cursor_pointer().text_color(t.muted).tooltip(tip)
      .hover(s => s.bg(withAlpha(t.foreground, UI.hover)).text_color(t.foreground)).on_mouse_down("left", stop)
      .on_click(action)
      .child(child);
    const newTab = ghostAction("tab-new", "New tab", div().text_size(17).line_height("18px").child("+"), () => openOverlay({ mod: "new-menu", kind: "popup", width: 250, height: 512 }));
    // One-click starts beside the +, using the program table's own icons: the
    // shipped tinted glyphs inherit the button's colour, Claude's stays orange.
    const launch = (id, label, icon, tint, argv) => ghostAction(id, label, tint ? svg(icon).size(14).flex_none() : image(icon).size(14), () => { showMain(); run("tab.new", { space: space?.id, argv }); });
    const launches = [
      launch("start-claude", "Claude Code", "icons/claude.svg", false, ["claude", "--dangerously-skip-permissions"]),
      launch("start-pi", "Pi", "icons/pi.svg", true, ["pi"]),
      launch("start-lazygit", "Lazygit", "icons/lazygit.svg", true, ["lazygit"]),
      launch("start-nvim", "Neovim", "icons/nvim.svg", true, ["nvim"]),
    ];
    return h_flex().id("tabs-bar").size_full().min_w(0).gap(8).pl(left).pr(8).items_center()
      .on_size_change((size, cx) => {
        const compact = size.width < 680;
        if (compact !== this.compact) { this.compact = compact; cx.notify(); }
      })
      .bg(t.chrome)
      .border_b(1).border_color(withAlpha(t.foreground, UI.line))
      .on_mouse_up("left", () => { this.pressed = null; this.over = null; })
      // 标签和新建入口留在可滚动区域内；Files／Changes 固定在标签栏最右侧。
      .child(h_flex().id("tab-scroll").flex_1().min_w(0).h_full().items_center().gap(4).overflow_x_scrollbar().mode("hover")
        .children([...entries.map(item), newTab])
        .child(h_flex().id("tab-launches").flex_none().h(SIZE.button).items_center().gap(2).ml(4).pl(8)
          .border_l(1).border_color(withAlpha(t.foreground, UI.line)).children(launches)))
      .when(panels.length > 0, el => el.child(h_flex().id("tab-panels").flex_none().h(SIZE.button).items_center().gap(3).pl(8)
        .border_l(1).border_color(withAlpha(t.foreground, UI.line)).children(panels)))
      .when(w?.buttons, el => el.child(button("minimize", w.platform === "windows" ? svg("mods/my-tabs/win-min.svg").size(16) : "−", () => run("window.minimize")))
        .child(button("maximize", w.platform === "windows" ? svg(`mods/my-tabs/${w.maximized ? "win-restore" : "win-max"}.svg`).size(16) : "□", () => run("window.maximize")))
        .child(button("close-window", w.platform === "windows" ? svg("mods/my-tabs/win-close.svg").size(16) : svg("mods/pane/close.svg").size(13), () => run("window.close"))));
  }
}
