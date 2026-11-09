import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

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
    settings: () => ({ zoom: 1 }), shared: () => undefined, markColor: () => null,
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

test("Files 和 Changes 在加号前只显示一次，布局不含额外工具 Tab", () => {
  const f = fixture(), root = f.render();
  assert.equal(f.body.type, "stack");
  assert.deepEqual(f.body.children.map(n => n.id), ["main", "files", "changes"]);
  assert.ok(f.body.children.filter(n => n.id !== "main").every(n => n.content.props.workspace));
  assert.deepEqual(find(root, "tab-scroll").nodes.map(n => n.key), [
    "tab-one", "tab-two", "panel-files", "panel-changes", "tab-new",
    "start-claude", "start-pi", "start-lazygit", "start-nvim",
  ]);
  assert.equal(root.nodes.length, 1);
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
  assert.equal(find(f.render(), "panel-changes").styles.bg, "#222222");
  assert.notEqual(find(f.render(), "tab-one").styles.bg, "#222222");
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
