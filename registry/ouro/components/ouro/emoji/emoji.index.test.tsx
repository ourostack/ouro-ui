import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import type { EmojiCatalogue, EmojiCatalogueCategory, EmojiItem } from "@/registry/ouro/components/ouro/emoji/emoji";
import { catalogueIndex, splitEmojiText } from "@/registry/ouro/components/ouro/emoji/emoji-styles";

// Its own file, so the module's record of recent builds and the warning it logs once start empty. The
// warning's test comes last: once it has warned, the page hears it no more.

// The clock moves a second at each look, so builds are a second apart unless a test stops it.
let now = 0;
let step = 1000;
let warn: MockInstance<typeof console.warn>;
beforeEach(() => {
  // Each test starts well past the builds of the one before.
  now += 60_000;
  step = 1000;
  vi.spyOn(Date, "now").mockImplementation(() => (now += step));
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

/** Emoji that no other catalogue holds, `count` of them, each with its own text. */
let made = 0;
function freshEmoji(count = 3): EmojiItem[] {
  return Array.from({ length: count }, () => {
    made += 1;
    return { id: `emoji-${made}`, name: `Emoji ${made}`, shortcodes: [`e${made}`], text: String.fromCodePoint(0x1f600 + (made % 64)), src: `/emoji/${made}.png` };
  });
}

/** A catalogue as an app's helper makes it for each text run: a new object around the emoji it is given. */
const wrap = (categories: readonly EmojiCatalogueCategory[], id?: string): EmojiCatalogue => (id === undefined ? { categories } : { id, categories });

/** A copy of the categories with new category objects and new item arrays, around the same emoji objects. */
const copyCategories = (categories: readonly EmojiCatalogueCategory[]) => categories.map((category) => ({ ...category, items: [...category.items] }));

/** Builds of the index: each distinct index object is one. */
const buildsOf = (catalogues: readonly EmojiCatalogue[]) => new Set(catalogues.map(catalogueIndex)).size;

const ready = "the index of the same emoji was built more than 3 times within a second";
const warnings = () => warn.mock.calls.filter(([message]) => String(message).includes(ready));

describe("catalogueIndex", () => {
  it("compiles nothing again for a catalogue whose emoji differ only in their pictures' addresses, and finds the new pictures", () => {
    const emoji = [...freshEmoji(), { ...freshEmoji(1)[0]!, skinTones: [{ id: `toned-${made}`, src: "/tone/1.png", text: "👋🏻" }] }];
    const before = catalogueIndex(wrap([{ id: "all", label: "All", items: emoji }]));
    // A CDN's addresses, signed afresh: new emoji objects, the same ids, text and shortcodes.
    const moved = emoji.map((item) => ({ ...item, src: `${item.src}?signature=2` }));
    const after = catalogueIndex(wrap([{ id: "all", label: "All", items: moved }]));
    expect(after).not.toBe(before);
    expect(after.pattern).toBe(before.pattern);
    expect(after.textPattern).toBe(before.textPattern);
    expect(after.textStarts).toBe(before.textStarts);
    expect(after.byId.get(moved[0]!.id)).toEqual({ item: moved[0], tone: "default" });
    expect(after.byText.get("👋🏻")).toEqual({ item: moved.at(-1), tone: "light" });
    expect(after.byToken.get(moved[1]!.shortcodes![0]!)!.item).toBe(moved[1]);
    // A change to what the emoji say compiles their patterns afresh.
    const renamed = catalogueIndex(wrap([{ id: "all", label: "All", items: moved.map((item, at) => (at === 0 ? { ...item, text: "🦊" } : item)) }]));
    expect(renamed.pattern).not.toBe(before.pattern);
    expect(renamed.byText.get("🦊")!.item.id).toBe(moved[0]!.id);
  });

  it("shares one index between fresh catalogue objects holding the same emoji", () => {
    const smileys = freshEmoji();
    const people = freshEmoji();
    const categories = [
      { id: "smileys", label: "Smileys", items: smileys },
      { id: "people", label: "People", items: people },
    ];
    // A new object around the same categories, and around new arrays of the same emoji.
    const fresh = [wrap(categories), ...Array.from({ length: 50 }, () => wrap(categories)), wrap(copyCategories(categories)), wrap(copyCategories(categories))];
    expect(buildsOf(fresh)).toBe(1);
    const index = catalogueIndex(fresh[0]!);
    expect(index.items).toEqual([...smileys, ...people]);
    // What a shared index finds is the emoji the catalogue holds.
    expect(splitEmojiText(`hi :${smileys[0]!.shortcodes![0]}:`, wrap(copyCategories(categories)))).toEqual(["hi ", { item: smileys[0], tone: "default", source: `:${smileys[0]!.shortcodes![0]}:` }]);
    expect(warnings()).toEqual([]);
  });

  it("builds a new index for a catalogue whose emoji changed", () => {
    const items = freshEmoji();
    const before = wrap([{ id: "all", label: "All", items }]);
    const added = wrap([{ id: "all", label: "All", items: [...items, ...freshEmoji(1)] }]);
    const reordered = wrap([{ id: "all", label: "All", items: [...items].reverse() }]);
    const renewed = wrap([{ id: "all", label: "All", items: items.map((item) => ({ ...item, src: `${item.src}?v=2` })) }]);
    expect(buildsOf([before, added, reordered, renewed])).toBe(4);
    for (const changed of [before, added, reordered, renewed]) expect(catalogueIndex(changed).items).toEqual(changed.categories[0]!.items);
  });

  it("shares one index between catalogues with the same id, and keeps the most recent ids", () => {
    const first = catalogueIndex(wrap([{ id: "all", label: "All", items: freshEmoji() }], "contoso-1"));
    // Every copy has new emoji objects, so only the id can say they are the same.
    expect(catalogueIndex(wrap([{ id: "all", label: "All", items: freshEmoji() }], "contoso-1"))).toBe(first);
    const second = catalogueIndex(wrap([{ id: "all", label: "All", items: freshEmoji() }], "contoso-2"));
    expect(second).not.toBe(first);
    // Sixteen ids are kept: a seventeenth lets the oldest go, and keeps the next.
    for (let id = 3; id <= 17; id += 1) catalogueIndex(wrap([{ id: "all", label: "All", items: freshEmoji(1) }], `contoso-${id}`));
    expect(catalogueIndex(wrap([{ id: "all", label: "All", items: freshEmoji() }], "contoso-2"))).toBe(second);
    expect(catalogueIndex(wrap([{ id: "all", label: "All", items: freshEmoji() }], "contoso-1"))).not.toBe(first);
  });

  it("finds a fresh catalogue's index reading each emoji once, and the same object's without reading anything", () => {
    let reads = 0;
    const counted = (items: EmojiItem[]) =>
      new Proxy(items, {
        get(target, key, receiver) {
          if (typeof key === "string" && /^\d+$/.test(key)) reads += 1;
          return Reflect.get(target, key, receiver) as unknown;
        },
      });
    const categories = [
      { id: "smileys", label: "Smileys", items: counted(freshEmoji(40)) },
      { id: "people", label: "People", items: counted(freshEmoji(40)) },
    ];
    let looks = 0;
    const once: EmojiCatalogue = {
      get categories() {
        looks += 1;
        return categories;
      },
    };
    const index = catalogueIndex(once);
    reads = 0;
    looks = 0;
    // The same object: no look at its categories at all.
    expect(catalogueIndex(once)).toBe(index);
    expect(looks).toBe(0);
    // A new object around the same item arrays: a lookup per emoji, each read once, and no build, which would read them again.
    expect(catalogueIndex(wrap(categories))).toBe(index);
    expect(reads).toBe(80);
    reads = 0;
    expect(catalogueIndex(wrap(categories.map((category) => ({ ...category }))))).toBe(index);
    expect(reads).toBe(80);
  });

  it("finds an emoji the app pushed into the same array, in a fresh catalogue", () => {
    const custom = freshEmoji();
    const categories = [{ id: "custom", label: "Contoso", items: custom }];
    const before = catalogueIndex(wrap(categories));
    // An array the app changes in place, as a reactive store's array keeps its identity.
    const [added] = freshEmoji(1);
    custom.push(added!);
    const after = wrap(categories);
    expect(catalogueIndex(after)).not.toBe(before);
    expect(catalogueIndex(after).byId.get(added!.id)).toEqual({ item: added, tone: "default" });
    expect(splitEmojiText(`hi :${added!.shortcodes![0]}:`, after)).toEqual(["hi ", { item: added, tone: "default", source: `:${added!.shortcodes![0]}:` }]);
    // Taken out again, the emoji is gone from the next catalogue's index.
    custom.pop();
    expect(catalogueIndex(wrap(categories))).toBe(before);
    expect(catalogueIndex(wrap(categories)).byId.has(added!.id)).toBe(false);
  });

  it("keeps the ids used most recently, letting go of the one used longest ago", () => {
    const copy = (id: string) => wrap([{ id: "all", label: "All", items: freshEmoji(1) }], id);
    const first = catalogueIndex(copy("busy"));
    const second = catalogueIndex(copy("quiet"));
    for (let id = 3; id <= 16; id += 1) catalogueIndex(copy(`other-${id}`));
    // Sixteen ids now. Using the first again keeps it, so the seventeenth lets the second go instead.
    expect(catalogueIndex(copy("busy"))).toBe(first);
    catalogueIndex(copy("other-17"));
    expect(catalogueIndex(copy("busy"))).toBe(first);
    expect(catalogueIndex(copy("quiet"))).not.toBe(second);
  });

  it("stays quiet for many different catalogues, and for equivalent fresh ones however often an app makes them", () => {
    step = 0;
    // A page of examples, each with its own emoji, the same number of them.
    for (let count = 0; count < 20; count += 1) catalogueIndex(wrap([{ id: "all", label: "All", items: freshEmoji() }]));
    const categories = [{ id: "all", label: "All", items: freshEmoji(10) }];
    for (let count = 0; count < 1000; count += 1) splitEmojiText("plain words", wrap(copyCategories(categories)));
    expect(warnings()).toEqual([]);
  });

  it("warns once in development when the same emoji are indexed more than three times within a second", () => {
    step = 0;
    const items = freshEmoji();
    // Each copy holds new objects for the same emoji, as a helper that rebuilds them for each message does.
    const build = () => catalogueIndex(wrap([{ id: "all", label: "All", items: items.map((item) => ({ ...item })) }]));
    // Three in a second is still quiet, and so is a fourth once the first three are a second old.
    for (let count = 0; count < 3; count += 1) build();
    now += 1000;
    build();
    expect(warnings()).toEqual([]);
    // Four within the second warn, once however many follow.
    for (let count = 0; count < 3; count += 1) build();
    expect(warnings()).toHaveLength(1);
    for (let count = 0; count < 20; count += 1) build();
    expect(warnings()).toHaveLength(1);
    expect(String(warnings()[0]![0])).toMatch(/^\[ouro-ui\] EmojiCatalogue: .*new emoji objects.*Fix: build the catalogue once and pass that object every time .* or give every copy the same id/);
  });
});
