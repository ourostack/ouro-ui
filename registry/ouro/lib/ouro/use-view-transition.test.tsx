import { createRoot, type Root } from "react-dom/client";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OuroProvider } from "@/registry/ouro/lib/ouro/ouro-provider";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { useViewTransition, type ViewSwap } from "@/registry/ouro/lib/ouro/use-view-transition";

const roots: Root[] = [];
const nodes: Element[] = [];
type Doc = { startViewTransition?: unknown };

function setStart(value: unknown) {
  Object.defineProperty(document, "startViewTransition", { value, configurable: true, writable: true });
}

afterEach(async () => {
  for (const root of roots.splice(0)) await act(() => root.unmount());
  for (const node of nodes.splice(0)) node.remove();
  delete (document as Doc).startViewTransition;
  document.title = "";
});

// A router stand-in: opening a recipe moves focus to its heading and sets the title, as an app's navigation does.
function App({ onRun }: { onRun?: (run: (swap: ViewSwap) => Promise<void>, enabled: boolean) => void }) {
  const { run, enabled } = useViewTransition();
  const [view, setView] = useState("list");
  onRun?.(run, enabled);
  const open = () =>
    run(() => {
      setView("recipe");
      document.title = "Recipe";
      queueMicrotask(() => document.querySelector<HTMLElement>("#heading")?.focus());
    });
  return (
    <div>
      <button id="open" onClick={() => void open()}>
        Open
      </button>
      <div role="status" id="status">
        {view === "recipe" ? "Recipe" : "List"}
      </div>
      {view === "recipe" && (
        <h1 id="heading" tabIndex={-1}>
          Recipe
        </h1>
      )}
    </div>
  );
}

async function mount(ui: React.ReactNode) {
  const host = document.createElement("div");
  document.body.append(host);
  nodes.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(() => root.render(ui));
  return host;
}

async function navigate(host: HTMLElement) {
  host.querySelector<HTMLElement>("#open")!.focus();
  await act(() => host.querySelector<HTMLElement>("#open")!.click());
  await expect.poll(() => document.title).toBe("Recipe");
  await expect.poll(() => document.activeElement?.id).toBe("heading");
  return { focus: document.activeElement?.id, title: document.title, status: host.querySelector("#status")!.textContent };
}

function fakeTransition(updateCallbackDone: Promise<void>, ready = Promise.resolve(), finished = Promise.resolve()) {
  return { updateCallbackDone, ready, finished };
}

describe("useViewTransition", () => {
  it("runs the swap inside the browser's transition, once, and resolves when the new view is in", async () => {
    let swaps = 0;
    const start = vi.fn((update: () => void | Promise<void>) => {
      const done = Promise.resolve().then(update);
      return fakeTransition(done);
    });
    setStart(start);
    let run!: (swap: ViewSwap) => Promise<void>;
    await mount(<App onRun={(r) => (run = r)} />);
    let during = -1;
    const finished = run(() => {
      swaps++;
      during = start.mock.calls.length;
    });
    expect(swaps).toBe(0);
    await finished;
    expect(swaps).toBe(1);
    expect(during).toBe(1);
    expect(start.mock.contexts[0]).toBe(document);
  });

  it("flushes a state update inside the transition, so the browser sees the new view", async () => {
    let seen = "";
    setStart((update: () => void | Promise<void>) => {
      const done = Promise.resolve().then(update).then(() => {
        seen = document.querySelector("#status")!.textContent!;
      });
      return fakeTransition(done);
    });
    const host = await mount(<App />);
    host.querySelector<HTMLElement>("#open")!.click();
    await expect.poll(() => seen).toBe("Recipe");
  });

  it("waits for a swap that returns a promise", async () => {
    setStart((update: () => void | Promise<void>) => fakeTransition(Promise.resolve().then(update)));
    let run!: (swap: ViewSwap) => Promise<void>;
    await mount(<App onRun={(r) => (run = r)} />);
    let finishedSwap = false;
    await run(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      finishedSwap = true;
    });
    expect(finishedSwap).toBe(true);
  });

  it("is not stopped by a transition that is skipped or interrupted", async () => {
    const ready = { catch: vi.fn() };
    const finished = { catch: vi.fn() };
    setStart((update: () => void | Promise<void>) => ({ updateCallbackDone: Promise.resolve().then(update), ready, finished }));
    let run!: (swap: ViewSwap) => Promise<void>;
    await mount(<App onRun={(r) => (run = r)} />);
    await expect(run(() => {})).resolves.toBeUndefined();
    expect(ready.catch).toHaveBeenCalledTimes(1);
    expect(finished.catch).toHaveBeenCalledTimes(1);
  });

  it("follows a change of motion setting on the same mounted hook", async () => {
    const start = vi.fn((update: () => void | Promise<void>) => fakeTransition(Promise.resolve().then(update)));
    setStart(start);
    let run!: (swap: ViewSwap) => Promise<void>;
    let enabled = true;
    const host = document.createElement("div");
    document.body.append(host);
    nodes.push(host);
    const root = createRoot(host);
    roots.push(root);
    const view = (motion: "full" | "reduced") => (
      <OuroProvider motion={motion}>
        <App onRun={(r, e) => ((run = r), (enabled = e))} />
      </OuroProvider>
    );
    await act(() => root.render(view("full")));
    await run(() => {});
    expect(start).toHaveBeenCalledTimes(1);
    expect(enabled).toBe(true);
    await act(() => root.render(view("reduced")));
    await run(() => {});
    expect(start).toHaveBeenCalledTimes(1);
    expect(enabled).toBe(false);
    await act(() => root.render(view("full")));
    expect(enabled).toBe(true);
  });

  it("passes a swap's failure on to the caller", async () => {
    setStart((update: () => void | Promise<void>) => fakeTransition(Promise.resolve().then(update)));
    let run!: (swap: ViewSwap) => Promise<void>;
    await mount(<App onRun={(r) => (run = r)} />);
    await expect(
      run(() => {
        throw new Error("no route");
      }),
    ).rejects.toThrow("no route");
  });

  it("reports a swap's failure as a rejection where there is no transition, as it does with one", async () => {
    setStart(undefined);
    let run!: (swap: ViewSwap) => Promise<void>;
    await mount(<App onRun={(r) => (run = r)} />);
    let rejected = "";
    await run(() => {
      throw new Error("no route");
    }).catch((error: Error) => (rejected = error.message));
    expect(rejected).toBe("no route");
  });

  it("swaps at once, with no transition, where the browser has none or motion is reduced", async () => {
    const start = vi.fn();
    let enabled = true;
    let run!: (swap: ViewSwap) => Promise<void>;
    setStart(undefined);
    await mount(<App onRun={(r, e) => ((run = r), (enabled = e))} />);
    const first = vi.fn();
    await run(first);
    expect(first).toHaveBeenCalledTimes(1);
    expect(enabled).toBe(true);

    setStart(start);
    await mount(
      <OuroProvider motion="reduced">
        <App onRun={(r, e) => ((run = r), (enabled = e))} />
      </OuroProvider>,
    );
    const second = vi.fn();
    await run(second);
    expect(second).toHaveBeenCalledTimes(1);
    expect(start).not.toHaveBeenCalled();
    expect(enabled).toBe(false);
  });

  it("uses the transition under motion=full, and answers enabled for a router's own prop", async () => {
    const start = vi.fn((update: () => void | Promise<void>) => fakeTransition(Promise.resolve().then(update)));
    setStart(start);
    let run!: (swap: ViewSwap) => Promise<void>;
    let enabled = false;
    await mount(
      <OuroProvider motion="full">
        <App onRun={(r, e) => ((run = r), (enabled = e))} />
      </OuroProvider>,
    );
    await run(() => {});
    expect(start).toHaveBeenCalledTimes(1);
    expect(enabled).toBe(true);
  });

  it("leaves the same focus and the same title with a transition, without one and under reduced motion", async () => {
    const results: unknown[] = [];

    setStart(undefined);
    results.push(await navigate(await mount(<App />)));
    await act(() => roots.pop()!.unmount());
    nodes.pop()!.remove();
    document.title = "";

    setStart((update: () => void | Promise<void>) => fakeTransition(Promise.resolve().then(update)));
    results.push(await navigate(await mount(<App />)));
    await act(() => roots.pop()!.unmount());
    nodes.pop()!.remove();
    document.title = "";

    results.push(
      await navigate(
        await mount(
          <OuroProvider motion="reduced">
            <App />
          </OuroProvider>,
        ),
      ),
    );

    expect(results[0]).toEqual({ focus: "heading", title: "Recipe", status: "Recipe" });
    expect(results[1]).toEqual(results[0]);
    expect(results[2]).toEqual(results[0]);
  });

  it("runs a real browser transition, where the browser has them, to the same place", async () => {
    if (typeof document.startViewTransition !== "function") return;
    const host = await mount(<App />);
    expect(await navigate(host)).toEqual({ focus: "heading", title: "Recipe", status: "Recipe" });
  });
});
