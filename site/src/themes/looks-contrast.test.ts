import { afterEach, describe, expect, it } from "vitest";
import "./presets.generated.css";
import { LIVE_PALETTES, PHASES, SEASONS, liveCss } from "./live";
import presets from "./presets.json";

// Every look a visitor can pick on the site (presets.json), light and dark, painted the way the page paints it:
// html[data-theme] over ouro-base, through the browser's own CSS. A look that leaves a tone to ouro-base (success,
// warning) inherits a value chosen for white, which can fall under 4.5:1 on a tinted page or sidebar, and no
// other test reads a picked look's colours: the page tests render the default look only.

type Rgb = [number, number, number];
const canvas = document.createElement("canvas");
canvas.width = canvas.height = 1;
const context = canvas.getContext("2d", { willReadFrequently: true })!;

/** Resolves any CSS color to sRGB, composited over `over` when it has alpha. */
function toRgb(color: string, over: Rgb = [255, 255, 255]): Rgb {
  context.clearRect(0, 0, 1, 1);
  context.fillStyle = `rgb(${over.join(",")})`;
  context.fillRect(0, 0, 1, 1);
  context.fillStyle = color;
  context.fillRect(0, 0, 1, 1);
  const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
  return [r!, g!, b!];
}
const luminance = ([r, g, b]: Rgb) => {
  const lin = (c: number) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};
const ratio = (a: Rgb, b: Rgb) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

const probe = document.createElement("i");
document.body.append(probe);
/** A theme variable as the browser computes it under the current html[data-theme] and .dark. */
const color = (name: string) => {
  probe.style.backgroundColor = `var(--${name})`;
  return getComputedStyle(probe).backgroundColor;
};

/** Where text sits on the site: the page, cards, popovers and the docs sidebar. */
const surfaces = ["background", "card", "popover", "sidebar"] as const;
/** Text tones (Text, plain and outline buttons, status lines), which sit on any of those surfaces. */
const tones = ["foreground", "muted-foreground", "primary", "destructive", "success", "warning"] as const;

/** The tones short of 4.5:1 on any surface, under whatever html[data-theme], [data-live] and .dark are set now. */
function shortPairs(): string[] {
  const short: string[] = [];
  for (const surface of surfaces) {
    const behind = toRgb(color(surface));
    for (const tone of tones) {
      const value = ratio(toRgb(color(tone), behind), behind);
      if (value < 4.5) short.push(`${tone} on ${surface}: ${value.toFixed(2)}:1`);
    }
  }
  return short;
}

const liveSheet = document.createElement("style");
document.head.append(liveSheet);

afterEach(() => {
  liveSheet.textContent = "";
  document.documentElement.removeAttribute("data-live");
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.classList.remove("dark");
});

describe("every look a visitor can pick", () => {
  for (const { name } of presets) {
    for (const scheme of ["light", "dark"] as const) {
      it(`${name}, ${scheme}: each text tone is at least 4.5:1 on the page, a card, a popover and the sidebar`, () => {
        document.documentElement.setAttribute("data-theme", name);
        document.documentElement.classList.toggle("dark", scheme === "dark");
        expect(shortPairs()).toEqual([]);
      });
    }
  }
});

// Live is Pearl repainted by the reader's sky (live.ts), so the page's colours change with the clock; each phase is
// checked here as the page applies it, since a sky the tests never render would only fail for the readers who see it.
describe("every live sky", () => {
  for (const phase of PHASES) {
    for (const scheme of ["light", "dark"] as const) {
      it(`${phase}, ${scheme}: each text tone is at least 4.5:1 on the page, a card, a popover and the sidebar`, () => {
        liveSheet.textContent = liveCss(LIVE_PALETTES[phase]!, SEASONS[0]!);
        document.documentElement.setAttribute("data-theme", "pearl");
        document.documentElement.setAttribute("data-live", phase);
        document.documentElement.classList.toggle("dark", scheme === "dark");
        // The sky's own page colour is what the probe reads, so this sweep can't pass on Pearl alone.
        const sky = LIVE_PALETTES[phase]![scheme].background;
        if (sky) expect(toRgb(color("background"))).toEqual(toRgb(sky));
        expect(shortPairs()).toEqual([]);
      });
    }
  }
});
