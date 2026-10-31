import { spring } from "motion";
import { afterEach, describe, expect, it } from "vitest";
import { commands } from "vitest/browser";

// The Ouro look (ouro-theme.css) over ouro-base.css, both loaded through app.css, which vitest.config.ts loads before every test.
// Colors are read through getComputedStyle, so the browser really evaluates the
// variables. Elements are painted with the variables themselves, not utilities, so a
// pair no component uses yet (`card`) is still checked; `soft` mixes the tone the way
// Tailwind compiles `bg-primary/10`.

type Rgb = [number, number, number];
/** Tones whose text sits on their own soft tint (`variant="soft"`) and on the page. */
const tones = ["primary", "secondary", "destructive", "success", "warning"] as const;

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
function mount(html: string) {
  const host = document.createElement("div");
  host.innerHTML = html;
  document.body.append(host);
  mounted.push(host);
  return host;
}
afterEach(() => {
  for (const node of mounted) node.remove();
  mounted = [];
  document.documentElement.classList.remove("dark");
});

/** The computed background of an element painted with `value` (a CSS color expression). */
const paint = (value: string) =>
  getComputedStyle(mount(`<i style="background-color: ${value}"></i>`).firstElementChild!).backgroundColor;
const color = (name: string) => paint(`var(--${name})`);
const soft = (tone: string) => paint(`color-mix(in oklab, var(--${tone}) 10%, transparent)`);

for (const scheme of ["light", "dark"] as const) {
  describe(`contrast (${scheme})`, () => {
    const surfaces = () => {
      document.documentElement.classList.toggle("dark", scheme === "dark");
      return { background: toRgb(color("background")), popover: toRgb(color("popover")) };
    };

    it.each(tones)("%s-foreground text on the solid tone is at least 4.5:1", (tone) => {
      surfaces();
      const solid = toRgb(color(tone));
      expect(ratio(toRgb(color(`${tone}-foreground`), solid), solid)).toBeGreaterThanOrEqual(4.5);
    });

    it.each(tones.filter((tone) => tone !== "secondary"))(
      "%s text on its soft tint is at least 4.5:1 over the page and a popover",
      (tone) => {
        for (const surface of Object.values(surfaces())) {
          const tint = toRgb(soft(tone), surface);
          expect(ratio(toRgb(color(tone), tint), tint)).toBeGreaterThanOrEqual(4.5);
        }
      },
    );

    it("secondary-foreground text on the soft secondary surface is at least 4.5:1 over the page and a popover", () => {
      for (const surface of Object.values(surfaces())) {
        const tint = toRgb(paint("color-mix(in oklab, var(--secondary) 50%, transparent)"), surface);
        expect(ratio(toRgb(color("secondary-foreground"), tint), tint)).toBeGreaterThanOrEqual(4.5);
      }
    });

    // Secondary is a surface (shadcn's meaning), never text on the page.
    it.each(tones.filter((tone) => tone !== "secondary"))("%s text on the page and a popover is at least 4.5:1 (Text tones, plain and outline buttons)", (tone) => {
      for (const surface of Object.values(surfaces())) {
        expect(ratio(toRgb(color(tone), surface), surface)).toBeGreaterThanOrEqual(4.5);
      }
    });

    // Chart series are graphics, which need 3:1 against what they are drawn on.
    it.each([1, 2, 3, 4, 5])("chart-%i is at least 3:1 on the page and a card", (index) => {
      surfaces();
      for (const surface of ["background", "card"]) {
        const behind = toRgb(color(surface));
        expect(ratio(toRgb(color(`chart-${index}`), behind), behind)).toBeGreaterThanOrEqual(3);
      }
    });

    it.each([
      ["foreground", "background"],
      ["popover-foreground", "popover"],
      ["card-foreground", "card"],
      ["muted-foreground", "muted"],
      ["muted-foreground", "background"],
      ["muted-foreground", "popover"],
      ["accent-foreground", "accent"],
    ])("%s on %s is at least 4.5:1", (text, surface) => {
      surfaces();
      const behind = toRgb(color(surface));
      expect(ratio(toRgb(color(text), behind), behind)).toBeGreaterThanOrEqual(4.5);
    });
  });
}

describe("dark mode", () => {
  it("switches the variables under a .dark ancestor, and nowhere else", () => {
    const host = mount('<i class="bg-primary"></i><div class="dark"><i class="bg-primary"></i></div>');
    const [light, dark] = [...host.querySelectorAll("i")].map((element) => getComputedStyle(element).backgroundColor);
    expect(light).not.toBe(dark);
    expect(toRgb(dark!)).toEqual([41, 151, 255]);
  });

  it("ignores the OS color scheme: only the .dark class switches", async () => {
    const before = color("background");
    await commands.emulateMedia({ colorScheme: "dark" });
    try {
      expect(matchMedia("(prefers-color-scheme: dark)").matches).toBe(true);
      expect(color("background")).toBe(before);
    } finally {
      await commands.emulateMedia({ colorScheme: "light" });
    }
  });
});

describe("sheet shadows", () => {
  it.each([
    ["bottom", "up", (x: number, y: number) => x === 0 && y < 0],
    ["top", "down", (x: number, y: number) => x === 0 && y > 0],
    ["left", "right", (x: number, y: number) => x > 0 && y === 0],
    ["right", "left", (x: number, y: number) => x < 0 && y === 0],
  ] as const)("--ouro-shadow-sheet-%s casts its soft shadow %s, onto the page", (side, _direction, toward) => {
    const element = mount(`<i style="box-shadow: var(--ouro-shadow-sheet-${side})"></i>`).firstElementChild!;
    const layers = getComputedStyle(element).boxShadow.split(/,\s*(?![^(]*\))/);
    // The last layer is the soft shadow: its color, then x, y and a blur of 32px.
    const [, x, y, blur] = layers.at(-1)!.match(/\) (-?[\d.]+)px (-?[\d.]+)px ([\d.]+)px/) ?? [];
    expect(toward(Number(x), Number(y))).toBe(true);
    expect(Number(blur)).toBe(32);
  });
});

describe("motion tokens", () => {
  const root = () => getComputedStyle(document.documentElement);

  it("are Motion's spring(0.4, 0.15) as a CSS duration and linear() easing", () => {
    const transition = String(spring(0.4, 0.15));
    const split = transition.indexOf(" ");
    expect(root().getPropertyValue("--ouro-spring-duration").trim()).toBe(transition.slice(0, split));
    expect(root().getPropertyValue("--ouro-ease-spring").trim()).toBe(transition.slice(split + 1));
  });

  it("runs the spring at least as long as its visual duration", () => {
    expect(Number.parseFloat(root().getPropertyValue("--ouro-spring-duration"))).toBeGreaterThanOrEqual(400);
  });

  it("defines the three easing curves under the --ouro- prefix, leaving Tailwind's own ease-out alone", () => {
    expect(root().getPropertyValue("--ouro-ease-out").trim()).toBe("cubic-bezier(0.23, 1, 0.32, 1)");
    expect(root().getPropertyValue("--ouro-ease-in-out").trim()).toBe("cubic-bezier(0.77, 0, 0.175, 1)");
    expect(root().getPropertyValue("--ouro-ease-drawer").trim()).toBe("cubic-bezier(0.32, 0.72, 0, 1)");
    // Tailwind's own `ease-out` class keeps Tailwind's curve in an app that installs the theme.
    const tailwind = getComputedStyle(mount('<i class="ease-out"></i>').firstElementChild!);
    expect(tailwind.transitionTimingFunction).toBe("cubic-bezier(0, 0, 0.2, 1)");
  });

  it("defines the durations: press 160ms, fast 150ms, base 200ms, draw 240ms, slow 300ms, sheet 500ms", () => {
    const durations = Object.fromEntries(
      ["press", "fast", "base", "draw", "slow", "sheet"].map((name) => [name, root().getPropertyValue(`--ouro-duration-${name}`).trim()]),
    );
    expect(durations).toEqual({ press: "160ms", fast: "150ms", base: "200ms", draw: "240ms", slow: "300ms", sheet: "500ms" });
  });
});

describe("press utility", () => {
  it("scales in and out in 160ms on the ease-out token, and eases colors in 150ms", () => {
    const style = getComputedStyle(mount('<button class="press"></button>').firstElementChild!);
    const properties = style.transitionProperty.split(", ");
    const durations = style.transitionDuration.split(", ");
    const easings = style.transitionTimingFunction.split(/, (?=cubic-bezier|ease|linear)/);
    const at = (property: string) => properties.indexOf(property);
    expect(at("scale")).toBeGreaterThanOrEqual(0);
    expect(durations[at("scale")]).toBe("0.16s");
    expect(easings[at("scale")]).toBe("cubic-bezier(0.23, 1, 0.32, 1)");
    for (const property of ["background-color", "border-color", "color", "opacity"]) {
      expect(durations[at(property)], property).toBe("0.15s");
      expect(easings[at(property)], property).toBe("ease");
    }
  });
});
