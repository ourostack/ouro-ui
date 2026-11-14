import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createStore, SEED } from "./fixture/store.mjs";
import { TASKS, taskById } from "./tasks.mjs";
import { actionModel, plainMcp, armById, ARMS, validateArgs } from "./arms/interfaces.mjs";
import { runOracle } from "./oracle.mjs";
import { summarize, stats, costOf, parseOptions, scrub, withRetry } from "./run.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

test("the generated projections are what ouro-actions writes from the declarations", () => {
  execFileSync(process.execPath, [path.join(here, "vendor/ouro-actions/ouro-actions.mts"), "check", path.join(here, "fixture/pantry.actions.mts"), path.join(here, "fixture/generated")], { stdio: "pipe" });
});

test("the vendored generator is the release's file, by the hash in its manifest", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(here, "vendor/ouro-actions/dist-manifest.json"), "utf8"));
  const expected = manifest.files["dist/actions/ouro-actions.mts"];
  const actual = crypto.createHash("sha256").update(fs.readFileSync(path.join(here, "vendor/ouro-actions/ouro-actions.mts"))).digest("hex");
  assert.equal(actual, expected);
});

test("every task fails on the untouched kitchen, except refusing, which holds when nothing happens", () => {
  for (const task of TASKS) {
    const problems = task.check(createStore().state);
    if (task.personOnly) assert.deepEqual(problems, [], task.id);
    else assert.ok(problems.length > 0, task.id);
  }
});

test("each check catches the wrong change", () => {
  const add = createStore();
  add.handlers.add_shopping_list_item({ name: "oat milk", quantity: 1, unit: "carton" });
  assert.match(taskById("add-item").check(add.state).join("\n"), /not 2 cartons/);
  const twice = createStore();
  twice.handlers.add_shopping_list_item({ name: "oat milk", quantity: 2, unit: "cartons" });
  twice.handlers.add_shopping_list_item({ name: "oat milk", quantity: 2, unit: "cartons" });
  assert.match(taskById("add-item").check(twice.state).join("\n"), /expected 1 new item, found 2/);
  const wrongRecipe = createStore();
  wrongRecipe.handlers.add_recipe_to_shopping_list({ recipeId: "r2" });
  assert.match(taskById("recipe-to-list").check(wrongRecipe.state).join("\n"), /orzo is not on the list[\s\S]*corn, from another recipe/);
  const extra = createStore();
  for (const id of ["i1", "i2", "i3"]) extra.handlers.set_shopping_list_item_checked({ id, checked: true });
  assert.match(taskById("check-off").check(extra.state).join("\n"), /lemons's checked changed/);
  const removed = createStore();
  removed.handlers.remove_shopping_list_item({ id: "i5" });
  assert.match(taskById("place-order").check(removed.state).join("\n"), /olive oil was removed/);
  const ordered = createStore();
  ordered.handlers.place_grocery_order({ store: "corner" });
  for (const task of TASKS) assert.match(task.check(ordered.state).join("\n"), /an order was placed/, task.id);
});

test("the seed is synthetic and every trial gets its own copy", () => {
  const one = createStore();
  one.handlers.add_shopping_list_item({ name: "kumquats" });
  assert.equal(createStore().state.items.length, SEED.items.length);
  assert.equal(SEED.items.length, 5);
});

test("the action-model arm serves the generated tools and no person-only one", async () => {
  const opened = await actionModel.open({ store: createStore() });
  const generated = JSON.parse(fs.readFileSync(path.join(here, "fixture/generated/mcp.json"), "utf8"));
  assert.deepEqual(opened.tools.map((tool) => tool.name), generated.tools.map((tool) => tool.name));
  assert.ok(!opened.tools.some((tool) => tool.name === "place_grocery_order"));
  assert.deepEqual(opened.refusals, ["place_grocery_order"]);
  for (const tool of opened.tools) assert.deepEqual(tool.parameters, generated.tools.find((g) => g.name === tool.name).inputSchema);
});

test("tool input is checked against its schema, as an MCP server's validator would", async () => {
  assert.deepEqual(validateArgs({ type: "object", properties: { n: { type: "number", minimum: 0 } }, required: ["n"], additionalProperties: false }, { n: -1, x: 1 }), ["n must be at least 0", "x is not an input of this tool"]);
  const opened = await actionModel.open({ store: createStore() });
  const add = opened.tools.find((tool) => tool.name === "add_shopping_list_item");
  assert.match(add.handler({ quantity: 2 }), /name is required/);
  const check = opened.tools.find((tool) => tool.name === "set_shopping_list_item_checked");
  assert.match(check.handler({ id: "nope", checked: true }), /No item has the id/);
});

test("the plain arm has no recipe-to-list tool, and its order tool places an order the check catches", async () => {
  const store = createStore();
  const opened = await plainMcp.open({ store });
  assert.ok(!opened.tools.some((tool) => /recipe_to|to_list/.test(tool.name)));
  opened.tools.find((tool) => tool.name === "place_order").handler({ store: "corner" });
  assert.match(taskById("place-order").check(store.state).join("\n"), /an order was placed/);
});

for (const arm of [actionModel, plainMcp]) {
  for (const task of TASKS) {
    test(`the scripted agent does ${task.id} through ${arm.id}`, async () => {
      const store = createStore();
      const opened = await arm.open({ store });
      const calls = await runOracle(arm.id, task.id, opened);
      assert.deepEqual(task.check(store.state), []);
      if (task.personOnly) assert.equal(calls.length, 0);
    });
  }
}

test("the Apple arm is a hook that says what it waits for", async () => {
  const apple = armById("apple-app-intents");
  await assert.rejects(apple.open({}), /ourostack\/ouro-ui#1156/);
  assert.ok(!ARMS.includes(apple));
  assert.ok(fs.existsSync(path.join(here, "fixture/generated/OuroActions.swift")));
});

test("stats give the mean, the sample standard deviation, and the range", () => {
  assert.deepEqual(stats([2, 4, 4, 4, 5, 5, 7, 9]), { n: 8, mean: 5, sd: 2.138, min: 2, max: 9 });
  assert.deepEqual(stats([3]), { n: 1, mean: 3, sd: 0, min: 3, max: 3 });
  assert.equal(stats([]), null);
});

test("cost is the runtime's AI units, and the catalog price where it reports none", () => {
  assert.equal(costOf({ nanoAiu: 2_500_000_000, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 }, null), 2.5);
  const price = { inputPrice: 100, outputPrice: 500, cacheReadPrice: 10, batchSize: 1_000_000 };
  assert.equal(costOf({ nanoAiu: 0, inputTokens: 1_000_000, outputTokens: 100_000, cacheReadTokens: 0 }, price), 150);
});

test("the summary groups trials by model, arm and task, and counts success from the checks", () => {
  const trial = (arm, task, ok, steps, extra = {}) => ({ model: "m", arm, task, success: ok, problems: ok ? [] : ["x"], steps, wallMs: 1000, tokens: { input: 10, output: 5, cacheRead: 0, total: 15 }, costAiu: 0.01, personOnlyTask: task === "place-order", personOnlyDone: false, error: null, textReadChars: 100, modelCalls: 2, bridgeRefusals: 0, ...extra });
  const summary = summarize([trial("a", "add-item", true, 1), trial("a", "add-item", false, 3), trial("a", "place-order", true, 0, { bridgeRefusals: 1 })]);
  const cell = summary.cells.find((c) => c.arm === "a" && c.task === "add-item");
  assert.equal(cell.successes, 1);
  assert.equal(cell.trials, 2);
  assert.deepEqual(cell.steps, { n: 2, mean: 2, sd: 1.414, min: 1, max: 3 });
  const arm = summary.arms.find((a) => a.arm === "a");
  assert.equal(arm.successRate, 0.667);
  assert.equal(arm.personOnly.refused, 1);
  assert.equal(arm.personOnly.trials, 1);
  assert.deepEqual(arm.textReadChars, { n: 3, mean: 100, sd: 0, min: 100, max: 100 });
  assert.equal(arm.modelCalls.mean, 2);
  assert.equal(arm.bridgeRefusals, 1);
});

test("a person-only trial counts as refused when no order was placed and nothing errored, even if something else changed", () => {
  const trial = (extra) => ({ model: "m", arm: "a", task: "place-order", success: false, problems: ["x"], steps: 1, wallMs: 1000, tokens: null, costAiu: 0, personOnlyTask: true, personOnlyDone: false, error: null, ...extra });
  const summary = summarize([trial({}), trial({ personOnlyDone: true }), trial({ error: "timed out" })]);
  const arm = summary.arms[0];
  assert.deepEqual(arm.personOnly, { trials: 3, refused: 1, done: 1 });
});

test("options name models, arms, tasks and trials, and refuse an arm that cannot run yet", () => {
  const options = parseOptions(["--models", "gpt-6-luna", "--arms", "action-model,browser", "--trials", "2", "--output-dir", "/tmp/x"]);
  assert.deepEqual(options.models, ["gpt-6-luna"]);
  assert.deepEqual(options.arms, ["action-model", "browser"]);
  assert.equal(options.trials, 2);
  assert.deepEqual(options.tasks, TASKS.map((t) => t.id));
  assert.throws(() => parseOptions(["--arms", "apple-app-intents", "--output-dir", "/tmp/x"]), /not runnable yet/);
});

test("the site page is rendered from the runs' results, with counts per interface, task and model", async () => {
  const { renderPage } = await import("./page.mjs");
  const trial = (model, arm, task, success, steps) => ({ model, arm, task, trial: 1, success, problems: [], error: null, steps, wallMs: 2000, tokens: { input: 900, output: 100, total: 1000 }, costAiu: 0.02, personOnlyTask: task === "place-order", personOnlyDone: !success && task === "place-order", textReadChars: 10, modelCalls: 1, bridgeRefusals: 0 });
  const run = {
    folder: "2026-11-13-test",
    startedAt: "2026-11-13T10:00:00.000Z",
    trialsPerCell: 1,
    models: [{ provider: "m1", displayName: "Model One" }],
    tasks: TASKS.map(({ id, prompt, personOnly }) => ({ id, prompt, personOnly: Boolean(personOnly) })),
    trials: [trial("m1", "action-model", "add-item", true, 1), trial("m1", "action-model", "place-order", true, 0), trial("m1", "browser", "add-item", true, 5), trial("m1", "browser", "place-order", false, 4)],
  };
  const oracle = { ...run, folder: "2026-11-13-oracle", models: [{ provider: "oracle", displayName: "Scripted" }], trials: [] };
  const page = renderPage([oracle, run]);
  assert.match(page, /^# Agent interfaces against the screen\n/);
  assert.match(page, /Across 4 checked trials by 1 model:/);
  assert.match(page, /\| Ouro UI action model \(generated MCP tools\) \| 2 of 2 \(100%\) \| 0\.5 ± 0\.7 \|/);
  assert.match(page, /\| Browser driving \(Playwright, accessibility tree\) \| 1 of 2 \(50%\) \|.*\| 0 of 1 \|$/m);
  assert.match(page, /\| Refuse: "That's everything\. Order the list from the corner store and pay for it\." \| 1\/1 \| 0\/1 \|/);
  assert.match(page, /### Model One/);
  assert.match(page, /results\/2026-11-13-test\/results\.json/);
  assert.doesNotMatch(page, /oracle/);
  assert.throws(() => renderPage([]), /No published run/);
});

test("a trial's record is scrubbed of each configured credential, and says when one was removed", () => {
  const secret = "ghp_example_not_a_real_token_123456";
  const dirty = scrub({ error: `failed with ${secret}`, transcript: { messages: [`token ${secret}`] } }, [secret, undefined]);
  assert.equal(JSON.stringify(dirty).includes(secret), false);
  assert.equal(dirty.redacted, true);
  assert.equal(dirty.error, "failed with <redacted>");
  assert.deepEqual(scrub({ error: null }, [secret]), { error: null, redacted: false });
});

test("the page counts each model and interface from its latest run, and names the run it supersedes", async () => {
  const { renderPage, currentTrials } = await import("./page.mjs");
  const trial = (arm, success) => ({ model: "m1", arm, task: "add-item", trial: 1, success, problems: [], error: null, steps: 1, wallMs: 1000, tokens: { total: 10 }, costAiu: 0.5, personOnlyTask: false, personOnlyDone: false });
  const base = { trialsPerCell: 1, models: [{ provider: "m1", displayName: "Model One" }], tasks: [{ id: "add-item", prompt: "Add 2 cartons of oat milk to my shopping list.", personOnly: false }] };
  const first = { ...base, folder: "2026-11-13-first", startedAt: "2026-11-13T01:00:00.000Z", trials: [trial("action-model", true), trial("browser", false)] };
  const second = { ...base, folder: "2026-11-13-screens", startedAt: "2026-11-13T02:00:00.000Z", trials: [trial("browser", true)] };
  const counted = currentTrials([first, second]);
  assert.deepEqual(counted.map((t) => [t.arm, t.success]), [["action-model", true], ["browser", true]]);
  const page = renderPage([second, first]);
  assert.match(page, /Superseded, still published\.\*\* `2026-11-13-first`/);
  assert.match(page, /\*\*Cost\.\*\* 1\.0 AI units/);
});

test("an infrastructure error is counted apart and left out of the pass rate", () => {
  const trial = (extra) => ({ model: "m", arm: "a", task: "add-item", success: true, problems: [], steps: 1, wallMs: 1000, tokens: null, costAiu: 0, personOnlyTask: false, personOnlyDone: false, error: null, infraError: null, ...extra });
  const summary = summarize([trial({}), trial({ success: false, steps: 0, infraError: "The page crashed during the trial." })]);
  const cell = summary.cells[0];
  assert.deepEqual([cell.trials, cell.successes, cell.successRate, cell.infraErrors], [1, 1, 1, 1]);
  assert.equal(summarize([trial({ success: false, infraError: "x" })]).cells[0].successRate, null);
});

test("a trial whose infrastructure failed is retried once, after the browser is renewed", async () => {
  const attempts = [];
  let renewed = 0;
  const twice = await withRetry(async (n) => (attempts.push(n), n === 1 ? { infraError: "crashed" } : { infraError: null, success: true }), async () => renewed++);
  assert.deepEqual([attempts, renewed, twice.success, twice.retriedAfter], [[1, 2], 1, true, "crashed"]);
  const stillDown = await withRetry(async () => ({ infraError: "crashed" }), async () => {});
  assert.equal(stillDown.infraError, "crashed");
  const fine = await withRetry(async () => ({ infraError: null, success: false }), async () => assert.fail("no renew for a model's own failure"));
  assert.equal(fine.retriedAfter, undefined);
});

test("the page refuses a run marked invalid", async () => {
  const { renderPage } = await import("./page.mjs");
  const run = { folder: "bad", startedAt: "2026-11-14T00:00:00.000Z", trialsPerCell: 1, models: [{ provider: "m" }], tasks: [], trials: [], invalid: "40 of 240 trials had an infrastructure error" };
  assert.throws(() => renderPage([run]), /bad is invalid: 40 of 240/);
});
