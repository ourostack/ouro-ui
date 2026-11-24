import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import { describe, test } from "node:test";
import { main } from "../../registry/ouro/check/run.ts";
import { changesBetween, waitForChange, watchLoop } from "../../registry/ouro/check/watch.ts";
import { browser, dir, fixtures, playwrightModule, scratch } from "./kit.mts";

// Part of Ouro check's Node side tests; scripts/check.test.mjs runs every file here under Node's coverage.

describe("Ouro check watch", () => {
  test("changesBetween names what a run opened and what it closed, and nothing that stayed", () => {
    const before = new Map([["a", "one"], ["b", "two"]]);
    assert.deepEqual(changesBetween(before, new Map([["b", "two"], ["c", "three"]])), ["+ three", "- one"]);
    assert.deepEqual(changesBetween(before, before), []);
  });

  test("watchLoop prints the first run whole, then only what changed, and says when nothing did", async () => {
    const runs = [new Map([["a", "one"]]), new Map([["a", "one"], ["b", "two"]]), new Map([["a", "one"], ["b", "two"]])];
    const lines: string[] = [];
    let waits = 0;
    const open = await watchLoop({ run: async () => runs.shift()!, wait: async () => void waits++, times: 3, log: (line) => lines.push(line) });
    assert.deepEqual(lines, ["+ one", "+ two", "· no change, 2 open"]);
    assert.equal(waits, 2);
    assert.equal(open.size, 2);
  });

  test("waitForChange resolves on a clock, and a quiet 300 ms after a file changes", async () => {
    const folder = dir("watched");
    const started = Date.now();
    await waitForChange([folder], 0.05);
    assert.ok(Date.now() - started < 290);
    const change = waitForChange([folder], 30);
    setTimeout(() => writeFileSync(join(folder, "a.txt"), "1"), 50);
    setTimeout(() => writeFileSync(join(folder, "a.txt"), "2"), 150);
    await change;
    assert.ok(Date.now() - started > 400);
  });

  test("watch reruns a running server's page and prints only the findings a run opened and closed, headless", async () => {
    const broken = readFileSync(join(fixtures, "overlap-fail.html"), "utf8");
    const fixed = readFileSync(join(fixtures, "overlap-pass.html"), "utf8");
    let html = broken;
    const server = createServer((_, res) => res.setHeader("content-type", "text/html").end(html));
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    const { port } = server.address() as { port: number };
    const lines: string[] = [];
    try {
      const code = await main(["watch", `http://127.0.0.1:${port}/`, "--times", "3", "--every", "0.1", "--sizes", "390x844"], {
        cwd: scratch,
        env: { PLAYWRIGHT_MODULE: playwrightModule, BROWSER_EXECUTABLE: browser },
        log: (line) => {
          lines.push(line);
          if (lines.length === 1) html = fixed;
        },
        error: (line) => lines.push(line),
      });
      assert.equal(code, 0);
    } finally {
      server.close();
    }
    assert.match(lines[0]!, /^\+ overlap /);
    assert.match(lines[1]!, /^- overlap /);
    assert.equal(lines[2], "· no change, 0 open");
    assert.match(lines.at(-1)!, /0 finding\(s\) open after 3 run\(s\)/);
  });

  test("watch ends needs-human while a finding stays open, and takes its folders from --watch", async () => {
    const folder = dir("served");
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, "index.html"), readFileSync(join(fixtures, "overlap-fail.html"), "utf8"));
    const lines: string[] = [];
    const code = await main(["watch", folder, "--watch", folder, "--times", "1", "--sizes", "390x844"], {
      cwd: scratch,
      env: { PLAYWRIGHT_MODULE: playwrightModule, BROWSER_EXECUTABLE: browser },
      log: (line) => lines.push(line),
      error: (line) => lines.push(line),
    });
    assert.equal(code, 3);
    assert.match(lines.join("\n"), /finding\(s\) open after 1 run\(s\)/);
  });
});
