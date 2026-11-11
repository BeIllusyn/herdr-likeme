// Workspace spaces: stable colored avatars, worktrees under their checkout,
// grouped by machine when more than one is known. After a space's name, the repo
// its first terminal is in now, only where unusual: branch, ahead/behind. Agent state lives in the agents list, not here. Click to
// switch, right-click for its menu, drag to reorder.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { spaces, machines, panes, run, openOverlay, exec, hc, theme, shared, setShared, watchFolder, window } from "herdr";
import { markColor, markInk, withAlpha, UI, TYPE, SIZE } from "./colors.js";
import { backgroundTick } from "./util.js";

// A place key is machine + NUL + folder: neither part can contain NUL, so the
// pair needs no JSON round-trip on the hot path (every 250 ms tick).
const SEP = "\u0000";
const keyOf = (on, cwd) => `${on ?? ""}${SEP}${cwd}`;
const machineOf = (key) => { const i = key.indexOf(SEP); return i > 0 ? key.slice(0, i) : null; };
const cwdOf = (key) => key.slice(key.indexOf(SEP) + 1);
const sameGit = (a, b) => a === b || Boolean(a && b &&
  a.name === b.name && a.branch === b.branch && a.ahead === b.ahead &&
  a.behind === b.behind && a.repo === b.repo && a.linked === b.linked);

// Where a space is now: its first terminal's live folder, else where it was made.
// `ps`: panes(), read once by the caller (each read copies every pane).
function place(s, ps) {
  const tabs = new Set((s.tabs ?? []).map((c) => c.id));
  return ps.find((p) => tabs.has(p.tab) && p.cwd)?.cwd || s.folder;
}
const rowHeight = ({ tree }) => (tree ? SIZE.worktreeRow : SIZE.row);
const where = (s, ps) => keyOf(s.machine ?? null, place(s, ps));
const base = (path) => path.replace(/\/+$/, "").split("/").pop();
// Changes made outside Herdr (an editor's save, a commit in another app): looked
// for this often, in repos the list shows, while the window is in front.
const FALLBACK = 60000;
// Namespaced keys keep this mod's memory out of another mod's. The bare keys are
// what earlier versions wrote; read them once so an update keeps the state.
const stored = (key) => localStorage.getItem(`likeme.${key}`) ?? localStorage.getItem(key);

export default class Spaces extends View {
  init(props, cx) {
    this.embedded = Boolean(props?.embedded);
    this.git = {}; // where() -> { name, branch, ahead, behind, repo, linked }, null: not a repo
    this.checked = {}; // where() -> when it was last looked at
    this.unsure = new Set(); // where()s git couldn't answer for (a machine away)
    this.pending = new Set(); // where()s to look at next
    this.busy = {}; // pane -> an agent working or a program in front of its shell
    this.ready = {}; // machine -> its layout was readable at the last look
    this.at = {}; // space -> its where() at the last look
    this.watching = new Set(); // local repos' git folders
    // Spaces made while this runs wait (at most a moment) for their git, so a
    // worktree appears under its repo instead of jumping there.
    this.shown = new Set(spaces().map((s) => s.id));
    this.born = {};
    // This retained child isn't redrawn by the host's live updates the way a mod
    // root is, so the list's own shape is watched and a change redraws it (see
    // `checkNew`): closing a space has to leave the list at once, not when some
    // later git look happens to finish.
    this.seen = null;
    this.colorSig = null;
    this.idleTicks = 0;
    this.pressed = null;
    this.over = null;
    this.machines = [];
    this.reconnecting = JSON.parse(stored("machines.reconnecting") ?? "{}");
    for (const state of Object.values(this.reconnecting)) state.busy = false;
    this.folded = new Set(JSON.parse(stored("machines.folded") ?? "[]"));
    // Colours are assigned here, not in `render`: `setShared` re-renders every
    // mod, and doing that from inside a render pass cascades into the window.
    this.syncColors(spaces());
    this.refreshMachines(cx);
    cx.timer.every(15000, cx => this.refreshMachines(cx));
    // `git status` walks the whole tree, on another machine a process there:
    // only when its answer could have changed (see `due`).
    // A tick where nothing can be seen (window in the background) is skipped:
    // three of four, so state still catches up within a second of returning.
    cx.timer.every(250, (cx) => {
      if (!backgroundTick(this)) return;
      this.checkNew(cx);
    });
  }

  // Give every space a colour once, and keep the table in step as spaces come
  // and go. Runs off the tick, never from `render`.
  syncColors(sp) {
    const colors = shared("space.colors") ?? {};
    const ids = new Set(sp.map((s) => s.id));
    const kept = {};
    let changed = false;
    for (const [id, c] of Object.entries(colors)) {
      if (ids.has(id)) kept[id] = c;
      else changed = true;
    }
    const palette = ["ansi6", "ansi3", "ansi4", "ansi5", "ansi2", "ansi1"];
    for (const p of sp) {
      if (kept[p.id] || p.name === "~") continue;
      const uses = (c) => Object.values(kept).filter((v) => v === c).length;
      kept[p.id] = palette.reduce((best, c) => (uses(c) < uses(best) ? c : best));
      changed = true;
    }
    if (changed) setShared("space.colors", kept);
  }

  checkNew(cx) {
    const now = Date.now();
    const sp = spaces();
    // New or renamed spaces need a colour before the first frame that shows them.
    const own = sp.map((s) => `${s.id}:${s.name}`).join("|");
    if (own !== this.colorSig) {
      this.colorSig = own;
      this.syncColors(sp);
    }
    // Everything the list draws changes under this view without the host telling
    // it: a closed space disappears, one is renamed, the active one moves. Redraw
    // on that change alone, not every tick. Colours only change with `own` above.
    const sig = sp.map((s) => `${s.id}:${s.name}:${s.active ? 1 : 0}:${s.machine ?? ""}:${s.folder ?? ""}`).join("|");
    if (sig !== this.seen) {
      this.seen = sig;
      cx.notify();
    }
    for (const s of sp) if (!this.shown.has(s.id)) this.born[s.id] ??= now;
    if (!sp.length) return;
    const due = this.due(now, sp, panes());
    if (due.size) this.refreshGit(due, cx);
  }

  // Places whose git could have changed: new ones (a new space, a cd), where a
  // command or an agent's turn just ended (a checkout, a commit, edits), those on
  // a machine that is back, and repos in view whose fallback is due.
  due(now, sp, ps) {
    // Moved there: what it knew of that place may be old.
    const at = {};
    for (const s of sp) at[s.id] = where(s, ps);
    const keys = new Set();
    for (const k of Object.values(at)) if (cwdOf(k)) keys.add(k);
    const due = new Set();
    for (const k of keys) if (!(k in this.git)) due.add(k);
    for (const [id, k] of Object.entries(at)) if (this.at[id] && this.at[id] !== k && keys.has(k)) due.add(k);
    this.at = at;
    const spaceOf = {};
    for (const s of sp) for (const t of s.tabs ?? []) spaceOf[t.id] = s;
    const busy = {};
    for (const p of ps) {
      if (!p.terminal || !spaceOf[p.tab]) continue;
      busy[p.pane] = p.status === "working" || !(p.program?.shell || p.program?.agent);
      if (this.busy[p.pane] && !busy[p.pane]) this.sameRepo(at[spaceOf[p.tab].id], keys).forEach((k) => due.add(k));
    }
    this.busy = busy;
    for (const m of machines()) {
      const ready = m.layout === "ready";
      if (ready && this.ready[m.name] === false) for (const k of keys) if (machineOf(k) === m.name) due.add(k);
      this.ready[m.name] = ready;
    }
    if (window()?.active) {
      for (const k of keys) {
        const asks = this.git[k] || this.unsure.has(k);
        if (asks && !this.folded.has(machineOf(k)) && now - (this.checked[k] ?? 0) > FALLBACK) due.add(k);
      }
    }
    return due;
  }

  // `key` and the other places in its repo (a commit there moves their ahead/behind).
  sameRepo(key, keys) {
    const repo = this.git[key]?.repo;
    return [key, ...(repo ? [...keys].filter((k) => this.git[k]?.repo === repo) : [])];
  }

  refreshMachines(cx) {
    cx.spawn(async cx => {
      let next = this.machines;
      try {
        const r = await hc(["machine", "ls", "--json"]);
        if (r.code === 0) next = (JSON.parse(r.stdout).machines ?? []).filter((m) => !m.temporary);
      } catch {}
      // The same list every 15 s is not a reason to redraw the sidebar.
      if (JSON.stringify(next) === JSON.stringify(this.machines)) return;
      this.machines = next;
      cx.notify();
    });
  }

  rebuilt(machine) {
    return machine?.state === "unreachable" && /^a different core answers there \("[^"]+"\)$/.test(machine.why ?? "");
  }

  reconnect(machine, cx) {
    const name = machine.name;
    if (this.reconnecting[name]?.busy) return;
    const state = this.reconnecting[name] ??= { machine, removed: false };
    state.busy = true;
    state.error = null;
    localStorage.setItem("likeme.machines.reconnecting", JSON.stringify(this.reconnecting));
    cx.notify();
    cx.spawn(async cx => {
      try {
        const ask = async args => {
          const r = await hc([...args, "--json"]);
          if (r.code !== 0) {
            let error;
            try { error = JSON.parse(r.stdout || r.stderr).error?.message; } catch {}
            throw new Error(error || r.stderr || r.stdout || "Couldn't connect.");
          }
        };
        if (!state.removed) {
          await ask(["machine", "rm", name]);
          state.removed = true;
          localStorage.setItem("likeme.machines.reconnecting", JSON.stringify(this.reconnecting));
        }
        const args = ["machine", "add"];
        if (machine.via) args.push("--via", machine.target);
        else args.push(machine.target);
        args.push("--name", name);
        if (machine.session) args.push("--session", machine.session);
        if (machine.temporary) args.push("--temp");
        await ask(args);
        this.folded.delete(name);
        localStorage.setItem("likeme.machines.folded", JSON.stringify([...this.folded]));
        delete this.reconnecting[name];
      } catch (e) {
        state.error = String(e.message ?? e);
        state.busy = false;
      }
      localStorage.setItem("likeme.machines.reconnecting", JSON.stringify(this.reconnecting));
      this.refreshMachines(cx);
      cx.notify();
    });
  }

  // One look at a time, each place once however often it was asked for meanwhile.
  // Places are looked at a few at a time: a slow one (another machine, a big
  // repo) no longer holds every later one behind it.
  refreshGit(keys, cx) {
    for (const k of keys) this.pending.add(k);
    if (this.refreshing) return;
    this.refreshing = true;
    this.gitDirty = false;
    cx.spawn(async (cx) => {
      while (this.pending.size) {
        const queue = [...this.pending];
        this.pending.clear();
        const worker = async () => {
          while (queue.length) await this.check(queue.shift(), cx);
        };
        await Promise.all(Array.from({ length: Math.min(4, queue.length) }, () => worker()));
      }
      const used = new Set();
      for (const g of Object.values(this.git)) if (g && !machineOf(g.repo)) used.add(cwdOf(g.repo));
      for (const repo of this.watching) if (!used.has(repo)) this.watching.delete(repo);
      this.refreshing = false;
      // A fallback look that found nothing new must not repaint the sidebar.
      if (this.gitDirty) cx.notify();
    });
  }

  // One place's git: branch, ahead/behind, its repo.
  async check(key, cx) {
    const on = machineOf(key), cwd = cwdOf(key);
    this.checked[key] = Date.now();
    this.unsure.delete(key);
    try {
      // No optional locks: a status that touched the index would wake the watch again.
      // Writes nothing under .git (index lock, fsmonitor cookie): watch() would wake on it.
      // Only the branch lines are read, so untracked files and rename detection
      // are pure work: `-uno --no-renames` skips both.
      // The two reads are independent: start the repo-name lookup alongside the
      // status scan instead of waiting for it. A path that is not a repo pays for
      // one extra process once; every real repo saves a round trip.
      const [r, rp] = await Promise.all([
        exec("git", ["--no-optional-locks", "-c", "core.fsmonitor=false", "status", "--porcelain=v2", "--branch", "-uno", "--no-renames"], { cwd, on }),
        exec("git", ["rev-parse", "--path-format=absolute", "--show-toplevel", "--git-common-dir"], { cwd, on }),
      ]);
      if (r.code !== 0) {
        // Only git's own "no" is remembered as no repo; anything else is asked again.
        if (!/not a git repository/i.test(r.stderr)) this.unsure.add(key);
        // A first answer — even "no repo" — is what lets `ordered` show the
        // space, so it has to reach a render; an unchanged null does not.
        if (this.git[key] !== null) this.gitDirty = true;
        this.git[key] = null;
        return;
      }
      // The repo's own .git folder names it; a worktree's top differs from it.
      // Both answers in one process.
      const [topOut, repoOut] = rp.stdout.split("\n");
      if (rp.code !== 0 || !topOut || !repoOut) throw new Error("rev-parse");
      const top = topOut.trim(), repo = repoOut.trim();
      const name = repo.endsWith("/.git") ? base(repo.slice(0, -5)) : base(repo).replace(/\.git$/, "");
      const info = { name, branch: null, ahead: 0, behind: 0, repo: keyOf(on, repo), linked: repo !== `${top}/.git` };
      for (const line of r.stdout.split("\n")) {
        if (line.startsWith("# branch.head ")) info.branch = line.slice(14);
        else if (line.startsWith("# branch.ab ")) {
          const [a, b] = line.slice(12).split(" ");
          info.ahead = Math.abs(parseInt(a, 10)) || 0;
          info.behind = Math.abs(parseInt(b, 10)) || 0;
        }
      }
      if (!sameGit(this.git[key], info)) this.gitDirty = true;
      this.git[key] = info;
      if (!on) this.watch(repo, cx);
    } catch {
      // Couldn't ask (the machine is away): keep what it showed, look again later.
      // The first failed look still counts as "known", so the space can show.
      if (!(key in this.git)) {
        this.git[key] = null;
        this.gitDirty = true;
      }
      this.unsure.add(key);
    }
  }

  watch(repo, cx) {
    if (this.watching.has(repo)) return;
    this.watching.add(repo);
    cx.spawn(async (cx) => {
      try {
        while (this.watching.has(repo)) {
          await watchFolder(repo);
          const mine = keyOf(null, repo);
          if (this.watching.has(repo)) this.refreshGit(Object.keys(this.git).filter((k) => this.git[k]?.repo === mine), cx);
        }
      } catch { this.watching.delete(repo); }
    });
  }

  menu(w) {
    // A popup is as tall as its items; height is only the most.
    openOverlay({ mod: "menu", kind: "popup", width: 200, height: 260, props: { tab: "space", target: { id: w.id } } });
  }

  // Spaces in order, each worktree space moved under its main checkout's.
  // `sp` and `ps` are the render's snapshots: every host read copies the list.
  ordered(sp, ps) {
    const ready = (w) => this.shown.has(w.id) || where(w, ps) in this.git || Date.now() - (this.born[w.id] ??= Date.now()) > 1500;
    for (const w of sp) if (!this.shown.has(w.id) && ready(w)) this.shown.add(w.id);
    const list = sp.map((w, i) => ({ w, i, g: this.git[where(w, ps)] ?? null })).filter((r) => this.shown.has(r.w.id));
    const mains = new Set(list.filter((r) => r.g && !r.g.linked).map((r) => r.g.repo));
    const nested = (r) => r.g?.linked && mains.has(r.g.repo);
    const out = [];
    const placed = new Set(); // repos whose worktrees are listed (under the first of its spaces)
    for (const r of list) {
      if (nested(r)) continue;
      out.push({ ...r, tree: null });
      if (!r.g || r.g.linked || placed.has(r.g.repo)) continue;
      placed.add(r.g.repo);
      const kids = list.filter((k) => nested(k) && k.g.repo === r.g.repo);
      kids.forEach((k, n) => out.push({ ...k, tree: n === kids.length - 1 ? "└─" : "├─" }));
    }
    return out;
  }

  // The rows, under a header per machine once one isn't this computer.
  grouped(t, sp, ps, ms, fillOf) {
    const rows = this.ordered(sp, ps);
    const draw = (r) => this.row(r, t, fillOf);
    const remote = [...new Set([...rows.map(r => r.w.machine).filter(Boolean), ...this.machines.map(m => m.name), ...Object.keys(this.reconnecting)])].sort();
    const stateByName = new Map(ms.map(k => [k.name, k]));
    const loading = m => {
      const layout = stateByName.get(m)?.layout;
      return layout === "loading" || (!layout && this.machines.some(k => k.name === m && k.state === "connected"))
        || sp.some(s => (s.machine ?? null) === m && !this.shown.has(s.id));
    };
    const loadingRow = m => h_flex().id(`machine-loading-${m ?? "local"}`).h(30).flex_none().px(8).gap(7).items_center().text_size(TYPE.small).text_color(t.dim)
      .child(div().text_size(12).text_color(t.muted).frames(["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"], 80))
      .child("Loading…");
    if (!remote.length) return loading(null) && !rows.length ? [loadingRow(null)] : rows.map(draw);
    const machineNames = [null, ...remote];
    return machineNames.flatMap((m) => {
      const mine = rows.filter((r) => (r.w.machine ?? null) === m);
      const repair = this.reconnecting[m];
      const machine = this.machines.find(k => k.name === m) ?? repair?.machine;
      const connected = !m || machine?.state === "connected";
      const rebuilt = this.rebuilt(machine) || !!repair;
      const folded = this.folded.has(m);
      const head = h_flex().id(`machine-${m ?? "local"}`).h(26).flex_none().px(8).gap(6).items_center().rounded(5).text_size(TYPE.label).font_semibold().text_color(t.muted)
        .cursor_pointer().hover(s => s.bg(withAlpha(t.foreground, UI.hover)).text_color(t.muted))
        .on_click((_e, cx) => {
          folded ? this.folded.delete(m) : this.folded.add(m);
          localStorage.setItem("likeme.machines.folded", JSON.stringify([...this.folded]));
          cx.notify();
        })
        .child(svg(`mods/workspace-chrome/${m ? "server" : "monitor"}.svg`).size(11).flex_none())
        .child(div().flex_1().truncate().child((m ?? "This computer").toUpperCase())
          .when(!connected && !rebuilt, el => el.child(div().flex_none().text_color(t.dim).child((machine?.state ?? "asleep").replace(/_/g, " "))))
          .when(rebuilt, el => el.child(h_flex().flex_none().gap(3).items_center()
            .child(div().max_w(140).truncate().child(repair?.error || "rebuilt ·"))
            .child(div().id(`machine-connect-${m}`).text_color(repair?.error ? t.blocked : t.muted)
              .hover(s => s.text_color(t.foreground))
              .tooltip(repair?.error || "This machine was rebuilt or replaced. Click to connect to the new one.")
              .on_click((_e, cx) => { cx.stop_propagation(); this.reconnect(machine, cx); })
              .child(repair?.busy ? "Connecting…" : "Connect"))))
          .when(connected, el => el.child(div().id(`machine-add-${m ?? "local"}`).flex_none().px(3).rounded(3).hover(s => s.bg(withAlpha(t.foreground, UI.hover)).text_color(t.foreground))
            .on_click((_e, cx) => { cx.stop_propagation(); run("space.new", { machine: m ?? "" }); }).child("+")))
          .child(div().size(5).rounded_full().flex_none().bg(connected ? t.ansi2 : t.dim))
          .child(svg(`mods/workspace-chrome/chevron-${folded ? "right" : "down"}.svg`).size(10).flex_none()));
      const empty = h_flex().id(`machine-new-${m ?? "local"}`).h(32).flex_none().px(8).gap(7).items_center().rounded(6)
        .text_size(TYPE.small).text_color(t.dim).hover(s => s.bg(withAlpha(t.foreground, UI.hover)).text_color(t.foreground))
        .on_click(() => run("space.new", { machine: m ?? "" }))
        .child(div().w(24).flex_none().flex().items_center().justify_center().child(svg("mods/workspace-chrome/plus.svg").size(11)))
        .child("New space there");
      if (rebuilt) return [head];
      return [head, ...(folded ? [] : mine.length ? mine.map(draw) : [loading(m) ? loadingRow(m) : empty])];
    });
  }

  row({ w, i, g, tree }, t, fillOf) {
    const on = w.active;
    const fill = fillOf(w.id);
    // A flat row on the graphite: selection is a slightly stronger neutral
    // fill, and the space's own mark wakes up — its monogram turns solid and
    // its branch glyph takes the colour. Resting rows keep the colour only in
    // an outlined monogram, so the sidebar stays quiet while every space keeps
    // an identity that survives its tab being closed.
    return v_flex()
      .relative()
      .id(`space-${w.id}`)
      .px(8)
      .h(rowHeight({ tree }))
      .cursor_pointer().tooltip(w.name)
      .flex_none()
      .justify_center()
      .rounded(SIZE.radius)
      .when(on, (el) => el.bg(withAlpha(t.foreground, UI.active)))
      .when(!on, (el) => el.hover((s) => s.bg(withAlpha(t.foreground, UI.hover))))
      .when(this.pressed === i && this.over !== i, (el) => el.opacity(0.45))
      .when(this.pressed !== null && this.over === i && this.pressed !== i, (el) => el.child(
        div().absolute().left(4).right(4).h(2).rounded(1).bg(t.accent)
          .when(this.pressed < i, line => line.bottom(0))
          .when(this.pressed > i, line => line.top(0)),
      ))
      .on_mouse_down("left", () => {
        this.pressed = i;
        this.over = i;
      })
      .on_mouse_move((_e, cx) => {
        const source = spaces()[this.pressed];
        const over = source && (source.machine ?? null) === (w.machine ?? null) ? i : null;
        if (this.pressed !== null && this.over !== over) {
          this.over = over;
          cx.notify();
        }
      })
      .on_mouse_up("left", (_e, cx) => {
        const from = this.pressed;
        const over = this.over;
        this.pressed = null;
        this.over = null;
        const source = from === null ? null : spaces()[from];
        if (source && over === i && from !== i) run("space.move", { id: source.id, index: i + 1 });
        else if (from === i) run("space.select", { id: w.id });
        cx.notify();
      })
      .on_mouse_down("right", () => this.menu(w))
      .child(
        h_flex()
          .gap(8)
          .items_center()
          .size_full()
          .when(Boolean(tree), el => el
            .child(
              // A real tree: the vertical line runs under the checkout's
              // monogram, the last worktree turns into the row.
              div().ml(2).w(8).flex_none().border_l(1).border_color(withAlpha(t.foreground, "1c"))
                .when(tree === "└─", d => d.h(19).self_start().border_b(1).rounded_bl(5))
                .when(tree !== "└─", d => d.self_stretch()),
            )
            .child(svg("mods/workspace-chrome/branch.svg").size(14).text_color(on ? fill : t.muted)))
          .when(!tree, el => el.child(h_flex().size(SIZE.mark).flex_none().rounded(SIZE.radius).border(1)
            .bg(on ? fill : withAlpha(fill, UI.tint))
            .border_color(on ? fill : withAlpha(fill, UI.tintEdge))
            .items_center().justify_center().text_size(11).font_semibold()
            .text_color(on ? markInk(fill) : fill)
            .child([...w.name][0]?.toUpperCase() ?? "?")))
          // Left: the mark. Right: the project name over its branch.
          .child(
            v_flex()
              .flex_1()
              .min_w(0)
              .gap(1)
              .child(div().min_w(0).truncate().text_size(TYPE.body).line_height("15px")
                .font_weight(on ? 600 : 500).text_color(t.foreground).child(w.name))
              .when(Boolean(g), el => el.child(
                h_flex()
                  .min_w(0)
                  .items_center()
                  .gap(4)
                  .text_size(TYPE.meta)
                  .line_height("14px")
                  .text_color(t.muted)
                  .child(svg("mods/workspace-chrome/branch.svg").size(10).flex_none().text_color(t.dim))
                  .child(div().min_w(0).truncate().child(g.branch ?? "detached"))
                  .when(g.ahead > 0, el => el.child(div().flex_none().text_color(t.ansi2).child(`↑${g.ahead}`)))
                  .when(g.behind > 0, el => el.child(div().flex_none().text_color(t.ansi1).child(`↓${g.behind}`))),
              )),
          ),
      );
  }

  // A quiet action at the end of the list, not a card: it reads as the next
  // thing to do rather than as another space.
  ghost(t) {
    return h_flex().id("space-new-hint").h(32).flex_none().px(8).gap(8).rounded(SIZE.radius)
      .text_size(TYPE.small).text_color(t.muted).items_center().cursor_pointer()
      .hover(s => s.bg(withAlpha(t.foreground, UI.hover)).text_color(t.foreground))
      .on_click(() => run("space.new"))
      .child(h_flex().size(SIZE.mark).flex_none().items_center().justify_center().child(svg("mods/workspace-chrome/plus.svg").size(12)))
      .child("New space");
  }

  render() {
    const t = theme();
    // One read of each host list per render: every read copies the whole list
    // into JS, and the row helpers used to read them again per space.
    const sp = spaces();
    const ps = sp.length ? panes() : [];
    const ms = machines();
    const colors = shared("space.colors") ?? {};
    // One colour lookup per hue, not one regex per row.
    const fills = new Map();
    const fillOf = (id) => {
      const color = colors[id] ?? "ansi6";
      let fill = fills.get(color);
      if (fill === undefined) {
        const raw = markColor(color, t) ?? t.muted;
        fill = raw ? raw.slice(0, 7) : null;
        fills.set(color, fill);
      }
      return fill;
    };
    const embedded = this.embedded;
    return v_flex().text_size(13)
      .when(!embedded, el => el.size_full().min_h(0).bg(t.chrome))
      .when(embedded, el => el.w_full().flex_none())
      .child(h_flex().h(SIZE.section).pl(16).pr(12).items_center().justify_between()
        .child(h_flex().gap(6).items_center()
          .child(div().text_size(TYPE.label).font_semibold().text_color(t.muted).child("SPACES"))
          .child(h_flex().min_w(18).h(16).px(5).rounded(5).items_center().justify_center()
            .bg(withAlpha(t.foreground, UI.subtle)).text_size(TYPE.label).text_color(t.muted).child(String(sp.length))))
        .child(div().id("space-new").size(SIZE.control).flex_none().flex().items_center().justify_center().rounded(5).cursor_pointer().tooltip("New space")
          .text_color(t.muted).hover(s => s.bg(withAlpha(t.foreground, UI.hover)).text_color(t.foreground))
          .on_click(() => run("space.new")).child(svg("mods/workspace-chrome/plus.svg").size(12))))
      .child(v_flex().px(SIZE.inset).pb(embedded ? 8 : 16).gap(3)
        .when(!embedded, el => el.flex_1().min_h(0).overflow_y_scrollbar().mode("hover"))
        .on_mouse_up("left", (_e, cx) => { this.pressed = null; cx.notify(); })
        .children([...this.grouped(t, sp, ps, ms, fillOf), this.ghost(t)]));
  }
}
