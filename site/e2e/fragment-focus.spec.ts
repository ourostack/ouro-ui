import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { expect, test, type Page } from "@playwright/test";
import { FRAGMENT_FOCUS_WAIT_MS, fragmentFocusScript } from "@/registry/ouro/lib/ouro/fragment-focus-script";

// fragmentFocusScript (lib/ouro/fragment-focus-script.ts) against a page of its own, served here: Safari, left to itself,
// jumps back to the place an address names (#target) each time a stylesheet loads, until the person scrolls, when the
// page finished parsing or a link to that place was followed while a stylesheet was still loading, and the jump takes
// focus (ourostack/ouro-ui#2224, #2228). Without the script, the first two tests fail in WebKit.

const LATE_MS = 600;
let server: Server;
let origin = "";
/** Stylesheet requests that never answer, until the test ends. */
const held: (() => void)[] = [];

const page = (slow: boolean) =>
  `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/${slow ? "late" : "now"}.css?head"></head><body>` +
  `<script>${fragmentFocusScript()}</script>` +
  `<p><a id="jump" href="#target">Jump</a></p><div style="height:3000px"></div>` +
  `<section id="target"><h2>Target</h2><button id="kept">Kept</button></section><div style="height:3000px"></div></body></html>`;

test.beforeAll(async () => {
  server = createServer((request, response) => {
    const url = new URL(request.url!, "http://localhost");
    const css = () => {
      response.writeHead(200, { "content-type": "text/css", "cache-control": "no-store" });
      response.end("p { color: rgb(1, 2, 3) }");
    };
    if (url.pathname === "/now.css") return css();
    // Late, as on a slow connection.
    if (url.pathname === "/late.css") return void setTimeout(css, LATE_MS);
    if (url.pathname === "/never.css") return void held.push(css);
    response.writeHead(200, { "content-type": "text/html" });
    response.end(page(url.searchParams.has("slow")));
  });
  await new Promise<void>((listening) => server.listen(0, "127.0.0.1", listening));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
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

test.describe("fragmentFocusScript", () => {
  test("keeps focus as later styles load, on a page opened at a place while its stylesheet loads", async ({ page: tab }) => {
    await tab.goto(`${origin}/?slow#target`, { waitUntil: "load" });
    await tab.locator("#kept").focus();
    await laterStyles(tab);
    await expect(tab.locator("#kept")).toBeFocused();
  });

  test("keeps focus as later styles load, after a link to a place on the page is followed while a stylesheet loads, and still goes there", async ({ page: tab }) => {
    await tab.goto(`${origin}/`, { waitUntil: "load" });
    const loaded = lazyStylesheet(tab, "/late.css?route");
    await tab.locator("#jump").click();
    await loaded;
    await expect.poll(() => tab.evaluate(() => document.querySelector(":target")?.id)).toBe("target");
    expect(await tab.evaluate(() => location.hash)).toBe("#target");
    await tab.locator("#kept").focus();
    await laterStyles(tab);
    await expect(tab.locator("#kept")).toBeFocused();
  });

  test("follows a link to a place on the page after two seconds when a stylesheet is still loading", async ({ page: tab }) => {
    await tab.goto(`${origin}/`, { waitUntil: "load" });
    void lazyStylesheet(tab, "/never.css").catch(() => {});
    await expect.poll(() => held.length).toBe(1);
    const clicked = Date.now();
    await tab.locator("#jump").click();
    await expect.poll(() => tab.evaluate(() => location.hash)).toBe("#target");
    expect(Date.now() - clicked).toBeGreaterThanOrEqual(FRAGMENT_FOCUS_WAIT_MS - 100);
  });
});
