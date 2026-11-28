import type {} from "@vitest/browser-playwright";
import type { BrowserCommand } from "vitest/node";
import type { PaintClip } from "../registry/ouro/check/squircle-paint.ts";

const squircleCapture: BrowserCommand<[PaintClip]> = async (ctx, clip) => {
  const frame = await ctx.frame();
  const frameElement = await frame.frameElement();
  const bounds = await frameElement.boundingBox();
  if (!bounds) throw new Error("The test frame has no visible bounds.");
  const viewport = await frame.evaluate(() => ({ width: innerWidth, height: innerHeight }));
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
  return `data:image/png;base64,${image.toString("base64")}`;
};

const cornerImageRoute: BrowserCommand<[{ data: string | null }]> = async (ctx, { data }) => {
  const url = "https://images.invalid/picture.png";
  await ctx.page.unroute(url);
  if (data !== null) {
    await ctx.page.route(url, (route) => route.fulfill({
      status: 200, contentType: "image/png", body: Buffer.from(data.split(",")[1]!, "base64"),
    }));
  }
};

export const squircleCommands = { squircleCapture, cornerImageRoute };

declare module "vitest/browser" {
  interface BrowserCommands {
    squircleCapture: (clip: PaintClip) => Promise<string>;
    cornerImageRoute: (options: { data: string | null }) => Promise<void>;
  }
}
