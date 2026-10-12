import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { DatePicker } from "@/registry/ouro/components/ouro/calendar/date-picker";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { rotate } from "@/registry/ouro/lib/ouro/testing/rotate";

// Runs in the `touch` project: Chromium as a 390x844 phone with a coarse pointer.

let root: Root | undefined;
const nodes: Element[] = [];
afterEach(async () => {
  await rotate(390, 844);
  await act(async () => root?.unmount());
  for (const node of nodes.splice(0)) node.remove();
});

async function render(node: ReactNode) {
  const host = document.createElement("div");
  host.style.padding = "24px";
  document.body.append(host);
  nodes.push(host);
  root = createRoot(host);
  await act(async () => root!.render(node));
  return host;
}

it("uses the phone's own date picker on a touch screen, submitting the ISO date", async () => {
  expect(matchMedia("(pointer: coarse)").matches).toBe(true);
  const host = await render(
    <form>
      <DatePicker label="Delivery date" name="delivery" defaultValue="2026-10-11" />
    </form>,
  );
  const input = host.querySelector("input")!;
  expect(input.type).toBe("date");
  expect(input.value).toBe("2026-10-11");
  expect(host.querySelector('button[aria-label="Choose date"]')).toBeNull();
  expect(Object.fromEntries(new FormData(host.querySelector("form")!))).toEqual({ delivery: "2026-10-11" });
  // 16px text, so iOS does not zoom on focus, and a 44px box.
  expect(parseFloat(getComputedStyle(input).fontSize)).toBeGreaterThanOrEqual(16);
  expect(host.querySelector<HTMLElement>("[data-ouro-input-group]")!.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
});

it("keeps the native picker, 16px text and a 44px box on a landscape phone, past the sm breakpoint", async () => {
  await rotate(844, 390);
  expect(matchMedia("(min-width: 640px)").matches).toBe(true);
  const host = await render(<DatePicker label="Delivery date" />);
  const input = host.querySelector("input")!;
  expect(input.type).toBe("date");
  expect(parseFloat(getComputedStyle(input).fontSize)).toBeGreaterThanOrEqual(16);
  expect(host.querySelector<HTMLElement>("[data-ouro-input-group]")!.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
});

/** Sets the native input's value as the phone's picker does. */
async function choose(input: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

it("reports a disallowed date from the phone's picker as empty, with the same messages as the text box", async () => {
  const calls: string[] = [];
  const host = await render(
    <form>
      <DatePicker
        label="Delivery date"
        name="delivery"
        min="2026-10-05"
        max="2026-10-31"
        isDateDisabled={(date) => date === "2026-10-13"}
        onValueChange={(value) => calls.push(value)}
      />
    </form>,
  );
  const input = host.querySelector("input")!;
  expect(input.type).toBe("date");
  await choose(input, "2026-10-01");
  expect(input.value).toBe("2026-10-01");
  expect(input.validationMessage).toBe("Enter a date in the allowed range.");
  await choose(input, "2026-10-13");
  expect(input.value).toBe("2026-10-13");
  expect(input.validationMessage).toBe("Enter a valid date.");
  expect(calls).toEqual([]);
  await choose(input, "2026-10-14");
  expect(calls).toEqual(["2026-10-14"]);
  expect(input.validity.valid).toBe(true);
  await choose(input, "2026-10-01");
  expect(calls).toEqual(["2026-10-14", ""]);
  // Clearing the picker leaves no date and no message.
  await choose(input, "2026-10-20");
  await choose(input, "");
  expect(calls).toEqual(["2026-10-14", "", "2026-10-20", ""]);
  expect(input.validity.valid).toBe(true);
});

it("reports a held date once the app relaxes the limit that made it disallowed", async () => {
  const onValueChange = vi.fn();
  const host = await render(<DatePicker label="Delivery date" min="2026-10-05" onValueChange={onValueChange} />);
  const input = host.querySelector("input")!;
  await choose(input, "2026-10-01");
  expect(onValueChange).not.toHaveBeenCalled();
  await act(async () => root!.render(<DatePicker label="Delivery date" min="2026-09-01" onValueChange={onValueChange} />));
  expect(onValueChange).toHaveBeenCalledTimes(1);
  expect(onValueChange).toHaveBeenLastCalledWith("2026-10-01");
  expect(input.validity.valid).toBe(true);
  // Tightening it again reports the field empty.
  await act(async () => root!.render(<DatePicker label="Delivery date" min="2026-10-05" onValueChange={onValueChange} />));
  expect(onValueChange).toHaveBeenLastCalledWith("");
  expect(onValueChange).toHaveBeenCalledTimes(2);
});
