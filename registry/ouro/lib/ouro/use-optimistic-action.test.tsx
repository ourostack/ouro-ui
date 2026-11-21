import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { useOptimisticAction, type OptimisticAction, type OptimisticActionOptions } from "@/registry/ouro/lib/ouro/use-optimistic-action";

const roots: Root[] = [];
const nodes: Element[] = [];

async function probe(base: number, options?: OptimisticActionOptions) {
  const state = {} as { current: OptimisticAction<number> };
  function Probe() {
    state.current = useOptimisticAction(base, options);
    return null;
  }
  const host = document.createElement("div");
  document.body.append(host);
  nodes.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(<Probe />));
  return state;
}

/** A commit the test settles by hand. */
function deferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

afterEach(async () => {
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  for (const node of nodes.splice(0)) node.remove();
});

describe("useOptimisticAction", () => {
  it("shows a change at once and stays pending without blocking the next", async () => {
    const state = await probe(1);
    const first = deferred();
    await act(async () => void state.current.run((n) => n + 1, () => first.promise));
    expect(state.current.value).toBe(2);
    expect(state.current.pending).toBe(true);
    const second = deferred();
    await act(async () => void state.current.run((n) => n * 10, () => second.promise));
    expect(state.current.value).toBe(20);
    await act(async () => {
      first.resolve();
      second.resolve();
    });
    expect(state.current.pending).toBe(false);
    expect(state.current.value).toBe(1);
  });

  it("undoes a refused change and says why, leaving the others in place", async () => {
    const state = await probe(1);
    const kept = deferred();
    const refused = deferred();
    let result: boolean | undefined;
    await act(async () => {
      void state.current.run((n) => n + 1, () => kept.promise);
      void state.current.run((n) => n * 10, () => refused.promise).then((ok) => (result = ok));
    });
    expect(state.current.value).toBe(20);
    await act(async () => refused.reject(new Error("Not allowed here")));
    expect(result).toBe(false);
    expect(state.current.value).toBe(2);
    expect(state.current.reason).toBe("Not allowed here");
    expect(state.current.pending).toBe(true);
    await act(async () => void state.current.run((n) => n, () => Promise.resolve()));
    expect(state.current.reason).toBeUndefined();
  });

  it("describes a refusal with the app's words, and survives a commit that throws at once", async () => {
    const state = await probe(0, { describe: (error) => `Failed: ${String(error)}` });
    await act(async () => {
      await state.current.run((n) => n + 1, () => {
        throw "boom";
      });
    });
    expect(state.current.reason).toBe("Failed: boom");
    expect(state.current.value).toBe(0);
    await act(async () => void (await state.current.run((n) => n + 1, () => Promise.reject({}))));
    expect(state.current.reason).toBe("Failed: [object Object]");
  });

  it("applies quick changes in the order they were made", async () => {
    const state = await probe(1);
    const a = deferred();
    const b = deferred();
    await act(async () => {
      void state.current.run((n) => n + 1, () => a.promise);
      void state.current.run((n) => n * 3, () => b.promise);
    });
    expect(state.current.value).toBe(6);
    await act(async () => a.resolve());
    expect(state.current.value).toBe(3);
  });

  it("says a plain reason when the error has no message", async () => {
    const state = await probe(0);
    await act(async () => void (await state.current.run((n) => n, () => Promise.reject(undefined))));
    expect(state.current.reason).toBe("That didn't go through");
  });

  it("resolves true when the commit succeeds", async () => {
    const state = await probe(0);
    let result: boolean | undefined;
    await act(async () => void (await state.current.run((n) => n + 1, () => Promise.resolve()).then((ok) => (result = ok))));
    expect(result).toBe(true);
  });

  it("describes a refusal with the describe the latest render gave", async () => {
    const state = {} as { current: OptimisticAction<number> };
    function Probe({ word }: { word: string }) {
      state.current = useOptimisticAction(0, { describe: () => word });
      return null;
    }
    const host = document.createElement("div");
    document.body.append(host);
    nodes.push(host);
    const root = createRoot(host);
    roots.push(root);
    await act(async () => root.render(<Probe word="first" />));
    await act(async () => root.render(<Probe word="second" />));
    await act(async () => void (await state.current.run((n) => n, () => Promise.reject(new Error("x")))));
    expect(state.current.reason).toBe("second");
  });
});
