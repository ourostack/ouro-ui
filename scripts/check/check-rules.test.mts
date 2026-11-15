import assert from "node:assert/strict";
import { copyFileSync, readFileSync } from "node:fs";


import { join } from "node:path";
import { describe, test } from "node:test";

import { chromium } from "playwright";
import { blank, BUDGETS, check, summary, transportIssues, type Report } from "../../registry/ouro/check/check.ts";

import { globToRegExp, listPages, serve } from "../../registry/ouro/check/serve.ts";
import { dir, fixtures, page, quiet, site, two } from "./kit.mts";

// Part of Ouro check's Node side tests; scripts/check.test.mjs runs every file here under Node's coverage.

describe("Ouro check's blank page", () => {
  // A page whose goto fails as Playwright's does when a navigation the page started itself wins, for the first `lost` tries.
  const racing = (lost: number, message = 'page.goto: Navigation to "about:blank" is interrupted by another navigation to "http://127.0.0.1/inp-pass.html?moved"') => {
    const calls: string[] = [];
    return {
      calls,
      page: {
        goto: async (url: string) => {
          calls.push(`goto ${url}`);
          if (calls.filter((call) => call.startsWith("goto")).length <= lost) throw new Error(message);
          return null;
        },
        waitForLoadState: async (state?: string) => void calls.push(`wait ${state}`),
      },
    };
  };

  test("lets a navigation the page started itself finish, then opens the blank page again", async () => {
    const { page, calls } = racing(2);
    await blank(page as never);
    assert.deepEqual(calls, ["goto about:blank", "wait load", "goto about:blank", "wait load", "goto about:blank"]);
  });

  test("gives up on the blank page after its last try, and passes any other failure on at once", async () => {
    const lost = racing(3);
    await assert.rejects(blank(lost.page as never), /is interrupted by another navigation/);
    assert.equal(lost.calls.filter((call) => call.startsWith("goto")).length, 3);
    const other = racing(1, "page.goto: Target page, context or browser has been closed");
    await assert.rejects(blank(other.page as never), /has been closed/);
    assert.deepEqual(other.calls, ["goto about:blank"]);
  });
});

describe("Ouro check's server", () => {
  test("serves a built folder as a host would, and nothing outside it", async () => {
    const folder = site("served", { "index.html": "<h1>Home</h1>", "docs/index.html": "<h1>Docs</h1>", "data.bin": "x", "style.CSS": "p{}" });
    const server = await serve(folder);
    try {
      const get = async (path: string) => {
        const response = await fetch(`${server.origin}${path}`);
        return [response.status, response.headers.get("content-type"), await response.text()];
      };
      assert.deepEqual(await get("/"), [200, "text/html", "<h1>Home</h1>"]);
      assert.deepEqual(await get("/docs"), [200, "text/html", "<h1>Docs</h1>"]);
      assert.deepEqual(await get("/docs/"), [200, "text/html", "<h1>Docs</h1>"]);
      assert.deepEqual(await get("/data.bin"), [200, "application/octet-stream", "x"]);
      assert.deepEqual(await get("/style.CSS"), [200, "text/css", "p{}"]);
      assert.equal((await get("/missing.html"))[0], 404);
      assert.equal((await get("/..%2f..%2fpackage.json"))[0], 403);
      assert.equal((await get("/50%off.png"))[0], 400);
    } finally {
      await server.close();
    }
  });

  test("lists a folder's pages, sorted, without hidden folders or node_modules, and matches a glob", async () => {
    const folder = site("listed", { "index.html": "", "b.html": "", "docs/index.html": "", "docs/deep/x.html": "", "docs/a.css": "", ".hidden/x.html": "", "node_modules/x/index.html": "" });
    assert.deepEqual(await listPages(folder), ["/", "/b.html", "/docs/", "/docs/deep/x.html"]);
    assert.deepEqual(await listPages(folder, "docs/**"), ["/docs/", "/docs/deep/x.html"]);
    assert.deepEqual(await listPages(folder, "/docs/*"), ["/docs/"]);
    assert.ok(globToRegExp("/**/x.html").test("/x.html") && globToRegExp("/**/x.html").test("/docs/deep/x.html"));
    assert.ok(globToRegExp("/?.html").test("/b.html") && !globToRegExp("/?.html").test("/bb.html"));
    assert.ok(globToRegExp("/a+(b).html").test("/a+(b).html") && !globToRegExp("/a.html").test("/aXhtml"));
  });
});

describe("Ouro check's design rules", () => {
  // Ari's findings of 2026-11-09, each as a fixture page that reproduces it: the check fails on each and passes once it
  // is fixed (each rule's pass page, in the test above).
  test("fails each seed case where a person saw it, with numbers that say why", async () => {
    const pages = ["giant-picture", "cramped-heading", "baked-corner", "jank", "type-scale"].map((rule) => `${rule}-fail.html`);
    const folder = site("seeds", Object.fromEntries(pages.map((file) => [file, readFileSync(join(fixtures, file), "utf8")])));
    for (const file of ["picture-960.png", "picture-160.png"]) copyFileSync(join(fixtures, file), join(folder, file));
    const result = await check({ targets: [folder], out: dir("seeds"), sizes: two, themes: ["light"], chromium, log: quiet });
    const of = (rule: string) => result.findings.filter((f) => f.rule === rule);
    // mendelow.me's giant photo: a banner leading a work entry fails on a laptop, not on a phone, where it is small.
    assert.deepEqual(of("giant-picture").map((f) => `${f.width} ${f.element}`), ['1440 img "A scene of a workshop at dawn" in article.card "Ouro UI"']);
    assert.match(of("giant-picture")[0]!.detail, /^the picture is \d+×\d+, \d+% of its item's height and [\d.]+ times its words'$/);
    // Ouro MD's header: the title row 6px under the hero art.
    assert.deepEqual(of("cramped-heading").map((f) => f.detail), ["6px below img.hero; a 48px heading needs 24px", "6px below img.hero; a 48px heading needs 24px"]);
    // Ouro MD's recording: the window's own dark corners inside the page's rounded frame.
    assert.ok(of("baked-corner").length > 0 && of("baked-corner").every((f) => /^the (top left|top right|bottom left|bottom right)(, (top right|bottom left|bottom right))+ corners draw a colour/.test(f.detail)), JSON.stringify(of("baked-corner")));
    // The plan map's jank: walked at one size and theme, each step three times.
    const jank = of("jank");
    assert.deepEqual(jank.map((f) => `${f.width} ${f.element}`).sort(), ['1440 hovering a#growing "Grows on hover"', '1440 hovering a#thrash "Measures every card on hover"', '1440 opening and closing button#open "Show the plan"']);
    assert.match(jank.find((f) => f.element.includes("thrash"))!.detail, /it forced \d+ layouts in its best run \(keep to 50\)/);
    assert.match(jank.find((f) => f.element.includes("growing"))!.detail, /it moved the page by a layout shift of [\d.]+ in its best run \(keep to 0.01\)/);
    const slow = jank.find((f) => f.element.includes("open"))!;
    assert.match(slow.detail, /^its longest frame took \d+ ms \(median of 3; budget 250 ms\)$/);
    assert.ok(slow.value! > BUDGETS.jank && slow.budget === BUDGETS.jank && slow.unit === "ms" && slow.samples!.length === 3, slow.detail);
    assert.ok(jank.every((f) => f.closeUp));
    // Refactoring UI's limited type scale: eleven sizes and five weights.
    assert.deepEqual(of("type-scale").map((f) => f.element), ["the page's text sizes", "the page's font weights", "the page's text sizes", "the page's font weights"]);
    // The walk is off with walk: false, and with the measured rules.
    const quietly = await check({ targets: [folder], out: dir("unwalked"), sizes: [[1440, 900]], themes: ["light"], config: { walk: false }, chromium, log: quiet });
    assert.deepEqual(quietly.findings.filter((f) => f.rule === "jank"), []);
  });

  test("judges jank only on a step's full runs: a covered target that returns is waited for, and one that never returns skips the step", async () => {
    // A button whose first click alone takes 400 ms; the veil covers it after that click, for 1200 ms or for good.
    const plan = (veil: string) => page(`<button id="open" type="button" aria-expanded="false">Show the plan</button><div id="panel" hidden>The plan.</div><div style="height:1200px"></div><script>const open = document.getElementById("open"); let clicks = 0; open.addEventListener("click", () => { clicks++; if (clicks === 1) { const start = performance.now(); while (performance.now() - start < 400); ${veil} } const shown = open.getAttribute("aria-expanded") === "true"; open.setAttribute("aria-expanded", String(!shown)); document.getElementById("panel").hidden = shown; });</script>`);
    const cover = `const veil = document.createElement("div"); veil.style.cssText = "position:fixed;inset:0;z-index:9"; document.body.append(veil);`;
    const slow = page(`<button id="open" type="button" aria-expanded="false">Show the plan</button><div id="panel" hidden>The plan.</div><div style="height:1200px"></div><script>const open = document.getElementById("open"); open.addEventListener("click", () => { const start = performance.now(); while (performance.now() - start < 400); const shown = open.getAttribute("aria-expanded") === "true"; open.setAttribute("aria-expanded", String(!shown)); document.getElementById("panel").hidden = shown; });</script>`);
    const folder = site("full-runs", {
      "slow.html": slow,
      "veiled.html": plan(`${cover} setTimeout(() => veil.remove(), 1200);`),
      "buried.html": plan(cover),
    });
    const result = await check({ targets: [folder], out: dir("full-runs"), sizes: [[1440, 900]], themes: ["light"], chromium, log: quiet });
    const jank = result.findings.filter((f) => f.rule === "jank");
    assert.deepEqual(jank.map((f) => `${f.page} ${f.element}`), ['/slow.html opening and closing button#open "Show the plan"']);
    assert.equal(jank[0]!.samples!.length, 3);
    assert.ok(jank[0]!.samples!.every((ms) => ms > BUDGETS.jank), JSON.stringify(jank[0]!.samples));
  });

  test("https: a site moves http:// to https:// with a 301 and asks for HSTS for a year, and so does its www. name", async () => {
    const calls: string[] = [];
    // A stand-in for the web: each address answers with a status and headers, or throws as fetch does when a name
    // doesn't resolve or a certificate fails.
    const web = (answers: Record<string, [number, Record<string, string>] | Error>) =>
      (async (url: string | URL | Request) => {
        calls.push(String(url));
        const answer = answers[String(url)];
        if (answer === undefined) throw Object.assign(new TypeError("fetch failed"), { cause: new Error("getaddrinfo ENOTFOUND") });
        if (answer instanceof Error) throw answer;
        return new Response(null, { status: answer[0], headers: answer[1] });
      }) as typeof fetch;
    const year = { "strict-transport-security": "max-age=31536000; includeSubDomains" };
    assert.deepEqual(await transportIssues("127.0.0.1:5173", web({})), []);
    assert.deepEqual(await transportIssues("app.localhost", web({})), []);
    assert.deepEqual(calls, []);
    const good = web({
      "http://good.test/": [301, { location: "https://good.test/" }],
      "https://good.test/": [200, year],
      "http://www.good.test/": [308, { location: "https://good.test/" }],
      "https://www.good.test/": [301, { location: "https://good.test/" }],
    });
    assert.deepEqual(await transportIssues("good.test", good), []);
    const bad = web({
      "http://bad.test/": [200, {}],
      "https://bad.test/": [200, {}],
      "http://www.bad.test/": [301, { location: "http://bad.test" }],
      "https://www.bad.test/": Object.assign(new TypeError("fetch failed"), { cause: new Error("certificate has expired") }),
    });
    assert.deepEqual(await transportIssues("bad.test", bad), [
      { element: "http://bad.test/", detail: "answers 200 over plain HTTP instead of moving to https://" },
      { element: "https://bad.test/", detail: "sends no Strict-Transport-Security" },
      { element: "http://www.bad.test/", detail: "moves to http://bad.test with 301, not to https:// with a 301" },
      { element: "https://www.bad.test/", detail: "does not answer over HTTPS: Error: certificate has expired" },
    ]);
    // A www. site's twin is its bare name; a site that doesn't listen on http:// serves nothing over it; a subdomain has
    // no twin.
    calls.length = 0;
    const short = web({ "http://short.test/": [302, {}], "https://www.short.test/": [200, { "strict-transport-security": "max-age=300" }], "https://ui.short.test/": new Error("refused") });
    assert.deepEqual(await transportIssues("www.short.test", short), [
      { element: "https://www.short.test/", detail: "Strict-Transport-Security max-age=300, under a year" },
      { element: "http://short.test/", detail: "moves to nowhere with 302, not to https:// with a 301" },
      { element: "https://short.test/", detail: "does not answer over HTTPS: Error: getaddrinfo ENOTFOUND" },
    ]);
    calls.length = 0;
    assert.deepEqual(await transportIssues("ui.short.test", short), [{ element: "https://ui.short.test/", detail: "does not answer over HTTPS: refused" }]);
    assert.deepEqual(calls, ["http://ui.short.test/", "https://ui.short.test/"]);

    // In a run: once a site, at the first size and theme, in the first shard only, gated as any finding is.
    const out = dir("https");
    const result = await check({ targets: ["https://bad.test/"], out, sizes: two, themes: ["dark", "light"], fetch: bad, chromium, log: quiet });
    assert.deepEqual(result.findings.filter((f) => f.rule === "https").map((f) => `${f.site} ${f.width}x${f.height} ${f.theme} ${f.element}`), [
      "bad.test 390x844 dark http://bad.test/",
      "bad.test 390x844 dark https://bad.test/",
      "bad.test 390x844 dark http://www.bad.test/",
      "bad.test 390x844 dark https://www.bad.test/",
    ]);
    assert.ok(result.findings.filter((f) => f.rule === "https").every((f) => f.gated && !f.closeUp));
    assert.match(summary(JSON.parse(readFileSync(join(out, "report.json"), "utf8")) as Report), /no HTTPS/);
    const second = await check({ targets: ["https://bad.test/"], out: dir("https-2"), sizes: two, themes: ["light"], shard: [2, 2], fetch: bad, chromium, log: quiet });
    assert.deepEqual(second.findings.filter((f) => f.rule === "https"), []);
    const waived = await check({ targets: ["https://bad.test/"], out: dir("https-3"), sizes: [[390, 844]], themes: ["light"], fetch: bad, config: { waive: { "/": { https: "a staging site" } } }, chromium, log: quiet });
    assert.ok(waived.findings.some((f) => f.rule === "https") && waived.gated.every((f) => f.rule !== "https"));
  });
});
