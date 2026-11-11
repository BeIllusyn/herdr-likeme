// Agents in grouped or priority views; parents take their most urgent sub-agent's place.
// A viewed done agent stays in Done until left.

import { View, div, image, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { agents, terminals, panes, focused, spaces, run, theme, shared, setShared, setAgentOrder, openOverlay, closeOverlay } from "herdr";
import { markColor, mix } from "./colors.js";
import { backgroundTick } from "./util.js";

const clean = (s) => (s ?? "").replace(/^[^\p{L}\p{N}]+/u, "").trim();
// Namespaced keys keep this mod's memory out of another mod's. The bare keys are
// what earlier versions wrote; read them once so an update keeps the state.
const stored = (key) => localStorage.getItem(`likeme.${key}`) ?? localStorage.getItem(key);

// The pane a tab's title comes from: its first agent, else its focused terminal,
// else its first terminal. One pass over the snapshot, not one `panes()` read per
// row (every host read copies the whole pane list into JS).
function leadPanes(all) {
  const leads = new Map();
  for (const p of all) {
    if (!p.terminal) continue;
    const current = leads.get(p.tab);
    if (!current || (!current.program?.agent && (p.program?.agent || (!current.focused && p.focused)))) leads.set(p.tab, p);
  }
  return leads;
}

// The title the agent itself generated, when its terminal reports one that says
// more than the program: a program name, a path, a user@host or the program key
// is not a title.
function ownTitle(t) {
  const prog = t?.program?.name;
  const live = clean(t?.title);
  return live && live !== prog && !/^[~/]|^[A-Za-z]:\\/.test(live) && !live.includes("@") && live.toLowerCase() !== t?.program?.key ? live : "";
}

function title(tab, l) {
  const live = ownTitle(l);
  return (tab.name === l?.program?.name || !tab.named) && live ? live : tab.name;
}
const RANK = { blocked: 4, done: 3, working: 2, idle: 1 };
// The row's mark and its section come from the same rank, so a parent with a
// blocked child reads as blocked instead of sitting under "Needs you" with an
// idle ring.
const STATUS_OF_RANK = { 4: "blocked", 3: "done", 2: "working", 1: "idle" };
// A sub-agent without a pane isn't in agents(): its raw word, error counting as
// blocked. It's never done: it reports to its parent, and the parent's done is the news.
const kidStatus = (k, listed) => {
  const s = listed.get(k.address) ?? k.status;
  return s === "error" ? "blocked" : s === "done" ? "idle" : s;
};
const SORTS = [
  { id: "priority", label: "Priority", icon: "mods/my-sidebar/sort.svg" },
  { id: "grouped", label: "Grouped by space", icon: "mods/workspace-chrome/layers.svg" },
];
const sortOf = () => SORTS.find((s) => s.id === shared("agents.sort")) ?? SORTS[0];
const SECTION = { 4: "Needs you", 3: "Done", 2: "Working", 1: "Idle" };
const SECTION_STATUS = { 4: "blocked", 3: "done", 2: "working" };

function duration(ms) {
  const m = Math.floor(ms / 60000);
  if (m < 1) return "<1m";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`;
}

// The agent's icon from the app's program table: a one-color glyph or a picture.
function icon(p, size, color) {
  if (!p?.icon) return null;
  return p.tint ? svg(p.icon).size(size).flex_none().text_color(color) : image(p.icon).w(size).h(size).flex_none();
}

export default class Agents extends View {
  init(props, cx) {
    this.embedded = Boolean(props?.embedded);
    this.sortMenuOpen = Boolean(props?.sortMenu);
    this.overlay = props?.overlay;
    if (this.sortMenuOpen) return;
    this.folded = new Set();
    this.orderSeen = null;
    this.idleTicks = 0;
    // Each agent's last state and when it changed (ms), kept across restarts.
    this.changed = JSON.parse(stored("changed") ?? "{}");
    // Pins are one-way: once read, drop the old key so an empty new key doesn't
    // fall back to it and re-migrate on every start.
    const legacyPins = localStorage.getItem("pins");
    this.pendingPins = JSON.parse(localStorage.getItem("likeme.pins") ?? legacyPins ?? "[]");
    if (legacyPins !== null) localStorage.removeItem("pins");
    if (!this.pendingPins.length) localStorage.removeItem("likeme.pins");
    this.migratingPins = new Set();
    if (this.pendingPins.length) this.migratePins(terminals());
    // This retained child isn't redrawn by the host's live updates the way a mod
    // root is. Watch what the list shows and redraw when it changes, not on every
    // tick: one redraw paints the whole window. The minute is in the signature so
    // the elapsed time under each row moves along.
    this.seen = null;
    cx.timer.every(250, (cx) => {
      // In the background nothing here needs four looks a second; one is enough
      // to catch up within a second of the window coming forward.
      if (!backgroundTick(this)) return;
      const minute = Math.floor(Date.now() / 60000);
      const list = agents();
      // Sub-agent rows only exist under an agent: with none there is no tree to
      // watch and this copy of every terminal is pure work.
      const all = list.length ? terminals() : [];
      // A pin's label echoes back through the terminal list; write it from the
      // tick so rendering stays free of side effects.
      if (this.pendingPins.length) this.migratePins(all);
      let sig = `${minute}|${shared("agents.sort") ?? ""}`;
      const colors = shared("space.colors") ?? {};
      for (const id in colors) sig += `|${id}=${colors[id]}`;
      for (const a of list) sig += `|${a.address}:${a.status}:${a.focused ? 1 : 0}:${a.pinned ? 1 : 0}:${a.pane}:${a.space}:${a.space_name}:${a.tab}:${a.tab_name}:${a.title}`;
      for (const t of all) sig += `|${t.address}:${t.state}:${t.status ?? ""}:${t.parent ?? ""}`;
      if (sig === this.seen) return;
      this.seen = sig;
      cx.notify();
    });
  }

  // Stamps agents whose state changed. Done and idle count as one: looking at a
  // finished agent turns done into idle, and looking isn't the agent doing anything.
  track(list, now) {
    let dirty = false;
    for (const a of list) {
      const s = a.status === "done" ? "idle" : a.status;
      if (this.changed[a.address]?.s === s) continue;
      this.changed[a.address] = { s, at: now };
      dirty = true;
    }
    if (!dirty) return;
    // Gone and old: the list alone is empty right after a start.
    const listed = new Set(list.map((a) => a.address));
    for (const [k, c] of Object.entries(this.changed)) if (!listed.has(k) && now - c.at > 30 * 86400000) delete this.changed[k];
    localStorage.setItem("likeme.changed", JSON.stringify(this.changed));
  }

  // Keep offline pins until their terminal returns, and keep each pending until
  // core echoes the label so a failed write doesn't erase the old pin.
  migratePins(all) {
    const listed = new Map(all.filter((t) => t.state === "live").map((t) => [t.address, t]));
    const pending = this.pendingPins.filter((address) => {
      const terminal = listed.get(address);
      if (!terminal) return true;
      if (terminal.labels?.["herdr.pinned"]) return false;
      if (!this.migratingPins.has(address)) {
        this.migratingPins.add(address);
        run("terminal.pin", { terminal: address, pinned: true });
      }
      return true;
    });
    if (pending.length === this.pendingPins.length) return;
    this.pendingPins = pending;
    if (pending.length) localStorage.setItem("likeme.pins", JSON.stringify(pending));
    else localStorage.removeItem("likeme.pins");
  }

  since(a) {
    return this.changed[a.address]?.at ?? 0;
  }

  // Looking at a done agent makes it idle; it stays with Done until you leave
  // it rather than drop away under you. Any other change moves it at once.
  hold(list) {
    const cur = list.find((a) => a.focused);
    const same = cur && cur.address === this.held?.address;
    // Arriving, or any change but done turning idle, sets what it was.
    if (!same || cur.status !== "idle") this.held = cur ? { address: cur.address, rank: RANK[cur.status] ?? 0 } : null;
  }

  rank(a) {
    const sawDone = a.address === this.held?.address && this.held.rank === RANK.done && a.status === "idle";
    return sawDone ? RANK.done : RANK[a.status] ?? 0;
  }

  sortMenu(t) {
    const on = sortOf().id;
    return v_flex()
      .w_full()
      .p(5)
      .bg(t.popover)
      .text_size(12.8)
      .child(div().px(8).pt(4).pb(6).text_size(11).text_color(t.dim).child("Sort agents"))
      .children(SORTS.map((s) => h_flex()
        .id(`sort-${s.id}`)
        .h(31)
        .px(8)
        .gap(9)
        .rounded(7)
        .items_center()
        .text_color(t.foreground)
        .hover((el) => el.bg(t.hover))
        .on_click(() => {
          setShared("agents.sort", s.id);
          closeOverlay(this.overlay);
        })
        .child(svg(s.icon).size(14).flex_none().text_color(t.muted))
        .child(div().flex_1().child(s.label))
        .when(s.id === on, (el) => el.child(svg("mods/workspace-chrome/check.svg").size(14).flex_none().text_color(t.foreground)))));
  }

  peek(addr) {
    run("terminal.peek", { terminal: addr });
  }

  // Live sub-agent trees for a whole render, computed once: a Map of parent to
  // its rows (tree lines included) and a Map of parent to the most urgent state
  // anywhere below it. The old per-agent recursion walked every terminal once
  // per agent — quadratic on a list with sub-agents.
  trees(all, list) {
    const kidsOf = new Map();
    for (const k of all) {
      if (k.state !== "live" || !k.parent) continue;
      let kids = kidsOf.get(k.parent);
      if (!kids) kidsOf.set(k.parent, kids = []);
      kids.push(k);
    }
    const subsOf = new Map();
    const urgency = new Map();
    const visit = (addr, lead) => {
      const done = urgency.get(addr);
      if (done !== undefined) return done;
      const kids = kidsOf.get(addr) ?? [];
      const subs = [];
      let top = 0;
      kids.forEach((k, i) => {
        const last = i === kids.length - 1;
        subs.push({ t: k, lines: [...lead, last ? "└" : "├"] });
        const rank = RANK[kidStatus(k, this.listed)] ?? 0;
        const below = visit(k.address, [...lead, last ? "" : "│"]);
        if (rank > top) top = rank;
        if (below > top) top = below;
      });
      subsOf.set(addr, subs);
      urgency.set(addr, top);
      return top;
    };
    for (const a of list) visit(a.address, []);
    return { subsOf, urgency: (addr) => urgency.get(addr) ?? 0 };
  }

  subRow(t, s, shown, compact) {
    const k = s.t;
    const st = kidStatus(k, this.listed);
    const pic = icon(k.program, 20, t.foreground);
    const on = k.address === shown;
    return h_flex()
      .id(`sub-${k.address}`)
      .pl(49)
      .pr(8)
      .h(26)
      .flex_none()
      .gap(0)
      .items_center()
      .rounded(8)
      .text_size(12.5)
      .when(on, (el) => el.bg(t.raised))
      .hover((s) => s.bg(t.hover))
      .on_click(() => this.peek(k.address))
      .children(s.lines.map(l => div().self_start().mt(-4).w(9).h(17).mr(4).flex_none()
        .when(Boolean(l), el => el.border_l(1.5).border_color(t.input))
        .when(l === "└" || l === "├", el => el.border_b(1.5).rounded_bl(6))))
      .when(Boolean(pic), el => el.child(div().mr(8).child(pic)))
      .child(div().flex_1().truncate().text_color(on ? t.foreground : t.muted).child(k.name || k.template || k.program?.name || k.address))
      .child(this.status(t, { status: st }, compact));
  }

  // compact: a ! for blocked where a header already says "Needs you".
  status(t, a, compact = false) {
    const color = t[a.status] ?? t.dim;
    if (a.status === "working") return div().w(18).h_full().flex_none().flex().items_center().justify_center()
      .child(div().text_size(16).line_height("16px").text_color(t.working).frames(["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"], 80));
    if (a.status === "blocked" && compact) return div().size(14).flex_none().rounded(4).bg(t.blocked + "26").text_size(10.5).font_bold().text_color(t.blocked).flex().items_center().justify_center().child("!");
    if (a.status === "blocked") return div().flex_none().px(6).h(18).rounded(5).bg(t.blocked + "26").text_size(10.5).font_semibold().text_color(t.blocked).flex().items_center().child("Needs you");
    // Idle keeps a faint ring: every row shows where its agent stands, and a
    // quiet one reads as quiet rather than as a row with no state at all.
    if (a.status === "idle") return div().size(7).mx(3).flex_none().rounded(4).border(1).border_color(t.dim + "80");
    return div().size(7).mx(3).flex_none().rounded(4).bg(a.status === "done" ? color : t.dim + "00");
  }

  render(cx) {
    const t = theme();
    if (this.sortMenuOpen) return this.sortMenu(t);
    const embedded = this.embedded;
    const sort = sortOf();
    let list = agents();
    // One pass over each host list: every read copies the whole list into JS.
    const listed = new Map();
    for (const a of list) listed.set(a.address, a.status);
    this.listed = listed;
    const all = list.length ? terminals() : [];
    const shown = focused()?.agent;
    const now = Date.now();
    this.track(list, now);
    this.hold(list);
    const byPriority = sort.id === "priority";
    // Sub-agent rows and their most urgent state, once for the whole list.
    const trees = this.trees(all, list);
    const urgency = new Map();
    for (const a of list) urgency.set(a.address, Math.max(this.rank(a), trees.urgency(a.address)));
    const rankOf = (a) => urgency.get(a.address);
    if (byPriority) list = [...list].sort((x, y) => rankOf(y) - rankOf(x) || this.since(y) - this.since(x) || y.seq - x.seq);
    const pinned = list.filter((a) => a.pinned);
    const rest = list.filter((a) => !a.pinned);
    list = [...pinned, ...rest];
    // The host only needs the order when it changed; this is called on every
    // hover otherwise.
    const addresses = list.map((a) => a.address);
    const order = addresses.join("\u0000");
    if (order !== this.orderSeen) {
      this.orderSeen = order;
      setAgentOrder(addresses);
    }

    const withKids = (a) => {
      const subs = trees.subsOf.get(a.address) ?? [];
      const r = row(a, subs);
      if (this.folded.has(a.address)) return [r];
      return [r, ...subs.map((s) => this.subRow(t, s, shown, byPriority))];
    };

    // The fold chevron; folded, the count too, colored by the most urgent one.
    const fold = (a, subs) => {
      const sts = subs.map((s) => kidStatus(s.t, this.listed));
      const top = sts.reduce((m, s) => ((RANK[s] ?? 0) > (RANK[m] ?? 0) ? s : m), null);
      const open = !this.folded.has(a.address);
      return div()
        .id(`fold-${a.address}`)
        .h(18)
        .px(3)
        .gap(3)
        .flex()
        .items_center()
        .rounded(4)
        .text_size(11)
        .text_color(open ? t.dim : (t[STATUS_OF_RANK[rankOf(a)] ?? top] ?? t.dim))
        .cursor_pointer()
        .hover((s) => s.bg(t.hover).text_color(t.foreground))
        .on_click((_e, cx) => {
          cx.stop_propagation();
          open ? this.folded.add(a.address) : this.folded.delete(a.address);
          cx.notify();
        })
        .child(svg(`mods/workspace-chrome/chevron-${open ? "down" : "right"}.svg`).size(11).flex_none())
        .when(!open, (el) => el.child(String(subs.length)));
    };

    // A row reads like a space row: the agent's own generated title leads when
    // there is one, with its space's name under it (the space alone leads when
    // not), and its space's colour as a faint wash behind both.
    // The tab and pane snapshots are read once for the whole list: the old
    // per-agent lookup copied `panes()` once per row and scanned every tab.
    const leads = list.length ? leadPanes(panes()) : null;
    const tabTitle = new Map();
    if (list.length) for (const s of spaces()) for (const tab of s.tabs) tabTitle.set(tab.id, title(tab, leads.get(tab.id)));
    const labelOf = (a) => tabTitle.get(a.tab) ?? (a.title || a.program?.name || "");
    // Every agent row is washed with its space's colour, faint when idle; the
    // focused one is a flat opaque tint, square and full-bleed, flush with its
    // neighbours. Cache per space so a list of twenty does not repeat the same
    // regex and blend twenty times.
    const colors = shared("space.colors") ?? {};
    const fills = new Map();
    const fillOf = (a) => {
      let fill = fills.get(a.space);
      if (fill === undefined) {
        fill = markColor(colors[a.space], t);
        fills.set(a.space, fill);
      }
      return fill;
    };
    const balloons = new Map();
    const balloonOf = (a) => {
      let balloon = balloons.get(a.space);
      if (balloon === undefined) {
        const fill = fillOf(a);
        balloon = fill ? mix(t.raised, fill, 0.32) : t.raised;
        balloons.set(a.space, balloon);
      }
      return balloon;
    };

    const row = (a, subs = []) => {
      const pic = icon(a.program, 30, t.foreground);
      // An agent on another machine (`vps/t7`) says which.
      const machine = a.address.includes("/") ? a.address.split("/")[0] : null;
      const fill = fillOf(a);
      // Top: the title the agent generated, else the project (its space).
      // Under it: whichever of the two did not lead.
      const raw = labelOf(a);
      const own = ownTitle(a);
      const titled = own && own !== a.space_name;
      const top = titled ? own : a.space_name || raw;
      const under = titled ? a.space_name : raw && raw !== top && !/^\d+$/.test(raw) ? raw : "";
      const when = this.since(a);
      const mark = STATUS_OF_RANK[rankOf(a)] ?? a.status;
      const idle = mark === "idle" && !a.focused;
      const isPinned = a.pinned;
      const pin = div()
        .id(`pin-${a.address}`)
        .flex_none()
        .p(2)
        .rounded(4)
        .text_color(t.dim)
        .cursor_pointer()
        .hover((s) => s.bg(t.hover).text_color(t.foreground))
        .tooltip(isPinned ? "Unpin" : "Pin to the top")
        .on_click((_e, cx) => {
          cx.stop_propagation();
          run("terminal.pin", { terminal: a.address, pinned: !isPinned });
          // The row moves away from under the pointer, and no hover-out comes.
          this.hovered = null;
          cx.notify();
        })
        .child(svg(`mods/workspace-chrome/${isPinned ? "pin-off" : "pin"}.svg`).size(13));
      return h_flex()
        .id(`ag-${a.address}`)
        .px(10)
        .h(44)
        .flex_none()
        .items_center()
        .gap(9)
        .rounded(10)
        .when(a.focused, (el) => el.bg(balloonOf(a)))
        .when(!a.focused, (el) => el
          .when(Boolean(fill), (r) => r.bg(fill + "0d"))
          .hover((s) => s.bg(t.hover)))
        .cursor_pointer()
        .on_hover((on, cx) => {
          // Only a change of which row is hovered needs a redraw; the event also
          // fires for rows the pointer merely crosses.
          if (on ? this.hovered === a.address : this.hovered !== a.address) return;
          this.hovered = on ? a.address : null;
          cx.notify();
        })
        .on_click(() => run("pane.focus", { pane: a.pane }))
        .when(Boolean(pic), el => el.child(div().id(`agent-fold-${a.address}`)
          .when(subs.length > 0, el => el.on_click((_e, cx) => {
            cx.stop_propagation();
            this.folded.has(a.address) ? this.folded.delete(a.address) : this.folded.add(a.address);
            cx.notify();
          })).child(pic)))
        .child(
          v_flex()
            .flex_1()
            .min_w(0)
            .gap(2)
            .child(div().min_w(0).truncate().text_size(13).line_height("16px").text_color(idle ? t.muted : t.foreground).tooltip(top).child(top))
            .when(Boolean(under) || Boolean(machine), el => el.child(
              h_flex()
                .min_w(0)
                .items_center()
                .gap(6)
                .text_size(11)
                .line_height("14px")
                .text_color(t.muted)
                .when(Boolean(under), el => el.child(div().min_w(0).truncate().tooltip(under).child(under)))
                .when(Boolean(under) && Boolean(machine), el => el.child(div().flex_none().child("·")))
                .when(Boolean(machine), el => el.child(div().flex_none().text_size(10).child(machine))),
            )),
        )
        .when(subs.length > 0, el => el.child(fold(a, subs)))
        // A fixed slot for the pin and the elapsed time: hovering must not move the row.
        .child(div().w(32).flex_none().h_full().flex().items_center().justify_end()
          .when(this.hovered === a.address, el => el.child(pin))
          .when(this.hovered !== a.address && Boolean(when), el => el.child(div().text_size(11).text_color(t.muted).child(duration(now - when)))))
        .child(div().min_w(18).flex_none().h_full().flex().items_center().justify_end().child(this.status(t, { status: mark }, byPriority && !isPinned)));
    };

    // Groups in list order: spaces (grouped) or priority sections. Agents of a
    // space are next to each other in agents(), so neighbours make a group.
    const groups = pinned.length ? [{ id: "pinned", label: "Pinned", status: null, members: pinned }] : [];
    for (const a of rest) {
      const r = rankOf(a) || RANK.idle;
      const id = byPriority ? `sec-${r}` : `sp-${a.space}`;
      if (groups.at(-1)?.id === id) groups.at(-1).members.push(a);
      else groups.push({ id, label: byPriority ? SECTION[r] : a.space_name || "", status: byPriority ? SECTION_STATUS[r] : null, members: [a] });
    }

    // A group's header; it folds the group. Folded, it says how many and the most urgent state.
    const header = (g) => {
      const open = !this.folded.has(g.id);
      const top = g.members.reduce((m, a) => ((rankOf(a) ?? 0) > (RANK[m] ?? 0) ? STATUS_OF_RANK[rankOf(a)] : m), null);
      return h_flex()
        .id(g.id)
        .px(10)
        .pt(4)
        .h(28)
        .flex_none()
        .gap(6)
        .items_center()
        .rounded(7)
        .text_size(11)
        .font_medium()
        .cursor_pointer()
        .hover((s) => s.text_color(t.foreground))
        .on_click((_e, cx) => {
          open ? this.folded.add(g.id) : this.folded.delete(g.id);
          cx.notify();
        })
        .child(div().truncate().text_color(t[g.status] ?? t.dim).child(g.label))
        .when(byPriority || !open, (el) => el.child(div().text_color(t.dim).child(String(g.members.length))))
        .child(div().flex_1())
        .when(!open, (el) => el
          .when(!byPriority && top, (el) => el.child(this.status(t, { status: top }, true)))
          .child(svg("mods/workspace-chrome/chevron-right.svg").size(11).flex_none().text_color(t.dim)));
    };
    // Priority's sections are the list's own labels, so they always show — an
    // all-idle list still says "Idle". A single space group in the grouped view
    // would only repeat its rows, so it hides.
    const showHeaders = byPriority || groups.length > 1;
    const rows = groups.flatMap((g) => showHeaders
      ? [header(g), ...(this.folded.has(g.id) ? [] : g.members.flatMap(withKids))]
      : g.members.flatMap(withKids));
    const empty = list.length === 0;
    const emptyState = v_flex()
      .w_full()
      .items_center()
      .gap(8)
      .px(16)
      .py(24)
      .child(svg("mods/workspace-chrome/layers.svg").size(22).text_color(t.muted))
      .child(div().text_size(12.5).text_color(t.muted).child("No agents yet"))
      .child(div().w_full().text_center().text_size(11).line_height("15px").text_color(t.muted).child("Agents appear here when they report their status."));

    return v_flex()
      .text_size(13)
      .when(!embedded, el => el.size_full().min_h(0).bg(t.chrome).border_t(1).border_color(t.border))
      .when(embedded, el => el.w_full().flex_none())
      .child(
        h_flex()
          .px(16)
          .h(41)
          .pt(embedded ? 10 : 14)
          .pb(5)
          .flex_none()
          .items_center()
          .justify_between()
          .child(div().text_size(14).font_medium().text_color(t.muted).child("Agents"))
          .child(
            div()
              .id("ag-sort")
              .text_size(11)
              .text_color(t.muted)
              .hover((s) => s.text_color(t.foreground))
              .on_click(() => openOverlay({ mod: "my-sidebar", kind: "popup", width: 200, height: 140, props: { sortMenu: true } }))
              .tooltip(`Sort agents: ${sort.label}`)
              .child(svg(sort.icon).size(14)),
          ),
      )
      .child(v_flex().id("ag-list").px(6).gap(4)
        .when(!embedded, el => el.flex_1().min_h(0).overflow_y_scrollbar().mode("always"))
        .when(empty && !embedded, el => el.items_center().justify_center())
        .children(empty ? [emptyState] : rows));
  }
}
