import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { commands, server } from "vitest/browser";
import { Card } from "@/registry/ouro/components/ouro/card/card";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Message } from "@/registry/ouro/components/ouro/message/message";
import { MessageList } from "@/registry/ouro/components/ouro/message/message-list";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

const roots: Root[] = [];
let mounted: Element[] = [];
const distinct = { "--background": "rgb(250, 250, 240)", "--card": "rgb(240, 250, 250)" };

afterEach(async () => {
  for (const name of Object.keys(distinct)) document.documentElement.style.removeProperty(name);
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  for (const node of mounted) node.remove();
  mounted = [];
});

async function render(node: ReactNode, style: Record<string, string> = {}) {
  const host = document.createElement("div");
  for (const [name, value] of Object.entries(style)) document.documentElement.style.setProperty(name, value);
  document.body.append(host);
  mounted.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
  return host.querySelector<HTMLElement>("[data-ouro-message-list-scroller]")!;
}

/** A theme variable as the browser computes it, so the tests hold under any app theme. */
function fill(variable: string): string {
  const probe = document.createElement("div");
  probe.style.backgroundColor = `var(${variable})`;
  document.body.append(probe);
  const value = getComputedStyle(probe).backgroundColor;
  probe.remove();
  return value;
}

const list = (
  <MessageList label="Launch channel" style={{ height: 240 }}>
    {Array.from({ length: 30 }, (_, index) => (
      <Message key={index} id={`m${index}`} variant="chat" role="assistant" name="Ana Lind">
        {`Message ${index}`}
      </Message>
    ))}
  </MessageList>
);

describe("MessageList surface", () => {
  it.each([
    ["the theme's own fills", {}],
    ["a theme whose page and card fills differ", distinct],
  ])("paints its scroller with the muted surface, opaque, on the page (%s)", async (_name, style) => {
    const scroller = await render(list, style);
    expect(getComputedStyle(scroller).backgroundColor).toBe(fill("--muted"));
    expect(getComputedStyle(scroller).backgroundColor).not.toMatch(/rgba|transparent/);
    expect(getComputedStyle(scroller.querySelector("[data-ouro-message-content]")!).backgroundColor).toBe(fill("--background"));
  });

  it.each([
    ["the theme's own fills", {}],
    ["a theme whose page and card fills differ", distinct],
  ])("paints its scroller with the Card's fill inside a Card (%s)", async (_name, style) => {
    const scroller = await render(<Card title="Thread">{list}</Card>, style);
    expect(getComputedStyle(scroller).backgroundColor).toBe(fill("--card"));
    expect(getComputedStyle(scroller.querySelector("[data-ouro-message-content]")!).backgroundColor).toBe(fill("--muted"));
  });

  it("keeps an app's bubble fill on the page and inside a Card", async () => {
    const themed = <div style={{ "--ouro-bubble-other": "rgb(80, 90, 100)" } as React.CSSProperties}>{list}</div>;
    for (const node of [themed, <Card title="Thread">{themed}</Card>]) {
      const scroller = await render(node);
      expect(getComputedStyle(scroller.querySelector("[data-ouro-message-content]")!).backgroundColor).toBe("rgb(80, 90, 100)");
    }
  });

  it("keeps a plain primary action readable on its surface", async () => {
    const scroller = await render(
      <div style={{ "--primary": "#9b6834", "--foreground": "#28231d" } as React.CSSProperties}>
        <MessageList label="Conversation"><Button variant="plain">Reply</Button></MessageList>
      </div>,
    );
    const probe = document.createElement("b");
    probe.style.color = "color-mix(in oklab, var(--primary) 80%, var(--foreground))";
    scroller.append(probe);
    expect(getComputedStyle(scroller.querySelector("button")!).color).toBe(getComputedStyle(probe).color);
  });

  it("keeps the surface step and scroll clearance with a floating foot", async () => {
    const scroller = await render(
      <MessageList label="Conversation" style={{ height: 240 }} foot={<div style={{ height: 48 }}>Draft</div>}>
        <Message role="assistant" name="Assistant">Hello</Message>
      </MessageList>,
    );
    await expect.poll(() => getComputedStyle(scroller).scrollPaddingBottom).toBe("48px");
    expect(getComputedStyle(scroller).backgroundColor).toBe(fill("--muted"));
  });

  it("uses the nested dark theme's muted surface for its scroller", async () => {
    const root = document.documentElement;
    const wasDark = root.classList.contains("dark");
    root.classList.remove("dark");
    try {
      const scroller = await render(<div className="dark">{list}</div>);
      const probe = document.createElement("div");
      probe.style.backgroundColor = "var(--muted)";
      scroller.append(probe);
      expect(getComputedStyle(scroller).backgroundColor).toBe(getComputedStyle(probe).backgroundColor);
    } finally {
      root.classList.toggle("dark", wasDark);
    }
  });

  it("keeps glass see-through when the app opts out of an opaque scroller", async () => {
    const scroller = await render(<div style={{ "--ouro-scroller-surface": "transparent" } as React.CSSProperties}>{list}</div>);
    expect(getComputedStyle(scroller).backgroundColor).toBe("rgba(0, 0, 0, 0)");
  });

  // Chromium on Windows promotes a see-through scroller only at 150% display scaling or more (ourostack/ouro-ui#2891).
  it.skipIf(server.browser !== "chromium")("is a layer of its own that the compositor scrolls", async () => {
    const scroller = await render(list);
    expect(scroller.scrollHeight).toBeGreaterThan(scroller.clientHeight);
    const layers = await commands.compositedLayers();
    expect(layers.some((layer) => layer.element?.endsWith('[data-ouro-part="scroller"]'))).toBe(true);
  });
});
