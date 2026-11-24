import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import baseCss from "@/registry/ouro/theme/ouro-base.css?raw";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { Alert } from "@/registry/ouro/components/ouro/alert/alert";
import { Avatar } from "@/registry/ouro/components/ouro/avatar/avatar";
import { Badge } from "@/registry/ouro/components/ouro/badge/badge";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Message } from "@/registry/ouro/components/ouro/message/message";
import { Kbd } from "@/registry/ouro/components/ouro/kbd/kbd";
import { Separator } from "@/registry/ouro/components/ouro/separator/separator";
import { SwipeActions } from "@/registry/ouro/components/ouro/swipe-actions/swipe-actions";
import { Switch } from "@/registry/ouro/components/ouro/switch/switch";
import { Heading } from "@/registry/ouro/components/ouro/text/heading";
import { Text, type TextProps } from "@/registry/ouro/components/ouro/text/text";
import { TimeGrid } from "@/registry/ouro/components/ouro/time-grid/time-grid";
import stockCss from "./shadcn-stock.css?raw";

// Every Button tone and variant, every Text tone and Heading, every Badge tone and
// variant, Alert's title and description in each tone, Kbd, Avatar's initials and a
// SwipeActions button in each tone keep their text at 4.5:1 or more in light and dark,
// and the off Switch's 1px hairline keeps 3:1 against the page (WCAG 1.4.11), under two themes:
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
const separatorTones = ["primary", "destructive", "success", "warning"] as const;

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
        <Avatar name="Ana Lind" data-probe="Avatar" />
        {separatorTones.map((tone) => (
          <Separator key={`separator-${tone}`} tone={tone} label="New" />
        ))}
        <SwipeActions label="Short ribs" trailing={tones.map((tone) => ({ label: "Archive", tone, onClick: () => {} }))}>
          Short ribs
        </SwipeActions>
      </>,
    ),
  );
  // SwipeActions' buttons take no attributes from the app: label them here, by their tone.
  for (const button of host.querySelectorAll("[data-ouro-swipe-actions-side] button")) button.setAttribute("data-probe", `SwipeActions ${button.getAttribute("data-tone")}`);
  // A labelled Separator's label is its text: probe the label span, the lines are no text.
  host.querySelectorAll('[data-ouro="separator"] [data-slot="separator-label"]').forEach((label, index) => {
    label.setAttribute("data-probe", `Separator ${separatorTones[index]}`);
  });
  return host;
}

for (const [name, css] of Object.entries(themes)) {
  for (const scheme of ["light", "dark"] as const) {
    describe(`${name} theme (${scheme})`, () => {
      it("the off Switch's edge is a 1px hairline at 3:1 or more against the page", async () => {
        document.documentElement.classList.toggle("dark", scheme === "dark");
        const style = document.createElement("style");
        style.textContent = css;
        document.head.append(style);
        mounted.push(style);
        const host = document.createElement("div");
        host.setAttribute("data-theme-probe", "");
        host.style.background = "var(--background)";
        document.body.append(host);
        mounted.push(host);
        const root = createRoot(host);
        roots.push(root);
        await act(async () => root.render(<Switch label="Backups" />));
        const track = host.querySelector('[role="switch"]')!;
        const page = backdrop(host);
        const edge = getComputedStyle(track);
        expect(edge.borderTopWidth).toBe("1px");
        expect(ratio(over(edge.borderTopColor, page), page)).toBeGreaterThanOrEqual(3);
      });

      it("the user's own chat bubble keeps its text at 4.5:1 or more on its fill", async () => {
        document.documentElement.classList.toggle("dark", scheme === "dark");
        const host = document.createElement("div");
        host.setAttribute("data-theme-probe", "");
        host.style.background = "var(--background)";
        const style = document.createElement("style");
        style.textContent = css;
        document.head.append(style);
        mounted.push(style);
        document.body.append(host);
        mounted.push(host);
        const root = createRoot(host);
        roots.push(root);
        await act(async () =>
          root.render(
            <Message variant="chat" role="user" name="Priya Okafor">
              Hi Mara
            </Message>,
          ),
        );
        const bubble = host.querySelector<HTMLElement>("[data-ouro-message-content]")!;
        const behind = backdrop(bubble);
        expect(ratio(over(getComputedStyle(bubble).color, behind), behind)).toBeGreaterThanOrEqual(4.5);
      });

      it("others' chat bubble keeps its text at 4.5:1 or more on its fill, from --ouro-bubble-other's fallback to --muted", async () => {
        document.documentElement.classList.toggle("dark", scheme === "dark");
        const host = document.createElement("div");
        host.setAttribute("data-theme-probe", "");
        host.style.background = "var(--background)";
        const style = document.createElement("style");
        style.textContent = css;
        document.head.append(style);
        mounted.push(style);
        document.body.append(host);
        mounted.push(host);
        const root = createRoot(host);
        roots.push(root);
        await act(async () =>
          root.render(
            <Message variant="chat" role="assistant" name="Mara Quill">
              Hi Priya
            </Message>,
          ),
        );
        const bubble = host.querySelector<HTMLElement>("[data-ouro-message-content]")!;
        const behind = backdrop(bubble);
        expect(ratio(over(getComputedStyle(bubble).color, behind), behind)).toBeGreaterThanOrEqual(4.5);
      });

      it("a TimeGrid's muted text on a marked day keeps 4.5:1 or more on the day's tint, in every tone", async () => {
        document.documentElement.classList.toggle("dark", scheme === "dark");
        const style = document.createElement("style");
        style.textContent = css;
        document.head.append(style);
        mounted.push(style);
        const host = document.createElement("div");
        host.setAttribute("data-theme-probe", "");
        host.style.cssText = "background:var(--background);width:1000px";
        document.body.append(host);
        mounted.push(host);
        const root = createRoot(host);
        roots.push(root);
        const marks = { "2026-03-09": "primary", "2026-03-10": "secondary", "2026-03-11": "success", "2026-03-12": "warning", "2026-03-13": "destructive" } as const;
        await act(async () =>
          root.render(
            <TimeGrid
              label="Team calendar"
              view="week"
              date="2026-03-12"
              events={[]}
              timeZone="America/New_York"
              now="2026-03-12T10:00:00-04:00"
              className="h-[30rem]"
              renderDaySummary={() => "2 events"}
              markedDays={Object.fromEntries(Object.entries(marks).map(([day, tone]) => [day, { label: `Away (${tone})`, tone }]))}
            />,
          ),
        );
        const muted = [
          ...host.querySelectorAll("[data-ouro-time-grid-head] > [data-ouro-time-grid-marked]:not([data-today]) > span > span:last-child"),
          ...host.querySelectorAll('[data-slot="time-grid-mark-label"]'),
          ...[...host.querySelectorAll("[data-ouro-time-grid-summary]")].filter((summary) => summary.getAttribute("aria-label")!.includes("Away")),
        ];
        expect(muted).toHaveLength(14);
        const short = muted.flatMap((element) => {
          const behind = backdrop(element);
          const value = ratio(over(getComputedStyle(element).color, behind), behind);
          return value < 4.5 ? [`${element.textContent}: ${value.toFixed(2)}`] : [];
        });
        expect(short).toEqual([]);
      });

      it.each(["background", "popover"] as const)("every tone and variant has text at 4.5:1 or more on the %s", async (surface) => {
        document.documentElement.classList.toggle("dark", scheme === "dark");
        const host = await render(css, surface);
        const found = ratios(host);
        expect(found).toHaveLength(variants.length * tones.length + textTones.length + 1 + badgeVariants.length * tones.length + tones.length * 2 + 2 + tones.length + separatorTones.length);
        const failures = found.filter(([, value]) => value < 4.5).map(([label, value]) => `${label}: ${value.toFixed(2)}`);
        expect(failures).toEqual([]);
      });
    });
  }
}
