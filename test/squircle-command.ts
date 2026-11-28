import type {} from "@vitest/browser-playwright";
import type { BrowserCommand } from "vitest/node";
import type { PaintClip } from "../registry/ouro/check/squircle-paint.ts";

const squircleCapture: BrowserCommand<[PaintClip]> = async (ctx, clip) => {
  const frame = await ctx.frame();
  const frameElement = await frame.frameElement();
  let scroll: { x: number; y: number } | null = null;
  try {
    let bounds = await frameElement.boundingBox();
    if (!bounds) throw new Error("The test frame has no visible bounds.");
    const page = ctx.page.viewportSize();
    if (bounds.x < 0 || bounds.y < 0 || (page && (bounds.x + bounds.width > page.width || bounds.y + bounds.height > page.height))) {
      scroll = await ctx.page.evaluate(() => ({ x: scrollX, y: scrollY }));
      if (scroll.x || scroll.y) {
        await ctx.page.evaluate(() => window.scrollTo({ left: 0, top: 0, behavior: "instant" }));
        bounds = await frameElement.boundingBox();
        if (!bounds) throw new Error("The test frame has no visible bounds.");
      }
    }
    const viewport = await frame.evaluate(() => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio }));
    const scaleX = bounds.width / viewport.width;
    const scaleY = bounds.height / viewport.height;
    const image = await ctx.page.screenshot({
      type: "png",
      animations: "disabled",
      caret: "hide",
      clip: {
        x: bounds.x + clip.x * scaleX,
        y: bounds.y + clip.y * scaleY,
        width: clip.width * scaleX,
        height: clip.height * scaleY,
      },
    });
    const actual = { width: image.readUInt32BE(16), height: image.readUInt32BE(20) };
    if (![1, viewport.dpr].some((scale) => Math.abs(actual.width - clip.width * scale) <= 1 && Math.abs(actual.height - clip.height * scale) <= 1)) {
      throw new Error(`Test-frame capture did not cover its clip: ${JSON.stringify({ clip, bounds, viewport, page, actual })}`);
    }
    return `data:image/png;base64,${image.toString("base64")}`;
  } finally {
    if (scroll && (scroll.x || scroll.y)) {
      await ctx.page.evaluate(({ x, y }) => window.scrollTo({ left: x, top: y, behavior: "instant" }), scroll);
    }
  }
};

const squircleHostScroll: BrowserCommand<[{ y: number | null }]> = async (ctx, { y }) => {
  if (y !== null) await ctx.page.evaluate((top) => window.scrollTo({ top, behavior: "instant" }), y);
  const scroll = await ctx.page.evaluate(() => scrollY);
  const bounds = await (await (await ctx.frame()).frameElement()).boundingBox();
  if (!bounds) throw new Error("The test frame has no visible bounds.");
  return { scroll, top: bounds.y };
};

const observedPages = new WeakSet<object>();
const cornerImageRoute: BrowserCommand<[{ data: string | null }]> = async (ctx, { data }) => {
  const url = "https://images.invalid/picture.png";
  if (!observedPages.has(ctx.page)) {
    observedPages.add(ctx.page);
    ctx.page.on("request", (request) => {
      if (request.url() === url) console.log("IMAGE REQUEST", request.url());
    });
    ctx.page.on("requestfailed", (request) => {
      if (request.url() === url) console.log("IMAGE REQUEST FAILED", JSON.stringify(request.failure()));
    });
    ctx.page.on("response", (response) => {
      if (response.url() === url) console.log("IMAGE RESPONSE", response.status());
    });
  }
  await ctx.page.unroute(url);
  if (data !== null) {
    await ctx.page.route(url, async (route) => {
      console.log("IMAGE ROUTE HIT", route.request().url());
      try {
        await route.fulfill({ status: 200, contentType: "image/png", body: Buffer.from(data.split(",")[1]!, "base64") });
      } catch (error) {
        console.log("IMAGE ROUTE ERROR", String(error));
        throw error;
      }
    });
  }
};

export const squircleCommands = { squircleCapture, squircleHostScroll, cornerImageRoute };

declare module "vitest/browser" {
  interface BrowserCommands {
    squircleCapture: (clip: PaintClip) => Promise<string>;
    squircleHostScroll: (options: { y: number | null }) => Promise<{ scroll: number; top: number }>;
    cornerImageRoute: (options: { data: string | null }) => Promise<void>;
  }
}
