import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import PortholeDemo from "./porthole.demo";

// The pretend service used to keep its heartbeat fresh with a `setInterval` tick, so a page a sweep revisits
// (or a build slow enough to let real seconds pass between a hover picture's two takes) could catch a beat that
// fell behind the tick and only later caught up, flipping the spot between alive and "Status unknown" in
// between the takes (ourostack/ouro-ui#2879). The heartbeat now needs no timer at all: it reads the clock
// directly, so it is still fresh at any render however long it has been since the last one.

const roots: Root[] = [];
let mounted: Element[] = [];

function render(): Element {
  const host = document.createElement("div");
  document.body.append(host);
  mounted.push(host);
  const root = createRoot(host);
  roots.push(root);
  return host;
}

function state(host: Element): string | null {
  return host.querySelector('[data-ouro="porthole"]')?.getAttribute("data-porthole-state") ?? null;
}

afterEach(async () => {
  vi.useRealTimers();
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  for (const node of mounted) node.remove();
  mounted = [];
});

describe("PortholeDemo", () => {
  it("stays alive across a gap far past the heartbeat timeout, with no tick in between, so a sweep's two takes agree", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    try {
      const host = render();
      await act(async () => roots[0]!.render(<PortholeDemo />));
      const spot = host.querySelector('[data-ouro-part="spot"]')!;

      const first = state(host);
      expect(first).not.toBe("unknown");

      // A gap well past the 5s heartbeat timeout, with no interval firing in between: the old, interval-fed
      // heartbeat would have read as stale here on the next render, regardless of which take caught it.
      await act(async () => vi.advanceTimersByTime(20_000));
      await act(async () => spot.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType: "mouse" })));
      await act(async () => vi.advanceTimersByTime(300));

      expect(state(host)).toBe(first);
    } finally {
      vi.useRealTimers();
    }
  });
});
