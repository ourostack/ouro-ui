import { describe, expect, it } from "vitest";
import registry from "../registry.json";
import { itemFor } from "@/registry/ouro/components/ouro/inspector/inspector-styles";

// X-ray (Inspector) tags each component root with the registry item its `data-ouro` name belongs
// to, and links the tag to that item's docs. A root whose name is no item, and is not an overlay's
// wrapper, would link to a docs page that does not exist: this reads every root name the
// components' source writes and holds each to an item.

const sources = import.meta.glob<string>(["../registry/ouro/components/ouro/**/*.tsx", "!../registry/ouro/components/ouro/**/*.{test,stories}.tsx"], { query: "?raw", import: "default", eager: true });

describe("X-ray's item names", () => {
  it("name a registry item for every component root, and skip only an overlay's wrappers", () => {
    const items = new Set(registry.items.map((item) => item.name));
    const names = new Set(Object.values(sources).flatMap((source) => [...source.matchAll(/data-ouro="([a-z-]+)"/g)].map((match) => match[1]!)));
    expect(names.size).toBeGreaterThan(50);
    const unknown = [...names].filter((name) => {
      const item = itemFor(name);
      return item !== null && !items.has(item);
    });
    expect(unknown, "map these roots to their item in inspector-styles.ts").toEqual([]);
    expect([...names].filter((name) => itemFor(name) === null).every((name) => /-(portal|positioner|backdrop|viewport)$/.test(name))).toBe(true);
    expect(itemFor("radio")).toBe("radio-group");
    expect(itemFor("sheet-portal")).toBeNull();
  });
});
