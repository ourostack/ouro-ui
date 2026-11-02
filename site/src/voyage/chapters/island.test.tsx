import { Suspense, useEffect, useState, type ComponentType, type JSX } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { fleschKincaid } from "../../../test/readability";
import { App } from "../../app";
import { ISLAND_FALLBACK } from "../copy";
import { island, IslandBoundary } from "./island";

// An island whose chunk fails to load (island.tsx) shows its fallback while the rest of the page
// hydrates, answers, and marks itself ready (html[data-site-ready], which the end-to-end specs wait
// for). The page here is hydrated from its server HTML, as the built site is.

let host: HTMLElement;
let root: Root | undefined;

function Counter({ id }: { id: string }): JSX.Element {
  const [count, setCount] = useState(0);
  return (
    <button type="button" data-id={id} onClick={() => setCount((value) => value + 1)}>
      {`${id} ${count}`}
    </button>
  );
}

/** The island's own content, as its chunk exports it: a section with the island's id. */
function Chapter(): JSX.Element {
  return (
    <section id="test-island">
      <Counter id="island" />
    </section>
  );
}

/** The page around the island, with something of its own to press. */
const pageWith = (Island: ComponentType) =>
  function TestPage(): JSX.Element {
    return (
      <main>
        <Counter id="page" />
        <Island />
      </main>
    );
  };

/** The island as the server renders it: the chapter in the same boundaries, its chunk already there. */
function ServerIsland(): JSX.Element {
  return (
    <IslandBoundary id="test-island">
      <Suspense>
        <Chapter />
      </Suspense>
    </IslandBoundary>
  );
}

const serverHtml = renderToString(<App path="/" Page={pageWith(ServerIsland)} />);

/** Hydrates the server's HTML with an island whose chunk `load` loads. */
async function hydrate(load: () => Promise<{ default: ComponentType }>): Promise<void> {
  host.innerHTML = serverHtml;
  const Page = pageWith(island("test-island", load));
  await act(() => {
    root = hydrateRoot(host, <App path="/" Page={Page} />);
  });
}

const button = (id: string) => host.querySelector<HTMLButtonElement>(`[data-id="${id}"]`);
const ready = () => document.documentElement.hasAttribute("data-site-ready");

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
});

afterEach(async () => {
  await act(() => root?.unmount());
  root = undefined;
  host.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("an island", () => {
  it("hydrates when its chunk loads, and the page marks itself ready", async () => {
    const load = vi.fn(() => Promise.resolve({ default: Chapter }));
    await hydrate(load);
    await expect.poll(ready).toBe(true);
    // Hydrated: a press on the island answers.
    await expect
      .poll(async () => {
        await act(() => button("island")?.click());
        return button("island")?.textContent;
      })
      .not.toBe("island 0");
    expect(load).toHaveBeenCalledTimes(1);
    expect(host.querySelector("[data-island-failed]")).toBeNull();
  });

  /** Presses the island before its chunk has loaded, then loads it, with the press's replay held on the faked clock. */
  async function pressThenLoad(chapter: ComponentType): Promise<void> {
    let loaded: ((module: { default: ComponentType }) => void) | undefined;
    await hydrate(() => new Promise((resolve) => (loaded = resolve)));
    await expect.poll(() => loaded).toBeDefined();
    await act(() => button("island")!.click());
    expect(button("island")!.textContent).toBe("island 0");
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    await act(() => loaded!({ default: chapter }));
  }

  it("makes a press held before it hydrated again once it has", async () => {
    await pressThenLoad(Chapter);
    await act(() => vi.runOnlyPendingTimers());
    expect(button("island")!.textContent).toBe("island 1");
  });

  it("drops a held press when a press elsewhere comes after it hydrates, before the press is made again", async () => {
    let pressedElsewhere = false;
    // A press on the page in the moment between hydrating and making the held press again.
    function ChapterPressedElsewhere(): JSX.Element {
      useEffect(() => {
        queueMicrotask(() => {
          button("page")!.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
          pressedElsewhere = true;
        });
      }, []);
      return <Chapter />;
    }
    await pressThenLoad(ChapterPressedElsewhere);
    expect(pressedElsewhere).toBe(true);
    await act(() => vi.runOnlyPendingTimers());
    expect(button("island")!.textContent).toBe("island 0");
  });

  it("shows its fallback when its chunk fails to load, while the rest of the page answers and the page marks itself ready", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const load = vi.fn(() => Promise.reject(new TypeError("Importing a module script failed.")));
    await hydrate(load);
    await expect.poll(() => host.querySelector("[data-island-failed]")).not.toBeNull();
    const fallback = host.querySelector("[data-island-failed]")!;
    expect(fallback.id).toBe("test-island");
    expect(fallback.textContent).toBe(`${ISLAND_FALLBACK.text} ${ISLAND_FALLBACK.reload}`);
    expect(fallback.querySelector("a")?.getAttribute("href")).toBe("");
    expect(button("island")).toBeNull();
    // Not tried again in place: the browser would answer from its record of the failed fetch.
    expect(load).toHaveBeenCalledTimes(1);
    expect(ready()).toBe(true);
    await act(() => button("page")!.click());
    expect(button("page")!.textContent).toBe("page 1");
    expect(error.mock.calls.some((call) => String(call[0]).includes("The test-island island did not load."))).toBe(true);
  });

  it("says its chunk did not load at grade 6 or under", () => {
    expect(fleschKincaid([ISLAND_FALLBACK.text, ISLAND_FALLBACK.reload]).grade).toBeLessThanOrEqual(6);
  });
});
