import { useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { ConversationFind } from "@/registry/ouro/components/ouro/conversation-find/conversation-find";
import { resultWords, stepFrom } from "@/registry/ouro/components/ouro/conversation-find/conversation-find-styles";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { watchAnnouncements } from "@/registry/ouro/lib/ouro/testing/announcements";

const roots: Root[] = [];
let mounted: Element[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) await act(async () => root.unmount());
  for (const host of mounted) host.remove();
  mounted = [];
});

async function render(node: ReactNode) {
  const host = document.createElement("div");
  document.body.append(host);
  mounted.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
  return { host, root };
}

const seen: { steps: number[]; closed: number } = { steps: [], closed: 0 };

function Bar({ count = 3, start = 0, query = "lunch", partial }: { count?: number; start?: number | null; query?: string; partial?: boolean }) {
  const [current, setCurrent] = useState<number | null>(start);
  return (
    <ConversationFind
      label="Find in conversation"
      query={query}
      onQueryChange={() => {}}
      count={count}
      current={current}
      partial={partial}
      onCurrentChange={(next) => {
        seen.steps.push(next);
        setCurrent(next);
      }}
      onClose={() => seen.closed++}
    />
  );
}

const box = () => document.querySelector<HTMLInputElement>('input[type="search"]')!;
const press = (init: KeyboardEventInit) => act(async () => void document.body.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init })));
const apple = /mac|iphone|ipad/i.test(navigator.platform);
const mod = apple ? { metaKey: true } : { ctrlKey: true };

describe("ConversationFind", () => {
  afterEach(() => {
    seen.steps = [];
    seen.closed = 0;
  });

  it("steps with Enter and Shift+Enter in the find box, wrapping round past either end", async () => {
    await render(<Bar />);
    expect(document.activeElement).toBe(box());
    await userEvent.keyboard("{Enter}{Enter}{Enter}");
    expect(seen.steps).toEqual([1, 2, 0]);
    await userEvent.keyboard("{Shift>}{Enter}{/Shift}");
    expect(seen.steps).toEqual([1, 2, 0, 2]);
    expect(document.activeElement).toBe(box());
    await page.getByRole("button", { name: "Next match" }).click();
    await page.getByRole("button", { name: "Previous match" }).click();
    expect(seen.steps.slice(4)).toEqual([0, 2]);
  });

  it("steps with F3 and Shift+F3 and with Cmd or Ctrl+G, from outside the box too", async () => {
    await render(<Bar />);
    const outside = document.createElement("button");
    document.body.append(outside);
    mounted.push(outside);
    outside.focus();
    await press({ key: "F3", code: "F3" });
    await press({ key: "F3", code: "F3", shiftKey: true });
    await press({ key: "g", code: "KeyG", ...mod });
    await press({ key: "G", code: "KeyG", shiftKey: true, ...mod });
    expect(seen.steps).toEqual([1, 0, 1, 0]);
    expect(document.activeElement).toBe(outside);
    // A plain G, the other platform's modifier and a prevented key are the page's own.
    await press({ key: "g", code: "KeyG" });
    await press({ key: "g", code: "KeyG", ...(apple ? { ctrlKey: true } : { metaKey: true }) });
    await press({ key: "F3", code: "F3", altKey: true });
    expect(seen.steps).toHaveLength(4);
  });

  it("closes with Escape and returns focus to where it came from", async () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    mounted.push(opener);
    opener.focus();
    await render(<Bar />);
    expect(document.activeElement).toBe(box());
    await userEvent.keyboard("{Escape}");
    expect(seen.closed).toBe(1);
    expect(document.activeElement).toBe(opener);
    box().focus();
    await page.getByRole("button", { name: "Close find" }).click();
    expect(seen.closed).toBe(2);
    expect(document.activeElement).toBe(opener);
  });

  it("leaves Enter and Escape to an input method while it is composing", async () => {
    await render(<Bar />);
    for (const key of ["Enter", "Escape"]) box().dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, isComposing: true }));
    expect(seen.steps).toEqual([]);
    expect(seen.closed).toBe(0);
  });

  it("says which match is current out of how many, in words a screen reader hears once per change", async () => {
    expect([resultWords(1, 5, "None"), resultWords(null, 5, "None"), resultWords(0, 0, "None"), stepFrom(null, 4, -1), stepFrom(null, 0, 1)]).toEqual(["2 of 5", "None", "None", 3, null]);
    const heard = watchAnnouncements();
    try {
      const { root } = await render(<Bar />);
      await expect.poll(() => heard.count("1 of 3")).toBe(1);
      await userEvent.keyboard("{Enter}");
      await expect.poll(() => heard.count("2 of 3")).toBe(1);
      await act(async () => root.render(<Bar count={0} start={null} />));
      await expect.poll(() => heard.count("No matches")).toBe(1);
      await act(async () => root.render(<Bar count={0} start={null} query="" />));
      await act(async () => {});
      expect(heard.changes.map((change) => change.text)).toEqual(["1 of 3", "2 of 3", "No matches"]);
    } finally {
      heard.stop();
    }
    expect(page.getByRole("search", { name: "Find in conversation" })).toBeDefined();
  });

  it("marks a count that more history may add to, and keeps its buttons off while there is nothing to step to", async () => {
    await render(<Bar partial />);
    await expect.element(page.getByRole("status")).toHaveTextContent("1 of 3+");
    await render(<Bar count={0} start={null} />);
    for (const name of ["Next match", "Previous match"]) expect(page.getByRole("button", { name }).last().element().getAttribute("aria-disabled")).toBe("true");
  });
});
