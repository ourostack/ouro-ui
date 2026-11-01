import { type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { commands, page, userEvent } from "vitest/browser";
import {
  EmojiPicker,
  type EmojiPickerCatalogueSelection,
  type EmojiPickerEmoji,
  type EmojiPickerProps,
  type EmojiSkinTone,
} from "@/registry/ouro/components/ouro/emoji-picker/emoji-picker";
import { EmojiText, type EmojiCatalogue, type EmojiItem } from "@/registry/ouro/components/ouro/emoji/emoji";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

// Runs in Chromium and WebKit: EmojiPicker with an image catalogue in place of the platform's emoji.

const roots: Root[] = [];
let mounted: Element[] = [];

/** A blank image whose address names it, so a test can tell the images apart. */
const image = (name: string) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><title>${name}</title></svg>`)}`;

const wave: EmojiItem = {
  id: "wave",
  name: "Waving hand",
  shortcodes: ["wave"],
  keywords: ["hello"],
  src: image("wave"),
  animatedSrc: image("wave moving"),
  skinTones: [1, 2, 3, 4, 5].map((tone) => ({ id: `wave-tone${tone}`, src: image(`wave tone${tone}`), animatedSrc: image(`wave tone${tone} moving`) })),
};
const smile: EmojiItem = { id: "smile", name: "Smiling face", shortcodes: ["smile"], keywords: ["happy"], src: image("smile"), animatedSrc: image("smile moving") };
const heart: EmojiItem = { id: "heart", name: "Red heart", shortcodes: ["heart"], keywords: ["love"], text: "❤️", src: image("heart") };
const party: EmojiItem = { id: "party", name: "Party popper", shortcodes: ["party", "tada"], keywords: ["celebrate"], text: "🎉", src: image("party"), animatedSrc: image("party moving") };
const fern: EmojiItem = { id: "fern", name: "Fernwood fern", shortcodes: ["fern"], keywords: ["team"], custom: true, src: image("fern") };
const mug: EmojiItem = { id: "mug", name: "Team coffee", shortcodes: ["coffee_time"], custom: true, src: image("mug") };
const catalogue: EmojiCatalogue = {
  categories: [
    { id: "smileys", label: "Smileys", items: [smile, wave] },
    { id: "symbols", label: "Symbols", items: [heart, party] },
    { id: "custom", label: "Fernwood", items: [fern, mug] },
  ],
};

async function render(node: ReactNode) {
  const host = document.createElement("div");
  document.body.append(host);
  mounted.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
  return { host, rerender: (next: ReactNode) => act(async () => root.render(next)) };
}

const picker = (props: Partial<EmojiPickerProps> = {}) => (
  <EmojiPicker
    label="Add a reaction"
    catalogue={catalogue}
    trigger={<Button aria-label="React">+</Button>}
    onSelect={() => {}}
    {...(props as object)}
  />
);

const panel = () => document.querySelector<HTMLElement>('[data-ouro="emoji-picker"]')!;
const popup = () => document.querySelector<HTMLElement>('[data-ouro="popover"], [data-ouro="sheet"]');
const search = () => panel().querySelector<HTMLInputElement>('input[type="search"]')!;
const cells = () => [...panel().querySelectorAll<HTMLButtonElement>('[data-ouro-part="emoji"]')];
const quickCells = () => [...panel().querySelectorAll<HTMLButtonElement>('[data-ouro-part="quick"]')];
const categoryButtons = () => [...panel().querySelectorAll<HTMLButtonElement>('[data-ouro-part="category"]')];
const cell = (name: string) => cells().find((element) => element.getAttribute("aria-label") === name)!;
const names = (list: HTMLElement[]) => list.map((element) => element.getAttribute("aria-label"));
const art = (element: Element) => element.querySelector<HTMLImageElement>('[data-ouro="emoji"]')?.getAttribute("src");
const headings = () => [...panel().querySelectorAll('[role="grid"]')].map((grid) => document.getElementById(grid.getAttribute("aria-labelledby")!)!.textContent);
const previewArt = () => art(panel().lastElementChild!);
const focused = () => document.activeElement as HTMLElement;
const pictographic = /\p{Extended_Pictographic}/u;

/** Waits until the open popover has started its entrance, then ends the fade at once. */
async function settled() {
  await expect
    .poll(() => {
      const element = popup();
      if (!element || element.hasAttribute("data-starting-style")) return false;
      for (const animation of element.getAnimations()) animation.finish();
      return true;
    }, { interval: 5 })
    .toBe(true);
}

async function open(props: Partial<EmojiPickerProps> = {}) {
  const rendered = await render(picker(props));
  await userEvent.click(rendered.host.querySelector("button")!);
  await settled();
  return rendered;
}

let warn: ReturnType<typeof vi.spyOn>;
// Reduced motion for the file, so a mouse left resting on an emoji plays nothing; the test of playing lets motion through.
beforeAll(async () => {
  await page.viewport(1280, 800);
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

describe("EmojiPicker with a catalogue", () => {
  it("draws only the catalogue's images, each named by its emoji's name, with the custom category labelled by the app", async () => {
    await open({ quick: ["party"] });
    expect(headings()).toEqual(["Smileys", "Symbols", "Fernwood"]);
    expect(names(cells())).toEqual(["Smiling face", "Waving hand", "Red heart", "Party popper", "Fernwood fern", "Team coffee"]);
    expect(cells().map(art)).toEqual([smile.src, wave.src, heart.src, party.src, fern.src, mug.src]);
    expect(cell("Fernwood fern").querySelector("img")!.alt).toBe("Fernwood fern");
    expect(page.getByRole("button", { name: "Fernwood fern" }).element()).toBe(cell("Fernwood fern"));
    // The category bar shows each category's first emoji, kept still, under its label.
    expect(names(categoryButtons())).toEqual(["Smileys", "Symbols", "Fernwood"]);
    expect(categoryButtons().map(art)).toEqual([smile.src, heart.src, fern.src]);
    await userEvent.hover(categoryButtons()[0]!);
    expect(art(categoryButtons()[0]!)).toBe(smile.src);
    // The skin tone button and the quick row are images too, and no text anywhere is an emoji.
    expect(art(panel().querySelector('[data-ouro-part="skin-tone"]')!)).toBe(wave.src);
    expect(quickCells().map(art)).toEqual([party.src]);
    expect(pictographic.test(panel().textContent!)).toBe(false);
    expect(warn).not.toHaveBeenCalled();
  });

  it("searches by shortcode, with or without colons, by keyword and by the emoji's text", async () => {
    await open();
    const results = async (text: string) => {
      await userEvent.clear(search());
      await userEvent.type(search(), text);
      return names(cells());
    };
    expect(await results("tada")).toEqual(["Party popper"]);
    expect(await results(":tada:")).toEqual(["Party popper"]);
    expect(await results("coffee_time")).toEqual(["Team coffee"]);
    expect(await results("coffee_t")).toEqual(["Team coffee"]);
    expect(await results("team")).toEqual(["Fernwood fern", "Team coffee"]);
    expect(await results("love")).toEqual(["Red heart"]);
    await userEvent.clear(search());
    await userEvent.fill(search(), "❤");
    expect(names(cells())).toEqual(["Red heart"]);
    await userEvent.fill(search(), "🎉");
    expect(names(cells())).toEqual(["Party popper"]);
    await userEvent.fill(search(), "party");
    expect(names(cells())).toEqual(["Party popper"]);
  });

  it("shows frequently used and quick emoji by id, leaving out ids the catalogue lacks", async () => {
    const { rerender } = await open({ frequent: ["heart", "gone", "wave-tone2"], quick: ["party", "nope", "smile"] });
    expect(headings()).toEqual(["Frequently used", "Smileys", "Symbols", "Fernwood"]);
    expect(names(cells()).slice(0, 2)).toEqual(["Red heart", "Waving hand"]);
    expect(names(quickCells())).toEqual(["Party popper", "Smiling face"]);
    // The same ids in a new array keep the emoji the picker drew.
    const first = cells()[0];
    await rerender(picker({ frequent: ["heart", "gone", "wave-tone2"], quick: ["party", "nope", "smile"] }));
    expect(cells()[0]).toBe(first);
    await rerender(picker({ frequent: ["smile"], quick: [] }));
    expect(names(cells()).slice(0, 1)).toEqual(["Smiling face"]);
    expect(quickCells()).toEqual([]);
  });

  it("chooses an emoji: onSelect gets its id, name, token, tone and catalogue item, and the token draws as its image", async () => {
    const onSelect = vi.fn<(selection: EmojiPickerCatalogueSelection) => void>();
    const { rerender } = await open({ onSelect } as Partial<EmojiPickerProps>);
    await userEvent.click(cell("Party popper"));
    expect(onSelect).toHaveBeenLastCalledWith({ id: "party", name: "Party popper", token: ":party:", skinTone: "default", item: party }, expect.anything());
    await rerender(picker({ onSelect, skinTone: "medium" } as Partial<EmojiPickerProps>));
    await userEvent.click(page.getByRole("button", { name: "React" }));
    await settled();
    await userEvent.click(cell("Waving hand"));
    expect(onSelect).toHaveBeenLastCalledWith({ id: "wave-tone3", name: "Waving hand", token: ":wave-tone3:", skinTone: "medium", item: wave }, expect.anything());
    await userEvent.click(page.getByRole("button", { name: "React" }));
    await settled();
    await userEvent.click(cell("Fernwood fern"));
    expect(onSelect).toHaveBeenLastCalledWith({ id: "fern", name: "Fernwood fern", token: ":fern:", skinTone: "default", item: fern }, expect.anything());
    const { host } = await render(<EmojiText text={`Done ${onSelect.mock.calls[0]![0].token} ${onSelect.mock.calls[1]![0].token}`} catalogue={catalogue} />);
    expect([...host.querySelectorAll("img")].map((img) => img.getAttribute("src"))).toEqual([party.src, image("wave tone3")]);
  });

  it("plays an animated emoji while it is in focus or under the mouse, and the preview with it", async () => {
    await commands.emulateMedia({ reducedMotion: "no-preference" });
    onTestFinished(() => commands.emulateMedia({ reducedMotion: "reduce" }));
    await open();
    expect(previewArt()).toBe(smile.src);
    await userEvent.hover(cell("Party popper"));
    await expect.poll(() => art(cell("Party popper"))).toBe(party.animatedSrc);
    await expect.poll(previewArt).toBe(party.animatedSrc);
    await userEvent.hover(search());
    await expect.poll(() => art(cell("Party popper"))).toBe(party.src);
    await expect.poll(previewArt).toBe(smile.src);
    await userEvent.click(search());
    await userEvent.keyboard("{ArrowDown}");
    expect(focused()).toBe(cell("Smiling face"));
    await expect.poll(() => art(cell("Smiling face"))).toBe(smile.animatedSrc);
    await expect.poll(previewArt).toBe(smile.animatedSrc);
    await userEvent.keyboard("{ArrowRight}");
    await expect.poll(() => art(cell("Smiling face"))).toBe(smile.src);
    await expect.poll(() => art(cell("Waving hand"))).toBe(wave.animatedSrc);
    await expect.poll(previewArt).toBe(wave.animatedSrc);
    // Focus leaves the grid for the search: the preview stops.
    await userEvent.keyboard("{ArrowUp}");
    expect(focused()).toBe(search());
    await expect.poll(() => art(cell("Waving hand"))).toBe(wave.src);
    await expect.poll(previewArt).toBe(wave.src);
  });

  it("shows animated emoji still under reduced motion, under the mouse and in focus", async () => {
    await open();
    await userEvent.hover(cell("Party popper"));
    await expect.poll(previewArt).toBe(party.src);
    await expect.poll(() => art(cell("Party popper"))).toBe(party.src);
    await userEvent.click(search());
    await userEvent.keyboard("{ArrowDown}");
    await expect.poll(() => art(cell("Smiling face"))).toBe(smile.src);
    await expect.poll(previewArt).toBe(smile.src);
  });

  it("offers the catalogue's skin tones as images, as a radio group the arrow keys move through", async () => {
    let tone: EmojiSkinTone = "default";
    await open({ onSkinToneChange: (next: EmojiSkinTone) => (tone = next) });
    await userEvent.click(page.getByRole("button", { name: "Skin tone: Default" }));
    const radios = [...panel().querySelectorAll<HTMLButtonElement>('[role="radio"]')];
    expect(names(radios)).toEqual(["Default", "Light", "Medium-light", "Medium", "Medium-dark", "Dark"]);
    expect(radios.map(art)).toEqual([wave.src, ...[1, 2, 3, 4, 5].map((index) => image(`wave tone${index}`))]);
    // Kept still, so the choice is calm.
    await userEvent.hover(radios[2]!);
    expect(art(radios[2]!)).toBe(image("wave tone2"));
    await userEvent.keyboard("{ArrowRight}{ArrowRight}{Enter}");
    expect(tone).toBe("medium-light");
    expect(art(cell("Waving hand"))).toBe(image("wave tone2"));
    expect(art(cell("Smiling face"))).toBe(smile.src);
  });

  it("names an empty catalogue with the fix, and opens empty", async () => {
    await open({ catalogue: { categories: [] } } as Partial<EmojiPickerProps>);
    expect(warn.mock.calls.map((call: unknown[]) => String(call[0]))).toEqual([
      '[ouro-ui] EmojiPicker: catalogue has no categories; pass the emoji to offer. Fix: <EmojiPicker label="Add a reaction" catalogue={{ categories: [{ id: "smileys", label: "Smileys", items }] }} onSelect={react}>.',
    ]);
    expect(cells()).toEqual([]);
    expect(panel().querySelector('[data-ouro-part="skin-tone"]')).toBeNull();
  });

  it("draws the platform's emoji categories' icons and skin tones with renderEmoji, kept still", async () => {
    const renderEmoji = (item: EmojiPickerEmoji, skinTone: EmojiSkinTone, ...rest: unknown[]) => <img alt="" data-art={`${item.name}/${skinTone}/${rest.length ? String(rest[0]) : "-"}`} />;
    const emoji = (text: string, name: string, skinTones?: boolean) => ({ emoji: text, name, skinTones });
    await open({
      catalogue: undefined,
      categories: [
        { label: "Smileys", emoji: [emoji("😀", "grinning face")] },
        { label: "Food", emoji: [emoji("🍕", "pizza"), emoji("👍", "thumbs up", true)] },
      ],
      renderEmoji,
      skinTone: "medium",
    } as unknown as Partial<EmojiPickerProps>);
    const art = (element: Element) => element.querySelector("img")!.dataset.art;
    expect(categoryButtons().map(art)).toEqual(["grinning face/default/false", "pizza/default/false"]);
    expect(art(cell("pizza"))).toBe("pizza/medium/undefined");
    // The skin tone button and its choices show the first emoji with tones, in each tone, and no hand character.
    const toneButton = panel().querySelector<HTMLButtonElement>('[data-ouro-part="skin-tone"]')!;
    expect(art(toneButton)).toBe("thumbs up/medium/-");
    expect(toneButton.textContent).toBe("");
    await userEvent.click(toneButton);
    expect([...panel().querySelectorAll('[role="radio"]')].map(art)).toEqual(["default", "light", "medium-light", "medium", "medium-dark", "dark"].map((tone) => `thumbs up/${tone}/-`));
  });

  it("shows the skin tones on the quick row's first emoji with tones, else the frequently used ones', drawn by renderEmoji", async () => {
    const renderEmoji = (item: EmojiPickerEmoji, skinTone: EmojiSkinTone) => <img alt="" data-art={`${item.name}/${skinTone}`} />;
    const emoji = (text: string, name: string, skinTones?: boolean) => ({ emoji: text, name, skinTones });
    const categories = [{ label: "People", emoji: [emoji("👍", "thumbs up", true)] }];
    const toneArt = () => panel().querySelector('[data-ouro-part="skin-tone"] img')!.getAttribute("data-art");
    const { rerender } = await open({ catalogue: undefined, categories, renderEmoji, quick: [emoji("🙂", "smile"), emoji("👋", "waving hand", true)], frequent: [emoji("👏", "clapping hands", true)] } as unknown as Partial<EmojiPickerProps>);
    expect(toneArt()).toBe("waving hand/default");
    await rerender(picker({ catalogue: undefined, categories, renderEmoji, frequent: [emoji("👏", "clapping hands", true)] } as unknown as Partial<EmojiPickerProps>));
    expect(toneArt()).toBe("clapping hands/default");
  });
});
