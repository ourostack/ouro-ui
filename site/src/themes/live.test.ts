import { describe, expect, it } from "vitest";
import { isSouthern, LIVE_PALETTES, liveCss, PHASES, SEASONS, skyAt } from "./live";

/** Pearl's own surfaces and text, which Live paints over (pearl.css). */
const PEARL = {
  light: { background: "#ffffff", foreground: "#1d1d1f", card: "#ffffff", muted: "#f5f5f7", "muted-foreground": "#6a6a6f", primary: "#0066cc", "primary-foreground": "#ffffff" },
  dark: { background: "#000000", foreground: "#f5f5f7", card: "#1c1c1e", muted: "#1c1c1e", "muted-foreground": "#a1a1a6", primary: "#2997ff", "primary-foreground": "#00172e" },
} as const;

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((index) => {
    const channel = parseInt(hex.slice(index, index + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

const at = (month: number, hours: number, minutes = 0) => ({ getMonth: () => month, getHours: () => hours, getMinutes: () => minutes });

describe("Live", () => {
  it("names the sky by the local clock: dawn, day, dusk and night in late October", () => {
    expect(skyAt(at(9, 7, 10), false).phase).toBe("dawn");
    expect(skyAt(at(9, 12), false).phase).toBe("day");
    expect(skyAt(at(9, 17, 50), false).phase).toBe("dusk");
    expect(skyAt(at(9, 22, 30), false).phase).toBe("night");
    expect(skyAt(at(9, 3), false).phase).toBe("night");
  });

  it("tints the porthole by season and leaves the page's own colours as the phase has them", () => {
    const sheets = SEASONS.map((season) => liveCss(LIVE_PALETTES["dusk"]!, season));
    const sky = (css: string) => /html\[data-live\]\{[^}]*--live-sky:([^;}]*)/.exec(css)![1];
    expect(new Set(sheets.map(sky)).size).toBe(SEASONS.length);
    for (const css of sheets) expect(css).toContain(`--primary:${LIVE_PALETTES["dusk"]!.light["primary"]!}`);
  });

  it("knows the season, and flips it south of the equator", () => {
    expect(skyAt(at(9, 12), false).season).toBe("autumn");
    expect(skyAt(at(9, 12), true).season).toBe("spring");
    expect(skyAt(at(0, 12), false).season).toBe("winter");
    expect(skyAt(at(6, 12), false).season).toBe("summer");
    expect(isSouthern("Australia/Sydney")).toBe(true);
    expect(isSouthern("America/New_York")).toBe(false);
  });

  for (const phase of PHASES) {
    for (const mode of ["light", "dark"] as const) {
      it(`keeps text readable at ${phase}, ${mode}`, () => {
        const colours = { ...PEARL[mode], ...LIVE_PALETTES[phase][mode] } as Record<string, string>;
        for (const surface of ["background", "card", "muted"]) {
          expect(contrast(colours.foreground!, colours[surface]!), `foreground on ${surface}`).toBeGreaterThanOrEqual(4.5);
          expect(contrast(colours["muted-foreground"]!, colours[surface]!), `muted text on ${surface}`).toBeGreaterThanOrEqual(4.5);
          expect(contrast(colours.primary!, colours[surface]!), `primary on ${surface}`).toBeGreaterThanOrEqual(3);
        }
        expect(contrast(colours["primary-foreground"]!, colours.primary!), "text on primary").toBeGreaterThanOrEqual(4.5);
      });
    }
  }
});
