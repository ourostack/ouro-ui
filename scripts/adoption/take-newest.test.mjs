import assert from "node:assert/strict";
import { test } from "node:test";
import { newest } from "./take-newest.mjs";

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
