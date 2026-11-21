import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLoadingVisible } from "@/registry/ouro/lib/ouro/use-loading-visible";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

const roots: Root[] = [];
const nodes: Element[] = [];

function Probe({ loading }: { loading: boolean }) {
  return <span data-visible={String(useLoadingVisible(loading, { delay: 100, minVisible: 300 }))} />;
}

async function mount(loading: boolean) {
  const host = document.createElement("div");
  document.body.append(host);
  nodes.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(<Probe loading={loading} />));
  return {
    set: (next: boolean) => act(async () => root.render(<Probe loading={next} />)),
    visible: () => host.firstElementChild!.getAttribute("data-visible"),
    tick: (ms: number) => act(async () => void vi.advanceTimersByTime(ms)),
  };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
});

afterEach(async () => {
  vi.useRealTimers();
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  nodes.splice(0).forEach((node) => node.remove());
});

describe("useLoadingVisible", () => {
  it("shows nothing for a load that ends within the delay", async () => {
    const view = await mount(true);
    await view.tick(99);
    expect(view.visible()).toBe("false");
    await view.set(false);
    await view.tick(1000);
    expect(view.visible()).toBe("false");
  });

  it("shows once a load has run for the delay", async () => {
    const view = await mount(true);
    await view.tick(100);
    expect(view.visible()).toBe("true");
  });

  it("keeps a shown placeholder until it has been up for the minimum, then hides it", async () => {
    const view = await mount(true);
    await view.tick(100);
    await view.tick(150);
    await view.set(false);
    await view.tick(149);
    expect(view.visible()).toBe("true");
    await view.tick(1);
    expect(view.visible()).toBe("false");
  });

  it("hides at once when the minimum has already passed", async () => {
    const view = await mount(true);
    await view.tick(100);
    await view.tick(400);
    await view.set(false);
    await view.tick(0);
    expect(view.visible()).toBe("false");
  });

  it("stays shown when a load restarts during the hold", async () => {
    const view = await mount(true);
    await view.tick(100);
    await view.set(false);
    await view.tick(100);
    await view.set(true);
    await view.tick(1000);
    expect(view.visible()).toBe("true");
  });
});
