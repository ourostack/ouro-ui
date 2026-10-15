import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { whyNoSkillPage } from "./agent-usability/page.mts";
import { arms } from "./agent-usability/prompt.mts";
import { screens } from "./agent-usability/screens.mts";

function cohort() {
  const dir = mkdtempSync(join(tmpdir(), "ouro-publication-fixture-"));
  mkdirSync(join(dir, "arms"));
  writeFileSync(join(dir, "run.md"), [
    "- Model: fixture-only-model",
    "- Effort: high",
    "- Agent: fixture-only-agent",
    "- shadcn CLI the skill-arm agents ran: fixture-only-cli",
  ].join("\n"));
  for (const arm of arms) {
    writeFileSync(join(dir, "arms", `${arm}.json`), JSON.stringify({
      arm, ouroRef: arm === "ouro" ? "v0.8.0" : null, files: {}, config: {}, configFiles: {},
      baseline: { typecheck: [], lint: [] },
    }));
    for (const screen of screens) for (const run of [1, 2, 3]) {
      const folder = join(dir, arm, screen, String(run), "score");
      mkdirSync(folder, { recursive: true });
      writeFileSync(join(folder, "score.json"), JSON.stringify({
        arm, screen, formulaVersion: 4, scoredAt: "2026-10-14T00:00:00.000Z", armRecord: "fixture-only-arm.json",
        versions: { harness: "fixture-only-harness", node: "fixture-only-node", playwright: "fixture-only-playwright", axeCore: "fixture-only-axe", chromium: "fixture-only-browser" },
        points: { typecheck: 0, lint: 0, axe: 0, behavior: 0, score: 0, max: 100 },
        checks: {
          typecheck: { pass: true, new: [], excused: 0, output: "Fixture-only clean typecheck." },
          lint: { pass: true, new: [], excused: 0, output: "Fixture-only clean lint." },
          build: { pass: true, output: "Fixture-only build." },
          fixtures: { pass: true, changed: [] },
          config: { changed: [] },
        },
        failures: ["Fixture-only behavior failure."],
        behavior: [{ id: "fixture-refusal", title: "Keeps the server refusal", covers: [1], viewport: "phone", gate: true, pass: false }],
        axe: [{
          viewport: "phone", width: 390, theme: "dark", pass: false,
          states: [{ name: "Fixture-only state", reached: true }],
          violations: [{ id: "fixture-only-rule", impact: "serious", help: "Fixture-only violation.", state: "Fixture-only state", targets: ["#fixture-only"] }],
          advisories: [],
        }],
        screenshots: [],
      }));
    }
  }
  return dir;
}

test("publication refuses a partial cohort rather than presenting it as the 45-build comparison", () => {
  const dir = cohort();
  renameSync(join(dir, "ouro", "app-shell", "3"), join(dir, "ouro", "app-shell", "unscored-fixture"));
  assert.throws(() => whyNoSkillPage(dir), /ouro\/app-shell.*three scored runs|ouro\/app-shell.*runs 1, 2, 3/);
});

test("publication includes each actual outcome and its run, not just aggregate scores", () => {
  const page = whyNoSkillPage(cohort());
  assert.match(page, /^# Why Ouro HX needs no skill\n\n[^\n]+\n/);
  assert.equal((page.match(/Keeps the server refusal/g) ?? []).length, 45);
  assert.equal((page.match(/390px dark/g) ?? []).length, 45);
  assert.match(page, /app-shell.*run 3/);
  assert.match(page, /Fixture-only behavior failure/);
  assert.match(page, /fixture-only-model/);
  assert.match(page, /v0\.8\.0/);
  assert.match(page, /https:\/\/ui\.shadcn\.com\/docs\/skills\.md/);
  assert.match(page, /one primary model\/effort setting/);
  assert.match(page, /formula grades the resulting apps, not operational safety/);
  assert.match(page, /https:\/\/github\.com\/ourostack\/ouro-ui\/tree\/main\/scripts\/agent-usability\/runs\//);
});

test("publication rejects a missing score or a result copied into a different arm", () => {
  const dir = cohort();
  const score = join(dir, "ouro", "app-shell", "3", "score", "score.json");
  const result = JSON.parse(readFileSync(score, "utf8"));
  writeFileSync(score, JSON.stringify({ ...result, arm: "shadcn" }));
  assert.throws(() => whyNoSkillPage(dir), /identifies a different arm or screen/);
  renameSync(score, `${score}.fixture-only-unscored`);
  assert.throws(() => whyNoSkillPage(dir), /ENOENT.*score\.json/);
});
