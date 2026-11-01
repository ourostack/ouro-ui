import { type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { commands, page, userEvent } from "vitest/browser";
import { ReactionBar, type CatalogueReaction, type ReactionBarProps } from "@/registry/ouro/components/ouro/reaction-bar/reaction-bar";
import type { EmojiCatalogue, EmojiItem } from "@/registry/ouro/components/ouro/emoji/emoji";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

// ReactionBar with an image catalogue: reactions by emoji id, drawn as the catalogue's images.

const roots: Root[] = [];
let mounted: Element[] = [];

/** A blank image whose address names it, so a test can tell the images apart. */
const image = (name: string) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><title>${name}</title></svg>`)}`;

const party: EmojiItem = { id: "party", name: "Party popper", shortcodes: ["party"], src: image("party"), animatedSrc: image("party moving") };
const heart: EmojiItem = { id: "heart", name: "Red heart", src: image("heart") };
const wave: EmojiItem = {
  id: "wave",
  name: "Waving hand",
  src: image("wave"),
  skinTones: [1, 2, 3, 4, 5].map((tone) => ({ id: `wave-tone${tone}`, src: image(`wave tone${tone}`) })),
};
const fern: EmojiItem = { id: "fern", name: "Fernwood fern", custom: true, src: image("fern") };
const catalogue: EmojiCatalogue = {
  categories: [
    { id: "people", label: "People", items: [wave] },
    { id: "symbols", label: "Symbols", items: [heart, party] },
    { id: "custom", label: "Fernwood", items: [fern] },
  ],
};
const reactions: CatalogueReaction[] = [
  { key: "party", count: 2, mine: true },
  { key: "wave-tone3", count: 1 },
  { key: "fern", count: 4, label: "Team fern" },
];

async function render(node: ReactNode) {
  const host = document.createElement("div");
  host.style.width = "360px";
  document.body.append(host);
  mounted.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
  return { host, rerender: (next: ReactNode) => act(async () => root.render(next)) };
}

const bar = (props: Partial<ReactionBarProps> = {}) => <ReactionBar catalogue={catalogue} reactions={reactions} onReact={() => {}} {...(props as object)} />;
const art = (element: Element | null) => element?.querySelector('[data-ouro="emoji"]')?.getAttribute("src");
const button = (name: string) => page.getByRole("button", { name, exact: true }).element();
const pictographic = /\p{Extended_Pictographic}/u;

let warn: ReturnType<typeof vi.spyOn>;
// Reduced motion for the file, so a mouse left resting on a reaction plays nothing; the test of playing lets motion through.
beforeAll(async () => {
  await commands.emulateMedia({ reducedMotion: "reduce" });
});
afterAll(async () => {
  await commands.emulateMedia({ reducedMotion: "no-preference" });
});
beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(async () => {
  vi.restoreAllMocks();
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  for (const node of mounted) node.remove();
  mounted = [];
});

describe("ReactionBar with a catalogue", () => {
  it("draws each reaction and quick reaction as the catalogue's image, named by the emoji's name and count", async () => {
    const { host } = await render(bar({ quick: ["heart", "party"] }));
    expect(button("Party popper, 2").getAttribute("aria-pressed")).toBe("true");
    expect(art(button("Party popper, 2"))).toBe(party.src);
    expect(art(button("Waving hand, 1"))).toBe(image("wave tone3"));
    expect(art(button("Team fern, 4"))).toBe(fern.src);
    // Party is already a reaction, so only the heart is offered.
    expect([...host.querySelectorAll('[data-ouro-part="quick"]')].map((element) => element.textContent)).toEqual(["Red heart"]);
    expect(art(button("Red heart"))).toBe(heart.src);
    expect(pictographic.test(host.textContent!)).toBe(false);
    expect(warn).not.toHaveBeenCalled();
  });

  it("offers quick reactions by id that are not there yet, leaving out ids the catalogue lacks", async () => {
    const onReact = vi.fn();
    const { host } = await render(bar({ reactions: [], quick: ["heart", "gone", "wave-tone1"], onReact } as Partial<ReactionBarProps>));
    expect([...host.querySelectorAll('[data-ouro-part="quick"]')].map((element) => element.textContent)).toEqual(["Red heart", "Waving hand"]);
    expect(art(button("Waving hand"))).toBe(image("wave tone1"));
    await userEvent.click(button("Waving hand"));
    expect(onReact).toHaveBeenCalledWith("wave-tone1", expect.anything());
    await userEvent.click(button("Red heart"));
    expect(onReact).toHaveBeenLastCalledWith("heart", expect.anything());
  });

  it("plays an animated reaction while its button is under the mouse or in focus, and never with reduced motion", async () => {
    await commands.emulateMedia({ reducedMotion: "no-preference" });
    try {
      await render(bar());
      const reaction = button("Party popper, 2");
      await userEvent.hover(reaction);
      await expect.poll(() => art(reaction)).toBe(party.animatedSrc);
      await userEvent.hover(button("Team fern, 4"));
      await expect.poll(() => art(reaction)).toBe(party.src);
      await act(async () => (reaction as HTMLElement).focus());
      expect(art(reaction)).toBe(party.animatedSrc);
    } finally {
      await commands.emulateMedia({ reducedMotion: "reduce" });
    }
    await expect.poll(() => art(button("Party popper, 2"))).toBe(party.src);
  });

  it("draws read-only reactions from the catalogue too, saying which is the person's own", async () => {
    const { host } = await render(<ReactionBar catalogue={catalogue} reactions={reactions} />);
    expect(host.querySelectorAll("button")).toHaveLength(0);
    const badges = [...host.querySelectorAll('[data-ouro="badge"]')];
    expect(badges.map((badge) => badge.textContent)).toEqual(["Party popper, 2, including you", "Waving hand, 1", "Team fern, 4"]);
    expect(badges.map(art)).toEqual([party.src, image("wave tone3"), fern.src]);
  });

  it("shows a reaction the catalogue lacks as the app's fallback, else as its id, and names it in development", async () => {
    const { host } = await render(bar({ reactions: [{ key: "gone", count: 1 }, { key: "old", count: 2, label: "Old smile", emoji: <svg data-testid="old" /> }] } as Partial<ReactionBarProps>));
    expect(button("gone, 1").textContent).toBe(":gone:gone, 1");
    expect(button("Old smile, 2").querySelector('[data-testid="old"]')).not.toBeNull();
    expect(host.querySelector('[data-ouro="emoji"]')).toBeNull();
    expect(warn.mock.calls.map((call: unknown[]) => String(call[0]))).toEqual([
      '[ouro-ui] ReactionBar: reaction "gone" is not in the catalogue, so it shows as text. Fix: { key: "gone", count, emoji: <Fallback /> }.',
    ]);
  });

  it("names reactions without emoji and quick reactions by id without a catalogue, with the fix, and hides those quick reactions", async () => {
    const props = { reactions: [{ key: "party", count: 1 }], quick: ["heart", { key: "like", label: "Like", emoji: "+" }], onReact: () => {} } as unknown as ReactionBarProps;
    const { host } = await render(<ReactionBar {...props} />);
    expect(warn.mock.calls.map((call: unknown[]) => String(call[0]))).toEqual([
      '[ouro-ui] ReactionBar: reaction "party" has no emoji; pass catalogue to draw it by id. Fix: <ReactionBar catalogue={catalogue} reactions={reactions}>.',
      '[ouro-ui] ReactionBar: quick reactions by id need catalogue, so they are hidden. Fix: <ReactionBar catalogue={catalogue} quick={["like", "heart"]}>.',
    ]);
    expect([...host.querySelectorAll('[data-ouro-part="quick"]')].map((element) => element.textContent)).toEqual(["+Like"]);
  });
});
