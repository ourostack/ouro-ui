import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { Progress } from "@/registry/ouro/components/ouro/progress/progress";
import { Slider } from "@/registry/ouro/components/ouro/slider/slider";
import { unreadDotClass } from "@/registry/ouro/components/ouro/agent-presence/agent-presence-styles";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

// Dots, thumbs, rings and pills say rounded-full and stay round: they never take the squircle from ouro-base.css,
// nor from a squircle parent through the inherited --corner-shape, with the polyfill's bridge in the page or without.

const roots: Root[] = [];
const hosts: HTMLElement[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) root.unmount();
  for (const host of hosts.splice(0)) host.remove();
  for (const style of document.querySelectorAll("style[data-test-bridge]")) style.remove();
});

async function mount(node: React.ReactNode) {
  const host = document.createElement("div");
  host.style.width = "320px";
  document.body.append(host);
  hosts.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
  return host;
}

function bridge() {
  const style = document.createElement("style");
  style.dataset.testBridge = "";
  style.textContent = ":where(*){corner-shape:var(--corner-shape,round)}";
  document.head.append(style);
}

const roundParts = (host: HTMLElement) => [...host.querySelectorAll<HTMLElement>('[class*="rounded-full"]')];

describe.each([
  { name: "without the polyfill", polyfill: false },
  { name: "with the polyfill's bridge", polyfill: true },
])("round parts $name", ({ polyfill }) => {
  it("keeps the unread dot, a slider's track, range and thumb and a progress bar round, even inside a squircle", async () => {
    if (polyfill) bridge();
    const host = await mount(
      <div data-ouro="card" className="rounded-xl p-4">
        <span data-testid="dot" className={unreadDotClass} />
        <Slider label="Servings" defaultValue={4} min={1} max={12} />
        <Progress label="Uploading" value={40} />
      </div>,
    );
    const squircle = getComputedStyle(host.querySelector<HTMLElement>('[data-ouro="card"]')!);
    expect(squircle.getPropertyValue("--corner-shape")).not.toBe("round");
    const parts = roundParts(host);
    expect(parts.length).toBeGreaterThanOrEqual(5);
    for (const part of parts) {
      const style = getComputedStyle(part);
      expect(style.getPropertyValue("--corner-shape"), part.className).toBe("round");
      expect(style.getPropertyValue("corner-shape"), part.className).not.toMatch(/superellipse\((?!1\))|squircle/);
    }
  });

  it("keeps a rounded-full part round outside any Ouro component", async () => {
    if (polyfill) bridge();
    const host = await mount(
      <div className="rounded-lg">
        <span aria-hidden="true" className="size-2 rounded-full" />
      </div>,
    );
    const dot = host.querySelector("span")!;
    expect(getComputedStyle(dot).getPropertyValue("--corner-shape")).toBe("round");
  });
});
