import { afterEach, describe, expect, it } from "vitest";
import { type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { pageCss } from "@/registry/ouro/lib/ouro/testing/page-css";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Card } from "@/registry/ouro/components/ouro/card/card";
import { Checkbox } from "@/registry/ouro/components/ouro/checkbox/checkbox";
import { Combobox } from "@/registry/ouro/components/ouro/combobox/combobox";
import { NumberField } from "@/registry/ouro/components/ouro/number-field/number-field";
import { NativeSelect } from "@/registry/ouro/components/ouro/select/native-select";
import { Select } from "@/registry/ouro/components/ouro/select/select";
import { SegmentedControl } from "@/registry/ouro/components/ouro/segmented-control/segmented-control";
import { TextField } from "@/registry/ouro/components/ouro/text-field/text-field";
import { Toggle } from "@/registry/ouro/components/ouro/toggle/toggle";

const roots: { root: Root; host: HTMLElement }[] = [];
const styles: HTMLStyleElement[] = [];

async function mount(node: ReactNode, tokens: Record<string, string> = {}) {
  const host = document.createElement("div");
  for (const [name, value] of Object.entries(tokens)) host.style.setProperty(name, value);
  document.body.append(host);
  const root = createRoot(host);
  roots.push({ root, host });
  await act(() => root.render(node));
  return host;
}

afterEach(async () => {
  for (const { root, host } of roots.splice(0)) {
    await act(() => root.unmount());
    host.remove();
  }
  for (const style of styles.splice(0)) style.remove();
});

const capsule = { "--ouro-control-radius": "9999px", "--ouro-control-corner-shape": "round" };
const circleChecks = { "--ouro-check-radius": "9999px", "--ouro-check-corner-shape": "round" };

/** The px radius of an element's top start corner. */
const radiusOf = (el: Element) => Number.parseFloat(getComputedStyle(el).borderTopLeftRadius);
/** The value of a custom property on an element, trimmed. */
const varOf = (el: Element, name: string) => getComputedStyle(el).getPropertyValue(name).trim();
/** The px value of one of ouro-base's --radius-ouro-* steps, read from a probe inside the host, so a theme the test sets applies. */
function step(host: HTMLElement, utility: string) {
  const probe = document.createElement("div");
  probe.className = utility;
  host.append(probe);
  const value = radiusOf(probe);
  probe.remove();
  return value;
}

/** The fallback rules as an engine without corner-shape applies them: the same blocks, with their condition taken off. */
function applyFallback() {
  const blocks = [...pageCss().matchAll(/@supports not \(corner-shape: squircle\)\s*\{((?:[^{}]*\{[^{}]*\})*)\s*\}/g)].map((match) => match[1]);
  const style = document.createElement("style");
  style.textContent = blocks.join("\n");
  document.head.append(style);
  styles.push(style);
}

/** Every control the control-shape tokens reach, one of each. */
function controls() {
  return (
    <>
      <Button>Save</Button>
      <Toggle label="Bold" variant="outline" />
      <SegmentedControl label="View" items={[{ value: "list", label: "List" }, { value: "grid", label: "Grid" }]} />
      <TextField label="Search recipes" type="search" />
      <Select label="Course" options={[{ value: "main", label: "Main" }]} />
      <NativeSelect label="Country" options={[{ value: "nz", label: "New Zealand" }]} />
      <NumberField label="Servings" defaultValue={4} />
      <Combobox label="Herb" items={["Basil", "Dill"]} />
    </>
  );
}

/** The nearest element at or around `el`, inside its component, whose corners are rounded: the one that draws the field's frame. */
function framed(el: HTMLElement): HTMLElement {
  let node: HTMLElement = el;
  while (radiusOf(node) === 0 && !node.hasAttribute("data-ouro")) node = node.parentElement!;
  return node;
}

/** The element of each control that draws its frame. */
function frames(host: HTMLElement) {
  const one = (selector: string) => framed(host.querySelector<HTMLElement>(selector)!);
  return {
    button: one('[data-ouro="button"]'),
    toggle: one('[data-ouro="toggle"]'),
    segmented: one('[data-ouro="segmented-control"] [role="radiogroup"], [data-ouro="segmented-control"][role="radiogroup"]'),
    textField: one('[data-ouro="text-field"] input'),
    select: one('[data-ouro="select"] [data-ouro-part="trigger"]'),
    nativeSelect: one('[data-ouro="native-select"] select'),
    numberField: one('[data-ouro="number-field"] input'),
    combobox: one('[data-ouro="combobox"] input'),
  };
}

describe("control shape tokens", () => {
  it("leave every control on the theme's own corners while unset", async () => {
    const host = await mount(controls());
    const lg = step(host, "rounded-ouro-lg");
    const md = step(host, "rounded-ouro-md");
    const f = frames(host);
    expect(radiusOf(f.button)).toBeCloseTo(lg, 1);
    expect(radiusOf(f.toggle)).toBeCloseTo(lg, 1);
    expect(radiusOf(f.segmented)).toBeCloseTo(lg, 1);
    for (const [name, field] of Object.entries({ textField: f.textField, select: f.select, nativeSelect: f.nativeSelect, numberField: f.numberField, combobox: f.combobox }))
      expect(radiusOf(field), name).toBeCloseTo(md, 1);
    for (const frame of Object.values(f)) expect(varOf(frame, "--corner-shape")).toBe(varOf(document.documentElement, "--ouro-corner-shape"));
  });

  it("make every control a capsule when a theme sets them to 9999px and round", async () => {
    const host = await mount(controls(), capsule);
    for (const [name, frame] of Object.entries(frames(host))) {
      expect(radiusOf(frame), name).toBeCloseTo(frame.getBoundingClientRect().height / 2, 0);
      expect(varOf(frame, "--corner-shape"), name).toBe("round");
    }
    const thumb = host.querySelector<HTMLElement>("[data-ouro-segment-thumb]")!;
    expect(radiusOf(thumb)).toBeGreaterThanOrEqual(thumb.getBoundingClientRect().height / 2 - 0.5);
    expect(varOf(thumb, "--corner-shape")).toBe("round");
  });

  it("make every control a squircle capsule at 9999px in the theme's squircle, its radius half its height", async () => {
    const host = await mount(controls(), { "--ouro-control-radius": "9999px" });
    for (const [name, frame] of Object.entries(frames(host))) {
      expect(radiusOf(frame), name).toBeCloseTo(frame.getBoundingClientRect().height / 2, 0);
      expect(varOf(frame, "--corner-shape"), name).toBe(varOf(document.documentElement, "--ouro-corner-shape"));
    }
  });

  it("keep a squircle capsule's own corner at 0.7 of half its height where the engine has no corner-shape, never a half circle", async () => {
    applyFallback();
    const host = await mount(controls(), { "--ouro-control-radius": "9999px" });
    for (const [name, frame] of Object.entries(frames(host))) {
      const half = frame.getBoundingClientRect().height / 2;
      expect(radiusOf(frame), name).toBeCloseTo(half * 0.7, 0);
    }
    // The stepper inside the number field rounds concentric with the field, inside its frame.
    const field = frames(host).numberField;
    const stepper = host.querySelector<HTMLElement>('[data-ouro="number-field"] button')!;
    expect(radiusOf(stepper)).toBeCloseTo(radiusOf(field) - 1, 0);
  });

  it("leave cards and the checkbox's box on the theme's corners when only the control tokens are set", async () => {
    const host = await mount(
      <>
        <Card title="Lemon rice">Serves 4</Card>
        <Checkbox label="Lemons" />
      </>,
      capsule,
    );
    const card = host.querySelector<HTMLElement>('[data-ouro="card"]')!;
    expect(radiusOf(card)).toBeLessThan(100);
    expect(radiusOf(host.querySelector('[role="checkbox"]')!)).toBeCloseTo(step(host, "rounded-ouro-sm"), 1);
  });

  it("round the checkbox's box into a circle when a theme sets the check tokens", async () => {
    const host = await mount(<Checkbox label="Lemons" />, circleChecks);
    const box = host.querySelector<HTMLElement>('[role="checkbox"]')!;
    expect(radiusOf(box)).toBeGreaterThanOrEqual(9999 * 0.7 - 1);
    expect(varOf(box, "--corner-shape")).toBe("round");
  });

  it("clip a capsule's surface with circular arcs where the engine has no corner-shape, and keep a squircle for the rest", async () => {
    applyFallback();
    const pill = await mount(<Button variant="outline">Save</Button>, capsule);
    const surface = pill.querySelector<HTMLElement>("[data-ouro-surface]")!;
    expect(getComputedStyle(surface).display).toBe("block");
    expect(getComputedStyle(surface).clipPath).toMatch(/^inset\(/);
    // The ring's corner is the capsule's: half the button's height.
    expect(Number.parseFloat(getComputedStyle(surface, "::after").borderTopLeftRadius)).toBeCloseTo(pill.querySelector("button")!.getBoundingClientRect().height / 2, 0);
    const plain = await mount(<Button variant="outline">Save</Button>);
    expect(getComputedStyle(plain.querySelector<HTMLElement>("[data-ouro-surface]")!).clipPath).toMatch(/^(shape|polygon)\(/);
  });
});
