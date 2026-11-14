import assert from "node:assert/strict";
import { copyFileSync, existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";

import { join } from "node:path";
import { describe, test } from "node:test";

import { chromium } from "playwright";
import { check, group, imagesReport, merge, placeOf, type Finding, type Gate, type Report } from "../../registry/ouro/check/check.ts";

import { serve } from "../../registry/ouro/check/serve.ts";
import { axe, browser, dir, fixtures, page, quiet, run, scratch, site, two } from "./kit.mts";

// Part of Ouro check's Node side tests; scripts/check.test.mjs runs every file here under Node's coverage.

describe("Ouro check", () => {
  test("names a page by site and path across several sites, a URL by its host and path, and the home page home", async () => {
    const server = await serve(fixtures);
    try {
      const first = site("first", { "index.html": page("<h1>Home</h1>"), "x.html": page("<h1>X</h1>") });
      const other = site("other", { "index.html": page("<h1>Home</h1>") });
      const url = `${server.origin}/overlap-pass.html?x=1#y`;
      const out = dir("sites");
      const result = await check({ targets: [first, other, url], out, sizes: [[390, 844]], themes: ["light"], chromium, log: quiet });
      assert.deepEqual(
        result.pages.map((p) => [p.site, p.page, p.name]),
        [
          ["first", "/", "first"],
          ["first", "/x.html", "first-x"],
          ["other", "/", "other"],
          [new URL(server.origin).host, "/overlap-pass.html?x=1#y", `${new URL(server.origin).host}-overlap-pass-html-x-1-y`.replace(/\W+/g, "-")],
        ],
      );
      const home = site("one", { "index.html": page("<h1>Home</h1>") });
      const alone = await check({ targets: [home], out: dir("home"), sizes: [[390, 844]], themes: ["light"], chromium, log: quiet });
      assert.equal(alone.pages[0]!.name, "home");
      // A URL with a long query, as an app's route can be: its start and a hash, short enough for a file name, and apart.
      const long = (n: number) => `${server.origin}/overlap-pass.html#/meeting?link=${encodeURIComponent(`https://example.test/l/meetup-join/${"a".repeat(300)}${n}`)}`;
      const named = await check({ targets: [long(1), long(2)], out: dir("long"), sizes: [[390, 844]], themes: ["light"], chromium, log: quiet });
      const names = named.pages.map((p) => p.name);
      assert.ok(names.every((name) => /^overlap-pass-html-meeting-link-https-3A-2F-2Fexample-test-2F-[0-9a-f]{8}$/.test(name)), names.join(" "));
      assert.notEqual(names[0], names[1]);
      assert.equal(named.shots.length, 2);
      // The same page twice, the second by a route in its hash, a same-document move from the first: each loads afresh.
      const routes = await check({ targets: [`${server.origin}/overlap-pass.html`, `${server.origin}/overlap-pass.html#/route`], out: dir("routes"), sizes: [[390, 844]], themes: ["light"], chromium, log: quiet });
      assert.deepEqual(routes.findings, []);
      assert.equal(routes.shots.length, 2);
    } finally {
      await server.close();
    }
  });

  test("draws a screen wider than 3072px at density 1, holds its pictures to that, and records the density of each finding", async () => {
    const wide = site("wide", { "page.html": page('<h1>Wide</h1><img src="picture-960.png" alt="A picture" style="width:900px;height:auto">') });
    copyFileSync(join(fixtures, "picture-960.png"), join(wide, "picture-960.png"));
    const result = await check({ targets: [wide], out: dir("wide"), sizes: [[3072, 1728], [3200, 1800]], themes: ["light"], chromium, log: quiet });
    assert.deepEqual(result.findings.map((f) => [f.rule, f.width, f.dpr]), [["blurry-image", 3072, 2]]);
  });

  test("never waives a blurry picture, and lists each one, with the file it needs, in the images report", async () => {
    const art = site("art", {
      "page.html": page('<h1>Art</h1><img src="picture-160.png" alt="A picture" style="width:320px;height:auto"><img src="picture-960.png" alt="A sharp picture" style="width:320px;height:auto">'),
      "other.html": page('<h1>Other</h1><p data-ouro-allow="blurry-image" data-ouro-allow-why="soft on purpose">Words</p>'),
    });
    for (const file of ["picture-160.png", "picture-960.png"]) copyFileSync(join(fixtures, file), join(art, file));
    const cwd = dir("art-cwd");
    writeFileSync(join(cwd, "ouro-check.json"), JSON.stringify({ waive: { "**": { "*": "everything on purpose" } } }));
    const result = await run([art, "--sizes", "390x844,1440x900", "--themes", "light", "--no-axe", "--no-measured", "--out", "first", "--images-report", "reports/images.json"], { cwd, env: { BROWSER_EXECUTABLE: browser } });
    assert.equal(result.code, 3, result.out + result.err);
    assert.match(result.out, /Images report: 1 picture\(s\) too small for where they are drawn, in reports\/images\.json/);
    const { images } = JSON.parse(readFileSync(join(cwd, "reports", "images.json"), "utf8")) as { images: Record<string, unknown>[] };
    assert.deepEqual(images, [
      {
        url: "/page.html",
        site: "art",
        page: "/page.html",
        selector: "body > main > img:nth-of-type(1)",
        element: "picture-160.png",
        currentSrc: images[0]!.currentSrc,
        naturalWidth: 160,
        naturalHeight: 90,
        renderedWidth: 320,
        dpr: 2,
        requiredWidth: 640,
        file: join(realpathSync(art), "picture-160.png"),
        sizes: ["390x844@2x light", "1440x900@2x light"],
      },
    ]);
    assert.match(String(images[0]!.currentSrc), /^http:\/\/[^/]+\/picture-160\.png$/);
    const report = JSON.parse(readFileSync(join(cwd, "first", "report.json"), "utf8")) as Report;
    // The waiver attempt is a finding of its own, and the config's "*" covers every rule but this one.
    assert.deepEqual(group(report.findings.filter((f) => f.gated)).map((g) => [g.page, g.rule, g.element]), [
      ["/other.html", "blurry-image", 'p "Words" [data-ouro-allow="blurry-image"]'],
      ["/page.html", "blurry-image", "picture-160.png"],
    ]);
    const merged = await run(["merge", "first", "--out", "merged", "--images-report", "merged.json"], { cwd });
    assert.equal(merged.code, 3, merged.err);
    assert.deepEqual(JSON.parse(readFileSync(join(cwd, "merged.json"), "utf8")), { images });
  });

  test("names a picture's file only when the check served it from a built folder, and keeps the largest need for each", () => {
    const at = { site: "s", page: "/a.html", name: "a" };
    assert.deepEqual(placeOf({ ...at, url: "https://site.test/a.html" }, "https://site.test/p.png"), { url: "https://site.test/a.html" });
    const served = { ...at, url: "http://127.0.0.1:5000/a.html", root: "/built" };
    assert.deepEqual(placeOf(served, "http://127.0.0.1:5000/art/my%20scene.png"), { url: "/a.html", file: join("/built", "art/my scene.png") });
    assert.deepEqual(placeOf(served, "https://cdn.test/p.png"), { url: "/a.html" });
    assert.deepEqual(placeOf(served, "blob:http://127.0.0.1:5000/1234"), { url: "/a.html" });
    assert.deepEqual(placeOf(served, "data:image/png;base64,AAAA"), { url: "/a.html" });
    const image = { selector: "img", src: "p.png", naturalWidth: 100, naturalHeight: 50, renderedWidth: 100, renderedHeight: 50, density: 2, requiredWidth: 200 };
    const finding = (over: Partial<Finding>, size: Partial<typeof image>): Finding => ({ site: "s", page: "/a.html", width: 390, height: 844, theme: "light", rule: "blurry-image", element: "p.png", detail: "", gated: true, ...over, image: { ...image, ...size } });
    assert.deepEqual(
      imagesReport([
        finding({ rule: "overlap" }, {}),
        finding({ width: 1440, height: 900 }, { renderedWidth: 300, requiredWidth: 600 }),
        finding({ theme: "dark" }, { renderedWidth: 400, requiredWidth: 400 }),
        finding({ width: 3840, height: 2160 }, { renderedWidth: 200, density: 1, requiredWidth: 700 }),
        finding({ page: "/b.html" }, { selector: "div", src: "q.png" }),
        finding({ site: "r" }, { renderedWidth: 120, requiredWidth: 240 }),
        finding({ site: "s", page: "/a.html" }, { selector: "p", src: "r.png", requiredWidth: 900 }),
      ].map((f, i) => (i === 0 ? { ...f, image: undefined } : i === 5 ? { ...f, image: { ...f.image!, url: "https://r.test/a.html", file: "/r/p.png" } } : f)) as Finding[]),
      [
        { url: "https://r.test/a.html", site: "r", page: "/a.html", selector: "img", element: "p.png", currentSrc: "p.png", naturalWidth: 100, naturalHeight: 50, renderedWidth: 120, dpr: 2, requiredWidth: 240, file: "/r/p.png", sizes: ["390x844@2x light"] },
        { url: "/a.html", site: "s", page: "/a.html", selector: "p", element: "p.png", currentSrc: "r.png", naturalWidth: 100, naturalHeight: 50, renderedWidth: 100, dpr: 2, requiredWidth: 900, file: null, sizes: ["390x844@2x light"] },
        { url: "/a.html", site: "s", page: "/a.html", selector: "img", element: "p.png", currentSrc: "p.png", naturalWidth: 100, naturalHeight: 50, renderedWidth: 400, dpr: 1, requiredWidth: 700, file: null, sizes: ["1440x900@2x light", "390x844@2x dark", "3840x2160@1x light"] },
        { url: "/b.html", site: "s", page: "/b.html", selector: "div", element: "p.png", currentSrc: "q.png", naturalWidth: 100, naturalHeight: 50, renderedWidth: 100, dpr: 2, requiredWidth: 200, file: null, sizes: ["390x844@2x light"] },
      ],
    );
  });

  // How many pure blue pixels a picture has, read in the browser.
  const bluePixels = async (file: string) => {
    const reader = await chromium.launch({ executablePath: browser });
    try {
      const tab = await reader.newPage();
      return await tab.evaluate(async (src) => {
        const img = new Image();
        img.src = src;
        await img.decode();
        const canvas = document.createElement("canvas");
        [canvas.width, canvas.height] = [img.naturalWidth, img.naturalHeight];
        const pen = canvas.getContext("2d")!;
        pen.drawImage(img, 0, 0);
        const data = pen.getImageData(0, 0, canvas.width, canvas.height).data;
        let blue = 0;
        for (let i = 0; i < data.length; i += 4) if (data[i]! < 40 && data[i + 1]! < 40 && data[i + 2]! > 215) blue++;
        return blue;
      }, `data:image/png;base64,${readFileSync(file).toString("base64")}`);
    } finally {
      await reader.close();
    }
  };

  test("dark-art: finds a dark page that shows the light run's picture, and passes night art, a light page and a dark run first", async () => {
    const night = "@media (prefers-color-scheme: dark) { body { background: #111; color: #eee } }";
    const art = readFileSync(join(fixtures, "picture-960.png"));
    const folder = site("night", {
      "same.html": page('<h1>Same art</h1><img src="/art.png" width="480" height="270" alt="A meadow">', `<style>${night}</style>`),
      "twins.html": page('<h1>Night art</h1><picture><source media="(prefers-color-scheme: dark)" srcset="/night.png"><img src="/art.png" width="480" height="270" alt="A meadow"></picture>', `<style>${night}</style>`),
      "light.html": page('<h1>Light page</h1><img src="/art.png" width="480" height="270" alt="A meadow">'),
    });
    for (const file of ["art.png", "night.png"]) writeFileSync(join(folder, file), art);
    const dark = (findings: Finding[]) => findings.filter((f) => f.rule === "dark-art").map((f) => [f.page, f.theme, f.element, f.detail]);
    const result = await check({ targets: [folder], out: dir("night"), sizes: [[1440, 900]], themes: ["light", "dark"], config: { walk: false }, chromium, log: quiet });
    assert.deepEqual(dark(result.findings), [["/same.html", "dark", 'img "A meadow"', "the dark theme shows the light theme's picture, art.png"]]);
    const darkFirst = await check({ targets: [folder], out: dir("night"), sizes: [[1440, 900]], themes: ["dark", "light"], config: { walk: false }, chromium, log: quiet });
    assert.deepEqual(dark(darkFirst.findings), []);
  });

  test("judges a page once its animations have run, as a person sees it after a moment", async () => {
    // A label that slides over the words in a second and a half: still on its way when the page has loaded.
    const sliding = site("sliding", {
      "page.html": page('<h1>Sliding</h1><section style="position:relative"><p style="margin:0">Words under a label</p><p style="position:absolute;top:0;left:0;margin:0;animation:in 1.5s ease-out">A label</p></section>', "<style>@keyframes in { from { transform: translateY(600px) } }</style>"),
    });
    const result = await check({ targets: [sliding], out: dir("sliding"), sizes: [[390, 844]], themes: ["light"], config: { walk: false }, chromium, log: quiet });
    assert.deepEqual(result.findings.map((f) => [f.rule, f.element]), [["overlap", 'p "Words under a label" × p "A label"']]);
  });

  test("checks a state a page reaches by presses as a page of its own, and fails one whose press finds nothing", async () => {
    // A view with no address: the cut-off text is there only once Open is pressed.
    const app = site("states", {
      "page.html": page('<h1>States</h1><button onclick="document.getElementById(\'view\').hidden=false">Open</button><p id="view" hidden style="width:60px;overflow:hidden;white-space:nowrap">Text cut off by its box, in a view</p>'),
    });
    const config: Gate = { walk: false, states: { "/page.html": { "a view open": ["text=Open"], missing: ["text=Nowhere"] }, "/other.html": { never: ["text=Open"] } } };
    const result = await check({ targets: [app], out: dir("states"), sizes: [[390, 844]], themes: ["light"], config, chromium, log: quiet });
    assert.deepEqual(
      result.pages.map((p) => [p.page, p.name]),
      [
        ["/page.html", "page"],
        ["/page.html (a view open)", "page-a-view-open"],
        ["/page.html (missing)", "page-missing"],
      ],
    );
    assert.deepEqual(
      result.findings.map((f) => [f.page, f.rule]),
      [
        ["/page.html (a view open)", "clipped-text"],
        ["/page.html (missing)", "http-error"],
      ],
    );
    assert.match(result.findings[1]!.detail, /^the state's press "text=Nowhere" found nothing to press \(/);
    // An app that opens on the view it last showed: each state starts from the page as a new visitor sees it, the last
    // one too, which starts once an earlier one has saved its view.
    const remembering = site("remembering", {
      "page.html": page(
        '<h1>Views</h1><button id="cal">Calendar</button><div id="chat"><button>Open row</button></div><div id="calendar" hidden>Days</div><script>const show = (v) => { chat.hidden = v !== "chat"; calendar.hidden = v !== "calendar"; }; show(localStorage.getItem("view") ?? "chat"); cal.onclick = () => { localStorage.setItem("view", "calendar"); show("calendar"); };</script>',
      ),
    });
    const views = await check({ targets: [remembering], out: dir("remembering"), sizes: [[390, 844], [1440, 900]], themes: ["light", "dark"], config: { walk: false, states: { "/page.html": { calendar: ["text=Calendar"], "calendar again": ["text=Calendar"], "calendar a third time": ["text=Calendar"], "calendar a fourth time": ["text=Calendar"], "a row open": ["text=Open row"] } } }, chromium, log: quiet });
    assert.deepEqual(views.findings, []);
  });

  test("photographs a finding on the screen, wherever on or off the page it sits", async () => {
    // Clipped sideways by the root, so a full-page shot ends at the screen's right edge; the screen scrolls to it.
    const right = site("right", { "page.html": page('<h1>Right</h1><p style="position:absolute;left:1500px;top:20px;width:60px;overflow:hidden;white-space:nowrap">Text cut off by its box, off to the right</p>', "<style>html{overflow-x:clip}</style>") });
    const rightOut = dir("right");
    const shot = await check({ targets: [right], out: rightOut, sizes: [[390, 844]], themes: ["light"], chromium, log: quiet });
    const far = shot.findings.find((f) => f.rule === "clipped-text")!;
    assert.ok(far.box!.x > 1000 && existsSync(join(rightOut, far.closeUp!)), JSON.stringify(far.box));
    const off = site("off", { "page.html": page('<h1>Off</h1><p style="position:absolute;left:-400px;top:-300px;width:60px;overflow:hidden;white-space:nowrap">Text cut off by its box, out of sight</p>') });
    const out = dir("off");
    const result = await check({ targets: [off], out, sizes: [[390, 844]], themes: ["light"], chromium, log: quiet });
    const cut = result.findings.find((f) => f.rule === "clipped-text")!;
    assert.deepEqual([cut.box!.x, cut.box!.y], [0, 0]);
    assert.ok(existsSync(join(out, cut.closeUp!)));
    // Far down a page with a bar stuck to the top of the screen: the close-up is of the text, not the bar over it.
    const barred = site("barred", {
      "page.html": page('<h1>Barred</h1><div style="height:3000px"></div><p style="width:60px;overflow:hidden;white-space:nowrap">Text cut off by its box, far down</p><div style="height:3000px"></div>').replace("<main>", '<div style="position:sticky;top:0;z-index:1"><header style="height:120px;background:#00f"></header></div><main>'),
    });
    const barredOut = dir("barred");
    const down = await check({ targets: [barred], out: barredOut, sizes: [[390, 844]], themes: ["light"], chromium, log: quiet });
    const deep = down.findings.find((f) => f.rule === "clipped-text")!;
    assert.ok(deep.box!.y > 3000 && deep.box!.height > 10, JSON.stringify(deep.box));
    assert.equal(await bluePixels(join(barredOut, deep.closeUp!.replace(/\.png$/, "-raw.png"))), 0);
  });

  test("finds a request to the page's own origin that gets no answer, once, by its path without the server's address or its query", async () => {
    // The server hangs up on /data.json without a word, as a crashed handler does.
    const server = createServer((request, response) => {
      if (request.url!.startsWith("/data.json")) return request.socket.destroy();
      response.writeHead(200, { "content-type": "text/html" }).end('<!doctype html><html lang="en"><title>Drop</title><main><h1>Drop</h1><p>Asks for data.</p></main><script>for (const n of [1, 2, 3]) fetch(`/data.json?try=${n}`).catch(() => undefined)</script>');
    });
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    const { port } = server.address() as { port: number };
    try {
      const result = await check({ targets: [`http://127.0.0.1:${port}/page`], out: dir("drop"), sizes: [[390, 844], [1440, 900]], themes: ["light"], measured: false, chromium, log: quiet });
      const failed = result.findings.filter((f) => f.rule === "failed-request");
      assert.deepEqual(failed.map((f) => [f.element, f.width]), [["GET /data.json", 390], ["GET /data.json", 1440]]);
      assert.match(failed[0]!.detail, /^no answer \(net::ERR_[A-Z_]+\)$/);
    } finally {
      await new Promise((done) => server.close(done));
    }
  });

  test("counts a press that starts a navigation as leaving the page before the address changes, and presses that control no more", async () => {
    // Each press starts a navigation to a new ?slow address that the server answers with no page (204), so the address
    // never changes. A press that starts one must still end that control's presses.
    let slowRequests = 0;
    const html = page(`<h1>Leaves</h1><p>The button leaves the page.</p><button type="button" data-ouro-check-press id="leave">Leave</button><script>let presses = 0; document.getElementById("leave").addEventListener("click", () => (location.search = "?slow=" + ++presses));</script>`);
    const server = createServer((request, response) => {
      if (!request.url!.startsWith("/?slow=")) return response.writeHead(200, { "content-type": "text/html" }).end(html);
      slowRequests++;
      response.writeHead(204).end();
    });
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    const { port } = server.address() as { port: number };
    try {
      await check({ targets: [`http://127.0.0.1:${port}/`], out: dir("leave"), sizes: [[1440, 900]], themes: ["light"], chromium, log: quiet });
      assert.equal(slowRequests, 1);
    } finally {
      server.closeAllConnections();
      await new Promise((done) => server.close(done));
    }
  });

  test("fails a page that answers an error or does not answer, and checks nothing else on it", async () => {
    const server = await serve(fixtures);
    const closed = await serve(fixtures);
    const refused = `${closed.origin}/overlap-fail.html`;
    await closed.close();
    try {
      const result = await check({ targets: [`${server.origin}/nope.html`, refused], out: dir("http"), sizes: [[390, 844]], themes: ["light"], chromium, log: quiet });
      // The two pages load side by side, so in either order.
      const gated = [...result.gated].sort((x, y) => x.detail.localeCompare(y.detail));
      assert.deepEqual(gated.map((f) => [f.rule, f.element]), [["http-error", "the page"], ["http-error", "the page"]]);
      assert.equal(gated[0]!.detail, "answered 404");
      assert.match(gated[1]!.detail, /^no answer: Error: connect ECONNREFUSED/);
    } finally {
      await server.close();
    }
  });

  test("records each opt-out once a page with its reason, plain aliases included, and keeps them through a merge", async () => {
    const opted = site("opted", {
      "page.html": page(
        '<h1>Opted</h1><div data-scroll-x="a timeline people pan sideways" style="overflow-x:auto"><div style="width:2000px;height:8px"></div></div><p data-clip-ok="">An alias without a reason counts for nothing</p><p data-ouro-allow="long-lines" data-ouro-allow-why="a ticker">Ticker</p>',
      ),
    });
    const out = dir("opted");
    const result = await check({ targets: [opted], out, sizes: two, themes: ["light", "dark"], chromium, log: quiet });
    const expected = [
      { site: "opted", page: "/page.html", rules: "long-lines", element: 'p "Ticker"', reason: "a ticker" },
      { site: "opted", page: "/page.html", rules: "sideways-scroll", element: "div [data-scroll-x]", reason: "a timeline people pan sideways" },
    ];
    assert.deepEqual(result.allowances, expected);
    assert.deepEqual(result.gated, []);
    assert.deepEqual((JSON.parse(readFileSync(join(out, "report.json"), "utf8")) as Report).allowances, expected);
    assert.deepEqual((await merge({ dirs: [out, out], out: dir("opted-merged"), chromium })).allowances, expected);
  });

  test("checks long lines only against a measure the project declares: none without one, a page glob's prose, or a selector's elements", async () => {
    const options = { targets: [fixtures], pages: "long-lines-*", sizes: [[1440, 900]] as [number, number][], themes: ["light"], chromium, log: quiet };
    const none = await check({ ...options, out: dir("measure-none") });
    assert.deepEqual(none.findings.filter((f) => f.rule === "long-lines"), []);
    const everywhere = await check({ ...options, out: dir("measure-all"), config: { measure: { "**": "100 chars" } } });
    assert.deepEqual(
      everywhere.findings.filter((f) => f.rule === "long-lines").map((f) => [f.page, f.detail.replace(/\d+ characters/, "N characters")]),
      [["/long-lines-fail.html", "about N characters a line (keep to 100)"]],
    );
    const elsewhere = await check({ ...options, out: dir("measure-glob"), config: { measure: { "/docs/**": "100 chars" } } });
    assert.deepEqual(elsewhere.findings.filter((f) => f.rule === "long-lines"), []);
    // A selector may hold a "/" of its own; only a leading "/" or a key of stars makes a page glob.
    const selected = await check({ ...options, out: dir("measure-selector"), config: { measure: { 'main p:not([data-x="/"])': "800px" } } });
    assert.deepEqual(selected.findings.filter((f) => f.rule === "long-lines").map((f) => f.page), ["/long-lines-fail.html"]);
    assert.match(selected.findings.find((f) => f.rule === "long-lines")!.detail, /^lines up to \d+px wide \(measure 800px\)$/);
  });

  test("names an axe finding the same at every size, whatever the other rules marked on the page", async () => {
    const faint = '<p style="width:60px;overflow:hidden;white-space:nowrap;color:#999;background:#aaa">Faint text cut off by its box</p>';
    const folder = site("faint", { "page.html": page(`<h1>Faint</h1>${faint}${faint}`) });
    const result = await check({ targets: [folder], out: dir("faint"), sizes: two, themes: ["light"], axe, chromium, log: quiet });
    const named = result.findings.filter((f) => f.rule === "axe");
    assert.deepEqual(named.map((f) => f.width).sort(), [1440, 390]);
    assert.equal(new Set(named.map((f) => f.element)).size, 1, named.map((f) => f.element).join(" | "));
    assert.doesNotMatch(named[0]!.element, /data-ouro-check-ref/);
    assert.ok(result.findings.some((f) => f.rule === "clipped-text"));
  });

  test("checks a page that never settles once its waits run out", async () => {
    const busy = site("busy", { "index.html": page("<p>Still loading.</p>", '<script type="module">setInterval(() => fetch(`/index.html?${Math.random()}`), 100);</script>') });
    // axe runs at the narrowest and widest of sizes without the phone and laptop ones.
    const result = await check({ targets: [busy], out: dir("busy"), sizes: [[400, 800]], themes: ["light"], readyTimeout: 200, readyEvents: ["app:drawn"], axe, chromium, log: quiet });
    assert.equal(result.shots.length, 1);
    // Checked as it is, but never a pass.
    assert.deepEqual(result.gated.map((f) => [f.rule, f.element]), [["not-ready", "the page"]]);
    assert.match(result.gated[0]!.detail, /^no ready signal in 0\.2 s/);
  });

  test("stops its servers and says why when the browser does not start", async () => {
    const missing = join(scratch, "no-browser");
    await assert.rejects(check({ targets: [fixtures], out: dir("no-browser"), sizes: [[390, 844]], themes: ["light"], chromium, executablePath: missing, log: quiet }), /no-browser/);
  });

  test("takes at most 40 close-ups a page, the first of each finding, in a run and in a merge", async () => {
    const prose = "Words that run on and on across the whole width of a wide screen, far past a hundred characters a line, and on.";
    const many = site("many", { "page.html": page(Array.from({ length: 45 }, (_, i) => `<p id="p${i}">${prose} ${prose}</p>`).join(""), "<style>main{max-width:none}</style>") });
    const out = dir("many");
    const result = await check({ targets: [many], out, sizes: [[1440, 900]], themes: ["light", "dark"], config: { measure: { "/**": "100 chars" } }, chromium, log: quiet });
    assert.equal(result.findings.length, 90);
    assert.equal(result.findings.filter((f) => f.closeUp).length, 40);
    const merged = await merge({ dirs: [out], out: dir("many-merged"), chromium });
    assert.equal(merged.findings.filter((f) => f.closeUp).length, 40);
    assert.equal(merged.findings.filter((f) => f.box).length, 40);
  });
});
