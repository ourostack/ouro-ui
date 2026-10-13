import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { commands } from "vitest/browser";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { HoverCard } from "@/registry/ouro/components/ouro/hover-card/hover-card";
import { pressTab } from "@/registry/ouro/lib/ouro/testing/tab";

// Runs in the `touch` project: Chromium as a 390x844 phone, which cannot hover.

let root: Root | undefined;
const nodes: Element[] = [];
afterEach(async () => {
  await act(() => root?.unmount());
  for (const node of nodes.splice(0)) node.remove();
});

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

it("never opens on a device that cannot hover: not from a tap, and not from keyboard focus", async () => {
  expect(matchMedia("(any-hover: hover)").matches).toBe(false);
  const host = document.createElement("div");
  host.style.padding = "120px 16px";
  document.body.append(host);
  nodes.push(host);
  root = createRoot(host);
  await act(() =>
    root!.render(
      <>
        <button type="button">Before</button>
        <HoverCard trigger={<a href="#cooks/ari">Ari</a>}>Preview</HoverCard>
      </>,
    ),
  );
  await commands.tap("a");
  expect(location.hash).toBe("#cooks/ari");
  await act(nextFrame);
  expect(document.querySelector('[data-ouro="hover-card"]')).toBeNull();
  // Focus opens after the card's delay: run the page's timers past it rather than wait.
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  try {
    document.querySelector<HTMLElement>("button")!.focus();
    await pressTab();
    expect(document.activeElement).toBe(document.querySelector("a"));
    await act(async () => vi.advanceTimersByTime(2000));
  } finally {
    vi.useRealTimers();
  }
  await act(nextFrame);
  expect(document.querySelector('[data-ouro="hover-card"]')).toBeNull();
  history.replaceState(null, "", location.pathname + location.search);
});
