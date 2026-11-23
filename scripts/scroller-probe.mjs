/* global URL, document, performance, requestAnimationFrame */
// Measures Ouro's scrollers with the compositor's LCD-text path on (ourostack/ouro-ui#2891).
//   node scripts/scroller-probe.mjs layers   which layers a see-through and an opaque scroller get
//   node scripts/scroller-probe.mjs frames   a long MessageList scrolled through, see-through against opaque
// Both run Chromium with --enable-lcd-text at a device scale of 1, as Windows at 100% scaling runs.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { chromium } from "playwright";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const dir = `${root}.tmp/scroller-probe/`;
const cpu = 4;
const runs = 3;
const mode = process.argv[2];

mkdirSync(dir, { recursive: true });
writeFileSync(
  `${dir}index.html`,
  '<!doctype html><html><body style="margin:0"><div id="root"></div><script type="module" src="./entry.tsx"></script></body></html>',
);
writeFileSync(
  `${dir}entry.tsx`,
  `import "@/app.css";
import { createRoot } from "react-dom/client";
import { ScrollArea } from "@/registry/ouro/components/ouro/scroll-area/scroll-area";
import { Message } from "@/registry/ouro/components/ouro/message/message";
import { MessageList } from "@/registry/ouro/components/ouro/message/message-list";
import { ConversationList } from "@/registry/ouro/components/ouro/conversation-list/conversation-list";

const words = "the quick brown fox jumps over a lazy dog while the ship sails on".split(" ");
const text = (index: number) => Array.from({ length: 4 + ((index * 37) % 60) }, (_, at) => words[(index + at) % words.length]).join(" ");
const count = Number(new URLSearchParams(location.search).get("n") ?? 1000);
const which = new URLSearchParams(location.search).get("which");
const messages = Array.from({ length: count }, (_, index) => (
  <Message key={index} id={"m" + index} variant="chat" role={index % 3 === 0 ? "user" : "assistant"} name={index % 3 === 0 ? "Ari" : "Ouro"}>
    {text(index)}
  </Message>
));
const rows = Array.from({ length: 200 }, (_, index) => ({ id: "c" + index, title: "Conversation " + index }));
createRoot(document.getElementById("root")!).render(
  <div style={{ background: "var(--background)", color: "var(--foreground)", padding: 16 }}>
    {which === "scroll-area" ? (
      <ScrollArea className="h-96" label="Steps">{messages.slice(0, 60)}</ScrollArea>
    ) : which === "conversation-list" ? (
      <ScrollArea className="h-96" label="Conversations"><ConversationList label="Conversations" items={rows} /></ScrollArea>
    ) : (
      <MessageList label="History" style={{ height: 600 }}>{messages}</MessageList>
    )}
  </div>,
);
`,
);

const server = await createServer({
  root: dir,
  configFile: false,
  logLevel: "error",
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": root } },
  server: { port: 0, fs: { allow: [root] } },
});
await server.listen();
const base = `http://localhost:${server.config.server.port ?? server.httpServer.address().port}/`;
const browser = await chromium.launch({ args: ["--enable-lcd-text", "--force-device-scale-factor=1"] });
const scrollers = { "scroll-area": "[data-scroll-viewport]", "conversation-list": "[data-scroll-viewport]", "message-list": "[data-ouro-message-list-scroller]" };
const seeThrough = (selector) => `${selector}{background-color:transparent !important}`;
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

async function open(which, transparent) {
  const page = await browser.newPage({ viewport: { width: 1000, height: 800 }, deviceScaleFactor: 1 });
  await page.goto(`${base}?which=${which}&n=${mode === "layers" ? 60 : 1000}`);
  await page.waitForSelector(scrollers[which]);
  if (transparent) await page.addStyleTag({ content: seeThrough(scrollers[which]) });
  await page.waitForTimeout(1500);
  return page;
}

try {
  if (mode === "layers") {
    for (const which of Object.keys(scrollers)) {
      for (const transparent of [true, false]) {
        const page = await open(which, transparent);
        const session = await page.context().newCDPSession(page);
        const trees = [];
        session.on("LayerTree.layerTreeDidChange", ({ layers }) => layers && trees.push(layers));
        await session.send("LayerTree.enable"); await page.evaluate(() => { const probe = document.createElement("div"); probe.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px;will-change:transform"; document.body.append(probe); });
        for (const by of [5, 40, 200]) {
          await page.evaluate((delta) => document.querySelector("[data-scroll-viewport], [data-ouro-message-list-scroller]").scrollBy(0, delta), by);
          await page.waitForTimeout(300);
        }
        await page.waitForTimeout(1000);
        const size = await page.evaluate((selector) => {
          const el = document.querySelector(selector);
          return { client: el.clientHeight, width: el.clientWidth, scroll: el.scrollHeight };
        }, scrollers[which]);
        const layers = trees.reduce((best, tree) => (tree.length > best.length ? tree : best), []);
        // A promoted scroller is a layer as wide as its viewport and taller than it, which holds its content.
        const content = layers.filter((layer) => layer.width >= size.width - 20 && layer.width <= size.width + 20 && layer.height > size.client + 40).length;
        console.log(`${which} ${transparent ? "see-through" : "opaque"}: ${layers.length} layers, ${content} holding the scrolled content (${size.scroll}px)`);
        await page.close();
      }
    }
  } else if (mode === "frames") {
    const results = { "see-through": [], opaque: [] };
    for (let run = 0; run < runs; run++) {
      for (const transparent of [true, false]) {
        const page = await open("message-list", transparent);
        const session = await page.context().newCDPSession(page);
        await session.send("Emulation.setCPUThrottlingRate", { rate: cpu });
        await browser.startTracing(page, { categories: ["devtools.timeline", "cc", "viz", "benchmark"] });
        const scrolled = await page.evaluate(
          (selector) =>
            new Promise((resolve) => {
              const el = document.querySelector(selector);
              const range = el.scrollHeight - el.clientHeight;
              const start = performance.now();
              let last = start;
              let late = 0;
              let frames = 0;
              const step = (now) => {
                frames++;
                if (now - last > 1000 / 60 + 8) late++;
                last = now;
                el.scrollTop = Math.min(range, ((now - start) / 8000) * range);
                if (now - start < 8000) requestAnimationFrame(step);
                else resolve({ frames, late, range });
              };
              requestAnimationFrame(step);
            }),
          scrollers["message-list"],
        );
        const events = JSON.parse((await browser.stopTracing()).toString()).traceEvents;
        const paintMs = events.filter((event) => event.name === "Paint" && event.ph === "X").reduce((sum, event) => sum + event.dur, 0) / 1000;
        results[transparent ? "see-through" : "opaque"].push({ ...scrolled, paintMs });
        await page.close();
      }
    }
    for (const [name, list] of Object.entries(results)) {
      console.log(
        `${name}: late frames ${list.map((r) => r.late).join(", ")} (median ${median(list.map((r) => r.late))}) of ${list.map((r) => r.frames).join(", ")}; paint ms ${list.map((r) => r.paintMs.toFixed(0)).join(", ")} (median ${median(list.map((r) => r.paintMs)).toFixed(0)}); scrolled ${list[0].range}px at ${cpu}x CPU throttle`,
      );
    }
  } else {
    console.error("usage: node scripts/scroller-probe.mjs <layers|frames>");
    process.exitCode = 1;
  }
} finally {
  await browser.close();
  await server.close();
  rmSync(dir, { recursive: true, force: true });
}
