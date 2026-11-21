import { type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Freshness } from "@/registry/ouro/components/ouro/freshness/freshness";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

const roots: Root[] = [];
const hosts: Element[] = [];

async function render(node: ReactNode) {
  const host = document.createElement("div");
  document.body.append(host);
  hosts.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
  return { root, el: host.querySelector<HTMLElement>('[data-ouro="freshness"]')! };
}

afterEach(async () => {
  for (const root of roots.splice(0)) await act(async () => root.unmount());
  for (const host of hosts.splice(0)) host.remove();
  vi.restoreAllMocks();
});

describe("Freshness", () => {
  it("says how old the data is, with the exact instant in a <time>", async () => {
    const at = new Date(Date.now() - 3 * 60_000);
    const { el } = await render(<Freshness updatedAt={at} />);
    expect(el.textContent).toMatch(/^Updated .*minutes? ago$/);
    expect(el.querySelector("time")!.getAttribute("datetime")).toBe(at.toISOString());
  });

  it("is quiet and keeps the icon's room while idle", async () => {
    const { el } = await render(<Freshness updatedAt={Date.now()} />);
    expect(el.hasAttribute("data-ouro-refreshing")).toBe(false);
    expect(el.hasAttribute("aria-busy")).toBe(false);
    expect(el.querySelector(".sr-only")).toBeNull();
    expect(el.querySelector('[data-ouro-part="icon"]')!.getAttribute("class")).toContain("invisible");
  });

  it("marks a refresh for agents and screen readers, and clears it", async () => {
    const { root, el } = await render(<Freshness updatedAt={Date.now()} refreshing />);
    expect(el.hasAttribute("data-ouro-refreshing")).toBe(true);
    expect(el.getAttribute("aria-busy")).toBe("true");
    expect(el.querySelector(".sr-only")!.textContent).toBe("Refreshing");
    expect(el.querySelector('[data-ouro-part="icon"]')!.getAttribute("class")).toContain("ouro-spin");
    await act(async () => root.render(<Freshness updatedAt={Date.now()} />));
    expect(el.hasAttribute("data-ouro-refreshing")).toBe(false);
    expect(el.querySelector(".sr-only")).toBeNull();
  });

  it("takes the words in another language, with the age where {age} sits", async () => {
    const { el } = await render(<Freshness updatedAt={Date.now()} refreshing labels={{ updated: "Actualizado {age}!", refreshing: "Actualizando" }} locale="es" />);
    expect(el.textContent).toMatch(/^Actualizado .*!Actualizando$/);
  });

  it("reads the default words from a labels object that sets only one", async () => {
    const { el } = await render(<Freshness updatedAt={Date.now()} refreshing labels={{ refreshing: "Loading" }} />);
    expect(el.textContent).toMatch(/^Updated .*Loading$/);
  });

  it("names the fix for a prop an agent guesses, and for an appearance class", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await render(<Freshness updatedAt={Date.now()} className="text-red-500" {...({ lastUpdated: 1, isFetching: true } as object)} />);
    const said = [...error.mock.calls, ...warn.mock.calls].map((c) => String(c[0])).join("\n");
    expect(said).toContain("[ouro-ui] Freshness: lastUpdated is not a prop. Fix: <Freshness updatedAt={query.dataUpdatedAt} />");
    expect(said).toContain("[ouro-ui] Freshness: isFetching is not a prop. Fix: <Freshness updatedAt={at} refreshing={isFetching} />");
    expect(said).toContain('remove "text-red-500"');
  });
});
