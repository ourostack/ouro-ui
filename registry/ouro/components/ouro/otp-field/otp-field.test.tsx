import { createRef, useState, type ReactNode } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { OtpField, type OtpFieldProps } from "@/registry/ouro/components/ouro/otp-field/otp-field";
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
      return host.querySelector<HTMLElement>('[data-ouro="otp-field"]')!;
    },
    get group() {
      return host.querySelector<HTMLElement>('[role="group"]')!;
    },
    /** The visible slots, without Base UI's hidden form input. */
    get slots() {
      return [...host.querySelectorAll<HTMLInputElement>("input[data-ouro-otp-slot]")];
    },
  };
}

/** The ids an element's `aria-describedby` lists. */
const describedBy = (element: Element) => (element.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean);
const valueOf = (slots: HTMLInputElement[]) => slots.map((slot) => slot.value).join("");

/** Pastes text into an element, as the system paste does. */
async function paste(target: HTMLElement, text: string) {
  const data = new DataTransfer();
  data.setData("text/plain", text);
  await act(async () => {
    target.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
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

describe("OtpField", () => {
  it("is a labeled group of six slots on the Field contract", async () => {
    const { root, group, slots } = await render(<OtpField label="Verification code" name="code" />);
    expect(root.getAttribute("data-ouro")).toBe("otp-field");
    expect(slots).toHaveLength(6);
    expect(slots[0]!.labels![0]!.textContent).toBe("Verification code");
    await expect.element(page.getByRole("group", { name: "Verification code" })).toBeVisible();
    expect(group.getAttribute("aria-labelledby")).toBe(root.querySelector("label")!.id);
    expect(slots.slice(1).map((slot) => slot.getAttribute("aria-label"))).toEqual([
      "Character 2 of 6",
      "Character 3 of 6",
      "Character 4 of 6",
      "Character 5 of 6",
      "Character 6 of 6",
    ]);
  });

  it("autofills one-time codes, with a number keyboard", async () => {
    const { slots } = await render(<OtpField label="Code" />);
    expect(slots[0]!.getAttribute("autocomplete")).toBe("one-time-code");
    expect(slots[1]!.getAttribute("autocomplete")).toBe("off");
    expect(slots.every((slot) => slot.inputMode === "numeric")).toBe(true);
  });

  it("takes a length", async () => {
    const { slots } = await render(<OtpField label="PIN" length={4} />);
    expect(slots).toHaveLength(4);
    expect(slots[3]!.getAttribute("aria-label")).toBe("Character 4 of 4");
  });

  it("moves to the next slot as the person types, and reports the value and completion", async () => {
    const onValueChange = vi.fn();
    const onValueComplete = vi.fn();
    const { slots } = await render(<OtpField label="Code" length={4} onValueChange={onValueChange} onValueComplete={onValueComplete} />);
    await userEvent.click(slots[0]!);
    await userEvent.keyboard("12a34");
    expect(valueOf(slots)).toBe("1234");
    expect(onValueChange).toHaveBeenLastCalledWith("1234");
    expect(onValueComplete).toHaveBeenCalledWith("1234");
    await userEvent.keyboard("{Backspace}");
    expect(valueOf(slots)).toBe("123");
  });

  it("fills every slot from a pasted code, ignoring spaces", async () => {
    const onValueComplete = vi.fn();
    const { slots } = await render(<OtpField label="Code" onValueComplete={onValueComplete} />);
    slots[0]!.focus();
    await paste(slots[0]!, "123 456");
    expect(valueOf(slots)).toBe("123456");
    expect(onValueComplete).toHaveBeenCalledWith("123456");
  });

  it("takes a whole code that iOS autofill writes into the first slot", async () => {
    const onValueComplete = vi.fn();
    const { slots } = await render(<OtpField label="Code" onValueComplete={onValueComplete} />);
    slots[0]!.focus();
    await act(async () => {
      // iOS fills a one-time code by replacing the first input's text with the whole code.
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(slots[0], "123456");
      slots[0]!.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertReplacementText", data: "123456" }));
    });
    expect(valueOf(slots)).toBe("123456");
    expect(onValueComplete).toHaveBeenCalledWith("123456");
  });

  it("steps back across slots with Backspace from an empty slot", async () => {
    const { slots } = await render(<OtpField label="Code" />);
    await userEvent.click(slots[0]!);
    await userEvent.keyboard("123");
    expect(document.activeElement).toBe(slots[3]);
    await userEvent.keyboard("{Backspace}");
    expect(valueOf(slots)).toBe("12");
    expect(document.activeElement).toBe(slots[2]);
    await userEvent.keyboard("{Backspace}{Backspace}");
    expect(valueOf(slots)).toBe("");
    expect(document.activeElement).toBe(slots[0]);
  });

  it("accepts letters with validationType", async () => {
    const { slots } = await render(<OtpField label="Recovery code" validationType="alphanumeric" length={4} />);
    await userEvent.click(slots[0]!);
    await userEvent.keyboard("a1B2");
    expect(valueOf(slots)).toBe("a1B2");
    expect(slots[0]!.inputMode).toBe("text");
  });

  it("follows a controlled value", async () => {
    function Controlled() {
      const [code, setCode] = useState("12");
      return (
        <>
          <OtpField label="Code" length={4} value={code} onValueChange={setCode} />
          <output>{code}</output>
        </>
      );
    }
    const { host, slots } = await render(<Controlled />);
    expect(valueOf(slots)).toBe("12");
    await userEvent.click(slots[2]!);
    await userEvent.keyboard("3");
    expect(host.querySelector("output")!.textContent).toBe("123");
  });

  it("submits the code under its name, and can submit the form when complete", async () => {
    let submitted: string | null = null;
    const { slots } = await render(
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submitted = new FormData(event.currentTarget).get("code") as string;
        }}
      >
        <OtpField label="Code" name="code" length={4} autoSubmit />
      </form>,
    );
    await userEvent.click(slots[0]!);
    await userEvent.keyboard("4321");
    await expect.poll(() => submitted).toBe("4321");
  });

  it("separates the slots into groups with groupSize", async () => {
    const { group } = await render(<OtpField label="Code" groupSize={3} />);
    const separators = group.querySelectorAll("[data-ouro-otp-separator]");
    expect(separators).toHaveLength(1);
    expect(separators[0]!.getAttribute("role")).toBe("separator");
    const children = [...group.children].map((child) => (child.hasAttribute("data-ouro-otp-separator") ? "-" : "x"));
    expect(children.join("")).toBe("xxx-xxx");
  });

  it("names each slot with slotLabel", async () => {
    const { slots } = await render(<OtpField label="Code" length={3} slotLabel={(position, length) => `Ziffer ${position} von ${length}`} />);
    expect(slots[1]!.getAttribute("aria-label")).toBe("Ziffer 2 von 3");
  });

  it("masks the characters with mask", async () => {
    const { slots } = await render(<OtpField label="PIN" length={4} mask />);
    expect(slots.every((slot) => slot.type === "password")).toBe(true);
  });

  it("wires description, error, required and disabled through Field", async () => {
    const { host, group, slots, rerender } = await render(
      <OtpField label="Code" description="We sent it to your phone." error="That code has expired." required />,
    );
    // Every slot points at the description and the error, so a screen reader reads them on
    // whichever slot it lands, and every slot is invalid.
    for (const slot of slots) {
      expect(describedBy(slot).map((id) => host.querySelector(`#${CSS.escape(id)}`)!.textContent)).toEqual([
        "We sent it to your phone.",
        "That code has expired.",
      ]);
      expect(slot.getAttribute("aria-invalid")).toBe("true");
    }
    expect(describedBy(group)).toEqual(describedBy(slots[0]!));
    expect(slots[0]!.required).toBe(true);
    await rerender(<OtpField label="Code" disabled />);
    expect(slots.every((slot) => slot.disabled)).toBe(true);
  });

  it("is invalid for a list of errors with a message, and valid for an empty list", async () => {
    const { slots, rerender } = await render(<OtpField label="Code" length={4} error={["", "That code has expired."]} />);
    expect(slots.every((slot) => slot.getAttribute("aria-invalid") === "true")).toBe(true);
    await rerender(<OtpField label="Code" length={4} error={[""]} />);
    expect(slots.some((slot) => slot.hasAttribute("aria-invalid"))).toBe(false);
  });

  it("forwards its ref to the group and lets layout classes win on the root", async () => {
    const ref = createRef<HTMLDivElement>();
    const { group, root } = await render(<OtpField label="Code" ref={ref} className="mt-6" />);
    expect(ref.current).toBe(group);
    expect(getComputedStyle(root).marginTop).toBe("24px");
  });
});

describe("OtpField looks", () => {
  it("has 44px slots with 16px text on phones and steps down with a fine pointer from sm", async () => {
    await page.viewport(390, 844);
    const { slots } = await render(<OtpField label="Code" />);
    const slot = slots[0]!;
    expect(slot.getBoundingClientRect().height).toBe(44);
    expect(getComputedStyle(slot).fontSize).toBe("16px");
    await page.viewport(1280, 800);
    await expect.poll(() => slot.getBoundingClientRect().height).toBe(36);
    expect(getComputedStyle(slot).fontSize).toBe("14px");
  });

  it("outlines the focused slot and marks invalid slots", async () => {
    const { host } = await render(
      <>
        <OtpField label="Valid" />
        <OtpField label="Invalid" error="Wrong code." />
      </>,
    );
    const slots = [...host.querySelectorAll<HTMLInputElement>("input[data-ouro-otp-slot]")];
    expect(getComputedStyle(slots[6]!).borderTopColor).not.toBe(getComputedStyle(slots[0]!).borderTopColor);
    await userEvent.click(slots[0]!);
    await expect.poll(() => getComputedStyle(slots[0]!).outlineStyle).toBe("solid");
  });
});

describe("OtpField development messages", () => {
  it.each([
    ["maxLength", { maxLength: 6 }, "maxLength is not a prop", "<OtpField length={6}>"],
    ["numInputs", { numInputs: 4 }, "numInputs is not a prop", "<OtpField length={4}>"],
    ["pattern", { pattern: "^\\d+$" }, "pattern is not a prop", '<OtpField validationType="alphanumeric">'],
    ["onComplete", { onComplete: () => {} }, "onComplete is not a prop", "<OtpField onValueComplete={(code) => …}>"],
    ["onChange", { onChange: () => {} }, "onChange is not a prop", "<OtpField onValueChange={(code) => …}>"],
    ["errorMessage", { errorMessage: "Wrong." }, "errorMessage is not a prop", '<OtpField error="Wrong.">'],
    ["isInvalid", { isInvalid: true }, "isInvalid is not a prop", '<OtpField error="What is wrong">'],
  ])("warns for %s with the fix", async (name, extra, problem, fix) => {
    const props = { label: "Code", ...extra } as unknown as OtpFieldProps;
    const { root } = await render(<OtpField {...props} />);
    expect(warn).toHaveBeenCalledWith(`[ouro-ui] OtpField: ${problem}. Fix: ${fix}.`);
    // Guard props never reach the DOM (the slots' own maxlength and pattern are Base UI's).
    expect(root.querySelector('[role="group"]')!.hasAttribute(name.toLowerCase())).toBe(false);
  });

  it("renders six slots and warns for a length that is not a positive whole number", async () => {
    const { slots } = await render(<OtpField label="Code" length={0} />);
    expect(slots).toHaveLength(6);
    expect(warn).toHaveBeenCalledWith("[ouro-ui] OtpField: length={0} is not a positive whole number. Fix: <OtpField length={6}>.");
  });

  it("renders numeric and warns for an unknown validationType", async () => {
    const props = { label: "Code", validationType: "digits" } as unknown as OtpFieldProps;
    const { slots } = await render(<OtpField {...props} />);
    expect(slots[0]!.inputMode).toBe("numeric");
    expect(warn).toHaveBeenCalledWith(
      '[ouro-ui] OtpField: validationType="digits" is not a validation type; use "numeric", "alpha", "alphanumeric". Fix: <OtpField validationType="numeric">.',
    );
  });

  it("names OtpField in Field's messages", async () => {
    await render(<OtpField label="" className="text-red-500" />);
    expect(warn).toHaveBeenCalledWith(
      '[ouro-ui] OtpField: "text-red-500" sets appearance, and className is for layout only. Fix: <OtpField error="What is wrong">.',
    );
    expect(warn).toHaveBeenCalledWith(
      '[ouro-ui] OtpField: label is empty, so the control has no name. Fix: <OtpField label="Email" hideLabel> to hide a label you still need.',
    );
  });

  it("says nothing for a full, valid field", async () => {
    await render(
      <OtpField
        label="Code"
        name="code"
        length={8}
        groupSize={4}
        validationType="alphanumeric"
        required
        description="From your authenticator app."
        error="Expired."
        hideLabel
        className="mt-2"
        defaultValue="AB12"
      />,
    );
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("OtpField server rendering", () => {
  const node = <OtpField label="Code" name="code" description="We sent it by text." error="That code has expired." length={4} />;

  it("renders the label, description and error ids on the server", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const doc = new DOMParser().parseFromString(renderToString(node), "text/html");
    const slots = [...doc.querySelectorAll("input[data-ouro-otp-slot]")];
    const first = slots[0]!;
    expect(doc.querySelector(`label[for="${first.id}"]`)!.textContent).toContain("Code");
    expect(slots).toHaveLength(4);
    // A server error marks every slot invalid and points every slot at the messages.
    for (const slot of slots) {
      expect(describedBy(slot).map((id) => doc.getElementById(id)!.textContent)).toEqual(["We sent it by text.", "That code has expired."]);
      expect(slot.getAttribute("aria-invalid")).toBe("true");
    }
    expect(first.getAttribute("autocomplete")).toBe("one-time-code");
    expect(error).not.toHaveBeenCalled();
  });

  it("hydrates with the same ids and no hydration warning", async () => {
    const host = document.createElement("div");
    host.innerHTML = renderToString(node);
    document.body.append(host);
    mounted.push(host);
    // Base UI's hidden form input (aria-hidden) gains its own aria-describedby after hydration; leave it out.
    const snapshot = () =>
      [...host.querySelectorAll(':not(input[aria-hidden="true"])')].map((el) => [
        el.tagName,
        el.id,
        el.getAttribute("for"),
        el.getAttribute("aria-describedby"),
      ]);
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
    const slots = [...host.querySelectorAll<HTMLInputElement>("input[data-ouro-otp-slot]")];
    await userEvent.click(slots[0]!);
    await userEvent.keyboard("12");
    expect(valueOf(slots)).toBe("12");
  });
});
