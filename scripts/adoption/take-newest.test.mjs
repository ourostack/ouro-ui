import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { scratchDir } from "../scratch.mjs";
import { main, newest } from "./take-newest.mjs";

const ledger = (generatedAt, extra = {}) => ({ schema: 1, generatedAt, surfaces: [], ...extra });

test("the site builds in the hourly ledger only when it is newer and of the same schema", () => {
  const committed = ledger("2026-11-13T21:27:00Z");
  const hourly = ledger("2026-11-14T10:15:43Z");
  assert.equal(newest(committed, hourly), hourly);
  assert.equal(newest(hourly, committed), hourly);
  assert.equal(newest(committed, ledger("2026-11-14T10:15:43Z", { schema: 2 })), committed);
  assert.equal(newest(committed, { schema: 1, generatedAt: "2026-11-14T10:15:43Z" }), committed);
  assert.equal(newest(committed, null), committed);
});

test("Ouro Current's list is built in the same way, newest first, and only with the lists the page reads", () => {
  const committed = { schema: 1, generatedAt: "2026-11-15T20:00:00Z", releases: {}, repos: [] };
  const published = { ...committed, generatedAt: "2026-11-23T22:59:27Z", repos: [{ repo: "o/r" }] };
  assert.equal(newest(committed, published), published);
  assert.equal(newest(committed, { ...published, repos: undefined }), committed);
  assert.match(readFileSync(join(import.meta.dirname, "../../.github/workflows/pages.yml"), "utf8"), /take-newest\.mjs "https:\/\/api\.github\.com\/repos\/\$REPO\/contents\/current\.json\?ref=adoption-data" site\/src\/current\/current\.json/);
});

test("the site reads the hourly ledger from the contents API, signed in, so a cached copy never stands in for it", async () => {
  const dir = scratchDir("take-newest-");
  const file = join(dir, "ledger.json");
  writeFileSync(file, JSON.stringify(ledger("2026-11-13T21:27:00Z")));
  const asked = [];
  const real = globalThis.fetch;
  const log = console.log;
  process.env.GH_TOKEN = "t0ken";
  globalThis.fetch = async (url, init) => (asked.push({ url, init }), { ok: true, json: async () => ledger("2026-11-16T08:17:43Z") });
  console.log = () => {};
  try {
    await main(["https://api.github.com/repos/o/r/contents/ledger.json?ref=adoption-data", file]);
  } finally {
    globalThis.fetch = real;
    console.log = log;
    delete process.env.GH_TOKEN;
  }
  assert.equal(asked[0].init.headers.accept, "application/vnd.github.raw+json");
  assert.equal(asked[0].init.headers.authorization, "Bearer t0ken");
  assert.equal(JSON.parse(readFileSync(file, "utf8")).generatedAt, "2026-11-16T08:17:43Z");
  assert.match(readFileSync(join(import.meta.dirname, "../../.github/workflows/pages.yml"), "utf8"), /take-newest\.mjs "https:\/\/api\.github\.com\/repos\/\$REPO\/contents\/ledger\.json\?ref=adoption-data"/);
});
