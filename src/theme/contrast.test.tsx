import distCss from "../../dist/styles.css?raw";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// Reads the built dist/styles.css, so run `pnpm build` first. Colors are read through
// getComputedStyle so light-dark() and color-mix() are really evaluated by the browser.

type Rgb = [number, number, number];
const tones = ["neutral", "accent", "success", "warning", "danger"] as const;
const inkTones = ["accent", "success", "warning", "danger"] as const;

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

let mounted: Element[] = [];
function mount(css: string, html: string) {
  const style = document.createElement("style");
  style.textContent = css;
  const host = document.createElement("div");
  host.innerHTML = html;
  document.head.append(style);
  document.body.append(host);
  mounted.push(style, host);
  return host;
}

beforeEach(() => {
  mount(distCss, "");
});
afterEach(() => {
  for (const node of mounted) node.remove();
  mounted = [];
  delete document.documentElement.dataset["theme"];
});

const bg = (cls: string) => {
  const el = mount("", `<i class="${cls}"></i>`).firstElementChild!;
  return getComputedStyle(el).backgroundColor;
};
const fg = (cls: string) => {
  const el = mount("", `<i class="${cls}"></i>`).firstElementChild!;
  return getComputedStyle(el).color;
};

for (const scheme of ["light", "dark"] as const) {
  describe(`contrast (${scheme})`, () => {
    beforeEach(() => {
      document.documentElement.dataset["theme"] = scheme;
    });

    const surfaces = () => ({
      surface: toRgb(bg("ou:bg-surface")),
      raised: toRgb(bg("ou:bg-surface-raised")),
    });

    it.each(tones)("on-%s text on the solid tone is at least 4.5:1", (tone) => {
      const solid = toRgb(bg(`ou:bg-${tone}`));
      const text = toRgb(fg(`ou:text-on-${tone}`), solid);
      expect(ratio(text, solid)).toBeGreaterThanOrEqual(4.5);
    });

    it.each(inkTones)("%s-ink text on soft-%s is at least 4.5:1 over both surfaces", (tone) => {
      for (const surface of Object.values(surfaces())) {
        const soft = toRgb(bg(`ou:bg-soft-${tone}`), surface);
        const text = toRgb(fg(`ou:text-${tone}-ink`), soft);
        expect(ratio(text, soft)).toBeGreaterThanOrEqual(4.5);
      }
    });

    it.each(inkTones)("%s-ink text on both surfaces is at least 4.5:1 (Text tones, plain and outline buttons)", (tone) => {
      for (const surface of Object.values(surfaces())) {
        expect(ratio(toRgb(fg(`ou:text-${tone}-ink`), surface), surface)).toBeGreaterThanOrEqual(4.5);
      }
    });

    it("neutral text on both surfaces is at least 4.5:1", () => {
      for (const surface of Object.values(surfaces())) {
        expect(ratio(toRgb(fg("ou:text-neutral"), surface), surface)).toBeGreaterThanOrEqual(4.5);
      }
    });

    it("ink text on soft-neutral is at least 4.5:1 over both surfaces", () => {
      for (const surface of Object.values(surfaces())) {
        const soft = toRgb(bg("ou:bg-soft-neutral"), surface);
        expect(ratio(toRgb(fg("ou:text-ink"), soft), soft)).toBeGreaterThanOrEqual(4.5);
      }
    });

    it("ink and muted ink on the canvas are at least 4.5:1", () => {
      for (const surface of Object.values(surfaces())) {
        expect(ratio(toRgb(fg("ou:text-ink"), surface), surface)).toBeGreaterThanOrEqual(4.5);
        expect(ratio(toRgb(fg("ou:text-ink-muted"), surface), surface)).toBeGreaterThanOrEqual(4.5);
      }
    });
  });
}
