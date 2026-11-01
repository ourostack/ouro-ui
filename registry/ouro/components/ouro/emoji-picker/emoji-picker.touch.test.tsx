import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { EmojiPicker, type EmojiPickerCategory } from "@/registry/ouro/components/ouro/emoji-picker/emoji-picker";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

// Runs in the `touch` project: Chromium as a 390x844 phone with a coarse pointer.

const categories: EmojiPickerCategory[] = [
  {
    label: "People",
    emoji: [
      { emoji: "👍", name: "thumbs up", skinTones: true },
      { emoji: "👋", name: "waving hand", skinTones: true },
    ],
  },
  { label: "Food", emoji: [{ emoji: "☕", name: "hot beverage" }] },
];

let root: Root | undefined;
const nodes: Element[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await act(async () => root?.unmount());
  for (const node of nodes.splice(0)) node.remove();
});

describe("EmojiPicker on a phone", () => {
  it("is a bottom sheet whose emoji, categories and tones are 44px touch targets, and a tap chooses", async () => {
    const onSelect = vi.fn();
    const host = document.createElement("div");
    document.body.append(host);
    nodes.push(host);
    root = createRoot(host);
    await act(async () =>
      root!.render(<EmojiPicker label="Add a reaction" categories={categories} quick={[categories[0]!.emoji[0]!]} trigger={<Button aria-label="React">+</Button>} onSelect={onSelect} />),
    );
    await userEvent.click(host.querySelector("button")!);
    const panel = () => document.querySelector<HTMLElement>('[data-ouro="emoji-picker"]');
    await expect.poll(() => panel()?.closest('[data-ouro="sheet"]')).toBeTruthy();
    // The sheet slides in with a transform, which a bounding box measures; wait until it settles.
    const sheet = panel()!.closest<HTMLElement>('[data-ouro="sheet"]')!;
    await expect.poll(() => !sheet.hasAttribute("data-starting-style") && sheet.getAnimations({ subtree: true }).length === 0).toBe(true);
    const sizes = (part: string) => [...panel()!.querySelectorAll<HTMLElement>(`[data-ouro-part="${part}"]`)].map((element) => element.getBoundingClientRect().height);
    expect(sizes("emoji")).toEqual([44, 44, 44]);
    expect(sizes("quick")).toEqual([44]);
    expect(sizes("category")).toEqual([44, 44]);
    expect(sizes("skin-tone")[0]).toBeGreaterThanOrEqual(44);
    await userEvent.click(panel()!.querySelector<HTMLElement>('[data-ouro-part="skin-tone"]')!);
    expect(sizes("tone")).toEqual([44, 44, 44, 44, 44, 44]);
    await userEvent.click(panel()!.querySelectorAll<HTMLElement>('[data-ouro-part="tone"]')[2]!);
    await userEvent.click(panel()!.querySelector<HTMLElement>('[aria-label="waving hand"]')!);
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ emoji: "👋🏼", skinTone: "medium-light" }), expect.anything());
  });
});
