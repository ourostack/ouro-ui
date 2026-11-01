import { type ReactNode } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { commands, userEvent } from "vitest/browser";
import { Emoji, EmojiText, type EmojiCatalogue, type EmojiItem, type EmojiProps, type EmojiTextProps } from "@/registry/ouro/components/ouro/emoji/emoji";
import { catalogueIndex, emojiToken, matchWords, searchCatalogue, splitEmojiText } from "@/registry/ouro/components/ouro/emoji/emoji-styles";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

// Runs in Chromium and WebKit.

const roots: Root[] = [];
let mounted: Element[] = [];

/** A blank image whose address names it, so a test can tell the images apart. */
const image = (name: string) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><title>${name}</title></svg>`)}`;

const tones = ["tone1", "tone2", "tone3", "tone4", "tone5"].map((tone, index) => ({
  id: `wave-${tone}`,
  src: image(`wave ${tone}`),
  animatedSrc: image(`wave ${tone} moving`),
  text: `👋${String.fromCodePoint(0x1f3fb + index)}`,
}));
const wave: EmojiItem = { id: "wave", name: "Waving hand", shortcodes: ["wave"], text: "👋", src: image("wave"), animatedSrc: image("wave moving"), skinTones: tones };
const party: EmojiItem = { id: "party", name: "Party popper", shortcodes: ["party", "tada"], text: "🎉", src: image("party"), srcSet: `${image("party 2x")} 2x`, animatedSrc: image("party moving") };
const heart: EmojiItem = { id: "heart", name: "Red heart", text: "❤️", src: image("heart") };
const fern: EmojiItem = { id: "fern", name: "Fernwood fern", shortcodes: ["Fern"], custom: true, src: image("fern") };
/** An id that looks like another emoji's shortcode: the shortcode wins. */
const tada: EmojiItem = { id: "tada", name: "Tada banner", src: image("tada") };
const catalogue: EmojiCatalogue = {
  categories: [
    { id: "people", label: "People", items: [wave, heart] },
    { id: "symbols", label: "Symbols", items: [party, tada, heart] },
    { id: "custom", label: "Fernwood", items: [fern] },
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

const emoji = (host: Element) => host.querySelector<HTMLImageElement>('[data-ouro="emoji"]')!;
const images = (host: Element) => [...host.querySelectorAll<HTMLImageElement>('[data-ouro="emoji"]')];
const messages = () => warn.mock.calls.map((call: unknown[]) => String(call[0]));

let warn: ReturnType<typeof vi.spyOn>;
// Motion is let through for the file; the reduced motion tests turn it on and back off.
beforeAll(async () => {
  await commands.emulateMedia({ reducedMotion: "no-preference" });
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
  // The mouse rests far from where the next test draws, so no emoji there plays for it.
  const corner = document.createElement("div");
  corner.style.cssText = "position:fixed;right:0;bottom:0;width:4px;height:4px";
  document.body.append(corner);
  await userEvent.hover(corner);
  corner.remove();
});

describe("Emoji", () => {
  it("draws the still image named by the emoji's name, the size of the text, in the tone asked for", async () => {
    const { host, rerender } = await render(
      <p style={{ fontSize: 20 }}>
        <Emoji item={party} />
      </p>,
    );
    const img = emoji(host);
    expect(img.tagName).toBe("IMG");
    expect(img.getAttribute("src")).toBe(party.src);
    expect(img.getAttribute("srcset")).toBe(party.srcSet);
    expect(img.alt).toBe("Party popper");
    expect(img.getBoundingClientRect().width).toBe(25);
    expect(img.getBoundingClientRect().height).toBe(25);
    expect(img.draggable).toBe(false);
    expect(img.getAttribute("loading")).toBe("lazy");
    expect(img.getAttribute("decoding")).toBe("async");
    await rerender(<Emoji item={wave} skinTone="medium" />);
    expect(emoji(host).getAttribute("src")).toBe(image("wave tone3"));
    expect(emoji(host).hasAttribute("srcset")).toBe(false);
    expect(emoji(host).alt).toBe("Waving hand");
    await rerender(<Emoji item={party} skinTone="dark" alt="" />);
    expect(emoji(host).getAttribute("src")).toBe(party.src);
    expect(emoji(host).alt).toBe("");
    expect(messages()).toEqual([]);
  });

  it("plays while the mouse is on its button or the button has focus, and stops after", async () => {
    const { host } = await render(
      <>
        <button type="button">
          <span aria-hidden="true">
            <Emoji item={party} />
          </span>
        </button>
        <button type="button">Elsewhere</button>
      </>,
    );
    const [button, elsewhere] = [...host.querySelectorAll("button")];
    expect(emoji(host).getAttribute("src")).toBe(party.src);
    await userEvent.hover(button!);
    await expect.poll(() => emoji(host).getAttribute("src")).toBe(party.animatedSrc);
    expect(emoji(host).hasAttribute("srcset")).toBe(false);
    await userEvent.hover(elsewhere!);
    await expect.poll(() => emoji(host).getAttribute("src")).toBe(party.src);
    expect(emoji(host).getAttribute("srcset")).toBe(party.srcSet);
    await act(async () => button!.focus());
    expect(emoji(host).getAttribute("src")).toBe(party.animatedSrc);
    await act(async () => elsewhere!.focus());
    expect(emoji(host).getAttribute("src")).toBe(party.src);
  });

  it("keeps playing while focus moves within its host, stops when focus or the mouse leaves, and plays for no touch", async () => {
    const { host, rerender } = await render(
      <div role="option" aria-selected="false" tabIndex={0}>
        <Emoji item={party} />
        <input aria-label="Note" />
      </div>,
    );
    const option = host.querySelector<HTMLElement>('[role="option"]')!;
    await act(async () => option.focus());
    expect(emoji(host).getAttribute("src")).toBe(party.animatedSrc);
    await act(async () => host.querySelector("input")!.focus());
    expect(emoji(host).getAttribute("src")).toBe(party.animatedSrc);
    await act(async () => host.querySelector("input")!.blur());
    expect(emoji(host).getAttribute("src")).toBe(party.src);
    await act(async () => void option.dispatchEvent(new PointerEvent("pointerenter", { pointerType: "touch" })));
    expect(emoji(host).getAttribute("src")).toBe(party.src);
    await act(async () => void option.dispatchEvent(new PointerEvent("pointerenter", { pointerType: "mouse" })));
    expect(emoji(host).getAttribute("src")).toBe(party.animatedSrc);
    await act(async () => void option.dispatchEvent(new PointerEvent("pointerleave", { pointerType: "mouse" })));
    expect(emoji(host).getAttribute("src")).toBe(party.src);
    // Focus that leaves while play is set goes unseen: without play again, the emoji is still.
    await act(async () => option.focus());
    await rerender(
      <div role="option" aria-selected="false" tabIndex={0}>
        <Emoji item={party} play={false} />
        <input aria-label="Note" />
      </div>,
    );
    await act(async () => option.blur());
    await rerender(
      <div role="option" aria-selected="false" tabIndex={0}>
        <Emoji item={party} />
        <input aria-label="Note" />
      </div>,
    );
    expect(emoji(host).getAttribute("src")).toBe(party.src);
  });

  it("plays and stops with play, plays for the image itself outside a button, and never without an animated image", async () => {
    const { host, rerender } = await render(<Emoji item={party} play />);
    expect(emoji(host).getAttribute("src")).toBe(party.animatedSrc);
    await rerender(<Emoji item={party} play={false} />);
    await userEvent.hover(emoji(host));
    expect(emoji(host).getAttribute("src")).toBe(party.src);
    await rerender(<Emoji item={party} />);
    await act(async () => void emoji(host).dispatchEvent(new PointerEvent("pointerenter", { pointerType: "mouse" })));
    expect(emoji(host).getAttribute("src")).toBe(party.animatedSrc);
    // The pointer leaves while play is set, unseen: without play again, the emoji is still.
    await rerender(<Emoji item={party} play={false} />);
    await act(async () => void emoji(host).dispatchEvent(new PointerEvent("pointerleave", { pointerType: "mouse" })));
    await rerender(<Emoji item={party} />);
    expect(emoji(host).getAttribute("src")).toBe(party.src);
    await rerender(<Emoji item={wave} skinTone="light" play />);
    expect(emoji(host).getAttribute("src")).toBe(image("wave tone1 moving"));
    await rerender(<Emoji item={heart} play />);
    expect(emoji(host).getAttribute("src")).toBe(heart.src);
  });

  it("shows the still image with reduced motion, whatever play says or the pointer does", async () => {
    await commands.emulateMedia({ reducedMotion: "reduce" });
    try {
      const { host } = await render(
        <>
          <Emoji item={party} play />
          <button type="button">
            <Emoji item={wave} />
          </button>
        </>,
      );
      const [played, inButton] = images(host);
      expect(played!.getAttribute("src")).toBe(party.src);
      expect(played!.getAttribute("srcset")).toBe(party.srcSet);
      await userEvent.hover(host.querySelector("button")!);
      await act(async () => host.querySelector("button")!.focus());
      expect(inButton!.getAttribute("src")).toBe(wave.src);
    } finally {
      await commands.emulateMedia({ reducedMotion: "no-preference" });
    }
  });

  it("renders the still image on the server and hydrates to it without a mismatch", async () => {
    const node = <Emoji item={party} play />;
    const html = renderToString(node);
    expect(html).toContain(`src="${party.src.replaceAll("&", "&amp;")}"`);
    const host = document.createElement("div");
    host.innerHTML = html;
    document.body.append(host);
    mounted.push(host);
    const recoverable = vi.fn();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await act(async () => {
      roots.push(hydrateRoot(host, node, { onRecoverableError: recoverable }));
    });
    expect(recoverable).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    expect(emoji(host).getAttribute("src")).toBe(party.animatedSrc);
  });

  it("passes the img attributes and ref through, and lets app layout classes win", async () => {
    const ref = { current: null as HTMLImageElement | null };
    const { host } = await render(<Emoji item={fern} ref={ref} title="Fernwood fern" className="size-8 ms-1" data-testid="fern" />);
    expect(ref.current).toBe(emoji(host));
    expect(emoji(host).title).toBe("Fernwood fern");
    expect(emoji(host).dataset.testid).toBe("fern");
    expect(emoji(host).getBoundingClientRect().width).toBe(32);
    expect(messages()).toEqual([]);
  });

  it("names a missing image, an unknown skin tone, an appearance class and other libraries' props, each with the fix", async () => {
    const props = { item: { id: "blank", name: "Blank" }, skinTone: "tan", className: "rounded-full", src: "/x.png", emoji: "🎉", animate: true } as unknown as EmojiProps;
    const { host } = await render(<Emoji {...props} />);
    expect(messages()).toEqual([
      '[ouro-ui] Emoji: "rounded-full" sets appearance, and className is for layout only. Fix: remove "rounded-full"; an emoji is its image.',
      '[ouro-ui] Emoji: item has no src, so there is no image to draw. Fix: <Emoji item={{ id: "party", name: "Party popper", src: "/emoji/party.png" }} />.',
      '[ouro-ui] Emoji: skinTone="tan" is not a skin tone; use "default", "light", "medium-light", "medium", "medium-dark", "dark". Fix: <Emoji item={item} skinTone="medium" />.',
      "[ouro-ui] Emoji: src is not a prop; the image comes from item. Fix: <Emoji item={{ id, name, src }} />.",
      "[ouro-ui] Emoji: emoji is not a prop; Emoji draws a catalogue's item. Fix: <Emoji item={catalogueItem} />.",
      "[ouro-ui] Emoji: animate is not a prop. Fix: <Emoji item={item} play />.",
    ]);
    expect(emoji(host).hasAttribute("src")).toBe(false);
    expect(emoji(host).hasAttribute("emoji")).toBe(false);
    expect(emoji(host).hasAttribute("animate")).toBe(false);
  });
});

describe("EmojiText", () => {
  const parts = (host: Element) =>
    [...host.querySelector('[data-ouro="emoji-text"]')!.childNodes].map((node) => (node instanceof HTMLImageElement ? `[${node.alt}|${node.getAttribute("src")}]` : node.textContent));
  const drawn = (item: { src: string }, name: string) => `[${name}|${item.src}]`;

  it("draws shortcode, id and tone id tokens as their images, and leaves unknown ones as text", async () => {
    const { host } = await render(<EmojiText text=":party: at 10:30:fern: :TADA: :Heart: :wave-tone3: :nope: tada :party:heart: :" catalogue={catalogue} />);
    expect(parts(host)).toEqual([
      drawn(party, "Party popper"),
      " at 10:30",
      drawn(fern, "Fernwood fern"),
      " ",
      drawn(party, "Party popper"),
      " ",
      drawn(heart, "Red heart"),
      " ",
      drawn(tones[2]!, "Waving hand"),
      " :nope: tada ",
      drawn(party, "Party popper"),
      "heart: :",
    ]);
  });

  it("draws the emoji text the catalogue lists as its images, longest first, with or without a variation selector", async () => {
    const { host } = await render(<EmojiText text={"👋🏽👋 hi ❤ and ❤️"} catalogue={catalogue} />);
    expect(parts(host)).toEqual([drawn(tones[2]!, "Waving hand"), drawn(wave, "Waving hand"), " hi ", drawn(heart, "Red heart"), " and ", drawn(heart, "Red heart")]);
  });

  it("enlarges up to three emoji alone, and nothing with other text, more emoji or without enlarge", async () => {
    const { host, rerender } = await render(
      <p style={{ fontSize: 16 }}>
        <EmojiText text=" :party: :heart: 🎉 " catalogue={catalogue} enlarge />
      </p>,
    );
    const root = () => host.querySelector('[data-ouro="emoji-text"]')!;
    const widths = () => images(host).map((img) => img.getBoundingClientRect().width);
    expect(root().hasAttribute("data-enlarged")).toBe(true);
    expect(widths()).toEqual([44, 44, 44]);
    await rerender(<EmojiText text=":party: :heart: :party: :heart:" catalogue={catalogue} enlarge />);
    expect(root().hasAttribute("data-enlarged")).toBe(false);
    await rerender(<EmojiText text="ok :party:" catalogue={catalogue} enlarge />);
    expect(root().hasAttribute("data-enlarged")).toBe(false);
    await rerender(<EmojiText text="   " catalogue={catalogue} enlarge />);
    expect(root().hasAttribute("data-enlarged")).toBe(false);
    await rerender(
      <p style={{ fontSize: 16 }}>
        <EmojiText text=":party:" catalogue={catalogue} />
      </p>,
    );
    expect(root().hasAttribute("data-enlarged")).toBe(false);
    expect(widths()).toEqual([20]);
  });

  it("counts an emoji in two categories once, and keeps the span's attributes and layout classes", async () => {
    const { host } = await render(<EmojiText text="plain" catalogue={catalogue} id="body" className="mt-1" />);
    const root = host.querySelector<HTMLElement>('[data-ouro="emoji-text"]')!;
    expect(root.id).toBe("body");
    expect(root.className).toBe("mt-1");
    expect(root.textContent).toBe("plain");
    expect(messages()).toEqual([]);
  });

  it("names a missing catalogue, children and an appearance class with the fix, and shows the text as it is", async () => {
    const props = { text: "hi :party:", children: "hi", className: "text-red-500" } as unknown as EmojiTextProps;
    const { host } = await render(<EmojiText {...props} />);
    expect(messages()).toEqual([
      '[ouro-ui] EmojiText: "text-red-500" sets appearance, and className is for layout only. Fix: remove "text-red-500"; EmojiText takes the look of the text around it.',
      "[ouro-ui] EmojiText: catalogue is missing, so no emoji can be drawn. Fix: <EmojiText text={message.body} catalogue={catalogue} />.",
      "[ouro-ui] EmojiText: children is not a prop; the text goes in text. Fix: <EmojiText text={message.body} catalogue={catalogue} />.",
    ]);
    expect(host.textContent).toBe("hi :party:");
  });

  it("draws nothing for text given as children, with the fix", async () => {
    const props = { catalogue, children: "Shipped :party:" } as unknown as EmojiTextProps;
    const { host } = await render(<EmojiText {...props} />);
    expect(messages()).toEqual(["[ouro-ui] EmojiText: children is not a prop; the text goes in text. Fix: <EmojiText text={message.body} catalogue={catalogue} />."]);
    expect(host.querySelector('[data-ouro="emoji-text"]')!.textContent).toBe("");
  });
});

describe("Emoji helpers", () => {
  const keycap: EmojiItem = { id: "keycap-star", name: "Keycap asterisk", text: "*️⃣", src: image("keycap") };
  const withKeycap: EmojiCatalogue = { categories: [...catalogue.categories, { id: "keys", label: "Keys", items: [keycap] }] };

  it("indexes a catalogue once, each emoji once, by id, tone id, token and text", () => {
    const index = catalogueIndex(catalogue);
    expect(catalogueIndex(catalogue)).toBe(index);
    expect(index.items.map((item) => item.id)).toEqual(["wave", "heart", "party", "tada", "fern"]);
    expect(index.byId.get("wave-tone5")).toEqual({ item: wave, tone: "dark" });
    expect(index.byToken.get("tada")).toEqual({ item: party, tone: "default" });
    expect(index.byToken.get("fern")).toEqual({ item: fern, tone: "default" });
    expect(index.byText.get("❤")).toEqual({ item: heart, tone: "default" });
    expect(index.byText.has("")).toBe(false);
  });

  it("finds emoji text with characters a pattern would read as its own", () => {
    expect(splitEmojiText("press *️⃣ or *", withKeycap)).toEqual(["press ", { item: keycap, tone: "default" }, " or *"]);
  });

  it("makes an emoji's token from its first shortcode, else its id, and a tone's id", () => {
    expect(emojiToken(party, "default")).toBe(":party:");
    expect(emojiToken(heart, "default")).toBe(":heart:");
    expect(emojiToken(wave, "medium-dark")).toBe(":wave-tone4:");
    expect(emojiToken(party, "dark")).toBe(":party:");
  });

  it("matches every typed word to the start of a word, a part of one, or a whole one, ignoring case, accents and colons", () => {
    const words = ["Party popper", "party_popper", "café-au-lait", "a:b"];
    expect(matchWords(words, "pop")).toBe(true);
    expect(matchWords(words, "PARTY POP")).toBe(true);
    expect(matchWords(words, "party_po")).toBe(true);
    expect(matchWords(words, ":party_popper:")).toBe(true);
    expect(matchWords(words, "cafe lait")).toBe(true);
    expect(matchWords(words, "b")).toBe(true);
    expect(matchWords(words, "arty")).toBe(false);
    expect(matchWords(words, "party cake")).toBe(false);
  });

  it("searches a catalogue by shortcode first, then name and keywords, up to the limit", () => {
    const searchable: EmojiCatalogue = {
      categories: [
        {
          id: "all",
          label: "All",
          items: [
            { id: "taco", name: "Taco", keywords: ["tasty"], src: image("taco") },
            { id: "tea", name: "Cup of tea", shortcodes: ["tea"], src: image("tea") },
            { id: "tada", name: "Party popper", shortcodes: ["tada"], src: image("tada") },
            { id: "cat", name: "Cat face", src: image("cat") },
          ],
        },
      ],
    };
    const ids = (query: string, limit = 8) => searchCatalogue(searchable, query, limit).map((item) => item.id);
    expect(ids("ta")).toEqual(["tada", "taco"]);
    expect(ids("t")).toEqual(["tea", "tada", "taco"]);
    expect(ids("t", 2)).toEqual(["tea", "tada"]);
    expect(ids("CUP")).toEqual(["tea"]);
    expect(ids("tasty")).toEqual(["taco"]);
    expect(ids("dog")).toEqual([]);
  });
});
