import { spring } from "motion";
import { afterEach, describe, expect, it } from "vitest";
import { commands, page, userEvent } from "vitest/browser";
import { pressTab } from "@/registry/ouro/lib/ouro/testing/tab";
import ouroPlain from "./ouro-plain.css?inline";

// The Ouro look (ouro-theme.css) over ouro-base.css, both loaded through app.css, which vitest.config.ts loads before every test.
// Colors are read through getComputedStyle, so the browser really evaluates the
// variables. Elements are painted with the variables themselves, not utilities, so a
// pair no component uses yet (`card`) is still checked; `soft` mixes the tone the way
// Tailwind compiles `bg-primary/10`.

// ouro-plain.css is an app's choice, so app.css leaves it out; the classes' tests below load it themselves.
const plainSheet = document.createElement("style");
plainSheet.textContent = ouroPlain;
document.head.append(plainSheet);

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

describe("wide-screen type", () => {
  const rootPx = () => Number.parseFloat(getComputedStyle(document.documentElement).fontSize);

  it("grows the root a step at 2400px and another at 3200px, then stops at 20px, so a 4K screen at 1x reads at a laptop's size", async () => {
    const seen: number[] = [];
    try {
      for (const width of [1440, 2399, 2400, 3199, 3200, 3840, 5120]) {
        await page.viewport(width, 900);
        await expect.poll(() => window.innerWidth).toBe(width);
        seen.push(rootPx());
      }
    } finally {
      await page.viewport(414, 896);
    }
    expect(seen).toEqual([16, 16, 18, 18, 20, 20, 20]);
  });
});

describe("text wrapping", () => {
  it("wraps Ouro body copy pretty and its headings balanced, and leaves the app's own text-wrap class the last word", () => {
    const host = document.createElement("div");
    host.setAttribute("data-ouro", "text");
    host.innerHTML = '<p>copy</p><h2>title</h2><p class="text-nowrap">own</p>';
    const outside = document.createElement("p");
    document.body.append(host, outside);
    try {
      const wrap = (element: Element) => getComputedStyle(element).textWrapStyle;
      expect(wrap(host.querySelector("p")!)).toBe("pretty");
      expect(wrap(host.querySelector("h2")!)).toBe("balance");
      expect(wrap(host.querySelector(".text-nowrap")!)).toBe("auto");
      expect(wrap(outside)).toBe("auto");
    } finally {
      host.remove();
      outside.remove();
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

  it("defines the durations: press 160ms, fast 150ms, base 200ms, draw 240ms, slow 300ms, sheet 500ms, bounce 650ms", () => {
    const durations = Object.fromEntries(
      ["press", "fast", "base", "draw", "slow", "sheet", "bounce"].map((name) => [name, root().getPropertyValue(`--ouro-duration-${name}`).trim()]),
    );
    expect(durations).toEqual({ press: "160ms", fast: "150ms", base: "200ms", draw: "240ms", slow: "300ms", sheet: "500ms", bounce: "650ms" });
  });

  it("defines --ouro-ease-bounce as a fixed curve, not read from Motion at runtime, bouncier than the retiring --ouro-ease-spring", () => {
    // A damping 0.6, response 0.35s spring, sampled the same way --ouro-ease-spring was: a fixed
    // linear() curve under the --ouro- prefix, a new easing rather than a revival of the spring
    // tokens above it (no component, nor this test, calls the `motion` package for it).
    const bounce = root().getPropertyValue("--ouro-ease-bounce").trim();
    expect(bounce).toBe(
      "linear(0, 0.1221, 0.3776, 0.6454, 0.8608, 1.002, 1.074, 1.0947, 1.0845, 1.0608, 1.0352, 1.0144, 1.0005, 0.9933, 0.991, 0.9919, 0.9941, 0.9965, 0.9985, 0.9999, 1.0006, 1)",
    );
    const peakOf = (curve: string) => Math.max(...curve.match(/-?[\d.]+/g)!.map(Number));
    expect(peakOf(bounce)).toBeGreaterThan(peakOf(root().getPropertyValue("--ouro-ease-spring")));
  });
});

describe("fixed sizes", () => {
  const root = () => getComputedStyle(document.documentElement);

  it("defines each step as a quarter rem, with a dot written as an underscore", () => {
    expect(root().getPropertyValue("--ouro-size-0_5").trim()).toBe("0.125rem");
    expect(root().getPropertyValue("--ouro-size-2_5").trim()).toBe("0.625rem");
    expect(root().getPropertyValue("--ouro-size-8").trim()).toBe("2rem");
    expect(root().getPropertyValue("--ouro-size-144").trim()).toBe("36rem");
  });

  it("lets an app theme a fixed size by its token, which the named utility reads", () => {
    const themed = mount('<div style="--ouro-size-8: 2.25rem"><i class="block size-ouro-8"></i></div>').firstElementChild!;
    expect(getComputedStyle(themed.firstElementChild!).width).toBe("36px");
  });

  it("keeps a fixed size at its step under a compact --spacing, where a spacing-scale size shrinks", () => {
    const widths = (element: Element) => [...element.children].map((child) => Number.parseFloat(getComputedStyle(child).width));
    const roomy = mount('<div><i class="block size-8"></i><i class="block size-ouro-8"></i></div>').firstElementChild!;
    expect(widths(roomy)).toEqual([32, 32]);
    const compact = mount('<div style="--spacing: 0.2rem"><i class="block size-8"></i><i class="block size-ouro-8"></i></div>').firstElementChild!;
    // WebKit rounds the spacing-scale width to a sixty-fourth of a pixel, so it is compared to a tenth.
    const [spaced, fixed] = widths(compact);
    expect(spaced).toBeCloseTo(25.6, 1);
    expect(fixed).toBe(32);
  });
});

describe("press utility", () => {
  it("scales in and out in 160ms on the ease-out token, and changes colors at once", () => {
    const style = getComputedStyle(mount('<button class="press"></button>').firstElementChild!);
    const properties = style.transitionProperty.split(", ");
    const durations = style.transitionDuration.split(", ");
    const easings = style.transitionTimingFunction.split(/, (?=cubic-bezier|ease|linear)/);
    const at = (property: string) => properties.indexOf(property);
    expect(at("scale")).toBeGreaterThanOrEqual(0);
    expect(durations[at("scale")]).toBe("0.16s");
    expect(easings[at("scale")]).toBe("cubic-bezier(0.23, 1, 0.32, 1)");
    expect(durations[at("opacity")]).toBe("0.15s");
    for (const property of ["background-color", "border-color", "color", "all"]) expect(at(property), property).toBe(-1);
  });

  it("draws a selected row's background on the frame it is selected, and takes it off the row it left on that frame", () => {
    const host = mount(
      '<div><button class="press aria-[current=true]:bg-primary aria-[current=true]:text-primary-foreground" aria-current="true">A</button><button class="press aria-[current=true]:bg-primary aria-[current=true]:text-primary-foreground">B</button></div>',
    );
    const [left, picked] = [...host.firstElementChild!.children] as [HTMLElement, HTMLElement];
    const selected = getComputedStyle(left).backgroundColor;
    const plain = getComputedStyle(picked).backgroundColor;
    expect(selected).not.toBe(plain);
    left.removeAttribute("aria-current");
    picked.setAttribute("aria-current", "true");
    // Read in the same frame, before any transition could run: each is already at its end.
    expect(getComputedStyle(picked).backgroundColor).toBe(selected);
    expect(getComputedStyle(left).backgroundColor).toBe(plain);
    expect([...left.getAnimations(), ...picked.getAnimations()]).toHaveLength(0);
  });
});

describe("focus and row classes for plain markup", () => {
  const outline = (element: Element) => {
    const style = getComputedStyle(element);
    return [style.outlineStyle, style.outlineWidth, style.outlineColor, style.outlineOffset].join(" ");
  };

  it("draws the ring Ouro's controls draw on keyboard focus: ouro-focus-ring outside the box, ouro-focus-ring-inset inside it", async () => {
    const host = mount(
      '<button id="start">Start</button>' +
        '<button class="outline-ring outline-offset-2 focus-visible:outline-2 focus-visible:outline-solid">Control</button>' +
        '<li class="ouro-focus-ring" tabindex="0">Row</li>' +
        '<li class="ouro-focus-ring-inset" tabindex="0">Cell</li>',
    );
    const [, control, ring, inset] = [...host.children] as HTMLElement[];
    expect(getComputedStyle(ring!).outlineStyle).toBe("none");
    host.querySelector<HTMLElement>("#start")!.focus();
    await pressTab();
    const controlRing = outline(control!);
    await pressTab();
    expect(document.activeElement).toBe(ring);
    expect(outline(ring!)).toBe(controlRing);
    await pressTab();
    expect(document.activeElement).toBe(inset);
    expect(outline(inset!)).toBe(controlRing.replace(/ 2px$/, " -2px"));
  });

  it("tints a row while a mouse rests on it, and more while it is pressed", async () => {
    await commands.parkPointer();
    const row = mount('<div class="ouro-row" style="padding: 12px">Open the customer</div>').firstElementChild as HTMLElement;
    const settled = () => expect.poll(() => row.getAnimations().length).toBe(0);
    expect(getComputedStyle(row).cursor).toBe("pointer");
    const rest = getComputedStyle(row).backgroundColor;
    await userEvent.hover(row);
    await settled();
    expect(toRgb(getComputedStyle(row).backgroundColor, toRgb(color("background")))).toEqual(toRgb(paint("color-mix(in oklab, var(--foreground) 3%, transparent)"), toRgb(color("background"))));
    expect(getComputedStyle(row).backgroundColor).not.toBe(rest);
    row.id = "pressed-row";
    await commands.pointerPress({ selector: "#pressed-row", action: "down" });
    try {
      await settled();
      expect(getComputedStyle(row).backgroundColor).toBe(paint("color-mix(in oklab, var(--foreground) 6%, transparent)"));
    } finally {
      await commands.pointerPress({ action: "up" });
    }
  });
});

describe("disclosure classes for pages with no script", () => {
  const disclosure =
    '<button id="start">Start</button>' +
    '<button class="outline-ring outline-offset-2 focus-visible:outline-2 focus-visible:outline-solid">Control</button>' +
    '<span class="rounded-ouro-md">Corner</span>' +
    '<details class="ouro-disclosure"><summary class="ouro-disclosure-summary">Why it matters</summary><div class="ouro-disclosure-panel">Because</div></details>';
  const parts = (host: HTMLElement) => ({
    control: host.children[1] as HTMLElement,
    corner: host.children[2] as HTMLElement,
    details: host.querySelector("details")!,
    summary: host.querySelector("summary")!,
    panel: host.querySelector<HTMLElement>(".ouro-disclosure-panel")!,
  });
  const chevron = (summary: Element) => {
    const style = getComputedStyle(summary, "::after");
    return [style.rotate, style.translate].join(" ");
  };
  const settled = () => expect.poll(() => document.getAnimations().length).toBe(0);

  it("draws the title as Collapsible does, with no browser marker, and opens on Enter with no script, turning the chevron over", async () => {
    const host = mount(disclosure);
    const { control, corner, details, summary, panel } = parts(host);
    const text = document.createRange();
    text.selectNodeContents(summary);
    expect(text.getClientRects()[0]!.left).toBeCloseTo(summary.getBoundingClientRect().left, 0);
    expect(getComputedStyle(summary).borderRadius).toBe(getComputedStyle(corner).borderRadius);
    const fine = matchMedia("(min-width: 640px) and (pointer: fine)").matches;
    expect(summary.getBoundingClientRect().height).toBeGreaterThanOrEqual(fine ? 36 : 44);
    expect(getComputedStyle(summary, "::after").borderRightColor).toBe(color("muted-foreground"));
    expect(chevron(summary)).toBe("45deg 0px -20%");
    expect(panel.checkVisibility()).toBe(false);
    host.querySelector<HTMLElement>("#start")!.focus();
    await pressTab();
    const ring = [getComputedStyle(control).outlineStyle, getComputedStyle(control).outlineWidth, getComputedStyle(control).outlineColor, getComputedStyle(control).outlineOffset].join(" ");
    await pressTab();
    expect(document.activeElement).toBe(summary);
    expect([getComputedStyle(summary).outlineStyle, getComputedStyle(summary).outlineWidth, getComputedStyle(summary).outlineColor, getComputedStyle(summary).outlineOffset].join(" ")).toBe(ring);
    await userEvent.keyboard("{Enter}");
    expect(details.open).toBe(true);
    await settled();
    expect(panel.checkVisibility()).toBe(true);
    expect(chevron(summary)).toBe("225deg 0px 20%");
  });

  it("turns the chevron on the motion tokens, and snaps it under reduced motion", async () => {
    const { details, summary } = parts(mount(disclosure));
    expect(chevron(summary)).toMatch(/^45deg /);
    details.open = true;
    expect(document.getAnimations().map((animation) => (animation as CSSTransition).transitionProperty).sort()).toEqual(["rotate", "translate"]);
    expect(getComputedStyle(summary, "::after").transitionDuration).toBe("0.2s, 0.2s");
    await settled();
    await commands.emulateMedia({ reducedMotion: "reduce" });
    try {
      details.open = false;
      expect(document.getAnimations()).toHaveLength(0);
      expect(chevron(summary)).toMatch(/^45deg /);
    } finally {
      await commands.emulateMedia({ reducedMotion: "no-preference" });
    }
  });
});

describe("skip link, focus target, focus ring within and reveal classes for plain markup", () => {
  const ring = (element: Element) => {
    const style = getComputedStyle(element);
    return [style.outlineStyle, style.outlineWidth, style.outlineColor, style.outlineOffset].join(" ");
  };
  const control = '<button class="outline-ring outline-offset-2 focus-visible:outline-2 focus-visible:outline-solid">Control</button>';

  it("hides the skip link until it has focus, then shows it with the ring, and its target takes focus with no outline, with no script", async () => {
    const host = mount(
      `<button id="start">Start</button>${control}<a class="ouro-skip-link" href="#plain-main">Skip to main content</a><main id="plain-main" tabindex="-1" class="ouro-focus-target">Recipes</main>`,
    );
    const [, button, link, main] = [...host.children] as HTMLElement[];
    expect(link!.getBoundingClientRect().width).toBe(1);
    expect(getComputedStyle(link!).clipPath).toBe("inset(50%)");
    host.querySelector<HTMLElement>("#start")!.focus();
    await pressTab();
    const controlRing = ring(button!);
    await pressTab();
    expect(document.activeElement).toBe(link);
    expect(ring(link!)).toBe(controlRing);
    expect(getComputedStyle(link!).clipPath).toBe("none");
    expect(link!.getBoundingClientRect().height).toBeGreaterThanOrEqual(36);
    expect(getComputedStyle(link!).position).toBe("fixed");
    await userEvent.keyboard("{Enter}");
    await expect.poll(() => document.activeElement).toBe(main);
    expect(getComputedStyle(main!).outlineStyle).toBe("none");
    history.replaceState(null, "", location.pathname + location.search);
  });

  it("rings a label around a visually hidden radio while the radio has keyboard focus, as TextField rings its box", async () => {
    const host = mount(
      `<button id="start">Start</button>${control}` +
        '<label class="ouro-focus-ring-within" style="display: inline-block; padding: 4px"><input type="radio" name="who" style="position: absolute; opacity: 0" /><span>Mine</span></label>',
    );
    const label = host.querySelector("label")!;
    expect(getComputedStyle(label).outlineStyle).toBe("none");
    host.querySelector<HTMLElement>("#start")!.focus();
    await pressTab();
    const controlRing = ring(host.children[1]!);
    await pressTab();
    expect(document.activeElement).toBe(host.querySelector("input"));
    expect(ring(label)).toBe(controlRing);
  });

  it("shows what it reveals to a mouse only while the pointer rests on its host or focus is in it, keeping its room", async () => {
    await commands.parkPointer();
    const host = mount(
      '<ul><li class="ouro-reveal-host" style="padding: 12px">Customer <span class="ouro-reveal"><button>Archive</button></span></li><li style="padding: 12px">Other</li></ul>',
    );
    const row = host.querySelector("li")!;
    const actions = host.querySelector<HTMLElement>(".ouro-reveal")!;
    const settled = () => expect.poll(() => actions.getAnimations().length).toBe(0);
    expect(getComputedStyle(actions).opacity).toBe("0");
    expect(actions.getBoundingClientRect().width).toBeGreaterThan(0);
    await userEvent.hover(row);
    await settled();
    expect(getComputedStyle(actions).opacity).toBe("1");
    await commands.parkPointer();
    await settled();
    expect(getComputedStyle(actions).opacity).toBe("0");
    actions.querySelector("button")!.focus();
    await settled();
    expect(getComputedStyle(actions).opacity).toBe("1");
  });
});

describe("current, toggle, segment and option classes for plain markup", () => {
  it("draws links as Link in the text colour, and marks the current one as Link's current does, semibold with a 2px primary underline", () => {
    const host = mount('<a class="ouro-nav-link" href="#a" aria-current="page">Today</a><a class="ouro-nav-link" href="#b">Customers</a><a class="ouro-nav-link" href="#c" aria-current="false">Lab</a>');
    const [current, other, off] = [...host.children].map((link) => getComputedStyle(link));
    expect(current!.fontWeight).toBe("600");
    expect(current!.color).toBe(color("foreground"));
    expect(current!.textDecorationColor).toBe(color("primary"));
    expect(current!.textDecorationThickness).toBe("2px");
    expect(other!.fontWeight).toBe("400");
    expect(other!.color).toBe(color("foreground"));
    expect(other!.textDecorationColor).toBe(paint("color-mix(in oklab, var(--foreground) 40%, transparent)"));
    expect(off!.textDecorationColor).not.toBe(color("primary"));
  });

  it("draws a pressed toggle as Toggle's outline variant does, tinted with the primary colour", () => {
    const host = mount('<button class="ouro-toggle" aria-pressed="true">Mine</button><button class="ouro-toggle" aria-pressed="false">All</button>');
    const [pressed, unpressed] = [...host.children].map((button) => getComputedStyle(button));
    expect(pressed!.backgroundColor).toBe(paint("color-mix(in oklab, var(--primary) 10%, transparent)"));
    expect(pressed!.color).toBe(paint("color-mix(in oklab, var(--primary) 80%, var(--foreground))"));
    expect(unpressed!.backgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect(unpressed!.borderTopColor).toBe(color("border"));
  });

  it("selects the segment whose radio is checked, by click or arrow key, and rings it on keyboard focus", async () => {
    const host = mount(
      '<button id="start">Start</button><div class="ouro-segmented"><label class="ouro-segment"><input type="radio" name="who" checked /> Mine</label><label class="ouro-segment"><input type="radio" name="who" /> Everyone</label></div>',
    );
    const [mine, everyone] = [...host.querySelectorAll("label")];
    const settled = () => expect.poll(() => document.getAnimations().length).toBe(0);
    await settled();
    expect(getComputedStyle(mine!).backgroundColor).toBe(paint("var(--ouro-segment-selected)"));
    expect(getComputedStyle(everyone!).backgroundColor).toBe("rgba(0, 0, 0, 0)");
    await userEvent.click(everyone!);
    await settled();
    expect(everyone!.querySelector("input")!.checked).toBe(true);
    expect(getComputedStyle(everyone!).backgroundColor).toBe(paint("var(--ouro-segment-selected)"));
    host.querySelector<HTMLElement>("#start")!.focus();
    await pressTab();
    expect(document.activeElement).toBe(everyone!.querySelector("input"));
    expect(getComputedStyle(everyone!).outlineStyle).toBe("solid");
    await userEvent.keyboard("{ArrowLeft}");
    await settled();
    expect(mine!.querySelector("input")!.checked).toBe(true);
    expect(getComputedStyle(mine!).backgroundColor).toBe(paint("var(--ouro-segment-selected)"));
  });

  it("highlights the selected option as Command does", () => {
    const host = mount('<div role="listbox" aria-label="Customers"><div role="option" class="ouro-option" aria-selected="true">Contoso</div><div role="option" class="ouro-option" aria-selected="false">Fabrikam</div></div>');
    const [selected, other] = [...host.querySelectorAll(".ouro-option")].map((option) => getComputedStyle(option));
    expect(selected!.backgroundColor).toBe(color("accent"));
    expect(selected!.color).toBe(color("accent-foreground"));
    expect(other!.backgroundColor).toBe("rgba(0, 0, 0, 0)");
  });
});
