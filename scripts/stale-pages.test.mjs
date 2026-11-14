import assert from "node:assert/strict";
import { test } from "node:test";
import { stalePages } from "./stale-pages.mjs";

const now = new Date("2026-11-14T12:00:00Z");
const releases = [
  { tag: "v1.3.3", at: "2026-11-14T11:00:00Z" },
  { tag: "v1.3.2", at: "2026-11-13T09:00:00Z" },
  { tag: "v1.3.1", at: "2026-11-12T09:00:00Z" },
];

test("the docs are stale once a release they do not name has been out more than a day, and the ledger after three hours", () => {
  assert.deepEqual(stalePages({ pinned: "v1.3.3", releases, ledgerAt: "2026-11-14T11:30:00Z", now }), []);
  assert.deepEqual(stalePages({ pinned: "v1.3.2", releases, ledgerAt: "2026-11-14T11:30:00Z", now }), [], "a release out less than a day is not late");
  const [docs] = stalePages({ pinned: "v1.3.1", releases, ledgerAt: "2026-11-14T11:30:00Z", now });
  assert.match(docs, /name v1\.3\.1, and 2 newer releases are out, 1 of them for more than a day/);
  const [ledger] = stalePages({ pinned: "v1.3.3", releases, ledgerAt: "2026-11-14T08:59:00Z", now });
  assert.match(ledger, /more than three hours ago/);
  assert.equal(stalePages({ pinned: "v9.9.9", releases, ledgerAt: "nonsense", now }).length, 2, "an unknown pin and an unreadable time are both stale");
});
