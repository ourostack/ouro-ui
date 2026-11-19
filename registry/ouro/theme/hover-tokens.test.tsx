import { afterEach, describe, expect, it } from "vitest";

const hosts: HTMLElement[] = [];
afterEach(() => {
  for (const host of hosts.splice(0)) host.remove();
  document.documentElement.classList.remove("dark");
});

/** A custom property as the Ouro theme resolves it in a scheme, read back as the colour it paints. */
function painted(name: string, scheme: "light" | "dark"): string {
  document.documentElement.classList.toggle("dark", scheme === "dark");
  const host = document.createElement("div");
  host.style.background = `var(${name})`;
  document.body.append(host);
  hosts.push(host);
  return getComputedStyle(host).backgroundColor;
}

const canvas = document.createElement("canvas");
canvas.width = canvas.height = 1;
const context = canvas.getContext("2d", { willReadFrequently: true })!;

/** Lightness in OKLab, 0 to 1, of a colour the browser computed. */
function lightness(color: string): number {
  context.clearRect(0, 0, 1, 1);
  context.fillStyle = color;
  context.fillRect(0, 0, 1, 1);
  const [r, g, b] = [...context.getImageData(0, 0, 1, 1).data].map((c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
}

const rowTokens = ["--ouro-row-hover", "--ouro-row-pressed", "--ouro-row-selected", "--ouro-row-selected-hover", "--ouro-row-selected-pressed"];

describe("hover tokens in the Ouro theme", () => {
  it.each(["light", "dark"] as const)("resolve every row state to a colour in %s", (scheme) => {
    for (const name of rowTokens) expect(painted(name, scheme), name).not.toBe("rgba(0, 0, 0, 0)");
    expect(painted("--ouro-row-hover", scheme)).not.toBe(painted("--ouro-row-selected", scheme));
  });

  it("give light and dark their own hover fill", () => {
    expect(painted("--ouro-row-hover", "light")).not.toBe(painted("--ouro-row-hover", "dark"));
  });

  it.each(["light", "dark"] as const)("keep a row's hover distinct from its selected fill, and from the page, in %s", (scheme) => {
    const page = painted("--background", scheme);
    const hover = painted("--ouro-row-hover", scheme);
    const selected = painted("--ouro-row-selected", scheme);
    const selectedHover = painted("--ouro-row-selected-hover", scheme);
    expect(Math.abs(lightness(hover) - lightness(selected))).toBeGreaterThanOrEqual(0.015);
    expect(Math.abs(lightness(hover) - lightness(page))).toBeGreaterThanOrEqual(0.015);
    expect(Math.abs(lightness(selectedHover) - lightness(selected))).toBeGreaterThanOrEqual(0.01);
  });

  it("sets a row's corner at 6px and the state layers at 5% and 12% in light, 8% and 14% in dark", () => {
    document.documentElement.classList.remove("dark");
    const read = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    expect(read("--ouro-row-radius")).toBe("0.375rem");
    expect([read("--ouro-state-hover"), read("--ouro-state-pressed")]).toEqual(["5%", "12%"]);
    document.documentElement.classList.add("dark");
    expect([read("--ouro-state-hover"), read("--ouro-state-pressed")]).toEqual(["8%", "14%"]);
  });
});
