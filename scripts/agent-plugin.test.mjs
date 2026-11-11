import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { RULES } from "../registry/ouro/check/check.ts";

// plugins/ouro-check ships the ouro-check agent skill to Agency, Copilot and Claude Code. These hold its two
// manifests together, and hold the skill to the check it teaches, so a release that changes the check
// cannot leave the skill naming a file, an option or a rule the check no longer has.

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const plugin = join(root, "plugins", "ouro-check");
const skill = readFileSync(join(plugin, "skills", "ouro-check", "SKILL.md"), "utf8");
const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));

describe("ouro-check agent plugin", () => {
  test("declares its skills folder in both manifests, with matching names, versions and descriptions", () => {
    const copilot = readJson(join(plugin, "plugin.json"));
    const claude = readJson(join(plugin, ".claude-plugin", "plugin.json"));
    assert.equal(copilot.name, "ouro-check");
    assert.equal(copilot.skills, "./skills/");
    assert.equal(claude.skills, "./skills/");
    assert.equal(claude.name, copilot.name);
    assert.equal(claude.version, copilot.version);
    assert.equal(claude.description, copilot.description);
    assert.equal(claude.license, copilot.license);
  });

  test("ships each skill with a SKILL.md whose name matches its folder", () => {
    const skills = readdirSync(join(plugin, "skills")).sort();
    assert.deepEqual(skills, ["ouro-check"]);
    for (const name of skills) {
      const file = join(plugin, "skills", name, "SKILL.md");
      assert.ok(existsSync(file), `${name} has no SKILL.md`);
      assert.match(readFileSync(file, "utf8"), new RegExp(`^---\\nname: ${name}\\ndescription: \\S[^\\n]*\\n---\\n`, "u"));
    }
  });

  test("the screen check guide names every rule Ouro check reports", () => {
    const guide = readFileSync(join(root, "docs", "guides", "guardrails.md"), "utf8");
    assert.ok(RULES.length > 0);
    assert.deepEqual(RULES.filter((rule) => !guide.includes(`\`${rule}\``)), []);
  });

  test("fetches the files the release's registry.json lists for ouro-check, and names only options Ouro check has", () => {
    assert.match(skill, /\/registry\.json" \| jq -r '\.items\[\] \| select\(\.name == "ouro-check"\)\.files\[\]\.path'/);
    // The skill saves each file by its base name, so every file must sit in the check's own folder.
    const item = readJson(join(root, "registry.json")).items.find((entry) => entry.name === "ouro-check");
    const paths = item.files.map((file) => file.path);
    assert.ok(paths.includes("registry/ouro/check/check.ts"));
    assert.deepEqual(paths.filter((path) => !/^registry\/ouro\/check\/[^/]+\.ts$/.test(path)), []);
    const help = spawnSync(process.execPath, [join(root, "registry", "ouro", "check", "check.ts"), "--help"], { encoding: "utf8" });
    assert.equal(help.status, 0, help.stderr);
    const flags = [...new Set(skill.match(/(?<![\w-])--[a-z][a-z-]*/g))];
    assert.ok(flags.length > 0);
    assert.deepEqual(flags.filter((flag) => !help.stdout.includes(`${flag} `)), []);
  });
});
