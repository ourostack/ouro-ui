import { createRef, useState, type ReactNode } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { Slider, type SliderProps } from "@/registry/ouro/components/ouro/slider/slider";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

const roots: Root[] = [];
let mounted: Element[] = [];

async function render(node: ReactNode) {
  const host = document.createElement("div");
  host.style.padding = "24px";
  host.style.width = "360px";
  document.body.append(host);
  mounted.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
  return {
    host,
    rerender: (next: ReactNode) => act(async () => root.render(next)),
    get root() {
      return host.querySelector<HTMLElement>('[data-ouro="slider"]')!;
    },
    get inputs() {
      return [...host.querySelectorAll<HTMLInputElement>('input[type="range"]')];
    },
    get thumbs() {
      return [...host.querySelectorAll<HTMLElement>("[data-ouro-slider-thumb]")];
    },
    get output() {
      return host.querySelector<HTMLElement>("[data-ouro-slider-value]");
    },
  };
}

const describedBy = (element: Element) => (element.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean);

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(async () => {
  vi.restoreAllMocks();
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  for (const node of mounted) node.remove();
  mounted = [];
  await page.viewport(414, 896);
});

describe("Slider", () => {
  it("is a labeled range input built on the Field contract", async () => {
    const { root, inputs } = await render(<Slider label="Servings" name="servings" defaultValue={4} min={1} max={12} />);
    expect(root.getAttribute("data-ouro")).toBe("slider");
    expect(inputs).toHaveLength(1);
    expect(inputs[0]!.labels![0]!.textContent).toBe("Servings");
    expect(inputs[0]!.value).toBe("4");
    expect(inputs[0]!.min).toBe("1");
    expect(inputs[0]!.max).toBe("12");
    expect(inputs[0]!.name).toBe("servings");
    await expect.element(page.getByRole("slider", { name: "Servings" })).toBeVisible();
    expect(warn).not.toHaveBeenCalled();
  });

  it("wires description, error and disabled through Field", async () => {
    const { host, inputs, root, rerender } = await render(
      <Slider label="Heat" description="How spicy." error="Too hot." defaultValue={50} />,
    );
    expect(describedBy(inputs[0]!).map((id) => host.querySelector(`#${CSS.escape(id)}`)!.textContent)).toEqual(["How spicy.", "Too hot."]);
    expect(inputs[0]!.getAttribute("aria-invalid")).toBe("true");
    await rerender(<Slider label="Heat" disabled defaultValue={50} />);
    expect(inputs[0]!.disabled).toBe(true);
    expect(root.querySelector("[data-ouro-slider-control]")!.hasAttribute("data-disabled")).toBe(true);
  });

  it("steps with the keyboard and reports the value", async () => {
    const onValueChange = vi.fn();
    const onValueCommitted = vi.fn();
    const { inputs } = await render(
      <Slider label="Servings" defaultValue={4} step={2} onValueChange={onValueChange} onValueCommitted={onValueCommitted} />,
    );
    inputs[0]!.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(inputs[0]!.value).toBe("6");
    expect(onValueChange).toHaveBeenLastCalledWith(6);
    expect(onValueCommitted).toHaveBeenLastCalledWith(6);
  });

  it("follows a controlled value", async () => {
    function Controlled() {
      const [value, setValue] = useState(30);
      return (
        <>
          <Slider label="Volume" value={value} onValueChange={setValue} showValue />
          <button type="button" onClick={() => setValue(70)}>
            Louder
          </button>
        </>
      );
    }
    const { inputs, output, host } = await render(<Controlled />);
    expect(output!.textContent).toBe("30");
    await userEvent.click(host.querySelector("button")!);
    expect(inputs[0]!.value).toBe("70");
    expect(output!.textContent).toBe("70");
  });

  it("gives a value array a thumb per value, each named", async () => {
    const onValueChange = vi.fn();
    const { inputs, thumbs, host } = await render(
      <Slider label="Price" name="price" defaultValue={[20, 80]} onValueChange={onValueChange} showValue />,
    );
    expect(inputs).toHaveLength(2);
    expect(thumbs).toHaveLength(2);
    expect(inputs.map((input) => input.getAttribute("aria-label"))).toEqual(["Minimum, Price", "Maximum, Price"]);
    expect(inputs.map((input) => input.value)).toEqual(["20", "80"]);
    // The visible label names the group; each thumb has its own name.
    const label = host.querySelector("label")!;
    expect(label.hasAttribute("for")).toBe(false);
    expect(host.querySelector('[role="group"]')!.getAttribute("aria-labelledby")).toBe(label.id);
    await expect.element(page.getByRole("group", { name: "Price" })).toBeVisible();
    inputs[1]!.focus();
    await userEvent.keyboard("{ArrowLeft}");
    expect(onValueChange).toHaveBeenLastCalledWith([20, 79]);
    expect(warn).not.toHaveBeenCalled();
  });

  it("translates the thumb names", async () => {
    const { inputs } = await render(<Slider label="Preis" defaultValue={[1, 2]} thumbLabels={["Von", "Bis"]} />);
    expect(inputs.map((input) => input.getAttribute("aria-label"))).toEqual(["Von, Preis", "Bis, Preis"]);
  });

  it("shows the formatted value with showValue, and a range with an en dash", async () => {
    const { host } = await render(
      <>
        <Slider label="Tip" defaultValue={0.15} min={0} max={0.3} step={0.01} format={{ style: "percent" }} showValue locale="en-US" />
        <Slider label="Budget" defaultValue={[10, 40]} max={100} format={{ style: "currency", currency: "USD", maximumFractionDigits: 0 }} showValue locale="en-US" />
        <Slider label="Plain" defaultValue={5} />
      </>,
    );
    const outputs = [...host.querySelectorAll("[data-ouro-slider-value]")];
    expect(outputs.map((output) => output.textContent)).toEqual(["15%", "$10 – $40"]);
    const tip = host.querySelector<HTMLInputElement>('input[type="range"]')!;
    expect(tip.getAttribute("aria-valuetext")).toBe("15%");
  });

  it("forwards its ref to the first thumb's input", async () => {
    const ref = createRef<HTMLInputElement>();
    const { inputs } = await render(<Slider label="Volume" ref={ref} />);
    expect(ref.current).toBe(inputs[0]);
  });

  it("lets app layout classes win on the root", async () => {
    const { root } = await render(<Slider label="Volume" className="mt-6" />);
    expect(getComputedStyle(root).marginTop).toBe("24px");
  });

  it("moves the thumb when the track is pressed", async () => {
    const onValueChange = vi.fn();
    const { host } = await render(<Slider label="Volume" defaultValue={0} onValueChange={onValueChange} />);
    const control = host.querySelector<HTMLElement>("[data-ouro-slider-control]")!;
    await userEvent.click(control, { position: { x: control.offsetWidth - 2, y: control.offsetHeight / 2 } });
    expect(onValueChange.mock.lastCall![0]).toBeGreaterThan(90);
  });
});

describe("Slider looks", () => {
  it("gives the thumb a 44px hit area only on a coarse pointer", async () => {
    const { thumbs } = await render(<Slider label="Volume" />);
    const target = thumbs[0]!.querySelector<HTMLElement>("[data-ouro-touch-target]")!;
    expect(getComputedStyle(target).display).toBe("none");
  });

  it("outlines the thumb while its input has keyboard focus", async () => {
    const { thumbs, inputs } = await render(<Slider label="Volume" />);
    expect(getComputedStyle(thumbs[0]!).outlineStyle).toBe("none");
    inputs[0]!.focus();
    await userEvent.keyboard("{ArrowRight}");
    await expect.poll(() => getComputedStyle(thumbs[0]!).outlineStyle).toBe("solid");
  });

  it("marks the track with the destructive color when invalid", async () => {
    const { host } = await render(
      <>
        <Slider label="Valid" defaultValue={50} />
        <Slider label="Invalid" defaultValue={50} error="Too much." />
      </>,
    );
    const [valid, invalid] = [...host.querySelectorAll<HTMLElement>("[data-ouro-slider-indicator]")];
    expect(getComputedStyle(invalid!).backgroundColor).not.toBe(getComputedStyle(valid!).backgroundColor);
  });
});

describe("Slider development messages", () => {
  it.each([
    ["errorMessage", { errorMessage: "Required." }, "errorMessage is not a prop", '<Slider error="Required.">'],
    ["helperText", { helperText: "Hint" }, "helperText is not a prop", '<Slider description="Hint">'],
    ["isInvalid", { isInvalid: true }, "isInvalid is not a prop", '<Slider error="What is wrong">'],
    ["invalid", { invalid: true }, "invalid is not a prop", '<Slider error="What is wrong">'],
    ["isDisabled", { isDisabled: true }, "isDisabled is not a prop", "<Slider disabled>"],
    ["isRequired", { isRequired: true }, "isRequired is not a prop; a slider always has a value", "<Slider defaultValue={50}>"],
    ["required", { required: true }, "required is not a prop; a slider always has a value", "<Slider defaultValue={50}>"],
    ["range", { range: true }, "range is not a prop; a value array gives a thumb per value", "<Slider defaultValue={[20, 80]}>"],
    ["minValue", { minValue: 1 }, "minValue is not a prop", "<Slider min={1}>"],
    ["maxValue", { maxValue: 9 }, "maxValue is not a prop", "<Slider max={9}>"],
    ["onChange", { onChange: () => {} }, "onChange is not a prop", "<Slider onValueChange={(value) => …}>"],
    ["valueLabelDisplay", { valueLabelDisplay: "on" }, "valueLabelDisplay is not a prop", "<Slider showValue>"],
    ["showTooltip", { showTooltip: true }, "showTooltip is not a prop", "<Slider showValue>"],
  ])("warns for %s with the fix", async (name, extra, problem, fix) => {
    const props = { label: "Volume", ...extra } as unknown as SliderProps;
    const { host } = await render(<Slider {...props} />);
    expect(warn).toHaveBeenCalledWith(`[ouro-ui] Slider: ${problem}. Fix: ${fix}.`);
    for (const element of host.querySelectorAll("*")) expect(element.hasAttribute(name.toLowerCase())).toBe(false);
  });

  it("warns when a range has the wrong number of thumb names", async () => {
    await render(<Slider label="Price" defaultValue={[1, 2, 3]} thumbLabels={["Low", "High"]} />);
    expect(warn).toHaveBeenCalledWith(
      '[ouro-ui] Slider: thumbLabels has 2 names for 3 thumbs. Fix: <Slider thumbLabels={["Minimum", "Middle", "Maximum"]}>.',
    );
  });

  it("names Slider in Field's messages", async () => {
    const { rerender } = await render(<Slider label="" className="bg-red-500" />);
    await rerender(<Slider label="" className="bg-red-500" />);
    expect(warn.mock.calls.map((call: unknown[]) => call[0])).toEqual([
      '[ouro-ui] Slider: "bg-red-500" sets appearance, and className is for layout only. Fix: <Slider error="What is wrong">.',
      '[ouro-ui] Slider: label is empty, so the control has no name. Fix: <Slider label="Email" hideLabel> to hide a label you still need.',
    ]);
  });
});

describe("Slider server rendering", () => {
  const node = (
    <div>
      <Slider label="Heat" name="heat" description="How spicy." error="Too hot." defaultValue={50} showValue />
      <Slider label="Price" name="price" defaultValue={[20, 80]} description="Per jar." />
    </div>
  );

  it("renders the label, description and error ids on the server", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const doc = new DOMParser().parseFromString(renderToString(node), "text/html");
    const [heat, low, high] = [...doc.querySelectorAll('input[type="range"]')];
    expect(doc.querySelector(`label[for="${heat!.id}"]`)!.textContent).toBe("Heat");
    expect(describedBy(heat!).map((id) => doc.getElementById(id)!.textContent)).toEqual(["How spicy.", "Too hot."]);
    expect(heat!.getAttribute("aria-invalid")).toBe("true");
    for (const thumb of [low!, high!]) expect(describedBy(thumb).map((id) => doc.getElementById(id)!.textContent)).toEqual(["Per jar."]);
    expect(doc.querySelector("[data-ouro-slider-value]")!.textContent).toBe("50");
    expect(error).not.toHaveBeenCalled();
  });

  it("hydrates with the same ids and no hydration warning", async () => {
    const host = document.createElement("div");
    host.innerHTML = renderToString(node);
    document.body.append(host);
    mounted.push(host);
    const snapshot = () =>
      [...host.querySelectorAll("label, input, [id]")].map((el) => [el.tagName, el.id, el.getAttribute("for"), el.getAttribute("aria-describedby")]);
    const before = snapshot();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const recoverable = vi.fn();
    let root!: Root;
    await act(async () => {
      root = hydrateRoot(host, node, { onRecoverableError: recoverable });
    });
    roots.push(root);
    expect(snapshot()).toEqual(before);
    expect(recoverable).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
});
