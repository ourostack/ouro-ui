import { Suspense, useState, type ComponentType, type JSX } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { fleschKincaid } from "../../../test/readability";
import { App } from "../../app";
import { ISLAND_FALLBACK } from "../copy";
import { island, IslandBoundary, loadWithRetry } from "./island";

// An island whose chunk fails to load (island.tsx): it is tried once more, and one that still
// fails shows its fallback while the rest of the page hydrates, answers, and marks itself ready
// (html[data-site-ready], which the end-to-end specs wait for). The page here is hydrated from its
// server HTML, as the built site is.

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
  vi.restoreAllMocks();
});

describe("an island whose chunk fails to load", () => {
  it("loads it once more after a failure, and gives up after a second", async () => {
    const fails = (times: number) => {
      let calls = 0;
      return vi.fn(() => (++calls <= times ? Promise.reject(new TypeError("Importing a module script failed.")) : Promise.resolve("loaded")));
    };
    const once = fails(1);
    await expect(loadWithRetry(once)).resolves.toBe("loaded");
    expect(once).toHaveBeenCalledTimes(2);
    const twice = fails(2);
    await expect(loadWithRetry(twice)).rejects.toThrow("Importing a module script failed.");
    expect(twice).toHaveBeenCalledTimes(2);
  });

  it("hydrates the island when the chunk fails once then loads, and the page marks itself ready", async () => {
    let calls = 0;
    const load = vi.fn(() => (++calls === 1 ? Promise.reject(new TypeError("Importing a module script failed.")) : Promise.resolve({ default: Chapter })));
    await hydrate(load);
    await expect.poll(ready).toBe(true);
    await expect.poll(() => load.mock.calls.length).toBe(2);
    // Hydrated: a press on the island answers.
    await expect
      .poll(async () => {
        await act(() => button("island")?.click());
        return button("island")?.textContent;
      })
      .not.toBe("island 0");
    expect(host.querySelector("[data-island-failed]")).toBeNull();
    await act(() => button("page")!.click());
    expect(button("page")!.textContent).toBe("page 1");
  });

  it("shows the island's fallback when the chunk fails twice, while the rest of the page answers and the page marks itself ready", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const load = vi.fn(() => Promise.reject(new TypeError("Importing a module script failed.")));
    await hydrate(load);
    await expect.poll(() => host.querySelector("[data-island-failed]")).not.toBeNull();
    const fallback = host.querySelector("[data-island-failed]")!;
    expect(fallback.id).toBe("test-island");
    expect(fallback.textContent).toBe(`${ISLAND_FALLBACK.text} ${ISLAND_FALLBACK.reload}`);
    expect(fallback.querySelector("a")?.getAttribute("href")).toBe("");
    expect(button("island")).toBeNull();
    expect(load).toHaveBeenCalledTimes(2);
    expect(ready()).toBe(true);
    await act(() => button("page")!.click());
    expect(button("page")!.textContent).toBe("page 1");
    expect(error.mock.calls.some((call) => String(call[0]).includes("The test-island island did not load."))).toBe(true);
  });

  it("says so at grade 6 or under", () => {
    expect(fleschKincaid([ISLAND_FALLBACK.text, ISLAND_FALLBACK.reload]).grade).toBeLessThanOrEqual(6);
  });
});
