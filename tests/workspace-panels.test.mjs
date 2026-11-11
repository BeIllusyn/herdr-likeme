import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { changeColor, markColor, markInk, withAlpha, UI, TYPE, SIZE } from "../mods/my-sidebar/colors.js";

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

// 只替换宿主导入；事件处理、布局切换和目录选择仍执行实际 Mod 源码。
function load(file, exports, host) {
  const source = read(file).replace(/^import .*;\n/gm, "").replace("export default class ", "class ");
  return runInNewContext(`${source}\n;({ ${exports} });`, { View: class {}, ...host }, { filename: file });
}

function element() {
  const node = { nodes: [], handlers: {}, styles: {} };
  const el = new Proxy(node, {
    get(target, key) {
      if (key in target) return target[key];
      return (...args) => {
        if (key === "child") target.nodes.push(args[0]);
        else if (key === "children") target.nodes.push(...args[0]);
        else if (key === "id") target.key = args[0];
        else if (key === "when") { if (args[0]) args[1](el); }
        else if (key.startsWith("on_")) target.handlers[`${key}${typeof args[0] === "string" ? `:${args[0]}` : ""}`] = args.at(-1);
        else target.styles[key] = args[0];
        return el;
      };
    },
  });
  return el;
}

function find(root, id) {
  if (root?.key === id) return root;
  for (const child of root?.nodes ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
}

function fixture({ legacy = false } = {}) {
  const layout = JSON.parse(read("layouts/likeme.json"));
  const body = layout.children.find(n => n.id === "work").children.find(n => n.id === "work-body");
  const tabs = [{ id: "one", name: "1", active: true }, { id: "two", name: "2", active: false }];
  const panes = tabs.map(tab => ({ tab: tab.id, pane: `pane-${tab.id}`, terminal: `terminal-${tab.id}`, cwd: `/project/${tab.id}` }));
  if (legacy) for (const id of ["files", "changes"]) {
    tabs.splice(1, 0, { id, name: id, active: false });
    panes.push({ tab: id, pane: `pane-${id}`, terminal: null, mod: `my-${id}` });
  }
  const space = { id: "space", active: true, folder: "/project", machine: null, tabs };
  const commands = [], timers = [];
  const cx = { stop_propagation() {}, notify() {}, timer: { after: (_ms, fn) => timers.push(fn) } };
  const host = {
    div: element, svg: element, image: element, h_flex: element,
    spaces: () => [space], panes: () => panes, layout: () => layout,
    focused: () => {
      const tab = tabs.find(t => t.active);
      const pane = panes.find(p => p.tab === tab?.id);
      return { space: space.id, tab: tab?.id, pane: pane?.pane, cwd: pane?.cwd };
    },
    theme: () => ({ raised: "#222222", muted: "#999999", foreground: "#ffffff", chrome: "#111111" }),
    window: () => ({ platform: "macos", titlebar: "none" }),
    settings: () => ({ zoom: 1 }), shared: () => undefined,
    // The tab bar imports these from colors.js; the loader strips imports, so
    // the fixture hands the mod the real tokens.
    markColor, withAlpha, UI, TYPE, SIZE,
    openOverlay: spec => commands.push({ name: "overlay", args: spec }),
    run(name, args) {
      commands.push({ name, args: JSON.parse(JSON.stringify(args)) });
      if (name === "layout.select") body.active = args.child;
      if (name === "tab.select") for (const tab of tabs) tab.active = tab.id === args.id;
    },
  };
  const { Tabs } = load("mods/my-tabs/main.js", "Tabs", host);
  const view = new Tabs();
  view.init();
  const render = () => view.render(cx);
  const click = (id, root = render()) => find(root, id).handlers.on_click({}, cx);
  return { body, tabs, panes, space, host, commands, timers, cx, view, render, click };
}

test("窄窗口收起工具文字，入口仍可点击，跨过宽度阈值时才重绘", () => {
  const f = fixture();
  let redraws = 0;
  const cx = { ...f.cx, notify: () => redraws++ };
  const resize = f.render().handlers.on_size_change;
  resize({ width: 600 }, cx);
  const compact = f.render();
  assert.ok(!find(compact, "panel-files").nodes.includes("Files"));
  assert.equal(find(compact, "panel-files").styles.tooltip, "Files");
  f.click("panel-files", compact);
  assert.equal(f.body.active, "files");
  resize({ width: 620 }, cx);
  assert.equal(redraws, 1);
  resize({ width: 900 }, cx);
  assert.ok(find(f.render(), "panel-files").nodes.includes("Files"));
  assert.equal(redraws, 2);
});

test("空间标记在明暗底色上自动选择可读的文字颜色", () => {
  assert.equal(markInk("#ffffff"), "#101114");
  assert.equal(markInk("#56b6c2"), "#101114");
  assert.equal(markInk("#101114"), "#ffffff");
  assert.equal(markInk("#243764"), "#ffffff");
  // A stored ANSI name resolves through the fallback table before it is read.
  assert.equal(markInk("ansi6"), "#101114");
  assert.equal(markInk(null), "#101114");
});

test("空间与改动状态共用一套可辨识的颜色", () => {
  const t = { ansi1: "#red", ansi2: "#green", ansi3: "#sand", ansi5: "#mauve", muted: "#muted" };
  assert.equal(changeColor("A", t), "#green");
  assert.equal(changeColor("D", t), "#red");
  assert.equal(changeColor("U", t), "#mauve");
  assert.equal(changeColor("M", t), "#sand");
  assert.equal(changeColor("?", t), "#sand");
  assert.equal(changeColor("A", { muted: "#muted" }), "#muted");
});

test("中性刻度逐级增强，线条分为三档", () => {
  const a = (step) => parseInt(step, 16);
  assert.ok(a(UI.subtle) < a(UI.hover));
  assert.ok(a(UI.hover) < a(UI.active));
  assert.ok(a(UI.lineSoft) < a(UI.field));
  assert.ok(a(UI.field) < a(UI.line));
});

test("Files 和 Changes 固定在标签栏右侧，只显示一次，布局不含额外工具 Tab", () => {
  const f = fixture(), root = f.render();
  assert.equal(f.body.type, "stack");
  assert.deepEqual(f.body.children.map(n => n.id), ["main", "files", "changes"]);
  assert.ok(f.body.children.filter(n => n.id !== "main").every(n => n.content.props.workspace));
  assert.deepEqual(find(root, "tab-scroll").nodes.map(n => n.key), [
    "tab-one", "tab-two", "tab-new", "tab-launches",
  ]);
  assert.deepEqual(find(root, "tab-launches").nodes.map(n => n.key), [
    "start-claude", "start-pi", "start-lazygit", "start-nvim",
  ]);
  // 两个入口不在滚动区内，而是作为标签栏的最后一段固定在最右侧。
  assert.deepEqual(find(root, "tab-panels").nodes.map(n => n.key), ["panel-files", "panel-changes"]);
  assert.deepEqual(root.nodes.map(n => n.key), ["tab-scroll", "tab-panels"]);
  assert.equal(root.nodes.length, 2);
});

test("连续点击和切换工具只选择工作区视图，不增加或关闭 Tab", () => {
  const f = fixture(), root = f.render();
  f.click("panel-files", root);
  assert.equal(f.body.active, "files");
  f.click("panel-files", root);
  assert.equal(f.body.active, "main");
  f.click("panel-files");
  f.click("panel-changes");
  assert.equal(f.body.active, "changes");
  assert.equal(f.tabs.length, 2);
  assert.ok(f.commands.every(c => c.name === "layout.select"));
  // The panel and the active tab share the neutral selection step; the panel
  // button is readable on its own fill, and neither borrows the space colour.
  const panelEl = find(f.render(), "panel-changes");
  const tabEl = find(f.render(), "tab-one");
  const panelBg = panelEl?.styles?.bg ?? "";
  const tabBg = tabEl?.styles?.bg ?? "";
  assert.equal(panelBg, withAlpha("#ffffff", UI.active));
  // While a tool view is open no tab carries the selection.
  assert.equal(tabBg, "");
});

test("点击当前普通 Tab 也会退出工具视图", () => {
  const f = fixture();
  f.click("panel-files");
  const tab = find(f.render(), "tab-one");
  tab.handlers["on_mouse_down:left"]({ click_count: 1 }, f.cx);
  tab.handlers["on_mouse_up:left"]({}, f.cx);
  assert.equal(f.body.active, "main");
  assert.deepEqual(f.commands.at(-1), { name: "tab.select", args: { id: "one" } });
});

test("快捷键或侧栏切换终端后退出工具视图，渲染中不直接执行命令", () => {
  const f = fixture();
  f.click("panel-files");
  f.tabs[0].active = false;
  f.tabs[1].active = true;
  const count = f.commands.length;
  f.render();
  assert.equal(f.commands.length, count);
  for (const timer of f.timers) timer(f.cx);
  assert.equal(f.body.active, "main");
});

test("同一 Tab 内切换到另一个 pane 后也返回终端", () => {
  const f = fixture();
  f.click("panel-files");
  f.panes[0].pane = "another-pane";
  f.render();
  for (const timer of f.timers) timer(f.cx);
  assert.equal(f.body.active, "main");
});

test("旧版工具 Tab 不再重复显示，固定入口复用其状态而不关闭它", () => {
  const f = fixture({ legacy: true });
  assert.equal(find(f.render(), "tab-files"), undefined);
  assert.equal(find(f.render(), "tab-changes"), undefined);
  f.click("panel-files");
  assert.equal(f.tabs.find(t => t.active).id, "files");
  f.click("panel-changes");
  assert.equal(f.tabs.find(t => t.active).id, "changes");
  f.click("panel-changes");
  assert.equal(f.tabs.find(t => t.active).id, "one");
  assert.equal(f.tabs.length, 4);
  assert.ok(f.commands.every(c => !["tab.new", "tab.close"].includes(c.name)));
});

test("过滤旧工具 Tab 后，拖动仍使用宿主列表中的正确位置", () => {
  const f = fixture({ legacy: true }), root = f.render();
  const first = find(root, "tab-one"), second = find(root, "tab-two");
  first.handlers["on_mouse_down:left"]({ click_count: 1 }, f.cx);
  second.handlers.on_mouse_move({}, f.cx);
  second.handlers["on_mouse_up:left"]({}, f.cx);
  assert.deepEqual(f.commands.at(-1), { name: "tab.move", args: { id: "one", index: 4 } });
});

test("加号保留菜单行为，快捷启动先返回终端再创建普通 Tab", () => {
  const f = fixture();
  f.click("panel-files");
  f.click("tab-new");
  assert.equal(f.commands.at(-1).args.mod, "new-menu");
  f.click("start-nvim");
  assert.equal(f.body.active, "main");
  assert.deepEqual(f.commands.at(-1), { name: "tab.new", args: { space: "space", argv: ["nvim"] } });
});

for (const [mod, name] of [["my-files", "Files"], ["my-changes", "Changes"]]) {
  test(`${name} 工作区视图跟随当前终端目录，旧独立实例仍保留自己的目录`, () => {
    const f = fixture();
    const { location } = load(`mods/${mod}/main.js`, `location, ${name}`, f.host);
    assert.equal(location("old-tab", "/old", true).cwd, "/project/one");
    assert.equal(location("old-tab", "/old"), null);
    f.space.machine = "remote";
    f.tabs[0].active = false;
    f.tabs[1].active = true;
    const next = location(null, null, true);
    assert.equal(next.cwd, "/project/two");
    assert.equal(next.on, "remote");
  });
}

test("Changes 把连续的新增/删除行归为一个变动块", () => {
  const { changeStarts } = load("mods/my-changes/main.js", "changeStarts", {});
  const rows = [
    { kind: "@" }, { kind: " " }, { kind: "-" }, { kind: "+" },
    { kind: " " }, { kind: "+" }, { kind: "@" }, { kind: "-" },
  ];
  assert.deepEqual(Array.from(changeStarts(rows)), [2, 5, 7]);
});

test("Changes 用整个文件作为 diff 上下文", async () => {
  const calls = [];
  const { Changes } = load("mods/my-changes/main.js", "Changes", {
    TYPE,
    exec: async (_cmd, args) => {
      calls.push(args);
      return { code: 0, stderr: "", stdout: "diff --git a/a b/a\n--- a/a\n+++ b/a\n@@ -1,2 +1,2 @@\n-old\n+new\n" };
    },
  });
  const changes = new Changes();
  Object.assign(changes, {
    files: [{ path: "a", status: "M", fresh: false, add: 1, del: 1 }],
    root: "/repo", on: null, hasHead: true, context: "ctx", open: "a", diffWidth: 0,
  });
  await changes.load("a", "ctx");
  assert.ok(calls[0].includes("-U1000000"));
  assert.deepEqual(Array.from(changes.rows, row => row.kind), ["@", "-", "+"]);
  assert.deepEqual(Array.from(changes.changes), [1]);
});

test("Files 把仓库里的绝对路径换算成自己树根下的相对路径", () => {
  const { relativePath } = load("mods/my-files/main.js", "relativePath", {});
  assert.equal(relativePath("/repo", "/repo/mods/a.js"), "mods/a.js");
  assert.equal(relativePath("/repo/", "/repo/a.js"), "a.js");
  assert.equal(relativePath("/repo/sub", "/repo/mods/a.js"), null);
  assert.equal(relativePath("C:\\repo", "C:/repo/a.js"), "a.js");
});

test("Files 把 diff 行配成变更前/后的两栏", () => {
  const { diffRows, diffPairs } = load("mods/my-files/main.js", "diffRows, diffPairs", {});
  const rows = diffRows(["@@ -1,3 +1,3 @@", " one", "-two", "+TWO", " three", "+extra"]);
  const pairs = diffPairs(rows);
  assert.equal(pairs.length, 4);
  assert.equal(pairs[0].left.text, "one");
  assert.equal(pairs[0].left.oldNumber, 1);
  assert.equal(pairs[0].right.newNumber, 1);
  assert.equal(pairs[1].left.text, "two");
  assert.equal(pairs[1].right.text, "TWO");
  assert.equal(pairs[2].left.text, "three");
  assert.equal(pairs[2].right.newNumber, 3);
  assert.equal(pairs[3].left, null);
  assert.equal(pairs[3].right.text, "extra");
});

test("Files 的对比模式读取整个文件的 diff", async () => {
  const calls = [];
  const { Files } = load("mods/my-files/main.js", "Files", {
    exec: async (_cmd, args) => {
      calls.push(args);
      if (args[0] === "rev-parse") return { code: 0, stdout: "abc", stderr: "" };
      return { code: 0, stderr: "", stdout: "@@ -1,1 +1,1 @@\n-a\n+b\n" };
    },
  });
  const tasks = [];
  const cx = { spawn: fn => tasks.push(fn), notify() {}, timer: { after() {}, every() {} } };
  const files = new Files();
  Object.assign(files, {
    root: "/repo", fileRoot: "/repo", file: "a.txt", gitTop: "/repo", on: null,
    context: "ctx", diffMode: true, marks: { "/repo/a.txt": "M" }, diffSeq: 0,
  });
  files.loadDiff(cx);
  await tasks[0](cx);
  assert.ok(calls.some(args => args.includes("-U1000000")));
  assert.equal(files.diffPairs.length, 1);
  assert.equal(files.diffPairs[0].left.text, "a");
  assert.equal(files.diffPairs[0].right.text, "b");
});

test("Files 的并排对比行给删除/新增半边着色", () => {
  const { Files } = load("mods/my-files/main.js", "Files", { div: element, h_flex: element, withAlpha, UI, TYPE, SIZE });
  const files = new Files();
  const theme = { ansi1: "#e06c75", ansi2: "#98c379", dim: "#999999", border: "#333333" };
  const row = files.compareRow({
    left: { kind: "-", oldNumber: 2, text: "old" },
    right: { kind: "+", newNumber: 2, text: "new" },
  }, theme);
  assert.equal(row.nodes[0].styles.bg, `#e06c75${UI.diff}`);
  assert.equal(row.nodes[2].styles.bg, `#98c379${UI.diff}`);
});

test("Files 收到 Changes 的打开请求时展开父目录；跨目录时按仓库根预览", () => {
  const { Files } = load("mods/my-files/main.js", "Files", {});
  const calls = [];
  const cx = { timer: { after: (_ms, fn) => fn(cx) }, notify() {} };
  const files = new Files();
  Object.assign(files, {
    workspace: true, root: "/repo", folders: new Set(), flat: null,
    toggle: path => calls.push(["toggle", path]),
    show: (path, _cx, from) => calls.push(["show", path, from ?? null]),
  });
  files.openFrom({ root: "/repo", path: "mods/a/b.js" }, cx);
  assert.deepEqual(calls, [["toggle", "mods"], ["toggle", "mods/a"], ["show", "mods/a/b.js", null]]);
  calls.length = 0;
  files.root = "/repo/sub";
  files.openFrom({ root: "/repo", path: "mods/a/b.js" }, cx);
  assert.deepEqual(calls, [["show", "mods/a/b.js", "/repo"]]);
});

test("切换工作区目录前，把未保存的文件编辑写回旧目录", async () => {
  const writes = [], tasks = [];
  const { Files } = load("mods/my-files/main.js", "Files", {
    writeTextFile: async (...args) => writes.push(args),
  });
  const file = new Files();
  Object.assign(file, {
    saved: new Map(), context: { key: "old" }, folders: new Set(), root: "/old", on: null,
    file: "same.txt", code: { value: () => "edited", release() {} }, original: "original", dirty: true,
  });
  const cx = { notify() {}, spawn: fn => tasks.push(fn) };
  file.refresh(cx, { cwd: "/new", on: null, space: "next" });
  await tasks[0](cx);
  assert.deepEqual(writes, [["/old/same.txt", "edited", "original"]]);
  assert.equal(file.root, "/new");
});
