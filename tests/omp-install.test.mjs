import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync, existsSync, lstatSync, mkdtempSync, readFileSync, readdirSync,
  rmSync, statSync, symlinkSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SCRIPT = join(ROOT, "extras/omp/install.sh");
const ICON = readFileSync(join(ROOT, "extras/omp/omp.svg"));
const FRAGMENT = JSON.parse(readFileSync(join(ROOT, "extras/omp/programs.json"), "utf8"));

function which(name) {
  const found = spawnSync("sh", ["-c", `command -v ${name}`], { encoding: "utf8" });
  return found.status === 0 ? found.stdout.trim() : "";
}

const PYTHON = which("python3");
const JQ = which("jq");
const HAS_PYTHON = Boolean(PYTHON) && spawnSync(PYTHON, ["-c", ""]).status === 0;
const HAS_JQ = Boolean(JQ);
const mergeTest = HAS_PYTHON || HAS_JQ ? test : test.skip;
const pythonTest = HAS_PYTHON ? test : test.skip;
const jqTest = HAS_JQ ? test : test.skip;

// Every script dependency except the merge tool. A bare temp PATH stays
// deterministic and lets the python probe be controlled.
const TOOL_NAMES = ["install", "mktemp", "stat", "chmod", "mv", "mkdir", "tr", "dirname", "rm"];
const TOOL_PATHS = Object.fromEntries(TOOL_NAMES.map(name => [name, which(name)]));

const temps = [];
function temp(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  temps.push(dir);
  return dir;
}

after(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

function toolBin({ python = "none", jq = false } = {}) {
  const dir = temp("likeme-tools-");
  for (const name of TOOL_NAMES) {
    if (TOOL_PATHS[name]) symlinkSync(TOOL_PATHS[name], join(dir, name));
  }
  if (jq) symlinkSync(JQ, join(dir, "jq"));
  if (python === "real") symlinkSync(PYTHON, join(dir, "python3"));
  if (python === "failing") {
    writeFileSync(join(dir, "python3"), "#!/bin/sh\nexit 1\n");
    chmodSync(join(dir, "python3"), 0o755);
  }
  return dir;
}

function envFor({ python = HAS_PYTHON ? "real" : "none", jq = !HAS_PYTHON && HAS_JQ } = {}) {
  return { PATH: toolBin({ python, jq }), HOME: temp("likeme-home-"), LIKEME_OMP: "1" };
}

function install(dst, env) {
  return spawnSync("/bin/bash", [SCRIPT, dst], { env, encoding: "utf8" });
}

function tempLeftovers(dst) {
  return readdirSync(dst).filter(name =>
    name.startsWith(".programs.") || name.startsWith("programs.json."));
}

test("fresh DST: creates programs.json and copies the namespaced icon", () => {
  const dst = temp("likeme-dst-");
  const result = install(dst, envFor());

  assert.equal(result.status, 0, result.stderr);
  const file = join(dst, "programs.json");
  assert.ok(existsSync(file), "programs.json was not created");
  assert.deepEqual(JSON.parse(readFileSync(file, "utf8")), FRAGMENT);
  assert.deepEqual(readFileSync(join(dst, "my-icons/likeme-omp.svg")), ICON);
  assert.deepEqual(tempLeftovers(dst), []);
});

mergeTest("existing programs.json: adds omp, preserves every key and the mode", () => {
  const dst = temp("likeme-dst-");
  const file = join(dst, "programs.json");
  const existing = {
    editor: { font_size: 14 },
    programs: { lazygit: { name: "Git", icon: "icons/lazygit.svg" } },
  };
  writeFileSync(file, `${JSON.stringify(existing, null, 2)}\n`);
  chmodSync(file, 0o640);

  const result = install(dst, envFor());
  assert.equal(result.status, 0, result.stderr);

  const merged = JSON.parse(readFileSync(file, "utf8"));
  assert.deepEqual(merged.editor, existing.editor);
  assert.deepEqual(merged.programs.lazygit, existing.programs.lazygit);
  assert.deepEqual(merged.programs.omp, FRAGMENT.programs.omp);
  assert.equal(statSync(file).mode & 0o777, 0o640);
  assert.deepEqual(tempLeftovers(dst), []);
});

mergeTest("existing programs.omp: leaves the file byte-identical, installs the icon", () => {
  const dst = temp("likeme-dst-");
  const file = join(dst, "programs.json");
  const existing = {
    programs: {
      omp: {
        name: "My omp",
        icon: "my-icons/custom.svg",
        tint: true,
        run: ["omp", "--custom"],
      },
    },
  };
  const before = Buffer.from(`${JSON.stringify(existing, null, 2)}\n`);
  writeFileSync(file, before);

  const result = install(dst, envFor());
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(readFileSync(file), before);
  assert.match(result.stdout, /already has programs\.omp/);
  assert.deepEqual(readFileSync(join(dst, "my-icons/likeme-omp.svg")), ICON);
  assert.deepEqual(tempLeftovers(dst), []);
});

test("invalid existing JSON: leaves the file byte-identical, warns, exits 0", () => {
  const dst = temp("likeme-dst-");
  const file = join(dst, "programs.json");
  const before = Buffer.from('{"programs": {\n');
  writeFileSync(file, before);

  const result = install(dst, envFor());
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(readFileSync(file), before);
  assert.match(result.stderr, /programs\.json: invalid JSON/);
  assert.deepEqual(tempLeftovers(dst), []);
});

jqTest("invalid existing JSON through jq: same warning, untouched", () => {
  const dst = temp("likeme-dst-");
  const file = join(dst, "programs.json");
  const before = Buffer.from('{"programs": {\n');
  writeFileSync(file, before);

  const result = install(dst, envFor({ python: "none", jq: true }));
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(readFileSync(file), before);
  assert.match(result.stderr, /programs\.json: invalid JSON/);
  assert.deepEqual(tempLeftovers(dst), []);
});

test("non-object shapes: left byte-identical, exit 0, warned", () => {
  for (const value of [[], { programs: [] }, { programs: null }, { programs: "x" }]) {
    const dst = temp("likeme-dst-");
    const file = join(dst, "programs.json");
    const before = Buffer.from(`${JSON.stringify(value)}\n`);
    writeFileSync(file, before);

    const result = install(dst, envFor());
    assert.equal(result.status, 0, `${JSON.stringify(value)}: ${result.stderr}`);
    assert.deepEqual(readFileSync(file), before, `${JSON.stringify(value)} changed`);
    assert.ok(result.stderr.trim().length > 0, `${JSON.stringify(value)} did not warn`);
    assert.deepEqual(tempLeftovers(dst), []);
  }
});

test("symlinked programs.json: link and target stay byte-identical", () => {
  const dst = temp("likeme-dst-");
  const file = join(dst, "programs.json");
  const target = join(temp("likeme-target-"), "programs.json");
  const before = Buffer.from('{"programs":{"lazygit":{"name":"Git"}}}\n');
  writeFileSync(target, before);
  symlinkSync(target, file);

  const result = install(dst, envFor());
  assert.equal(result.status, 0, result.stderr);
  assert.ok(lstatSync(file).isSymbolicLink(), "the symlink was replaced");
  assert.deepEqual(readFileSync(file), before);
  assert.deepEqual(readFileSync(target), before);
  assert.match(result.stderr, /programs\.json is a symlink/);
  assert.ok(!existsSync(join(dst, "my-icons")), "the icon should not be installed");
});

test("dangling symlinked programs.json: refused, link kept", () => {
  const dst = temp("likeme-dst-");
  const file = join(dst, "programs.json");
  const target = join(temp("likeme-target-"), "missing.json");
  symlinkSync(target, file);

  const result = install(dst, envFor());
  assert.equal(result.status, 0, result.stderr);
  assert.ok(lstatSync(file).isSymbolicLink(), "the symlink was replaced");
  assert.ok(!existsSync(target), "the symlink target was created");
  assert.match(result.stderr, /programs\.json is a symlink/);
});

pythonTest("non-finite JSON numbers refuse the merge", () => {
  const dst = temp("likeme-dst-");
  const file = join(dst, "programs.json");
  const before = Buffer.from('{"editor":{"ratio":1e999},"programs":{}}\n');
  writeFileSync(file, before);

  const result = install(dst, envFor());
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(readFileSync(file), before);
  assert.match(result.stderr, /could not write the merged JSON/);
  assert.deepEqual(tempLeftovers(dst), []);
});

test("LIKEME_OMP=0: writes nothing, prints the skip line", () => {
  const dst = temp("likeme-dst-");
  const result = install(dst, { ...envFor(), LIKEME_OMP: "0" });

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(readdirSync(dst), []);
  assert.match(result.stdout, /omp registration skipped \(LIKEME_OMP=0\)/);
});

test("omp absent: still registers the entry and icon", () => {
  const dst = temp("likeme-dst-");
  const result = install(dst, envFor());

  assert.equal(result.status, 0, result.stderr);
  const file = join(dst, "programs.json");
  assert.ok(existsSync(file), "programs.json should exist without omp");
  const merged = JSON.parse(readFileSync(file, "utf8"));
  assert.deepEqual(merged.programs.omp, FRAGMENT.programs.omp);
  assert.deepEqual(merged.programs.omp.run, ["omp"]);
  assert.deepEqual(merged.programs.omp.match, ["omp"]);
  assert.deepEqual(readFileSync(join(dst, "my-icons/likeme-omp.svg")), ICON);
});

jqTest("jq-only PATH: merges, preserves other entries, leaves no temp file", () => {
  const dst = temp("likeme-dst-");
  const file = join(dst, "programs.json");
  const existing = {
    editor: { font_size: 13 },
    programs: { nvim: { name: "Neovim" } },
  };
  writeFileSync(file, `${JSON.stringify(existing, null, 2)}\n`);

  const result = install(dst, envFor({ python: "none", jq: true }));
  assert.equal(result.status, 0, result.stderr);

  const merged = JSON.parse(readFileSync(file, "utf8"));
  assert.deepEqual(merged.editor, existing.editor);
  assert.deepEqual(merged.programs.nvim, existing.programs.nvim);
  assert.deepEqual(merged.programs.omp, FRAGMENT.programs.omp);
  assert.deepEqual(tempLeftovers(dst), []);
});

jqTest("a failing python3 falls through to jq", () => {
  const dst = temp("likeme-dst-");
  const file = join(dst, "programs.json");
  const existing = { programs: { lazygit: { name: "Git" } } };
  writeFileSync(file, `${JSON.stringify(existing, null, 2)}\n`);

  const result = install(dst, envFor({ python: "failing", jq: true }));
  assert.equal(result.status, 0, result.stderr);

  const merged = JSON.parse(readFileSync(file, "utf8"));
  assert.deepEqual(merged.programs.lazygit, existing.programs.lazygit);
  assert.deepEqual(merged.programs.omp, FRAGMENT.programs.omp);
  assert.deepEqual(tempLeftovers(dst), []);
});
