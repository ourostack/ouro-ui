import { describe, expect, it } from "vitest";
import { findInMessages, locateMatch, messageText, rangesIn } from "@/registry/ouro/lib/ouro/find-messages";

const entries = [
  { key: "a", text: "Istanbul ıi İ" },
  { key: "b", text: "none here" },
  { key: "c", text: "ISTANBUL" },
];

describe("messageText", () => {
  it("reads strings, numbers, arrays, elements, fragments and a post's subject, and skips the rest", () => {
    expect(messageText(["a", 2, null, false, <b key="x">c{4}</b>])).toBe("a2c4");
    expect(messageText(<p>Hello</p>)).toBe("Hello");
    expect(messageText(<h2 {...({ subject: "Re: " } as object)}>plans</h2>)).toBe("Re: plans");
    expect(messageText(undefined)).toBe("");
  });
});

describe("findInMessages", () => {
  it("counts per message in order, with the fold and the locale the find names", () => {
    const plain = findInMessages(entries, { query: "istanbul" });
    expect(plain.total).toBe(2);
    expect(plain.order).toEqual([
      { key: "a", count: 1 },
      { key: "c", count: 1 },
    ]);
    expect(findInMessages(entries, { query: "istanbul", fold: "none" }).total).toBe(0);
    expect(findInMessages(entries, { query: "i", fold: "case", locale: "tr" }).counts.get("a")).toBe(2);
    expect(findInMessages(entries, { query: "" })).toEqual({ total: 0, counts: new Map(), order: [] });
  });
});

describe("locateMatch", () => {
  it("names the message and place of a match, wrapping the index round, and none for an empty result", () => {
    const result = findInMessages([{ key: "a", text: "fox fox" }, { key: "b", text: "fox" }], { query: "fox" });
    expect(locateMatch(result, 0)).toEqual({ key: "a", occurrence: 0 });
    expect(locateMatch(result, 2)).toEqual({ key: "b", occurrence: 0 });
    expect(locateMatch(result, -1)).toEqual({ key: "b", occurrence: 0 });
    expect(locateMatch(result, 4)).toEqual({ key: "a", occurrence: 1 });
    expect(locateMatch(findInMessages([], { query: "fox" }), 0)).toBeNull();
  });
});

describe("rangesIn", () => {
  it("makes a range for each match across text nodes, with the find's fold and locale", () => {
    const root = document.createElement("div");
    root.innerHTML = "Caf<b>é</b> CAFE <i>caf</i>é";
    expect(rangesIn(root, { query: "cafe" }).map((range) => range.toString())).toEqual(["Café", "CAFE", "café"]);
    expect(rangesIn(root, { query: "cafe", fold: "case" }).map((range) => range.toString())).toEqual(["CAFE"]);
    const turkish = document.createElement("div");
    turkish.textContent = "ıi İ";
    expect(rangesIn(turkish, { query: "i", fold: "case", locale: "tr" })).toHaveLength(2);
  });
});
