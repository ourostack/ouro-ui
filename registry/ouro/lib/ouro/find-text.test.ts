import { describe, expect, it } from "vitest";
import { findMatches, type FindFold } from "@/registry/ouro/lib/ouro/find-text";

const slices = (text: string, query: string, fold?: FindFold, locale?: string) =>
  findMatches(text, query, { ...(fold ? { fold } : {}), ...(locale ? { locale } : {}) }).map(({ start, end }) => text.slice(start, end));

describe("findMatches", () => {
  it("matches nothing for an empty query or empty text", () => {
    expect(findMatches("abc", "")).toEqual([]);
    expect(findMatches("", "a")).toEqual([]);
    expect(findMatches("abc", "\u0301")).toEqual([]);
  });

  it("returns ranges of the original text, in order", () => {
    expect(findMatches("Résumé und RESUME", "resume")).toEqual([
      { start: 0, end: 6 },
      { start: 11, end: 17 },
    ]);
    expect(findMatches("one two one", "one")).toEqual([
      { start: 0, end: 3 },
      { start: 8, end: 11 },
    ]);
  });

  it("never overlaps matches and finds every one", () => {
    expect(findMatches("aaaa", "aa")).toEqual([
      { start: 0, end: 2 },
      { start: 2, end: 4 },
    ]);
    expect(findMatches("aaa", "aa")).toEqual([{ start: 0, end: 2 }]);
    expect(findMatches("ababab", "aba")).toEqual([{ start: 0, end: 3 }]);
    for (const text of ["aaaaaaa", "abababab", "ßßß ss", "Aa aA"]) {
      const found = findMatches(text, "a");
      for (let i = 1; i < found.length; i++) expect(found[i]!.start).toBeGreaterThanOrEqual(found[i - 1]!.end);
    }
  });

  it("honours each fold", () => {
    expect(slices("Café cafe CAFÉ", "cafe", "none")).toEqual(["cafe"]);
    expect(slices("Café cafe CAFÉ", "cafe", "case")).toEqual(["cafe"]);
    expect(slices("Café cafe CAFÉ", "café", "case")).toEqual(["Café", "CAFÉ"]);
    expect(slices("Café cafe CAFÉ", "cafe", "accents")).toEqual(["cafe"]);
    expect(slices("Café cafe CAFÉ", "Cafe", "accents")).toEqual(["Café"]);
    expect(slices("Café cafe CAFÉ", "cafe", "all")).toEqual(["Café", "cafe", "CAFÉ"]);
    expect(slices("Café cafe CAFÉ", "cafe")).toEqual(["Café", "cafe", "CAFÉ"]);
  });

  it("treats composed and decomposed letters as the same letter, even with no fold", () => {
    const decomposed = "re\u0301sume\u0301";
    expect(slices(decomposed, "résumé", "none")).toEqual([decomposed]);
    expect(slices("résumé", decomposed, "none")).toEqual(["résumé"]);
  });

  it("never splits a letter from its combining marks", () => {
    const text = "e\u0301 e\u0301\u0323 e";
    expect(slices(text, "e", "none")).toEqual(["e"]);
    expect(findMatches(text, "e", { fold: "none" })).toEqual([{ start: 7, end: 8 }]);
    expect(slices(text, "e", "all")).toEqual(["e\u0301", "e\u0301\u0323", "e"]);
    for (const fold of ["none", "case", "accents", "all"] as const) {
      for (const query of ["e", "\u0301", "e\u0301", "x"]) {
        for (const { start, end } of findMatches(text, query, { fold })) {
          expect(/\p{M}/u.test(text[start]!)).toBe(false);
          expect(end === text.length || !/\p{M}/u.test(text[end]!)).toBe(true);
        }
      }
    }
  });

  it("finds a letter with several stacked marks by its base, and by any of its marks' removal", () => {
    expect(slices("ệ", "e", "accents")).toEqual(["ệ"]);
    expect(slices("ệ", "ê", "accents")).toEqual(["ệ"]);
    expect(slices("ệ", "ẹ", "accents")).toEqual(["ệ"]);
  });

  it("folds ß and ss, whole letters only", () => {
    expect(slices("Straße STRASSE strasse", "strasse", "case")).toEqual(["Straße", "STRASSE", "strasse"]);
    expect(slices("Straße", "straße", "case")).toEqual(["Straße"]);
    expect(slices("ß", "s", "case")).toEqual([]);
    expect(slices("ß", "ss", "case")).toEqual(["ß"]);
    expect(slices("ßs", "ss", "case")).toEqual(["ß"]);
    expect(slices("sß", "ss", "case")).toEqual(["ß"]);
    expect(slices("ẞ", "ß", "case")).toEqual(["ẞ"]);
    expect(slices("Straße", "strasse", "none")).toEqual([]);
    expect(slices("Straße", "strasse", "accents")).toEqual([]);
    expect(findMatches("Straße", "SS")).toEqual([{ start: 4, end: 5 }]);
  });

  it("folds the Greek final sigma, capital sigma and sigma together", () => {
    expect(slices("ΟΔΥΣΣΕΥΣ Οδυσσεύς οδυσσευσ", "οδυσσευσ", "case")).toEqual(["ΟΔΥΣΣΕΥΣ", "οδυσσευσ"]);
    expect(slices("ΟΔΥΣΣΕΥΣ Οδυσσεύς οδυσσευσ", "ΟΔΥΣΣΕΥΣ")).toEqual(["ΟΔΥΣΣΕΥΣ", "Οδυσσεύς", "οδυσσευσ"]);
    expect(slices("ς", "σ", "case")).toEqual(["ς"]);
    expect(slices("σ", "ς", "case")).toEqual(["σ"]);
    expect(slices("Σ", "ς", "case")).toEqual(["Σ"]);
    expect(slices("ς", "σ", "none")).toEqual([]);
  });

  it("folds ligatures to their letters and back", () => {
    expect(slices("ﬁnal ﬂow oﬃce ﬀ ﬅ ﬆ", "final", "case")).toEqual(["ﬁnal"]);
    expect(slices("ﬂow", "flow")).toEqual(["ﬂow"]);
    expect(slices("office", "oﬃce")).toEqual(["office"]);
    expect(slices("oﬃce", "ffi")).toEqual(["ﬃ"]);
    expect(slices("oﬃce", "ff")).toEqual([]);
    expect(slices("ﬅ ﬆ", "st")).toEqual(["ﬅ", "ﬆ"]);
    expect(slices("ſ", "s")).toEqual(["ſ"]);
    expect(slices("ﬁ", "fi", "none")).toEqual([]);
    expect(slices("ﬁ", "fi", "accents")).toEqual([]);
  });

  it("keeps the offsets right after letters that fold to more or fewer characters", () => {
    const text = "ﬃ ß İ e\u0301 🙂 end";
    const [match] = findMatches(text, "end");
    expect(text.slice(match!.start, match!.end)).toBe("end");
    expect(findMatches("🙂 🙂", "🙂")).toEqual([
      { start: 0, end: 2 },
      { start: 3, end: 5 },
    ]);
  });

  it("tells the Turkish dotted and dotless i apart, with and without the locale", () => {
    expect(slices("I i İ ı", "i")).toEqual(["I", "i", "İ"]);
    expect(slices("I i İ ı", "ı")).toEqual(["ı"]);
    expect(slices("I i İ ı", "i", "case")).toEqual(["I", "i"]);
    expect(slices("I i İ ı", "İ", "case")).toEqual(["İ"]);
    expect(slices("I i İ ı", "İ")).toEqual(["I", "i", "İ"]);
    expect(slices("I i İ ı", "I", "none")).toEqual(["I"]);
    expect(slices("I i İ ı", "i", "none", "tr")).toEqual(["i"]);
    expect(slices("I i İ ı", "ı", "case", "tr")).toEqual(["I", "ı"]);
    expect(slices("I i İ ı", "i", "case", "tr")).toEqual(["i", "İ"]);
    expect(slices("I i İ ı", "I", "case", "tr")).toEqual(["I", "ı"]);
    expect(slices("İSTANBUL ıspanak", "istanbul", "case", "tr")).toEqual(["İSTANBUL"]);
    expect(slices("ISPANAK ıspanak", "ıspanak", "case", "tr")).toEqual(["ISPANAK", "ıspanak"]);
  });

  it("leaves scripts whose marks carry meaning alone when it folds accents", () => {
    expect(slices("कि की", "कि", "accents")).toEqual(["कि"]);
    expect(slices("שָׁלוֹם", "שלום", "accents")).toEqual([]);
  });

  it("treats a Hangul syllable and its jamo as the same letter", () => {
    expect(slices("\u1112\u1161\u11ab", "\ud55c", "none")).toEqual(["\u1112\u1161\u11ab"]);
    expect(slices("\ud55c", "\u1112\u1161\u11ab", "none")).toEqual(["\ud55c"]);
    expect(slices("\ud558\u11ab", "\ud55c", "none")).toEqual(["\ud558\u11ab"]);
    expect(slices("\u1112\u1161\u11ab", "\u1112", "none")).toEqual([]);
  });

  it("slices every match back to text that equals the query once both are folded", () => {
    const words = ["Café", "ÉCOLE", "straße", "ﬁnal", "ΣΊΣΥΦΟΣ", "İstanbul", "ıspanak", "e\u0301", "plain", "🙂", "Ǆ", "ǆ"];
    for (const fold of ["none", "case", "accents", "all"] as const) {
      for (const query of words) {
        const text = words.join(" | ");
        for (const { start, end } of findMatches(text, query, { fold })) {
          expect(start).toBeGreaterThanOrEqual(0);
          expect(end).toBeGreaterThan(start);
          expect(end).toBeLessThanOrEqual(text.length);
          expect(findMatches(text.slice(start, end), query, { fold })).toEqual([{ start: 0, end: end - start }]);
        }
      }
    }
  });

  it("folds every full case folding the helper knows, and no more", () => {
    const pairs: [string, string][] = [
      ["ß", "ss"], ["ẞ", "ss"], ["ς", "σ"], ["ſ", "s"], ["ŉ", "ʼn"], ["և", "եւ"], ["ẚ", "aʾ"],
      ["ﬀ", "ff"], ["ﬁ", "fi"], ["ﬂ", "fl"], ["ﬃ", "ffi"], ["ﬄ", "ffl"], ["ﬅ", "st"], ["ﬆ", "st"],
    ];
    for (const [letter, spelled] of pairs) {
      expect(slices(`x ${letter} y`, spelled)).toEqual([letter]);
      expect(slices(`x ${spelled} y`, letter)).toEqual([spelled]);
    }
  });

  it("strips a combining mark at the first and last place of each block it knows", () => {
    for (const mark of [0x300, 0x36f, 0x1ab0, 0x1abe, 0x1dc0, 0x1dff, 0x20d0, 0x20f0, 0xfe20, 0xfe2f]) {
      const text = `a${String.fromCodePoint(mark)}b`;
      expect(slices(text, "ab", "accents")).toEqual([text]);
    }
    expect(slices("a\u2ff0b", "ab", "accents")).toEqual([]);
    expect(slices("a\u02ffb", "ab", "accents")).toEqual([]);
  });

  it("keeps a Hangul syllable's jamo together from the first to the last place of each range", () => {
    const joined: [number, number][] = [
      [0x1100, 0x1160], [0x1100, 0x11ff], [0x11ff, 0x11a8], [0x1100, 0x11a8], [0xac00, 0x11a8], [0xd7a3, 0x11a8],
    ];
    const apart: [number, number][] = [
      [0x1100, 0x115f], [0x1100, 0x1200], [0x10ff, 0x11a8], [0x1200, 0x11a8], [0xabff, 0x11a8], [0xd7a4, 0x11a8],
    ];
    const text = ([first, second]: [number, number]) => String.fromCodePoint(first, second);
    for (const pair of joined) expect(findMatches(text(pair), String.fromCodePoint(pair[0]), { fold: "none" })).toEqual([]);
    for (const pair of apart) expect(findMatches(text(pair), String.fromCodePoint(pair[0]), { fold: "none" })).toHaveLength(1);
  });
});
