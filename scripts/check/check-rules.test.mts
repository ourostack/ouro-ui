import assert from "node:assert/strict";
import { copyFileSync, readFileSync } from "node:fs";


import { join } from "node:path";
import { describe, test } from "node:test";

import { chromium } from "playwright";
import { blank, BUDGETS, caption, check, goTo, summary, transportIssues, type Report } from "../../registry/ouro/check/run.ts";

import { globToRegExp, listPages, serve } from "../../registry/ouro/check/serve.ts";
import { dir, fixtures, page, quiet, site, two } from "./kit.mts";

// Part of Ouro check's Node side tests; scripts/check.test.mjs runs every file here under Node's coverage.

describe("Ouro check going to a page", () => {
  // A page whose goto loses to an about:blank navigation still landing, for the first `lost` tries.
  const late = (lost: number, message = 'page.goto: Navigation to "http://127.0.0.1/inp-pass.html" is interrupted by another navigation to "about:blank"', quiet = false) => {
    const calls: string[] = [];
    return {
      calls,
      page: {
        goto: async (url: string) => {
          calls.push(`goto ${url}`);
          if (calls.filter((call) => call.startsWith("goto")).length <= lost) throw new Error(message);
          return "answer";
        },
        waitForEvent: async (event: string) => {
          calls.push(`wait ${event}`);
          if (quiet) throw new Error("page.waitForEvent: Timeout 5000ms exceeded while waiting for event \"load\"");
        },
      },
    };
  };

  test("lets an about:blank navigation still landing finish, then goes to the page again", async () => {
    const { page, calls } = late(2);
    assert.equal(await goTo(page as never, "/inp-pass.html"), "answer");
    assert.deepEqual(calls, ["goto /inp-pass.html", "wait load", "goto /inp-pass.html", "wait load", "goto /inp-pass.html"]);
  });

  test("lets a navigation to the same page that a press set off finish, then asks for the page again (#1595)", async () => {
    const same = late(1, 'page.goto: Navigation to "/inp-pass.html" is interrupted by another navigation to "/inp-pass.html"');
    assert.equal(await goTo(same.page as never, "/inp-pass.html"), "answer");
    assert.deepEqual(same.calls, ["goto /inp-pass.html", "wait load", "goto /inp-pass.html"]);
  });

  test("waits for the load of the navigation that won, not the page it replaced, and goes on when that load came first (#1641)", async () => {
    const message = 'page.goto: Navigation to "/inp-pass.html" is interrupted by another navigation to "/inp-pass.html"';
    const loaded = late(2, message);
    assert.equal(await goTo(loaded.page as never, "/inp-pass.html"), "answer");
    assert.deepEqual(loaded.calls, ["goto /inp-pass.html", "wait load", "goto /inp-pass.html", "wait load", "goto /inp-pass.html"]);
    const early = late(1, message, true);
    assert.equal(await goTo(early.page as never, "/inp-pass.html"), "answer");
    assert.deepEqual(early.calls, ["goto /inp-pass.html", "wait load", "goto /inp-pass.html"]);
  });

  test("gives up after its last try, and passes any other failure on at once", async () => {
    const lost = late(3);
    await assert.rejects(goTo(lost.page as never, "/inp-pass.html"), /is interrupted by another navigation to "about:blank"/);
    assert.equal(lost.calls.filter((call) => call.startsWith("goto")).length, 3);
    const other = late(1, 'page.goto: Navigation to "http://127.0.0.1/inp-pass.html" is interrupted by another navigation to "http://127.0.0.1/elsewhere.html"');
    await assert.rejects(goTo(other.page as never, "/inp-pass.html"), /elsewhere\.html/);
    assert.deepEqual(other.calls, ["goto /inp-pass.html"]);
  });
});

describe("Ouro check's blank page", () => {
  // A page whose goto fails as Playwright's does when a navigation the page started itself wins, for the first `lost` tries.
  const racing = (lost: number, message = 'page.goto: Navigation to "about:blank" is interrupted by another navigation to "http://127.0.0.1/inp-pass.html?moved"', at = "http://127.0.0.1/inp-pass.html?moved") => {
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
        url: () => at,
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

  test("is done when the navigation that wins is to about:blank too, once the page has loaded it", async () => {
    const toBlank = 'page.goto: Navigation to "about:blank" is interrupted by another navigation to "about:blank"';
    const won = racing(3, toBlank, "about:blank");
    await blank(won.page as never);
    assert.deepEqual(won.calls, ["goto about:blank", "wait load"]);
    // Still somewhere else once that has loaded, it tries again, and gives up after its last try.
    const elsewhere = racing(3, toBlank);
    await assert.rejects(blank(elsewhere.page as never), /is interrupted by another navigation to "about:blank"/);
    assert.deepEqual(elsewhere.calls, ["goto about:blank", "wait load", "goto about:blank", "wait load", "goto about:blank", "wait load"]);
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

  test("lists a folder's pages, sorted, without hidden folders, node_modules or redirect pages, and matches a glob", async () => {
    const folder = site("listed", { "index.html": "", "b.html": "", "docs/index.html": "", "docs/deep/x.html": "", "docs/a.css": "", ".hidden/x.html": "", "node_modules/x/index.html": "", "docs/Old/index.html": '<!doctype html><meta http-equiv="refresh" content="0; url=/docs/" />' });
    assert.deepEqual(await listPages(folder), ["/", "/b.html", "/docs/", "/docs/deep/x.html"]);
    assert.deepEqual(await listPages(folder, "docs/**"), ["/docs/", "/docs/deep/x.html"]);
    assert.deepEqual(await listPages(folder, "/docs/*"), ["/docs/"]);
    assert.ok(globToRegExp("/**/x.html").test("/x.html") && globToRegExp("/**/x.html").test("/docs/deep/x.html"));
    assert.ok(globToRegExp("/?.html").test("/b.html") && !globToRegExp("/?.html").test("/bb.html"));
    assert.ok(globToRegExp("/a+(b).html").test("/a+(b).html") && !globToRegExp("/a.html").test("/aXhtml"));
  });
});

describe("Ouro check's design rules", () => {
  test("reports an inset framed surface with the surface-token fix at both sizes and themes", async () => {
    const markup = (fixed: boolean) => `
      <div style="width:340px;height:200px;padding:24px;overflow:hidden;border:1px solid var(--line);background:var(--shell)">
        <div id="card" style="width:220px;height:100px;${fixed ? "" : "border:1px solid var(--line);"}background:var(--card)">A collection</div>
      </div>`;
    const styles = "<style>:root{--shell:#ddd;--card:#fff;--line:#888}.dark{--shell:#202020;--card:#555;--line:#888}</style>";
    const folder = site("inset-frame", {
      "broken.html": page(markup(false), styles),
      "fixed.html": page(markup(true), styles),
    });
    const report = await check({ targets: [folder], out: dir("inset-frame"), sizes: [[390, 844], [1280, 800]], themes: ["light", "dark"], config: { walk: false }, measured: false, axe: false, chromium, log: quiet });
    const findings = report.findings.filter((finding) => finding.rule === "nested-frame");
    assert.equal(findings.length, 4, JSON.stringify(findings));
    assert.ok(findings.every((finding) => finding.page.includes("broken.html") && finding.gated));
    assert.deepEqual(new Set(findings.map(({ width, theme }) => `${width} ${theme}`)), new Set(["390 light", "390 dark", "1280 light", "1280 dark"]));
    assert.ok(findings.every((finding) => /\): .*theme surface tokens/.test(caption(finding))));
    assert.ok(findings.every((finding) => /for mismatched corners, .*radius/.test(caption(finding))));
  });

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

  test("cramped-heading: a closed details' hidden children count as no box above a heading", async () => {
    const block = `<code style="display:block;height:48px;background:#ddd">verify:testExists(a)</code>`;
    const folder = site("closed-details", {
      "closed.html": page(`<ul style="margin:0;padding:0"><li><details><summary>Checks</summary>${block}</details></li></ul><h2 style="margin:60px 0 0;font-size:25px">Pin a version</h2>`, ""),
    });
    const result = await check({ targets: [folder], out: dir("closed-details"), sizes: [[1440, 900]], themes: ["light"], chromium, log: quiet });
    assert.deepEqual(result.findings.filter((f) => f.rule === "cramped-heading"), []);
  });

  test("cramped-heading: an aria-hidden layer that takes no presses is no box above a heading", async () => {
    const folder = site("decoration", {
      "overlay.html": page(`<div><span aria-hidden="true" style="display:block;height:60px;pointer-events:none;box-shadow:0 0 0 6px #ddd"></span><h2 style="margin:0;font-size:25px">Notes</h2><p>Words under it.</p></div>`, ""),
    });
    const result = await check({ targets: [folder], out: dir("decoration"), sizes: [[1440, 900]], themes: ["light"], chromium, log: quiet });
    assert.deepEqual(result.findings.filter((f) => f.rule === "cramped-heading"), []);
  });

  test("giant-text: mendelow.me's root type, grown with the screen to 24px, fails on a 4K display and not on a laptop, and ouro-base's 125% step passes", async () => {
    const words = "<p>Selected work, from the timeline to the tea. Each piece sits under a rule and reads top to bottom.</p><p>The words are the page's running text, drawn at the body size the root sets.</p>";
    const style = (root: string) => `<style>main{max-width:36rem;margin:0 auto}body{font-size:1.125rem}h1{font-size:4rem;line-height:1}${root}</style>`;
    const folder = site("giant-text", {
      "grown.html": page(`<h1>Ari</h1>${words}`, style("@media (min-width: 1600px) { html { font-size: min(calc(0.45vw + 8.8px), 24px); } }")),
      "stepped.html": page(`<h1>Ari</h1>${words}`, style("@media (width >= 150rem) { html { font-size: 112.5%; } } @media (width >= 200rem) { html { font-size: 125%; } }")),
    });
    const result = await check({ targets: [folder], out: dir("giant-text"), sizes: [[1440, 900], [3840, 2160]], themes: ["light"], chromium, log: quiet });
    const giant = result.findings.filter((f) => f.rule === "giant-text");
    assert.deepEqual(giant.map((f) => `${f.page} ${f.width} ${f.element}`), ["/grown.html 3840 the page's running text"]);
    assert.match(giant[0]!.detail, /^most of it is drawn at 27px \(\d+ characters\); keep reading text to 24px or under at every screen size$/);
  });

  test("giant-text counts no emoji: a picker's grid drawn large on a 4K display is no running text (#2363)", async () => {
    const grid = Array.from({ length: 80 }, () => `<button type="button" aria-label="Thumbs up">\u{1F44D}\u{1F3FD}</button>`).join("");
    const head = `<style>main{max-width:36rem;margin:0 auto}button{font-size:1.5rem;border:0;background:none;padding:4px}@media (width >= 150rem) { html { font-size: 112.5%; } }</style>`;
    const folder = site("giant-emoji", { "picker.html": page(`<h1>Pick a reaction</h1><p>Choose a skin tone first.</p><div>${grid}</div>`, head) });
    const result = await check({ targets: [folder], out: dir("giant-emoji"), sizes: [[3840, 2160]], themes: ["light"], chromium, log: quiet });
    assert.deepEqual(result.findings.filter((f) => f.rule === "giant-text"), []);
  });

  test("dark-miss leaves a fill from a token the theme gives a dark value, as nova's near-white primary, and still finds one with no dark value (#2363)", async () => {
    const bubble = (fill: string) => `<p>The page is dark.</p><div class="bubble" style="padding:16px;border-radius:12px;color:#171717;background:${fill}">Perfect, thank you both.</div>`;
    // shadcn's way: a .dark class the app sets from the scheme, and Tailwind's bg-primary reading --color-primary, which reads --primary.
    const classTheme = `<style>:root{--background:#ffffff;--primary:#171717;--color-primary:var(--primary)}.dark{--background:#0a0a0a;--primary:#e5e5e5}body{background:var(--background);color:#fafafa}.bg-primary{background-color:var(--color-primary)}</style><script>document.documentElement.classList.toggle("dark", matchMedia("(prefers-color-scheme: dark)").matches)</script>`;
    const mediaTheme = `<style>:root{--background:#ffffff;--card:#eeeeee;--primary:#171717}@media (prefers-color-scheme: dark){:root{--background:#0a0a0a;--primary:#e5e5e5}}body{background:var(--background);color:#fafafa}</style>`;
    const folder = site("dark-tokens", {
      "class.html": page(`<p>The page is dark.</p><div class="bg-primary" style="padding:16px;border-radius:12px;color:#171717">Perfect, thank you both.</div>`, classTheme),
      "media.html": page(bubble("var(--primary)"), mediaTheme),
      "light-only-token.html": page(bubble("var(--card)"), mediaTheme),
      "literal.html": page(bubble("#e5e5e5"), mediaTheme),
    });
    const result = await check({ targets: [folder], out: dir("dark-tokens"), sizes: [[1440, 900]], themes: ["dark"], chromium, log: quiet });
    const misses = result.findings.filter((f) => f.rule === "dark-miss").map((f) => f.page).sort();
    assert.deepEqual(misses, ["/light-only-token.html", "/literal.html"]);
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
