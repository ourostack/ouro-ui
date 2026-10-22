import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { commands, server } from "vitest/browser";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Checkbox } from "@/registry/ouro/components/ouro/checkbox/checkbox";
import { Link } from "@/registry/ouro/components/ouro/link/link";
import { RadioGroup } from "@/registry/ouro/components/ouro/radio-group/radio-group";
import { Switch } from "@/registry/ouro/components/ouro/switch/switch";
import { Tabs } from "@/registry/ouro/components/ouro/tabs/tabs";
import { Toggle } from "@/registry/ouro/components/ouro/toggle/toggle";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import presetsCss from "@/site/src/themes/presets.generated.css?raw";
import presets from "@/site/src/themes/themes.json";

// The solid primary Button is the page's main action. It reads --ouro-action and
// --ouro-action-foreground, which fall back to --primary and --primary-foreground, so a theme
// can paint its actions charcoal and keep its selection brass (ourostack/ouro-ui#124). Every
// other control that reads --primary (selection, a soft or outline primary, a primary link)
// must stay on --primary when only the action token is set.

const action = "rgb(10, 20, 30)";
const onAction = "rgb(250, 240, 230)";

const roots: Root[] = [];
const mounted: Element[] = [];
beforeEach(async () => {
  await commands.emulateMedia({ reducedMotion: "no-preference", forcedColors: "none" });
});
afterEach(async () => {
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  for (const node of mounted.splice(0)) node.remove();
  document.documentElement.classList.remove("dark");
  await commands.emulateMedia({ forcedColors: "none" });
});

/** Every control that reads --primary, in its selected state where it has one. */
function Scene() {
  return (
    <>
      <Button data-probe="solid button">Save</Button>
      <Button href="/recipes/new" data-probe="solid link button">
        New recipe
      </Button>
      <Button disabled data-probe="disabled solid button">
        Save
      </Button>
      <Button variant="soft" data-probe="soft button">
        Save
      </Button>
      <Button variant="outline" data-probe="outline button">
        Save
      </Button>
      <Button variant="plain" data-probe="plain button">
        Save
      </Button>
      <Link href="/recipes" tone="primary" data-probe="primary link">
        Recipes
      </Link>
      <Checkbox label="Vegan" defaultChecked />
      <Switch label="Nightly backups" defaultChecked />
      <RadioGroup legend="Size" name="size" defaultValue="small" options={[{ value: "small", label: "Small" }, { value: "large", label: "Large" }]} />
      <Toggle label="Show completed" defaultPressed />
      <Tabs
        label="Recipe"
        items={[
          { value: "ingredients", label: "Ingredients", content: "Flour" },
          { value: "method", label: "Method", content: "Knead" },
        ]}
      />
      <Tabs
        label="Search scope"
        items={[
          { value: "recipes", label: "Recipes", href: "/search?scope=recipes" },
          { value: "chefs", label: "Chefs", href: "/search?scope=chefs" },
        ]}
        value="recipes"
      />
    </>
  );
}

/** The parts that show a selection or a primary tone without being the main action. */
const selection = [
  '[data-probe="soft button"]',
  '[data-probe="outline button"]',
  '[data-probe="plain button"]',
  '[data-probe="primary link"]',
  '[data-ouro-control="checkbox"][data-ouro-part="box"]',
  '[data-ouro-control="switch"][data-ouro-part="track"]',
  "[data-ouro-switch-thumb]",
  '[data-ouro-control="radio-group"][data-ouro-part="circle"][data-checked]',
  "[data-ouro-radio-dot]",
  '[data-ouro-control="toggle"]',
  '[role="tab"][aria-selected="true"]',
  "[data-ouro-tabs-indicator]",
  '[data-ouro-part="link"][aria-current="page"] [data-ouro-tabs-indicator]',
];

const painted = ["background-color", "color", "border-top-color", "outline-color"] as const;

async function render(tokens: boolean): Promise<HTMLElement> {
  const host = document.createElement("div");
  host.style.background = "var(--background)";
  host.style.padding = "16px";
  if (tokens) {
    host.style.setProperty("--ouro-action", action);
    host.style.setProperty("--ouro-action-foreground", onAction);
  }
  document.body.append(host);
  mounted.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(<Scene />));
  await expect.poll(() => host.getAnimations({ subtree: true }).length).toBe(0);
  return host;
}

function colours(host: HTMLElement, properties: readonly string[] = painted): Record<string, Record<string, string>> {
  return Object.fromEntries(
    selection.map((selector) => {
      const element = host.querySelector(selector);
      expect(element, selector).not.toBeNull();
      const style = getComputedStyle(element!);
      return [selector, Object.fromEntries(properties.map((property) => [property, style.getPropertyValue(property)]))];
    }),
  );
}

/** What forced colours paint that the action token could change: fill, label and focus ring. */
const forcedPainted = ["background-color", "color", "outline-color"];

/** A token's colour as the browser resolves it inside `host`. */
function resolved(host: HTMLElement, variable: string): string {
  const probe = document.createElement("i");
  probe.style.backgroundColor = `var(${variable})`;
  host.append(probe);
  const value = getComputedStyle(probe).backgroundColor;
  probe.remove();
  return value;
}

const probe = (host: HTMLElement, name: string) => host.querySelector<HTMLElement>(`[data-probe="${name}"]`)!;

describe("the action token", () => {
  it("repaints the solid primary Button, as a button and as a link, and leaves every selection on --primary", async () => {
    const plain = await render(false);
    const themed = await render(true);
    for (const name of ["solid button", "solid link button", "disabled solid button"]) {
      expect(getComputedStyle(probe(themed, name)).backgroundColor, name).toBe(action);
      expect(getComputedStyle(probe(themed, name)).color, name).toBe(onAction);
      expect(getComputedStyle(probe(plain, name)).backgroundColor, name).toBe(resolved(plain, "--primary"));
      expect(getComputedStyle(probe(plain, name)).color, name).toBe(resolved(plain, "--primary-foreground"));
    }
    expect(colours(themed)).toEqual(colours(plain));
    // The current link of link-mode Tabs is a selection too, so its line stays on --primary.
    const line = themed.querySelector('[data-ouro-part="link"][aria-current="page"] [data-ouro-tabs-indicator]')!;
    expect(getComputedStyle(line).backgroundColor).toBe(resolved(themed, "--primary"));
    expect(getComputedStyle(line).backgroundColor).not.toBe(action);
  });

  it("drives the Button's hover and press layer and its disabled look from the action's colours", async () => {
    const themed = await render(true);
    // The state layer is the label's colour, so hover and press wash the action in its own foreground.
    expect(getComputedStyle(probe(themed, "solid button"), "::before").backgroundColor).toBe(onAction);
    const disabled = getComputedStyle(probe(themed, "disabled solid button"));
    expect(disabled.backgroundColor).toBe(action);
    expect(Number(disabled.opacity)).toBe(0.5);
  });

  it("follows a theme scoped to part of the page and its dark values", async () => {
    const style = document.createElement("style");
    style.textContent = `[data-action-scope] { --ouro-action: ${action}; } .dark [data-action-scope] { --ouro-action: ${onAction}; --ouro-action-foreground: ${action}; }`;
    document.head.append(style);
    mounted.push(style);
    const host = await render(false);
    const button = probe(host, "solid button");
    // The button eases its colours, so read them once the change has run.
    const look = () => [getComputedStyle(button).backgroundColor, getComputedStyle(button).color];
    host.setAttribute("data-action-scope", "");
    // Only the fill is set in light, so the label keeps --primary-foreground.
    await expect.poll(look).toEqual([action, resolved(host, "--primary-foreground")]);
    document.documentElement.classList.add("dark");
    await expect.poll(look).toEqual([onAction, action]);
  });

  // Only Chromium forces the colours; WebKit matches the media query without repainting anything.
  it.skipIf(server.browser !== "chromium")("leaves forced colours as they were: the system's colours replace the action's", async () => {
    await commands.emulateMedia({ forcedColors: "active" });
    expect(matchMedia("(forced-colors: active)").matches).toBe(true);
    const plain = await render(false);
    const themed = await render(true);
    const buttons = (host: HTMLElement) =>
      Object.fromEntries(
        ["solid button", "solid link button", "disabled solid button"].map((name) => {
          const style = getComputedStyle(probe(host, name));
          // A transparent border is left out: under forced colours Chromium on Linux can leave it
          // part way through its ease.
          return [name, Object.fromEntries(forcedPainted.map((property) => [property, style.getPropertyValue(property)]))];
        }),
      );
    // A colour still easing into its forced value settles before the two are compared.
    await expect.poll(() => buttons(themed)).toEqual(buttons(plain));
    await expect.poll(() => colours(themed, forcedPainted)).toEqual(colours(plain, forcedPainted));
  });
});

// Contrast of the main action in each of the site's presets, which `Copy theme` hands to apps.

type Rgb = [number, number, number];
const canvas = document.createElement("canvas");
canvas.width = canvas.height = 1;
const context = canvas.getContext("2d", { willReadFrequently: true })!;

/** A CSS colour composited over `below`, as sRGB. */
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

/** The colour behind an element: every background from the page down, composited. */
function backdrop(element: Element): Rgb {
  const chain: Element[] = [];
  for (let node: Element | null = element; node; node = node.parentElement) chain.unshift(node);
  return chain.reduce<Rgb>((below, node) => over(getComputedStyle(node).backgroundColor, below), [255, 255, 255]);
}

describe("the action in every site preset", () => {
  // The presets' fonts are served by the site, not this test page.
  const css = presetsCss.replace(/@font-face\s*\{[^}]*\}/g, "");

  for (const { name } of presets) {
    for (const scheme of ["light", "dark"] as const) {
      it(`${name} (${scheme}) keeps the solid primary Button's label at 4.5:1 or more`, async () => {
        const style = document.createElement("style");
        style.textContent = css;
        document.head.append(style);
        mounted.push(style);
        document.documentElement.classList.toggle("dark", scheme === "dark");
        const host = document.createElement("div");
        host.setAttribute("data-theme", name);
        host.style.background = "var(--background)";
        document.body.append(host);
        mounted.push(host);
        const root = createRoot(host);
        roots.push(root);
        await act(async () => root.render(<Button data-probe="action">Save</Button>));
        const button = probe(host, "action");
        const behind = backdrop(button);
        const value = ratio(over(getComputedStyle(button).color, behind), behind);
        expect(value, `${name} ${scheme}: ${value.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
        if (name === "cookbook") {
          // Spoonjoy's charcoal (amber in the dark) action, not its brass selection.
          expect(getComputedStyle(button).backgroundColor).toBe(resolved(host, "--sj-action"));
          expect(getComputedStyle(button).backgroundColor).not.toBe(resolved(host, "--primary"));
        }
      });
    }
  }
});
