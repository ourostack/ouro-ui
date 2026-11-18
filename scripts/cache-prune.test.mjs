import assert from "node:assert/strict";
import { test } from "node:test";
import { familyOf, toDelete } from "./cache-prune.mjs";

const hash = (digit) => digit.repeat(64);
const sha = "c".repeat(40);
let nextId = 1;
const cache = (key, ref, createdAt, extra = {}) => ({ id: nextId++, key, ref, sizeInBytes: 1000, createdAt, ...extra });
const main = "refs/heads/main";
const pull = "refs/pull/42/merge";
const deleted = (caches) => toDelete(caches).map((entry) => entry.key);

test("cache prune deletes every entry a pull request or the merge queue saved", () => {
  const prs = [
    cache(`install-app-pw1.65.0-shadcn-nova-${hash("1")}-${hash("2")}`, pull, "2026-11-18T10:00:00Z"),
    cache(`install-npm-ouro-nova-${hash("3")}`, "refs/heads/gh-readonly-queue/main/pr-9", "2026-11-18T10:00:00Z"),
    cache("node-cache-Linux-x64-pnpm-" + hash("4"), pull, "2026-11-18T10:00:00Z"),
  ];
  assert.deepEqual(deleted(prs), prs.map((entry) => entry.key));
});

test("cache prune keeps a stryker entry from the newest pull request run, and drops an older one of the same family", () => {
  const dependencies = "d".repeat(16);
  const older = cache(`stryker-42-${dependencies}-${sha}`, pull, "2026-11-18T09:00:00Z");
  const newer = cache(`stryker-42-${dependencies}-${"e".repeat(40)}`, pull, "2026-11-18T10:00:00Z");
  const otherChange = cache(`stryker-42-${"f".repeat(16)}-${sha}`, pull, "2026-11-18T08:00:00Z");
  assert.deepEqual(toDelete([older, newer, otherChange]), [older]);
});

test("cache prune keeps a stryker entry whose key matches no family", () => {
  const unknown = cache("stryker-42-something-else", pull, "2026-11-18T10:00:00Z");
  assert.deepEqual(toDelete([unknown]), []);
});

test("cache prune keeps the newest entry of each family on main, by creation time and not list order", () => {
  const oldest = cache(`install-npm-ouro-nova-${hash("1")}`, main, "2026-11-10T00:00:00Z");
  const newest = cache(`install-npm-ouro-nova-${hash("2")}`, main, "2026-11-18T00:00:00Z");
  const middle = cache(`install-npm-ouro-nova-${hash("3")}`, main, "2026-11-14T00:00:00Z");
  const otherPreset = cache(`install-npm-ouro-vega-${hash("4")}`, main, "2026-11-01T00:00:00Z");
  assert.deepEqual(toDelete([oldest, newest, middle, otherPreset]), [oldest, middle]);
});

test("cache prune groups the prepared app by its fixture hash, so a fixture keeps its own newest app", () => {
  const fixtureA = (createdAt, regs) => cache(`install-app-pw1.65.0-shadcn-nova-${hash("a")}-${regs}`, main, createdAt);
  const oldA = fixtureA("2026-11-10T00:00:00Z", hash("1"));
  const newA = fixtureA("2026-11-17T00:00:00Z", hash("2"));
  const fixtureB = cache(`install-app-pw1.65.0-shadcn-nova-${hash("b")}-${hash("3")}`, main, "2026-11-01T00:00:00Z");
  assert.deepEqual(toDelete([oldA, newA, fixtureB]), [oldA]);
});

test("cache prune keeps the newest browser-debs entry per runner image, across image versions", () => {
  const browsers = (imageVersion, set) => `browser-debs-Linux-ubuntu24-${imageVersion}-X64-1.65.0-${set}`;
  const older = cache(browsers("20260301.1.0", "chromium-webkit"), main, "2026-10-01T00:00:00Z");
  const newer = cache(browsers("20261101.2.0", "chromium-webkit"), main, "2026-11-01T00:00:00Z");
  const chromium = cache(browsers("20260301.1.0", "chromium"), main, "2026-10-01T00:00:00Z");
  assert.equal(familyOf(older.key), familyOf(newer.key));
  assert.deepEqual(toDelete([older, newer, chromium]), [older]);
});

test("cache prune leaves a main key that matches no family alone, and reads no unknown key as a family", () => {
  const unknown = cache("something-else-entirely", main, "2026-01-01T00:00:00Z");
  const unknownTwin = cache("something-else-entirely", main, "2026-02-01T00:00:00Z");
  assert.equal(familyOf("something-else-entirely"), null);
  assert.deepEqual(toDelete([unknown, unknownTwin]), []);
});

test("cache prune keeps only the newest Playwright browsers for each key", () => {
  const old = cache("playwright-Linux-ubuntu24-X64-1.65.0-chromium-webkit", main, "2026-10-01T00:00:00Z");
  const fresh = cache("playwright-Linux-ubuntu24-X64-1.65.0-chromium-webkit", main, "2026-11-01T00:00:00Z");
  const chromium = cache("playwright-Linux-ubuntu24-X64-1.65.0-chromium", main, "2026-10-01T00:00:00Z");
  assert.deepEqual(toDelete([old, fresh, chromium]), [old]);
});
