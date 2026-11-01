import { type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { commands, page, userEvent } from "vitest/browser";
import { Autocomplete, type AutocompleteTrigger } from "@/registry/ouro/components/ouro/autocomplete/autocomplete";
import { Composer } from "@/registry/ouro/components/ouro/composer/composer";
import { EmojiText, type EmojiCatalogue, type EmojiItem } from "@/registry/ouro/components/ouro/emoji/emoji";
import { TextArea } from "@/registry/ouro/components/ouro/text-field/text-area";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

// Autocomplete with an image emoji catalogue: suggestions drawn as its images, picks inserted as tokens.

const roots: Root[] = [];
let mounted: Element[] = [];

/** A blank image whose address names it, so a test can tell the images apart. */
const image = (name: string) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><title>${name}</title></svg>`)}`;

const party: EmojiItem = { id: "party", name: "Party popper", shortcodes: ["tada", "party"], keywords: ["celebrate"], src: image("party"), animatedSrc: image("party moving") };
const taco: EmojiItem = { id: "taco", name: "Taco", shortcodes: ["taco"], keywords: ["tasty"], src: image("taco") };
const tasks: EmojiItem = { id: "tasks", name: "Ta-da list", keywords: ["todo"], src: image("tasks") };
const tea: EmojiItem = { id: "tea", name: "Cup of tea", keywords: ["tasty"], src: image("tea") };
const fern: EmojiItem = { id: "fern", name: "Fernwood fern", shortcodes: ["fern"], custom: true, src: image("fern") };
/** Twelve more, to fill the list past its cap. */
const many: EmojiItem[] = Array.from({ length: 12 }, (_, index) => ({ id: `star${index}`, name: `Star ${index}`, shortcodes: [`star${index}`], src: image(`star ${index}`) }));
const catalogue: EmojiCatalogue = {
  categories: [
    { id: "food", label: "Food", items: [tea, party, taco, tasks] },
    { id: "stars", label: "Stars", items: many },
    { id: "custom", label: "Fernwood", items: [fern] },
  ],
};
const emojiTrigger: AutocompleteTrigger = { char: ":", label: "Emoji", minQueryLength: 2, catalogue };

async function render(node: ReactNode) {
  const host = document.createElement("div");
  host.style.padding = "24px";
  host.style.width = "520px";
  document.body.append(host);
  mounted.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
  return { host, control: host.querySelector<HTMLTextAreaElement>("textarea")! };
}

const options = () => [...document.querySelectorAll<HTMLElement>('[data-ouro="autocomplete"] [role="option"]')];
const labels = () => options().map((option) => option.querySelector(".truncate")!.textContent);
const art = (option: HTMLElement) => option.querySelector('[data-ouro="emoji"]')?.getAttribute("src");

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(async () => {
  await page.viewport(1280, 800);
  await commands.emulateMedia({ reducedMotion: "no-preference" });
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(async () => {
  vi.restoreAllMocks();
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  for (const node of mounted) node.remove();
  mounted = [];
});

describe("Autocomplete with a catalogue", () => {
  it("suggests emoji by shortcode, name and keyword, shortcodes first, drawn as images", async () => {
    const { control } = await render(
      <Autocomplete triggers={[emojiTrigger]}>
        <TextArea label="Message" />
      </Autocomplete>,
    );
    control.focus();
    await userEvent.keyboard("Hi :ta");
    await expect.poll(labels).toEqual(["Party popper", "Taco", "Cup of tea", "Ta-da list"]);
    expect(options().map((option) => option.querySelector(".ms-2")?.textContent)).toEqual([":tada:", ":taco:", ":tea:", ":tasks:"]);
    expect(options().map(art)).toEqual([party.animatedSrc, taco.src, tea.src, tasks.src]);
    // The custom emoji come up too, and no more than eight at once.
    await userEvent.keyboard("{Backspace}{Backspace}fe");
    await expect.poll(labels).toEqual(["Fernwood fern"]);
    await userEvent.keyboard("{Backspace}{Backspace}st");
    await expect.poll(() => labels().length).toBe(8);
    expect(warn).not.toHaveBeenCalled();
  });

  it("plays the active suggestion's emoji only, and none with reduced motion", async () => {
    const { control } = await render(
      <Autocomplete triggers={[emojiTrigger]}>
        <TextArea label="Message" />
      </Autocomplete>,
    );
    control.focus();
    await userEvent.keyboard(":party");
    await expect.poll(labels).toEqual(["Party popper"]);
    expect(art(options()[0]!)).toBe(party.animatedSrc);
    await userEvent.keyboard("{Backspace}{Backspace}{Backspace}{Backspace}{Backspace}ta");
    await expect.poll(labels).toEqual(["Party popper", "Taco", "Cup of tea", "Ta-da list"]);
    await userEvent.keyboard("{ArrowDown}");
    expect(art(options()[0]!)).toBe(party.src);
    await commands.emulateMedia({ reducedMotion: "reduce" });
    await userEvent.keyboard("{ArrowUp}");
    await expect.poll(() => art(options()[0]!)).toBe(party.src);
  });

  it("inserts the picked emoji's token and a space in a Composer, which EmojiText draws as its image", async () => {
    const onSend = vi.fn();
    const onPick = vi.fn();
    const { control } = await render(
      <Autocomplete triggers={[{ ...emojiTrigger, onPick }]}>
        <Composer label="Message" onSend={onSend} />
      </Autocomplete>,
    );
    control.focus();
    await userEvent.keyboard("Shipped :fer");
    await expect.poll(labels).toEqual(["Fernwood fern"]);
    await userEvent.keyboard("{Enter}");
    expect(control.value).toBe("Shipped :fern: ");
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ value: "fern", label: "Fernwood fern", emoji: fern }), "fer");
    expect(onSend).not.toHaveBeenCalled();
    await userEvent.keyboard("{Enter}");
    expect(onSend).toHaveBeenCalledWith("Shipped :fern: ", expect.anything());
    const { host } = await render(<EmojiText text={onSend.mock.calls[0]![0] as string} catalogue={catalogue} />);
    expect(host.querySelector("img")!.getAttribute("src")).toBe(fern.src);
    expect(host.querySelector("img")!.alt).toBe("Fernwood fern");
  });

  it("names a trigger with neither items nor catalogue, with the fix, and suggests nothing for it", async () => {
    const { control } = await render(
      <Autocomplete triggers={[{ char: "@", label: "People" }]}>
        <TextArea label="Message" />
      </Autocomplete>,
    );
    control.focus();
    await userEvent.keyboard("@a");
    await act(async () => {});
    expect(options()).toEqual([]);
    expect(warn.mock.calls.map((call: unknown[]) => String(call[0]))).toEqual([
      '[ouro-ui] Autocomplete: the "@" trigger has neither items nor catalogue, so it suggests nothing. Fix: { char: "@", label: "People", items }.',
    ]);
  });
});
