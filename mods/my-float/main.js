// A floating, tabbed file viewer over the work area. The panel is an overlay
// window with no host frame, so its tab row and editor run edge to edge; a
// layout floating block draws the collapsed button and stays alive, which is
// what lets Files hand it a file while the panel is closed.
import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex, Editor, EditorState } from "gpui-base";
import { theme, settings, props, shared, setShared, readTextFile, writeTextFile, openOverlay, closeOverlay } from "herdr";
import { markColor, selectedInk, withAlpha, syntaxColors, scmColors, UI, TYPE, SIZE } from "./colors.js";

// Same extension table and truncation cap as Files: a cut preview must stay
// read-only, because a save writes the whole file back.
const LANG = { ts: "js", tsx: "js", mts: "js", cts: "js", jsx: "js", mjs: "js", toml: "yaml", jsonc: "json", svelte: "html", vue: "html" };
const MAX_TEXT = 400000;
// A request older than this was left in shared.json by an earlier run.
const REQUEST_TTL = 30000;
const PANEL_KEY = "floating-files";

const stop = (_e, cx) => cx.stop_propagation();
const isAbsolute = (path) => /^([a-zA-Z]:[\\/]|\\\\|\/)/.test(path);
const tabKey = (tab) => `${tab.abs}\u0000${tab.on ?? ""}`;

function joined(root, path) {
  return `${String(root).replace(/[\\/]+$/, "")}/${String(path).replace(/^[\\/]+/, "")}`;
}

// The tab label is the file name; the header keeps the full directory, so two
// same-named files from different spaces stay distinguishable in the tooltip.
function splitPath(path) {
  const parts = String(path).replace(/\\/g, "/").split("/");
  const leaf = parts.pop() || String(path);
  return { leaf, dir: parts.length ? `${parts.join("/")}/` : "/" };
}

export default class FloatingFiles extends View {
  init(_props, cx) {
    const p = props() ?? {};
    this.role = p.role === "mini" ? "mini" : p.role === "miniPanel" ? "miniPanel" : "panel";
    // Element ids must stay unique per copy: a tab or button in one floating
    // file view must never land on another copy's state.
    this.uid = Math.random().toString(36).slice(2, 7);
    this.overlay = p.overlay ?? null;

    if (this.role === "mini") {
      // The coordinator is a layout floating block with no content of its own:
      // it opens the frameless panel and mini windows and is always alive.
      this.lastRequest = 0;
      this.opening = false;
      this.miniOpening = false;
      this.repositioning = false;
      this.vp = null;
      // No overlay window survives a restart. Keep the files, start collapsed;
      // close a mini a hot reload left behind so it reopens at the right place.
      cx.timer.after(0, () => {
        const miniId = shared("float.miniId");
        if (miniId) closeOverlay(miniId);
        if (shared("float.miniId") !== null) setShared("float.miniId", null);
        if (shared("float.open") !== false) setShared("float.open", false);
        if (shared("float.panel") !== false) setShared("float.panel", false);
        if (shared("float.mini") !== false) setShared("float.mini", false);
      });
      // An overlay window is not anchored by the host: watch the main window so
      // the mini reopens at the corner after a resize.
      cx.timer.every(500, (cx) => this.watchViewport(cx));
      return;
    }

    if (this.role === "miniPanel") {
      // The frameless mini window: its whole 40 px surface is our tile.
      if (!this.overlay) return;
      this.hovering = false;
      this.closing = false;
      if (shared("float.mini") !== true) setShared("float.mini", true);
      return;
    }

    // This copy is the panel overlay's content. A bare copy (the mod check, or
    // a layout that puts it in a block) has no overlay and must draw nothing.
    if (!this.overlay) return;

    this.tabs = this.restoreTabs();
    const state = shared("float.state");
    const active = state?.active;
    this.active = this.tabs.length ? Math.max(0, this.tabs.findIndex(tab => tabKey(tab) === active)) : -1;
    this.lastRequest = 0;
    this.requestScheduled = false;
    // Only the active tab keeps an editor: switching tabs saves the old text and
    // loads the new file, the same optimistic whole-file contract Files uses.
    this.loadSeq = 0;
    this.code = null;
    this.original = null;
    this.editable = false;
    this.dirty = false;
    this.saving = false;
    this.flushPromise = null;
    this.saveError = null;
    this.saveVersion = 0;
    this.loading = false;
    this.fileError = null;

    // The windows being up are the state the coordinator reads. A request that
    // opened this window adds (or selects) its file before the restored tab is
    // loaded, so the click lands on the file the person asked for.
    if (shared("float.panel") !== true) setShared("float.panel", true);
    if (shared("float.open") !== true) setShared("float.open", true);
    if (shared("float.mini") !== false) setShared("float.mini", false);
    this.consumeRequest(cx);
    if (this.active >= 0 && !this.loading) this.load(cx);
  }

  restoreTabs() {
    const state = shared("float.state");
    const saved = state && Array.isArray(state.tabs) ? state.tabs : [];
    return saved.filter(tab => tab && typeof tab.abs === "string").map((tab) => {
      const parts = splitPath(tab.abs);
      return {
        abs: tab.abs,
        on: tab.on ?? null,
        path: typeof tab.path === "string" ? tab.path : tab.abs,
        leaf: typeof tab.leaf === "string" ? tab.leaf : parts.leaf,
        dir: typeof tab.dir === "string" ? tab.dir : parts.dir,
        space: tab.space ?? null,
        spaceName: tab.spaceName ?? null,
      };
    });
  }

  // The tabs live in shared state, not in this window: closing the overlay must
  // not lose them. The mini button's count comes from the same list.
  persist() {
    setShared("float.state", {
      tabs: this.tabs.map(({ abs, on, path, leaf, dir, space, spaceName }) => ({ abs, on, path, leaf, dir, space, spaceName })),
      active: this.active >= 0 ? tabKey(this.tabs[this.active]) : null,
    });
  }

  // Files writes {root, path, on, space, at} through shared(); both the mini
  // block and the open panel watch it, so the request is never dropped.
  takePanelRequest(cx) {
    if (this.requestScheduled) return;
    const req = shared("float.request");
    if (!req || typeof req.at !== "number" || req.at === this.lastRequest) return;
    if (Date.now() - req.at > REQUEST_TTL) { this.lastRequest = req.at; return; }
    this.requestScheduled = true;
    // Mutating tabs and calling the host belong after the frame, not in render.
    cx.timer.after(0, (cx) => {
      this.requestScheduled = false;
      this.consumeRequest(cx);
    });
  }

  async consumeRequest(cx) {
    const req = shared("float.request");
    if (!req || typeof req.at !== "number" || req.at === this.lastRequest) return false;
    this.lastRequest = req.at;
    if (Date.now() - req.at > REQUEST_TTL) return false;
    await this.apply(req, cx);
    setShared("float.request", null);
    return true;
  }

  async apply(req, cx) {
    if (!req?.root || !req?.path) return;
    const abs = isAbsolute(req.path) ? String(req.path) : joined(req.root, req.path);
    const on = req.on ?? null;
    const existing = this.tabs.findIndex(tab => tab.abs === abs && (tab.on ?? null) === on);
    if (existing >= 0) {
      if (existing !== this.active || !this.code) {
        await this.flush(cx);
        this.release();
        this.active = existing;
        this.load(cx);
      }
    } else {
      const { leaf, dir } = splitPath(abs);
      await this.flush(cx);
      this.tabs.push({ abs, on, path: String(req.path), leaf, dir, space: req.space ?? null, spaceName: req.spaceName ?? null, icon: req.icon ?? null });
      this.release();
      this.active = this.tabs.length - 1;
      this.load(cx);
    }
    this.persist();
  }

  async select(index, cx) {
    if (index < 0 || index >= this.tabs.length) return;
    if (index === this.active && this.code) return;
    await this.flush(cx);
    this.release();
    this.active = index;
    this.load(cx);
    this.persist();
  }

  release() {
    this.code?.release();
    this.code = null;
    this.original = null;
    this.editable = false;
    this.dirty = false;
    this.saving = false;
    this.saveError = null;
    this.loading = false;
    this.fileError = null;
  }

  load(cx) {
    const tab = this.tabs[this.active];
    if (!tab) return;
    const seq = ++this.loadSeq;
    this.loading = true;
    this.fileError = null;
    cx.notify();
    cx.spawn(async cx => {
      let text = null, error = null;
      try {
        text = await readTextFile(tab.abs, { on: tab.on });
        if (text === null) error = "This file is no longer available";
        else if (text.includes("\0")) error = "Binary file · no text preview";
      } catch {
        error = "Cannot preview this file (binary, too large, or unreadable)";
      }
      // A newer tab switch, a close, or a reload owns the panel now.
      if (this.loadSeq !== seq || this.tabs[this.active] !== tab) return;
      this.loading = false;
      if (error) { this.fileError = error; cx.notify(); return; }
      const t = theme(), ext = tab.path.includes(".") ? tab.path.split(".").pop() : "txt";
      // writeTextFile is local-only, so a file from another machine stays a viewer.
      const editable = !tab.on && text.length <= MAX_TEXT;
      this.original = text;
      this.editable = editable;
      const state = EditorState.new({
        language: LANG[ext] ?? ext,
        readonly: !editable,
        value: editable ? text : text.slice(0, MAX_TEXT) + "\n… (file truncated)",
        font_family: settings().font_family,
        font_size: 12,
        syntax: syntaxColors(t),
      });
      this.code = state;
      if (editable) {
        // Coalesce keystrokes into one save after a pause, plus one on blur,
        // submit, tab switch and close — the same rhythm as Files.
        state.on("change", (_e, cx) => {
          if (this.code !== state) return;
          // Getting focus can report a change with the same text: not an edit.
          if (state.value() === this.original) {
            if (!this.dirty) return;
            this.dirty = false; this.saveVersion++; cx.notify();
            return;
          }
          const wasDirty = this.dirty;
          this.dirty = true;
          const version = ++this.saveVersion;
          if (!wasDirty) cx.notify();
          cx.timer.after(700, cx => {
            if (this.code === state && this.saveVersion === version) this.flush(cx);
          });
        });
        state.on("blur", (_e, cx) => { if (this.code === state) this.flush(cx); });
        state.on("submit", (_e, cx) => { if (this.code === state) this.flush(cx); });
      }
      cx.notify();
    });
  }

  // One write at a time, and the caller may wait for it. A close or collapse
  // awaits this, because the overlay's tasks are cancelled with its window.
  flush(cx) {
    if (this.flushPromise) return this.flushPromise;
    this.flushPromise = (async () => {
      const tab = this.tabs[this.active], code = this.code;
      if (!tab || !code || !this.editable || !this.dirty) return;
      this.saving = true;
      this.saveError = null;
      cx.notify();
      try {
        // Keep writing if the person typed while the first write was out.
        while (this.dirty && this.code === code) {
          const text = code.value(), expected = this.original;
          this.dirty = false;
          try {
            await writeTextFile(tab.abs, text, expected);
            this.original = text;
            if (code.value() !== text) this.dirty = true;
          } catch {
            this.dirty = true;
            this.saveError = "Save failed — the file changed on disk";
            break;
          }
        }
      } finally {
        this.saving = false;
        cx.notify();
      }
    })().finally(() => { this.flushPromise = null; });
    return this.flushPromise;
  }

  async closeTab(index, cx) {
    if (index < 0 || index >= this.tabs.length) return;
    const wasActive = index === this.active;
    if (wasActive) {
      await this.flush(cx);
      this.release();
    }
    this.tabs.splice(index, 1);
    if (!this.tabs.length) {
      this.active = -1;
      this.persist();
      await this.collapse(cx);
      return;
    }
    if (index < this.active) this.active--;
    else if (wasActive) {
      this.active = Math.min(index, this.tabs.length - 1);
      this.load(cx);
    }
    this.persist();
    cx.notify();
  }

  async collapse(cx) {
    await this.flush(cx);
    this.persist();
    if (shared("float.open") !== false) setShared("float.open", false);
    if (shared("float.panel") !== false) setShared("float.panel", false);
    if (shared("float.mini") !== false) setShared("float.mini", false);
    if (this.overlay) closeOverlay(this.overlay);
    else cx.notify();
  }

  // A window closed by a layout switch still keeps its edit and its tab list.
  async close(cx) {
    if (this.role === "miniPanel") {
      if (shared("float.mini") !== false) setShared("float.mini", false);
      return;
    }
    if (this.role !== "panel" || !this.overlay) return;
    await this.flush(cx);
    this.persist();
    if (shared("float.open") !== false) setShared("float.open", false);
    if (shared("float.panel") !== false) setShared("float.panel", false);
    if (shared("float.mini") !== false) setShared("float.mini", false);
  }

  tabTip(tab) {
    return `${tab.abs}${tab.spaceName ? `\n${tab.spaceName}` : ""}`;
  }

  tabPill(tab, index, t, colors) {
    const active = index === this.active;
    const raw = markColor(colors[tab.space], t);
    const dot = raw ?? t.accent ?? t.muted;
    const ink = selectedInk(t);
    return h_flex().id(`float-tab-${this.uid}-${tab.id ?? index}`).h(26).flex_none().rounded(6).px(8).gap(6).items_center()
      .text_size(TYPE.meta).cursor_pointer()
      .when(active, el => el.bg(t.selected).text_color(ink))
      .when(!active, el => el.text_color(t.muted).hover(s => s.bg(t.hover).text_color(t.foreground)))
      .on_mouse_down("left", stop)
      .on_click((_e, cx) => this.select(index, cx))
      .child(div().size(5).flex_none().rounded_full().bg(active ? dot : withAlpha(dot, UI.dotSoft)))
      .child(div().max_w(180).truncate().tooltip(this.tabTip(tab)).child(tab.leaf))
      .child(div().id(`float-close-${this.uid}-${index}`).size(14).flex().flex_none().items_center().justify_center().rounded(3)
        .text_color(active ? ink : t.muted).opacity(active ? 0.7 : 0.4).tooltip("Close file")
        .hover(s => s.bg(withAlpha(t.blocked, UI.hover)).text_color(t.blocked).opacity(1))
        .on_mouse_down("left", stop)
        .on_click((_e, cx) => { cx.stop_propagation(); this.closeTab(index, cx); })
        .child(svg("mods/pane/close.svg").size(10)));
  }

  status(tab, t) {
    if (this.loading) return div().w(76).flex_none().text_size(TYPE.meta).text_color(t.muted).child("Loading…");
    if (this.fileError) return div().w(76).flex_none();
    if (!this.editable) return div().w(76).flex_none().text_size(TYPE.meta).text_color(t.muted)
      .tooltip(tab.on ? `Read-only on ${tab.on}` : "Read-only").child("Read-only");
    return h_flex().w(76).flex_none().gap(5).items_center().text_size(TYPE.meta)
      .text_color(this.saveError ? t.blocked : t.muted)
      .when(this.dirty, e => e.cursor_pointer().hover(s => s.text_color(t.foreground)))
      .when(Boolean(this.saveError), e => e.tooltip(this.saveError))
      .on_mouse_down("left", stop)
      .on_click((_e, cx) => this.flush(cx))
      .child(div().size(4).flex_none().rounded_full().bg(this.saveError ? t.blocked : this.dirty || this.saving ? t.working : withAlpha(scmColors(t).added, UI.dotSoft)))
      .child(this.saveError ? "Save failed" : this.saving ? "Saving…" : this.dirty ? "Save" : "Saved");
  }

  empty(tab, t) {
    return v_flex().flex_1().min_w(0).p(24).items_center().justify_center().gap(8)
      .child(h_flex().size(40).mb(4).flex_none().items_center().justify_center().rounded(12).bg(withAlpha(t.foreground, UI.subtle))
        .child(svg("mods/my-files/file.svg").size(18).text_color(t.muted)))
      .child(div().text_size(TYPE.body).font_weight(500).text_color(t.foreground).child(tab ? "Select a file" : "No floating file"))
      .child(div().text_size(TYPE.meta).text_center().text_color(t.muted).child("Open a file in Files, then use the floating button."));
  }

  panel(t) {
    const tab = this.tabs[this.active] ?? null;
    const colors = shared("space.colors") ?? {};
    const tint = tab ? (markColor(colors[tab.space], t) ?? t.accent ?? t.muted) : (t.accent ?? t.muted);

    const strip = h_flex().id(`float-strip-${this.uid}`).h(34).flex_none().items_center()
      .bg(withAlpha(t.foreground, UI.subtle))
      .border_b(1).border_color(withAlpha(t.foreground, UI.lineSoft))
      .child(h_flex().id(`float-tabs-${this.uid}`).flex_1().min_w(0).h_full().items_center().gap(3).pl(6).pr(4)
        .overflow_x_scrollbar().mode("hover")
        .children(this.tabs.map((item, i) => this.tabPill(item, i, t, colors))))
      .child(div().id(`float-collapse-${this.uid}`).size(SIZE.control).flex_none().mr(6).flex().items_center().justify_center().rounded(5)
        .cursor_pointer().text_color(t.muted).tooltip("Collapse to the corner")
        .hover(s => s.bg(t.hover).text_color(t.foreground))
        .on_mouse_down("left", stop)
        .on_click((_e, cx) => this.collapse(cx))
        .child(svg("mods/my-files/chevron-down.svg").size(13)));

    const header = h_flex().h(32).flex_none().px(10).gap(8).items_center().bg(t.surface)
      .border_b(1).border_color(withAlpha(t.foreground, UI.lineSoft))
      .child(tab?.icon
        ? image(`mods/my-files/material/${tab.icon}.svg`).size(16).flex_none()
        : svg("mods/my-files/file.svg").size(16).flex_none().text_color(tint))
      .child(h_flex().flex_1().min_w(0).items_center()
        .when(Boolean(tab?.dir), el => el.child(div().min_w(0).truncate().text_size(TYPE.meta).text_color(t.muted).child(tab.dir)))
        .child(div().min_w(0).max_w(280).truncate().text_size(TYPE.small).font_weight(600).text_color(t.foreground)
          .tooltip(tab?.abs ?? "Floating files").child(tab?.leaf ?? "Floating files")))
      .when(Boolean(tab), el => el.child(this.status(tab, t)));

    const body = v_flex().flex_1().min_h(0).min_w(0).bg(t.background)
      .when(this.loading, el => el.child(div().p(12).text_size(TYPE.meta).text_color(t.dim).child("Loading file…")))
      .when(!this.loading && Boolean(this.fileError), el => el.child(div().p(12).text_size(TYPE.meta).text_color(t.dim).child(this.fileError)))
      // Selecting text in the editor must not drag the overlay window.
      .when(!this.loading && !this.fileError && Boolean(this.code), el => el.child(
        div().flex_1().min_h(0).on_mouse_down("left", stop).child(Editor.new(this.code).size_full())))
      .when(!this.loading && !this.fileError && !this.code, el => el.child(this.empty(tab, t)));

    // No host frame: the root is the panel itself, edge to edge, with only its
    // own border and rounded corners.
    return v_flex().id(`float-panel-${this.uid}`).size_full().min_w(0).min_h(0)
      .rounded(8).border(1).border_color(withAlpha(t.foreground, UI.line))
      .bg(t.background).overflow_hidden()
      .child(strip)
      .child(header)
      .child(body);
  }

  // The mini is its own frameless window, so its 40 px surface is entirely our
  // tile: no host frame, no padding above or below.
  miniButton(t, count) {
    const setHover = (hovered, cx) => {
      if (this.hovering === hovered) return;
      this.hovering = hovered;
      cx.notify();
    };
    return v_flex().id(`float-mini-button-${this.uid}`).relative().size_full().items_center().justify_center()
      .rounded(9).border(1).border_color(withAlpha(t.foreground, UI.line))
      .bg(this.hovering ? t.hover : withAlpha(t.foreground, UI.subtle))
      .cursor_pointer()
      .tooltip(count === 1 ? "Floating file" : `${count} floating files`)
      .on_mouse_down("left", stop)
      .on_hover(setHover)
      .on_click((_e, cx) => this.openFromMini(cx))
      .child(svg("mods/my-float/float.svg").size(17).flex_none().text_color(t.muted))
      .child(div().absolute().top(3).right(3).h(13).min_w(13).rounded_full().px(3)
        .flex().items_center().justify_center().bg(t.accent).text_color(t.accent_foreground)
        .text_size(9).font_weight(600).child(String(count)));
  }

  // herdr's window() only carries platform facts; the size is on the shell's
  // global window, and this copy lives in the main window's layout.
  viewport() {
    try {
      const size = globalThis.window?.viewport_size?.() ?? null;
      return size ? { width: size.width, height: size.height } : null;
    } catch { return null; }
  }

  watchViewport(cx) {
    const vp = this.viewport();
    if (!vp) return;
    const changed = this.vp && (vp.width !== this.vp.width || vp.height !== this.vp.height);
    this.vp = { width: vp.width, height: vp.height };
    // The mini window is positioned by the host and would otherwise stay at the
    // old corner after the app window is resized.
    if (changed && shared("float.mini") === true) this.repositionMini(cx);
  }

  repositionMini(cx) {
    if (this.repositioning || shared("float.mini") !== true) return;
    this.repositioning = true;
    const id = shared("float.miniId");
    if (id) closeOverlay(id);
    if (shared("float.mini") !== false) setShared("float.mini", false);
    // Let the old window's close settle before the new one takes the corner.
    cx.timer.after(30, (cx) => {
      this.repositioning = false;
      this.openMini(cx);
      cx.notify();
    });
  }

  miniSpec() {
    const vp = this.viewport() ?? { width: 1200, height: 800 };
    const size = 40;
    return {
      mod: "my-float",
      props: { role: "miniPanel" },
      kind: "window",
      frame: "none",
      width: size,
      height: size,
      at: { x: Math.max(12, vp.width - size - 12), y: Math.max(12, vp.height - size - 12) },
    };
  }

  openMini(cx) {
    if (this.miniOpening) return;
    if (shared("float.open") === true || shared("float.mini") === true) return;
    this.miniOpening = true;
    setShared("float.mini", true);
    const id = openOverlay(this.miniSpec());
    if (id && shared("float.miniId") !== id) setShared("float.miniId", id);
    cx.timer.after(0, (cx) => { this.miniOpening = false; cx.notify(); });
  }

  panelSpec() {
    const vp = this.viewport() ?? { width: 1200, height: 800 };
    const width = Math.max(380, Math.min(760, vp.width - 48));
    const height = Math.max(240, Math.min(520, vp.height - 72));
    return {
      mod: "my-float",
      props: { role: "panel" },
      kind: "window",
      frame: "none",
      key: PANEL_KEY,
      width,
      height,
      at: { x: Math.max(12, vp.width - width - 16), y: Math.max(12, vp.height - height - 16) },
    };
  }

  openPanel(cx) {
    if (this.opening) return;
    this.opening = true;
    if (shared("float.open") !== true) setShared("float.open", true);
    if (shared("float.panel") !== true) setShared("float.panel", true);
    if (shared("float.mini") !== false) setShared("float.mini", false);
    openOverlay(this.panelSpec());
    cx.timer.after(0, (cx) => { this.opening = false; cx.notify(); });
  }

  // The mini window only announces that it wants the panel; the coordinator
  // opens it, because only a layout copy can measure the main window.
  openFromMini(cx) {
    if (shared("float.open") !== true) setShared("float.open", true);
    if (shared("float.mini") !== false) setShared("float.mini", false);
    if (this.overlay) closeOverlay(this.overlay);
    cx.notify();
  }

  // The coordinator stays alive while the panel is closed, so it is the one that
  // opens the windows when Files (or the mini itself) asks for them.
  takeMiniRequest(cx) {
    const req = shared("float.request");
    if (!req || typeof req.at !== "number" || req.at === this.lastRequest) return;
    this.lastRequest = req.at;
    if (Date.now() - req.at > REQUEST_TTL) return;
    if (shared("float.panel") === true) return;
    cx.timer.after(0, (cx) => this.openPanel(cx));
  }

  render(cx) {
    const t = theme();
    if (this.role === "mini") {
      // The coordinator has no content of its own. It watches requests and keeps
      // the frameless mini window up whenever the panel is closed.
      this.takeMiniRequest(cx);
      const state = shared("float.state");
      const count = state && Array.isArray(state.tabs) ? state.tabs.length : 0;
      // The mini asked for the panel by setting float.open. The coordinator owns
      // the panel spec, so its size and place are measured in this window.
      if (shared("float.open") === true && shared("float.panel") !== true && !this.opening) {
        cx.timer.after(0, (cx) => {
          if (shared("float.open") === true && shared("float.panel") !== true) this.openPanel(cx);
        });
      }
      if (shared("float.open") !== true && count > 0 && shared("float.mini") !== true && !this.repositioning) {
        cx.timer.after(0, (cx) => this.openMini(cx));
      }
      return div();
    }
    if (this.role === "miniPanel") {
      if (!this.overlay) return div();
      if (shared("float.open") === true) {
        // The panel opened over us (a Files request or the coordinator): go away.
        if (!this.closing) {
          this.closing = true;
          cx.timer.after(0, (cx) => {
            this.closing = false;
            if (shared("float.mini") !== false) setShared("float.mini", false);
            closeOverlay(this.overlay);
          });
        }
        return div();
      }
      const state = shared("float.state");
      const count = state && Array.isArray(state.tabs) ? state.tabs.length : 0;
      return this.miniButton(t, count);
    }
    if (!this.overlay) return div();
    this.takePanelRequest(cx);
    return this.panel(t);
  }
}
