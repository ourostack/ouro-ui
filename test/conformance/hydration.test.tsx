import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { commands } from "vitest/browser";
import { conformanceStories } from "./harness.ts";

// Server/client agreement. Every story renders to HTML as a server in UTC and en-US would, and
// that HTML hydrates in a reader's browser in Los Angeles with German formats and in Tokyo with
// Japanese ones. A story whose markup depends on the time zone, the locale, randomness or the
// clock (`Date.now()`, `Math.random()`, `toLocaleString()` during render) makes React throw away
// the server HTML: `onRecoverableError` reports it, or React logs an attribute mismatch, and
// either fails here.
//
// The server and each reader are frames of their own (frame.tsx), each with its own copy of every
// module, so a formatter one caches at module level under its locale is never what another reads:
// a library that keeps one `Intl.NumberFormat` per options, made in the server's en-US, would
// otherwise format the German reader's values as en-US too and hide the mismatch every real reader
// sees. The page's time zone and locale switch through CDP (test/conformance/commands.ts) before
// each frame does its work, so the server frame only ever runs as en-US in UTC, and each reader's
// only in its own.

type Frame = typeof import("./frame.tsx");

const server = { timezoneId: "UTC", locale: "en-US" };
const readers = [
  { timezoneId: "America/Los_Angeles", locale: "de-DE" },
  { timezoneId: "Asia/Tokyo", locale: "ja-JP" },
];

const frames: HTMLIFrameElement[] = [];

/** A fresh frame with frame.tsx loaded: a page with its own modules. */
async function openFrame(): Promise<Frame> {
  const iframe = document.createElement("iframe");
  // Laid out, so animation frames run in it, but out of sight. Vitest's browser transform routes
  // dynamic imports through its runner, which only the test page has: the frame's passes them on.
  iframe.style.cssText = "position:fixed;left:-20000px;top:0;width:1280px;height:800px;border:0";
  const url = new URL("./frame.tsx", import.meta.url).href;
  iframe.srcdoc = `<!doctype html><html lang="en"><head><meta charset="utf-8"></head><body><script>window.__vitest_browser_runner__ = { wrapModule: (load) => (typeof load === "function" ? load() : load), wrapDynamicImport: (load) => (typeof load === "function" ? load() : load) };</script><script type="module">window.__ouroFrame = import(${JSON.stringify(url)});</script></body></html>`;
  const loaded = new Promise((resolve) => iframe.addEventListener("load", resolve, { once: true }));
  document.body.append(iframe);
  frames.push(iframe);
  await loaded;
  const window = iframe.contentWindow as Window & { __ouroFrame?: Promise<Frame> };
  for (let tries = 0; !window.__ouroFrame && tries < 100; tries += 1) await new Promise((resolve) => setTimeout(resolve, 10));
  return await window.__ouroFrame!;
}

let serverFrame: Frame;
const readerFrames: Frame[] = [];

beforeAll(async () => {
  await commands.emulateLocale(server);
  serverFrame = await openFrame();
  serverFrame.setLanguage(server.locale);
  for (const reader of readers) {
    await commands.emulateLocale(reader);
    const frame = await openFrame();
    frame.setLanguage(reader.locale);
    readerFrames.push(frame);
  }
  await commands.emulateLocale(server);
}, 60_000);

afterAll(async () => {
  for (const frame of readerFrames) await frame.unmount();
  for (const iframe of frames.splice(0)) iframe.remove();
  await commands.emulateLocale(server);
});

describe("server HTML hydrates in another time zone and locale", () => {
  it.each(conformanceStories)("$id", async ({ id, parameters }) => {
    await commands.emulateLocale(server);
    const rendered = await serverFrame.serverHtml(id);
    if (parameters.conformance?.clientOnly) {
      expect("error" in rendered, `${parameters.conformance.clientOnly}: the story now renders on a server, so remove its clientOnly`).toBe(true);
      return;
    }
    if ("error" in rendered) throw new Error(`the server render threw: ${rendered.error}`);
    const problems: string[] = [];
    for (const [index, reader] of readers.entries()) {
      await commands.emulateLocale(reader);
      const frame = readerFrames[index]!;
      problems.push(...(await frame.hydrate(id, rendered.html)).map((problem) => `${reader.timezoneId} ${reader.locale}: ${problem}`));
      await frame.unmount();
    }
    await commands.emulateLocale(server);
    expect(problems.join("\n")).toBe("");
  });
});
