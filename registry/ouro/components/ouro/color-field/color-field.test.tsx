import { createRef, useState, type ReactNode } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { ColorField, type ColorFieldProps } from "@/registry/ouro/components/ouro/color-field/color-field";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

const roots: Root[] = [];
let mounted: Element[] = [];

async function render(node: ReactNode) {
  const host = document.createElement("div");
  host.style.padding = "24px";
  host.style.maxWidth = "420px";
  document.body.append(host);
  mounted.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
  return {
    host,
    rerender: (next: ReactNode) => act(async () => root.render(next)),
    get root() {
      return host.querySelector<HTMLElement>('[data-ouro="color-field"]')!;
    },
    get text() {
      return host.querySelector<HTMLInputElement>('input[type="text"]')!;
    },
    get picker() {
      return host.querySelector<HTMLInputElement>('input[type="color"]')!;
    },
    get box() {
      return host.querySelector<HTMLElement>("[data-ouro-input-group]")!;
    },
  };
}

/** The ids an element's `aria-describedby` lists. */
const describedBy = (element: Element) => (element.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean);

/** Picks a color in the native picker, as the OS dialog does. */
async function pick(picker: HTMLInputElement, color: string) {
  await act(async () => {
    // Through the prototype's setter, as the browser sets it, so React sees a change.
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(picker, color);
    picker.dispatchEvent(new Event("input", { bubbles: true }));
    picker.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

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

describe("ColorField", () => {
  it("is a labeled hex text input with a native color picker, on the Field contract", async () => {
    const { root, text, picker } = await render(<ColorField label="Accent color" name="accent" defaultValue="#3366FF" />);
    expect(root.getAttribute("data-ouro")).toBe("color-field");
    expect(text.labels![0]!.textContent).toBe("Accent color");
    expect(text.value).toBe("#3366ff");
    expect(text.name).toBe("accent");
    expect(picker.value).toBe("#3366ff");
    expect(picker.getAttribute("aria-label")).toBe("Pick a color");
    expect(picker.name).toBe("");
    await expect.element(page.getByRole("textbox", { name: "Accent color" })).toBeVisible();
    expect(text.getAttribute("autocomplete")).toBe("off");
    expect(text.spellcheck).toBe(false);
  });

  it("starts at black without a value", async () => {
    const { text, picker } = await render(<ColorField label="Color" />);
    expect(text.value).toBe("#000000");
    expect(picker.value).toBe("#000000");
  });

  it("moves the picker as a valid hex is typed, in any of its forms", async () => {
    const onValueChange = vi.fn();
    const { text, picker } = await render(<ColorField label="Color" onValueChange={onValueChange} />);
    await userEvent.clear(text);
    await userEvent.type(text, "f0");
    expect(picker.value).toBe("#000000");
    expect(onValueChange).not.toHaveBeenCalled();
    await userEvent.type(text, "8");
    expect(picker.value).toBe("#ff0088");
    expect(onValueChange).toHaveBeenLastCalledWith("#ff0088");
    await userEvent.type(text, "0a1");
    expect(picker.value).toBe("#f080a1");
    expect(onValueChange).toHaveBeenLastCalledWith("#f080a1");
  });

  it("writes the picked color into the text input", async () => {
    const onValueChange = vi.fn();
    const { text, picker } = await render(<ColorField label="Color" onValueChange={onValueChange} />);
    await pick(picker, "#12ab34");
    expect(text.value).toBe("#12ab34");
    expect(onValueChange).toHaveBeenLastCalledWith("#12ab34");
  });

  it("tidies the text when the input loses focus, and puts back the last color when it is not a hex", async () => {
    const { text } = await render(<ColorField label="Color" defaultValue="#112233" />);
    await userEvent.clear(text);
    await userEvent.type(text, "ABC");
    await userEvent.tab();
    expect(text.value).toBe("#aabbcc");
    await userEvent.clear(text);
    await userEvent.type(text, "blue");
    await userEvent.tab();
    expect(text.value).toBe("#aabbcc");
  });

  it("submits the color as #rrggbb even while the text is untidy", async () => {
    let submitted: FormDataEntryValue | null = null;
    const { text, host } = await render(
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submitted = new FormData(event.currentTarget).get("accent");
        }}
      >
        <ColorField label="Accent" name="accent" defaultValue="#000000" />
        <button type="submit">Save</button>
      </form>,
    );
    await userEvent.clear(text);
    await userEvent.type(text, "F0A");
    await userEvent.click(host.querySelector("button")!);
    expect(submitted).toBe("#ff00aa");
  });

  it("submits a required field whose text was cleared, with its color", async () => {
    let submitted: FormDataEntryValue | null = null;
    const { text } = await render(
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submitted = new FormData(event.currentTarget).get("accent");
        }}
      >
        <ColorField label="Accent" name="accent" defaultValue="#3366ff" required />
        <button type="submit">Save</button>
      </form>,
    );
    // Enter submits while the text is still empty (a click would tidy it on blur first).
    await userEvent.clear(text);
    await userEvent.keyboard("{Enter}");
    expect(submitted).toBe("#3366ff");
  });

  it("goes back to defaultValue when the form resets", async () => {
    const onValueChange = vi.fn();
    const { text, picker, host } = await render(
      <form>
        <ColorField label="Accent" name="accent" defaultValue="#3366ff" onValueChange={onValueChange} />
        <ColorField label="Border" name="border" />
        <button type="reset">Reset</button>
      </form>,
    );
    const border = host.querySelectorAll<HTMLInputElement>('input[type="color"]')[1]!;
    await pick(border, "#00ff00");
    await pick(picker, "#ff0000");
    expect(text.value).toBe("#ff0000");
    await userEvent.click(host.querySelector("button")!);
    await expect.poll(() => text.value).toBe("#3366ff");
    expect(picker.value).toBe("#3366ff");
    expect(onValueChange).toHaveBeenLastCalledWith("#3366ff");
    expect(new FormData(host.querySelector("form")!).get("accent")).toBe("#3366ff");
    // Without defaultValue, it goes back to black.
    expect(border.value).toBe("#000000");
  });

  it("leaves a controlled color to the app when the form resets", async () => {
    const onValueChange = vi.fn();
    const { text, host } = await render(
      <form>
        <ColorField label="Accent" value="#ff0000" onValueChange={onValueChange} />
        <button type="reset">Reset</button>
      </form>,
    );
    await userEvent.click(host.querySelector("button")!);
    await expect.poll(() => text.value).toBe("#ff0000");
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it("shows a plain swatch and keeps the hex text where the browser has no color picker", async () => {
    // A browser without <input type="color"> reports the type as text.
    const type = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "type")!;
    vi.spyOn(HTMLInputElement.prototype, "type", "get").mockImplementation(function (this: HTMLInputElement) {
      const attribute = this.getAttribute("type");
      return attribute === "color" ? "text" : (type.get!.call(this) as string);
    });
    const onValueChange = vi.fn();
    const { host, picker, text } = await render(<ColorField label="Accent" defaultValue="#3366ff" onValueChange={onValueChange} />);
    expect(picker).toBeNull();
    const swatch = host.querySelector<HTMLElement>("[data-ouro-color-swatch]")!;
    expect(swatch.getAttribute("aria-hidden")).toBe("true");
    expect(getComputedStyle(swatch).backgroundColor).toBe("rgb(51, 102, 255)");
    await userEvent.clear(text);
    await userEvent.type(text, "#ff0000");
    expect(onValueChange).toHaveBeenLastCalledWith("#ff0000");
    expect(getComputedStyle(swatch).backgroundColor).toBe("rgb(255, 0, 0)");
  });

  it("adds nothing to the form data without a name, or while disabled", async () => {
    const { host } = await render(
      <form>
        <ColorField label="Unnamed" defaultValue="#111111" />
        <ColorField label="Disabled" name="off" defaultValue="#222222" disabled />
      </form>,
    );
    expect([...new FormData(host.querySelector("form")!).keys()]).toEqual([]);
  });

  it("does not report a color it already has", async () => {
    const onValueChange = vi.fn();
    const { text } = await render(<ColorField label="Color" defaultValue="#123456" onValueChange={onValueChange} />);
    await userEvent.click(text);
    await userEvent.keyboard("{End}{Backspace}6");
    expect(text.value).toBe("#123456");
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it("follows a controlled value", async () => {
    function Controlled() {
      const [color, setColor] = useState("#000000");
      return (
        <>
          <ColorField label="Color" value={color} onValueChange={setColor} />
          <button type="button" onClick={() => setColor("#ffffff")}>
            White
          </button>
          <output>{color}</output>
        </>
      );
    }
    const { host, text, picker } = await render(<Controlled />);
    await pick(picker, "#00ff00");
    expect(host.querySelector("output")!.textContent).toBe("#00ff00");
    expect(text.value).toBe("#00ff00");
    await userEvent.click(host.querySelector("button")!);
    expect(text.value).toBe("#ffffff");
    expect(picker.value).toBe("#ffffff");
  });

  it("names the picker with pickerLabel", async () => {
    const { picker } = await render(<ColorField label="Farbe" pickerLabel="Farbe wählen" />);
    expect(picker.getAttribute("aria-label")).toBe("Farbe wählen");
  });

  it("wires description, error, required and disabled through Field, to both inputs", async () => {
    const { host, text, picker, rerender } = await render(
      <ColorField label="Color" description="Used for buttons." error="Pick a darker color." required />,
    );
    expect(describedBy(text).map((id) => host.querySelector(`#${CSS.escape(id)}`)!.textContent)).toEqual([
      "Used for buttons.",
      "Pick a darker color.",
    ]);
    expect(describedBy(picker)).toEqual(describedBy(text));
    expect(text.getAttribute("aria-invalid")).toBe("true");
    // A color always has a value, so required marks the field but never blocks the submit.
    expect(text.getAttribute("aria-required")).toBe("true");
    expect(text.required).toBe(false);
    expect(host.querySelector("[data-ouro-required]")).not.toBeNull();
    await rerender(<ColorField label="Color" disabled />);
    expect(text.disabled).toBe(true);
    expect(picker.disabled).toBe(true);
  });

  it("gives the swatch a 44px hit area on phones, and the box 44px with 16px text", async () => {
    await page.viewport(390, 844);
    const { box, text } = await render(<ColorField label="Color" />);
    expect(box.getBoundingClientRect().height).toBe(44);
    expect(getComputedStyle(text).fontSize).toBe("16px");
    await page.viewport(1280, 800);
    await expect.poll(() => box.getBoundingClientRect().height).toBe(36);
  });

  it("outlines the box when either input has keyboard focus", async () => {
    const { box } = await render(<ColorField label="Color" />);
    document.body.focus();
    await userEvent.tab();
    await expect.poll(() => getComputedStyle(box).outlineStyle).toBe("solid");
  });

  it("forwards its ref to the text input and lets layout classes win on the root", async () => {
    const ref = createRef<HTMLInputElement>();
    const { text, root } = await render(<ColorField label="Color" ref={ref} className="mt-6" />);
    expect(ref.current).toBe(text);
    expect(getComputedStyle(root).marginTop).toBe("24px");
  });
});

describe("ColorField development messages", () => {
  it.each([
    ["format", { format: "rgb" }, "format is not a prop; ColorField takes and gives #rrggbb", '<ColorField defaultValue="#3366ff">'],
    ["alpha", { alpha: true }, "alpha is not supported; ColorField takes #rrggbb", '<ColorField defaultValue="#3366ff">'],
    ["color", { color: "#ff0000" }, "color is not a prop", '<ColorField defaultValue="#ff0000">'],
    ["onChange", { onChange: () => {} }, "onChange is not a prop", "<ColorField onValueChange={(hex) => …}>"],
    ["isDisabled", { isDisabled: true }, "isDisabled is not a prop", "<ColorField disabled>"],
  ])("warns for %s with the fix", async (name, extra, problem, fix) => {
    const props = { label: "Color", ...extra } as unknown as ColorFieldProps;
    const { host } = await render(<ColorField {...props} />);
    expect(warn).toHaveBeenCalledWith(`[ouro-ui] ColorField: ${problem}. Fix: ${fix}.`);
    for (const element of host.querySelectorAll("*")) expect(element.hasAttribute(name.toLowerCase())).toBe(false);
  });

  it("warns for a value that is not a hex color and renders black", async () => {
    const { text } = await render(<ColorField label="Color" defaultValue="red" />);
    expect(text.value).toBe("#000000");
    expect(warn).toHaveBeenCalledWith('[ouro-ui] ColorField: defaultValue="red" is not a hex color. Fix: <ColorField defaultValue="#ff0000">.');
    const { text: other } = await render(<ColorField label="Color" value="rgb(0 0 0)" />);
    expect(other.value).toBe("#000000");
    expect(warn).toHaveBeenCalledWith('[ouro-ui] ColorField: value="rgb(0 0 0)" is not a hex color. Fix: <ColorField value="#000000">.');
  });

  it("names ColorField in Field's messages", async () => {
    await render(<ColorField label="" className="bg-blue-500" />);
    expect(warn).toHaveBeenCalledWith('[ouro-ui] ColorField: "bg-blue-500" sets appearance, and className is for layout only. Fix: style fields in your theme (--input, --ring, --radius).');
    expect(warn).toHaveBeenCalledWith(
      '[ouro-ui] ColorField: label is empty, so the control has no name. Fix: <ColorField label="Email" hideLabel> to hide a label you still need.',
    );
  });

  it("says nothing for a full, valid field", async () => {
    await render(
      <ColorField
        label="Color"
        name="color"
        defaultValue="#abc"
        required
        description="For your tags."
        error="Too light."
        hideLabel
        className="mt-2"
      />,
    );
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("ColorField server rendering", () => {
  const node = <ColorField label="Color" name="color" defaultValue="#3366ff" description="For your tags." error="Too light." />;

  it("renders the label, description and error ids on the server", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const doc = new DOMParser().parseFromString(renderToString(node), "text/html");
    const text = doc.querySelector('input[type="text"]')!;
    const picker = doc.querySelector('input[type="color"]')!;
    expect(doc.querySelector(`label[for="${text.id}"]`)!.textContent).toContain("Color");
    expect(describedBy(text).map((id) => doc.getElementById(id)!.textContent)).toEqual(["For your tags.", "Too light."]);
    expect(describedBy(picker)).toEqual(describedBy(text));
    expect(text.getAttribute("aria-invalid")).toBe("true");
    expect(text.getAttribute("value")).toBe("#3366ff");
    expect(error).not.toHaveBeenCalled();
  });

  it("hydrates with the same ids and no hydration warning", async () => {
    const host = document.createElement("div");
    host.innerHTML = renderToString(node);
    document.body.append(host);
    mounted.push(host);
    const snapshot = () =>
      [...host.querySelectorAll("*")].map((el) => [el.tagName, el.id, el.getAttribute("for"), el.getAttribute("aria-describedby")]);
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
    await pick(host.querySelector('input[type="color"]')!, "#000001");
    expect(host.querySelector<HTMLInputElement>('input[type="text"]')!.value).toBe("#000001");
  });
});
