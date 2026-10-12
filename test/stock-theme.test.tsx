import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import baseCss from "@/registry/ouro/theme/ouro-base.css?raw";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { Alert } from "@/registry/ouro/components/ouro/alert/alert";
import { Avatar } from "@/registry/ouro/components/ouro/avatar/avatar";
import { Badge } from "@/registry/ouro/components/ouro/badge/badge";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Kbd } from "@/registry/ouro/components/ouro/kbd/kbd";
import { Heading } from "@/registry/ouro/components/ouro/text/heading";
import { Text, type TextProps } from "@/registry/ouro/components/ouro/text/text";
import stockCss from "./shadcn-stock.css?raw";

// Every Button tone and variant, every Text tone and Heading, every Badge tone and
// variant, Alert's title and description in each tone, Kbd and Avatar's initials keep their text at 4.5:1
// or more in light and dark, under two themes:
//
// - "stock shadcn": the variables `shadcn init` writes (test/shadcn-stock.css, copied
//   from the install spike) plus ouro-base.css, which every app installs. This is an
//   app that keeps its own theme (spec §3, rule 2).
// - "Ouro": ouro-theme.css over ouro-base.css, as app.css loads them.
//
// The stock variables are scoped to a wrapper by rewriting their selectors, so the
// Tailwind utilities app.css compiled resolve against them inside it.

const tones = ["primary", "secondary", "destructive", "success", "warning"] as const;
const variants = ["solid", "soft", "outline", "plain"] as const;
const badgeVariants = ["solid", "soft", "outline"] as const;
const textTones = ["default", "muted", "primary", "secondary", "destructive", "success", "warning"] as const;

/** A stylesheet's `:root` and `.dark` blocks, rescoped to `[data-theme-probe]`. */
function scoped(css: string): string {
  return css
    .replace(/^@import[^\n]*\n/gm, "")
    .replace(/^:root\s*\{/gm, "[data-theme-probe] {")
    .replace(/^\.dark\s*\{/gm, ".dark [data-theme-probe] {");
}

const themes = {
  "stock shadcn": `${scoped(stockCss)}\n${scoped(baseCss)}`,
  Ouro: "",
} as const;

type Rgb = [number, number, number];
const canvas = document.createElement("canvas");
canvas.width = canvas.height = 1;
const context = canvas.getContext("2d", { willReadFrequently: true })!;

/** A CSS color composited over `over`, as sRGB. */
function over(color: string, below: Rgb): Rgb {
  context.clearRect(0, 0, 1, 1);
  context.fillStyle = `rgb(${below.join(",")})`;
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

/** The color behind an element: every background from the page down, composited. */
function backdrop(element: Element): Rgb {
  const chain: Element[] = [];
  for (let node: Element | null = element; node; node = node.parentElement) chain.unshift(node);
  return chain.reduce<Rgb>((below, node) => over(getComputedStyle(node).backgroundColor, below), [255, 255, 255]);
}

/** The text-to-background ratio of every element, by its label. */
function ratios(host: Element): Array<[string, number]> {
  return [...host.querySelectorAll("[data-probe]")].map((element) => {
    const behind = backdrop(element);
    return [element.getAttribute("data-probe")!, ratio(over(getComputedStyle(element).color, behind), behind)];
  });
}

const roots: Root[] = [];
const mounted: Element[] = [];
afterEach(async () => {
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  for (const node of mounted.splice(0)) node.remove();
  document.documentElement.classList.remove("dark");
});

async function render(css: string, surface: "background" | "popover") {
  const style = document.createElement("style");
  style.textContent = css;
  document.head.append(style);
  mounted.push(style);
  const host = document.createElement("div");
  host.setAttribute("data-theme-probe", "");
  host.style.background = `var(--${surface})`;
  document.body.append(host);
  mounted.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () =>
    root.render(
      <>
        {variants.flatMap((variant) =>
          tones.map((tone) => (
            <Button key={`${variant}-${tone}`} variant={variant} tone={tone} data-probe={`Button ${variant} ${tone}`}>
              Save
            </Button>
          )),
        )}
        {textTones.map((tone) => (
          <Text key={tone} tone={tone as TextProps["tone"]} data-probe={`Text ${tone}`}>
            Saved
          </Text>
        ))}
        <Heading level={2} data-probe="Heading">
          Recipes
        </Heading>
        {badgeVariants.flatMap((variant) =>
          tones.map((tone) => (
            <Badge key={`badge-${variant}-${tone}`} variant={variant} tone={tone} data-probe={`Badge ${variant} ${tone}`}>
              Vegan
            </Badge>
          )),
        )}
        {tones.map((tone) => (
          <Alert
            key={`alert-${tone}`}
            tone={tone}
            title={<span data-probe={`Alert ${tone} title`}>Saved</span>}
            description={<span data-probe={`Alert ${tone} description`}>In your cookbook.</span>}
          />
        ))}
        <Kbd keys={["mod", "k"]} data-probe="Kbd" />
        <Avatar name="Ada Lovelace" data-probe="Avatar" />
      </>,
    ),
  );
  return host;
}

for (const [name, css] of Object.entries(themes)) {
  for (const scheme of ["light", "dark"] as const) {
    describe(`${name} theme (${scheme})`, () => {
      it.each(["background", "popover"] as const)("every tone and variant has text at 4.5:1 or more on the %s", async (surface) => {
        document.documentElement.classList.toggle("dark", scheme === "dark");
        const host = await render(css, surface);
        const found = ratios(host);
        expect(found).toHaveLength(variants.length * tones.length + textTones.length + 1 + badgeVariants.length * tones.length + tones.length * 2 + 2);
        const failures = found.filter(([, value]) => value < 4.5).map(([label, value]) => `${label}: ${value.toFixed(2)}`);
        expect(failures).toEqual([]);
      });
    });
  }
}
