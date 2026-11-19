import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { expect, test, type Page } from "@playwright/test";
import { FRAGMENT_FOCUS_WAIT_MS, fragmentFocusScript } from "@/registry/ouro/lib/ouro/fragment-focus-script";

// fragmentFocusScript (lib/ouro/fragment-focus-script.ts) against a page of its own, served here: Safari, left to itself,
// jumps back to the place an address names (#target) each time a stylesheet loads, until the person scrolls, when the
// page finished parsing or a link to that place was followed while a stylesheet was still loading, and the jump takes
// focus (ourostack/ouro-ui#2224, #2228). Without the script, the focus tests fail in WebKit.

const LATE_MS = 600;
let server: Server;
let origin = "";
/** Stylesheet requests that answer only once the test, or the page through /release, lets them. */
const held: (() => void)[] = [];
/** Once the page has asked for /release, held stylesheets answer at once. */
let released = false;
/** A deferred script that waits until the route stylesheet's @import has been asked for, so parsing ends with it loading. */
const waiting: (() => void)[] = [];
let imported = false;

const page = (slow: boolean, deferred: string | null) =>
  `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/${slow ? "late" : "now"}.css?head">` +
  // As a module script does when it adds a route's CSS as the page starts.
  (deferred === null ? "" : `<script defer src="/route.js?${deferred}"></script>`) +
  (deferred === "import" || deferred === "nested" ? `<script defer src="/wait.js"></script>` : "") +
  `</head><body>` +
  `<script>${fragmentFocusScript()}</script>` +
  `<p><a id="jump" href="#target">Jump</a></p><div style="height:3000px"></div>` +
  `<section id="target"><h2>Target</h2><button id="kept">Kept</button></section><div style="height:3000px"></div></body></html>`;

test.beforeAll(async () => {
  server = createServer((request, response) => {
    const url = new URL(request.url!, "http://localhost");
    const css = () => {
      response.writeHead(200, { "content-type": "text/css", "cache-control": "no-store" });
      response.end(`html { --${url.search.slice(1) || "sheet"}: 1 }`);
    };
    if (url.pathname === "/now.css") return css();
    // Late, as on a slow connection.
    if (url.pathname === "/late.css") return void setTimeout(css, LATE_MS);
    if (url.pathname === "/held.css") {
      if (url.search === "?imported") {
        imported = true;
        for (const answer of waiting.splice(0)) answer();
      }
      return void (released ? css() : held.push(css));
    }
    // A route stylesheet whose @import (or, nested, its import's @import) is still loading.
    if (url.pathname === "/import.css") {
      response.writeHead(200, { "content-type": "text/css", "cache-control": "no-store" });
      return void response.end(`@import url("${url.search === "?nested" ? "/import.css?inner" : "/held.css?imported"}"); html { --route: 1 }`);
    }
    if (url.pathname === "/wait.js") {
      const answer = () => {
        response.writeHead(200, { "content-type": "text/javascript" });
        response.end("");
      };
      return void (imported ? answer() : waiting.push(answer));
    }
    // Adds the route's stylesheet and counts its loads, as Vite's preload does. `after` lets the stylesheet arrive only
    // once parsing has ended, and holds the script's moment-later callback until it has: so it arrives while set aside.
    if (url.pathname === "/route.js") {
      const kind = url.search.slice(1);
      const href = { late: "/late.css?route", after: "/held.css?route", import: "/import.css?route", nested: "/import.css?nested", window: "/late.css?route" }[kind];
      response.writeHead(200, { "content-type": "text/javascript" });
      const add = `document.head.append(link);`;
      return void response.end(
        `window.routeLoads = 0; const link = (window.routeLink = document.createElement("link")); link.rel = "stylesheet"; link.href = "${href}";` +
          `link.addEventListener("load", () => window.routeLoads++);` +
          // `window`: added by the app's own listener for the end of parsing, on the window.
          (kind === "window" ? `window.addEventListener("DOMContentLoaded", () => { ${add} });` : add) +
          (kind === "after"
            ? `document.addEventListener("DOMContentLoaded", () => { const real = window.setTimeout; window.setTimeout = (callback) => { window.setTimeout = real; link.addEventListener("load", () => real(callback), { once: true }); return 0; }; fetch("/release"); });`
            : ""),
      );
    }
    if (url.pathname === "/release") {
      released = true;
      for (const answer of held.splice(0)) answer();
      response.writeHead(204);
      return void response.end();
    }
    response.writeHead(200, { "content-type": "text/html" });
    response.end(page(url.searchParams.has("slow"), url.searchParams.get("deferred")));
  });
  await new Promise<void>((listening) => server.listen(0, "127.0.0.1", listening));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

test.afterEach(() => {
  released = false;
  imported = false;
  for (const answer of waiting.splice(0)) answer();
  for (const answer of held.splice(0)) answer();
});

test.afterAll(async () => {
  for (const answer of held.splice(0)) answer();
  await new Promise((closed) => server.close(closed));
});

/** Adds a stylesheet, as a chapter or a route does once it is used; resolves once a jump that set off would have landed. */
const laterStyles = (tab: Page) =>
  tab.evaluate(
    () =>
      new Promise<void>((landed) => {
        const style = document.createElement("style");
        style.textContent = "i { color: rgb(4, 5, 6) }";
        document.head.append(style);
        // Safari queues its jump as a task once the stylesheet is in; a task after it and two frames see it done.
        setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(() => landed())));
      }),
  );

/** Adds a stylesheet that loads as `href` answers; resolves once it has. */
const lazyStylesheet = (tab: Page, href: string) =>
  tab.evaluate(
    (address) =>
      new Promise<void>((loaded) => {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = address;
        link.onload = () => loaded();
        document.head.append(link);
      }),
    href,
  );

/** The route's stylesheet applies, from its one link, which loaded once. */
async function routeStyled(tab: Page): Promise<void> {
  await expect.poll(() => tab.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--route").trim())).toBe("1");
  await tab.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  expect(await tab.evaluate(() => document.querySelectorAll(`link[href="${(window as unknown as { routeLink: Element }).routeLink.getAttribute("href")}"]`).length)).toBe(1);
  expect(await tab.evaluate(() => (window as unknown as { routeLoads: number }).routeLoads)).toBe(1);
}

/** Opens a page whose route stylesheet's @import (`import`), or its import's @import (`nested`), is loading as parsing ends; lets it arrive; focus stays as later styles load. */
async function keepsFocusThroughImport(tab: Page, kind: "import" | "nested"): Promise<void> {
  await tab.goto(`${origin}/?deferred=${kind}#target`, { waitUntil: "domcontentloaded" });
  // From the end of parsing on, every held stylesheet answers, as the page's /release makes it: in Safari the script
  // sets the route stylesheet aside and adds a fresh copy, whose import's request can come after this line (#2329).
  released = true;
  for (const answer of held.splice(0)) answer();
  await expect.poll(() => tab.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--imported").trim())).toBe("1");
  await routeStyled(tab);
  await tab.locator("#kept").focus();
  await laterStyles(tab);
  await expect(tab.locator("#kept")).toBeFocused();
}

test.describe("fragmentFocusScript", () => {
  test("keeps focus as later styles load, on a page opened at a place while its stylesheet loads", async ({ page: tab }) => {
    await tab.goto(`${origin}/?slow#target`, { waitUntil: "load" });
    await tab.locator("#kept").focus();
    await laterStyles(tab);
    await expect(tab.locator("#kept")).toBeFocused();
  });

  test("keeps focus as later styles load, after a link to a place on the page is followed while a stylesheet loads, and still goes there", async ({ page: tab, browserName }) => {
    await tab.goto(`${origin}/`, { waitUntil: "load" });
    const loaded = lazyStylesheet(tab, "/held.css?route");
    await expect.poll(() => held.length).toBe(1);
    await tab.locator("#jump").click();
    // Held while the stylesheet loads, in Safari: other browsers don't jump back, so the script leaves them alone.
    if (browserName === "webkit") expect(await tab.evaluate(() => location.hash)).toBe("");
    held.shift()!();
    await loaded;
    await expect.poll(() => tab.evaluate(() => document.querySelector(":target")?.id)).toBe("target");
    expect(await tab.evaluate(() => location.hash)).toBe("#target");
    await tab.locator("#kept").focus();
    await laterStyles(tab);
    await expect(tab.locator("#kept")).toBeFocused();
  });

  test("keeps focus as later styles load, after a stylesheet the page's script added was still loading as parsing ended", async ({ page: tab }) => {
    await tab.goto(`${origin}/?deferred=late`, { waitUntil: "load" });
    await routeStyled(tab);
    await tab.locator("#jump").click();
    await expect.poll(() => tab.evaluate(() => location.hash)).toBe("#target");
    await tab.locator("#kept").focus();
    await laterStyles(tab);
    await expect(tab.locator("#kept")).toBeFocused();
  });

  test("a stylesheet the page's script added that arrives while set aside still applies, from one link, with one load event", async ({ page: tab, browserName }) => {
    test.skip(browserName !== "webkit", "Only Safari jumps back, so the script sets a stylesheet aside only there.");
    await tab.goto(`${origin}/?deferred=after#target`, { waitUntil: "load" });
    await routeStyled(tab);
    // A fresh copy took the place of the one that arrived while set aside, and came back empty.
    expect(await tab.evaluate(() => document.querySelector('link[href$="?route"]') !== (window as unknown as { routeLink: Element }).routeLink)).toBe(true);
  });

  test("keeps focus as later styles load, after a stylesheet the app's own listener added as parsing ended", async ({ page: tab }) => {
    await tab.goto(`${origin}/?deferred=window#target`, { waitUntil: "load" });
    await routeStyled(tab);
    await tab.locator("#kept").focus();
    await laterStyles(tab);
    await expect(tab.locator("#kept")).toBeFocused();
  });

  test("keeps focus as later styles load, after a stylesheet the page's script added had an @import still loading as parsing ended", async ({ page: tab }) => {
    await keepsFocusThroughImport(tab, "import");
  });

  test("keeps focus as later styles load, after a stylesheet the page's script added had an @import inside an @import still loading as parsing ended", async ({ page: tab }) => {
    await keepsFocusThroughImport(tab, "nested");
  });

  test("follows a link to a place on the page after two seconds when a stylesheet is still loading", async ({ page: tab, browserName }) => {
    test.skip(browserName !== "webkit", "Only Safari jumps back, so the script holds a link only there.");
    await tab.goto(`${origin}/`, { waitUntil: "load" });
    void lazyStylesheet(tab, "/held.css?never").catch(() => {});
    await expect.poll(() => held.length).toBe(1);
    const clicked = Date.now();
    await tab.locator("#jump").click();
    await expect.poll(() => tab.evaluate(() => location.hash)).toBe("#target");
    expect(Date.now() - clicked).toBeGreaterThanOrEqual(FRAGMENT_FOCUS_WAIT_MS - 100);
  });
});
