import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { resolveMessages } from "../../registry/ouro/lib/ouro/a2ui-core.ts";

const root = "test/fixtures/a2ui";
const json = (p: string) => JSON.parse(readFileSync(`${root}/${p}`, "utf8"));

// One node test per core case, so the scripts job's log names each case and its result; the vitest run in the browser shards proves the same cases in a browser.
for (const file of readdirSync(`${root}/cases`).filter((f) => f.endsWith(".json")).sort()) {
  test(`core case ${file} resolves to its expect`, () => {
    const c = json(`cases/${file}`);
    const got = JSON.parse(JSON.stringify(resolveMessages(json(c.catalog), c.messages)));
    assert.deepEqual(got, c.expect);
  });
}
