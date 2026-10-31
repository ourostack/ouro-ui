import { useEffect, useState, type JSX } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { HydrateInTurn, hydratedInTurn, hydratingServerHtml } from "./hydrate";

// Hydration in turns (hydrate.tsx): each boundary hydrates after the one before it, once the
// browser is idle, and a press hydrates the boundary it lands in at once. The test holds the idle
// callbacks, so it decides when the browser is idle.

let idle: Array<() => void> = [];
let host: HTMLElement;
let root: Root | undefined;
const committed: string[] = [];

function Counter({ id }: { id: string }): JSX.Element {
  const [count, setCount] = useState(0);
  useEffect(() => void committed.push(id), [id]);
  return (
    <button type="button" data-id={id} onClick={() => setCount((value) => value + 1)}>
      {`${id} ${count}`}
    </button>
  );
}

function Page({ names }: { names: string[] }): JSX.Element {
  return (
    <main>
      {names.map((name) => (
        <HydrateInTurn key={name} name={name}>
          <Counter id={name} />
        </HydrateInTurn>
      ))}
    </main>
  );
}

// The server's HTML, rendered before any test marks the page as hydrating.
const serverHtml = new Map([["first", "second"], ["waiting", "later"], ["safari-a", "safari-b"]].map((names) => [names.join(), renderToString(<Page names={names} />)]));

async function hydrate(names: string[], waits = true): Promise<void> {
  host.innerHTML = serverHtml.get(names.join())!;
  hydratingServerHtml();
  await act(() => {
    root = hydrateRoot(host, <Page names={names} />);
  });
  // Every boundary has joined the queue: the first waits for the browser to be idle.
  if (waits) await expect.poll(() => idle.length).toBeGreaterThan(0);
}

/** Runs the idle callbacks waiting now, as the browser does once it has nothing else to do. */
async function goIdle(): Promise<void> {
  const waiting = idle;
  idle = [];
  await act(() => {
    for (const callback of waiting) callback();
  });
}

const button = (id: string) => host.querySelector<HTMLButtonElement>(`[data-id="${id}"]`)!;

beforeEach(() => {
  committed.length = 0;
  idle = [];
  vi.stubGlobal("requestIdleCallback", (callback: () => void) => idle.push(callback));
  host = document.createElement("div");
  document.body.append(host);
});

afterEach(async () => {
  await act(() => root?.unmount());
  root = undefined;
  host.remove();
  vi.unstubAllGlobals();
});

describe("hydration in turns", () => {
  it("keeps each boundary's server HTML until its turn, hydrates them one at a time in order, then reports the page hydrated", async () => {
    await hydrate(["first", "second"]);
    let done = false;
    void hydratedInTurn().then(() => (done = true));
    expect(committed).toEqual([]);
    await goIdle();
    await expect.poll(() => committed).toEqual(["first"]);
    await expect.poll(() => idle.length).toBeGreaterThan(0);
    expect(committed).toEqual(["first"]);
    await goIdle();
    await expect.poll(() => committed).toEqual(["first", "second"]);
    await expect
      .poll(async () => {
        await goIdle();
        return done;
      })
      .toBe(true);
    await act(() => button("second").click());
    expect(button("second").textContent).toBe("second 1");
  });

  it("hydrates every boundary at once where the browser has no requestIdleCallback, and reports the page hydrated at once", async () => {
    vi.stubGlobal("requestIdleCallback", undefined);
    await hydrate(["safari-a", "safari-b"], false);
    await expect.poll(() => committed).toEqual(["safari-a", "safari-b"]);
    await hydratedInTurn();
    await act(() => button("safari-b").click());
    expect(button("safari-b").textContent).toBe("safari-b 1");
  });

  it("answers a press on a boundary still waiting its turn, by hydrating it inside the press", async () => {
    await hydrate(["waiting", "later"]);
    expect(committed).toEqual([]);
    await act(() => button("later").click());
    expect(button("later").textContent).toBe("later 1");
    await expect.poll(() => committed).toContain("waiting");
  });
});
