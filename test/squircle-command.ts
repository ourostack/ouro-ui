import { createServer, type Server } from "node:http";
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

const imageServers = new WeakMap<object, Server>();
const cornerImageServer: BrowserCommand<[{ data: string | null }]> = async (ctx, { data }) => {
  const previous = imageServers.get(ctx.page);
  if (data === null) {
    if (!previous) throw new Error("No corner image server is running.");
    await new Promise<void>((resolve, reject) => previous.close((error) => error ? reject(error) : resolve()));
    imageServers.delete(ctx.page);
    return null;
  }
  if (previous) throw new Error("The corner image server is already running.");
  const body = Buffer.from(data.split(",")[1]!, "base64");
  const server = createServer((request, response) => {
    if (request.url !== "/picture.png") {
      response.writeHead(404);
      response.end();
      return;
    }
    response.writeHead(200, { "Content-Type": "image/png", "Content-Length": body.length });
    response.end(body);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("The corner image server has no port.");
  imageServers.set(ctx.page, server);
  return `http://127.0.0.1:${address.port}/picture.png`;
};

export const squircleCommands = { squircleCapture, squircleHostScroll, cornerImageServer };

declare module "vitest/browser" {
  interface BrowserCommands {
    squircleCapture: (clip: PaintClip) => Promise<string>;
    squircleHostScroll: (options: { y: number | null }) => Promise<{ scroll: number; top: number }>;
    cornerImageServer: (options: { data: string | null }) => Promise<string | null>;
  }
}
