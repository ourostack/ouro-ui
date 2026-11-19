import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { expect, test, type Page } from "@playwright/test";
import { createServer as createViteServer, type ViteDevServer } from "vite";
import type { HeroPicture } from "@/registry/ouro/components/ouro/hero/hero";
import { colorSchemeScript } from "@/registry/ouro/lib/ouro/color-scheme-script";
import { heroPreloadScript } from "@/registry/ouro/lib/ouro/hero-preload-script";

// A hero's two twins, served from a server that counts every image request. The head reaches the browser 300 ms
// before the body, so the time a request arrives shows whether the preload began early. The old markup is what a
// pair both `priority` rendered before the helper existed (lazy twins and a static preload per scheme), written out
// by hand; the new one is the real Hero's server HTML with the helper in the head.

interface Markup {
  head: string;
  body: string;
}

interface Hit {
  path: string;
  /** Milliseconds from the head being sent to the request's arrival. */
  at: number;
}

interface Site {
  url: string;
  hits: Hit[];
  server: Server;
}

const art = (scene: "day" | "night", width: number) => `/art/${scene}/${width}.svg`;
const srcSet = (scene: "day" | "night") => `${art(scene, 640)} 640w, ${art(scene, 1536)} 1536w`;
const day: HeroPicture = { src: art("day", 1536), srcSet: srcSet("day"), sizes: "100vw", width: 1536, height: 576, alt: "Day", priority: true };
const night: HeroPicture = { src: art("night", 1536), srcSet: srcSet("night"), sizes: "100vw", width: 1536, height: 576, alt: "Night", priority: true };

// Hero's classes as the stylesheet of an app gives them: a twin shows in its scheme, and hides without scripts when it waits for one.
const CSS = String.raw`
  body { margin: 0; }
  .block { display: block; }
  .hidden { display: none; }
  .dark .dark\:hidden { display: none; }
  .dark .dark\:block { display: block; }
  @media (scripting: none) { .\[\@media\(scripting\:none\)\]\:hidden { display: none; } }
  img { display: block; width: 100%; height: auto; }
`;

// The first-paint script Hero rendered for a pair both `priority` before this change: it flips the shown twin to eager.
const OLD_FIRST_PAINT = `(function(s,u){var f=s.parentNode,p=f.children;for(var i=0;i<p.length;i++){var g=p[i].tagName==="PICTURE"&&getComputedStyle(p[i]).display!=="none"&&p[i].querySelector("img");if(g){if(u&&g.loading==="lazy")g.loading="eager";var d=function(){f.setAttribute("data-loaded","")};if(g.complete&&g.naturalWidth)d();else g.addEventListener("load",d)}}})(document.currentScript,1)`;

const oldMarkup = (): Markup => ({
  head:
    `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style><script>${colorSchemeScript()}</script>` +
    `<link rel="preload" as="image" fetchpriority="high" media="(prefers-color-scheme: dark)" imagesrcset="${srcSet("night")}" imagesizes="100vw">` +
    `<link rel="preload" as="image" fetchpriority="high" media="(prefers-color-scheme: light)" imagesrcset="${srcSet("day")}" imagesizes="100vw">` +
    "</head><body>",
  body:
    `<div data-slot="hero-media">` +
    `<picture class="block dark:hidden" data-scheme="light"><img data-slot="hero-image" src="${art("day", 1536)}" srcset="${srcSet("day")}" sizes="100vw" width="1536" height="576" alt="Day" fetchpriority="high" loading="lazy"></picture>` +
    `<picture class="hidden dark:block" data-scheme="dark"><img data-slot="hero-image" src="${art("night", 1536)}" srcset="${srcSet("night")}" sizes="100vw" width="1536" height="576" alt="Night" fetchpriority="high" loading="lazy"></picture>` +
    `<script>${OLD_FIRST_PAINT}</script></div></body></html>`,
});

const newMarkup = (): Markup => ({
  head: `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style><script>${colorSchemeScript()}${heroPreloadScript({ light: day, dark: night })}</script></head><body>`,
  body: `${heroBody}</body></html>`,
});

// Hero's server HTML, rendered by Vite's SSR loader (hero-preload-markup.tsx) once per worker.
let heroBody = "";
let vite: ViteDevServer | undefined;

test.beforeAll(async () => {
  vite = await createViteServer({
    configFile: false,
    root: process.cwd(),
    logLevel: "silent",
    appType: "custom",
    server: { middlewareMode: true, hmr: false, ws: false },
    optimizeDeps: { noDiscovery: true, include: [] },
    resolve: { alias: [{ find: /^@\//, replacement: `${process.cwd()}/` }] },
    esbuild: { jsx: "automatic" },
  });
  const markup = (await vite.ssrLoadModule("/site/e2e/hero-preload-markup.tsx")) as typeof import("./hero-preload-markup");
  heroBody = markup.renderHero(day, night);
});

test.afterAll(async () => {
  await vite?.close();
});

const svg = (scene: "day" | "night", width: number) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="576" viewBox="0 0 ${width} 576"><rect width="100%" height="100%" fill="${scene === "day" ? "#f5d76e" : "#1b2a4a"}"/></svg>`;

const pages: Record<string, () => Markup> = { "/old": oldMarkup, "/new": newMarkup };
const artPath = /^\/art\/(day|night)\/(\d+)\.svg$/;

async function startSite(): Promise<Site> {
  const site: Site = { url: "", hits: [], server: undefined as unknown as Server };
  let headAt = 0;
  site.server = createServer((request, response) => {
    const path = new URL(request.url ?? "/", "http://site").pathname;
    const image = artPath.exec(path);
    if (image) {
      site.hits.push({ path, at: Date.now() - headAt });
      response.writeHead(200, { "content-type": "image/svg+xml", "cache-control": "no-store" });
      setTimeout(() => response.end(svg(image[1] as "day" | "night", Number(image[2]))), 150);
      return;
    }
    const markup = pages[path]?.();
    if (!markup) {
      response.writeHead(404).end();
      return;
    }
    headAt = Date.now();
    response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    response.write(markup.head);
    setTimeout(() => response.end(markup.body), 300);
  });
  await new Promise<void>((listening) => site.server.listen(0, "127.0.0.1", listening));
  site.url = `http://127.0.0.1:${(site.server.address() as AddressInfo).port}`;
  return site;
}

async function stopSite(site: Site): Promise<void> {
  await new Promise<void>((closed) => site.server.close(() => closed()));
}

/** Opens a path, waits until its hero shows its picture, and returns the image requests it made. */
async function load(page: Page, site: Site, path: string): Promise<Hit[]> {
  site.hits.length = 0;
  await page.goto(site.url + path);
  await page.waitForFunction(() => document.querySelector('[data-slot="hero-media"]')?.hasAttribute("data-loaded") === true);
  // A request for a twin the page does not show would come after the first paint, so give it time to arrive.
  await page.waitForTimeout(300);
  return [...site.hits];
}

async function storeChoice(page: Page, choice: string): Promise<void> {
  await page.addInitScript((value) => localStorage.setItem("ouro-color-scheme", value), choice);
}

test.describe("a hero whose twins both have priority", () => {
  test("fetches the twin for the page's scheme once, for a stored dark choice with the system in light", async ({ page }) => {
    const site = await startSite();
    try {
      await page.emulateMedia({ colorScheme: "light" });
      await storeChoice(page, "dark");
      const hits = await load(page, site, "/new");
      expect(hits).toHaveLength(1);
      expect(hits[0]!.path).toMatch(/^\/art\/night\//);
    } finally {
      await stopSite(site);
    }
  });

  test("fetches the twin for the page's scheme once, for a stored light choice with the system in light", async ({ page }) => {
    const site = await startSite();
    try {
      await page.emulateMedia({ colorScheme: "light" });
      await storeChoice(page, "light");
      const hits = await load(page, site, "/new");
      expect(hits).toHaveLength(1);
      expect(hits[0]!.path).toMatch(/^\/art\/day\//);
    } finally {
      await stopSite(site);
    }
  });

  test("fetches the twin for the page's scheme once, for a stored light choice with the system in dark", async ({ page }) => {
    const site = await startSite();
    try {
      await page.emulateMedia({ colorScheme: "dark" });
      await storeChoice(page, "light");
      const hits = await load(page, site, "/new");
      expect(hits).toHaveLength(1);
      expect(hits[0]!.path).toMatch(/^\/art\/day\//);
    } finally {
      await stopSite(site);
    }
  });

  test("fetches the twin for the page's scheme once, for the system's dark scheme with nothing stored", async ({ page }) => {
    const site = await startSite();
    try {
      await page.emulateMedia({ colorScheme: "dark" });
      const hits = await load(page, site, "/new");
      expect(hits).toHaveLength(1);
      expect(hits[0]!.path).toMatch(/^\/art\/night\//);
    } finally {
      await stopSite(site);
    }
  });

  test("starts the hero image no later than the static preload did, when the stored choice is the system's", async ({ page }) => {
    const site = await startSite();
    const starts: Record<"/old" | "/new", number[]> = { "/old": [], "/new": [] };
    try {
      await page.emulateMedia({ colorScheme: "dark" });
      await storeChoice(page, "dark");
      // Alternating runs, so both markups meet the same load on the machine. The old markup may fetch twice (WebKit
      // does not match its lazy twin to the preload), so only its first request's start is kept.
      for (let run = 0; run < 3; run++) {
        for (const path of ["/old", "/new"] as const) {
          const hits = await load(page, site, path);
          if (path === "/new") expect(hits).toHaveLength(1);
          starts[path].push(hits[0]!.at);
        }
      }
      const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;
      test.info().annotations.push({ type: "hero image start (ms)", description: `old ${starts["/old"].join(", ")}; new ${starts["/new"].join(", ")}` });
      expect(median(starts["/new"])).toBeLessThanOrEqual(median(starts["/old"]) + 25);
    } finally {
      await stopSite(site);
    }
  });

  test("without JavaScript, the noscript twins are the pictures shown, and each file loads once", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    const site = await startSite();
    try {
      await page.emulateMedia({ colorScheme: "light" });
      await page.goto(`${site.url}/new`);
      // The empty twins are hidden without scripts; the noscript's light twin is the one the CSS shows.
      await expect(page.locator('[data-slot="hero-media"] > picture:visible')).toHaveCount(0);
      await expect(page.locator('[data-slot="hero-media"] noscript picture:visible')).toHaveAttribute("data-scheme", "light");
      await expect.poll(() => site.hits.length).toBeGreaterThan(0);
      // Browsers fetch lazy images anyway without scripts, so the hidden twin loads too, but no file loads twice.
      await page.waitForTimeout(300);
      const paths = site.hits.map((hit) => hit.path);
      expect(new Set(paths).size).toBe(paths.length);
      expect(paths).toContain(art("day", 1536));
    } finally {
      await stopSite(site);
      await context.close();
    }
  });
});
