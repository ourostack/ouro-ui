import { useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { commands, page, userEvent } from "vitest/browser";
import { Combobox } from "@/registry/ouro/components/ouro/combobox/combobox";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

// Runs in the `touch` project: Chromium as a 390x844 phone with a coarse pointer.

const herbs = ["Basil", "Chives", "Dill", "Mint", "Oregano", "Parsley", "Rosemary", "Sage", "Thyme"];
const many = Array.from({ length: 40 }, (_, index) => `Spice ${index + 1}`);

let root: Root | undefined;
const nodes: Element[] = [];
beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(async () => {
  vi.restoreAllMocks();
  await act(async () => root?.unmount());
  for (const node of nodes.splice(0)) node.remove();
  await page.viewport(390, 844);
});

async function render(node: ReactNode) {
  const host = document.createElement("div");
  host.style.padding = "16px";
  document.body.append(host);
  nodes.push(host);
  root = createRoot(host);
  await act(async () => root!.render(node));
  return host;
}

const sheet = () => document.querySelector<HTMLElement>('[data-ouro="sheet"]');
const TRIGGER = "[data-ouro-combobox-trigger]";

/** Waits for the sheet's entrance to finish. */
async function opened() {
  await expect
    .poll(() => {
      const element = sheet();
      return Boolean(element && !element.hasAttribute("data-starting-style") && element.getAnimations().length === 0);
    })
    .toBe(true);
  return sheet()!;
}

describe("Combobox on a phone", () => {
  it("is a button in the field that opens a sheet titled with the label", async () => {
    const host = await render(<Combobox label="Herb" name="herb" items={herbs} placeholder="Pick a herb" description="For the sauce." />);
    const trigger = host.querySelector<HTMLButtonElement>(TRIGGER)!;
    expect(trigger.labels![0]!.textContent).toBe("Herb");
    expect(trigger.textContent).toContain("Pick a herb");
    expect(host.querySelector(`#${CSS.escape(trigger.getAttribute("aria-describedby")!.split(" ")[0]!)}`)!.textContent).toBe("For the sauce.");
    expect(trigger.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    await commands.tap(TRIGGER);
    const panel = await opened();
    await expect.element(page.getByRole("dialog", { name: "Herb" })).toBeVisible();
    expect(panel.querySelectorAll('[role="option"]')).toHaveLength(herbs.length);
  });

  it("pins the search input at the top, with 16px text, and filters as you type", async () => {
    await render(<Combobox label="Herb" items={many} />);
    await commands.tap(TRIGGER);
    const panel = await opened();
    const input = panel.querySelector<HTMLInputElement>('input[role="combobox"]')!;
    expect(input.getAttribute("aria-label")).toBe("Herb");
    expect(parseFloat(getComputedStyle(input).fontSize)).toBeGreaterThanOrEqual(16);
    const search = panel.querySelector<HTMLElement>("[data-ouro-combobox-search]")!;
    expect(getComputedStyle(search).position).toBe("sticky");
    for (const option of panel.querySelectorAll<HTMLElement>('[role="option"]')) {
      expect(option.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    }
    await commands.tap('[data-ouro="sheet"] input[role="combobox"]');
    await userEvent.type(input, "Spice 3");
    await expect
      .poll(() => [...panel.querySelectorAll('[role="option"]')].map((option) => option.textContent))
      .toEqual(["Spice 3", "Spice 30", "Spice 31", "Spice 32", "Spice 33", "Spice 34", "Spice 35", "Spice 36", "Spice 37", "Spice 38", "Spice 39"]);
  });

  it("scrolls a long list with a finger without closing the sheet", async () => {
    await render(<Combobox label="Spice" items={many} />);
    await commands.tap(TRIGGER);
    const panel = await opened();
    const body = panel.querySelector<HTMLElement>("[data-ouro-sheet-content]")!;
    expect(body.scrollHeight).toBeGreaterThan(body.clientHeight);
    const rect = body.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    // Scroll down first, then drag back down: the list scrolls rather than the sheet moving.
    await commands.touchDrag({ from: [x, rect.bottom - 40], to: [x, rect.top + 120], steps: 12 });
    await expect.poll(() => body.scrollTop).toBeGreaterThan(100);
    await commands.touchDrag({ from: [x, rect.top + 120], to: [x, rect.top + 220], steps: 12 });
    await expect.poll(() => body.scrollTop).toBeGreaterThan(0);
    await expect.poll(() => sheet()?.hasAttribute("data-ending-style") ?? true).toBe(false);
    expect(sheet()).not.toBeNull();
  });

  it("picks an item with a tap, closes the sheet and returns focus to the button", async () => {
    const onValueChange = vi.fn();
    const host = await render(<Combobox label="Herb" name="herb" items={herbs} onValueChange={onValueChange} />);
    await commands.tap(TRIGGER);
    await opened();
    await commands.tap('[role="option"]:nth-child(3)');
    expect(onValueChange).toHaveBeenLastCalledWith("Dill");
    await expect.poll(sheet).toBeNull();
    const trigger = host.querySelector<HTMLButtonElement>(TRIGGER)!;
    expect(trigger.textContent).toContain("Dill");
    expect(document.activeElement).toBe(trigger);
    expect(host.querySelector<HTMLInputElement>('input[name="herb"]')!.value).toBe("Dill");
  });

  it("picks several with multiple, and Done closes the sheet", async () => {
    function Picker() {
      const [value, setValue] = useState<string[]>(["Basil"]);
      return <Combobox label="Herbs" multiple items={herbs} value={value} onValueChange={setValue} doneLabel="Fertig" />;
    }
    const host = await render(<Picker />);
    expect(host.querySelector(TRIGGER)!.textContent).toContain("Basil");
    await commands.tap(TRIGGER);
    await opened();
    await commands.tap('[role="option"]:nth-child(3)');
    await expect.poll(() => host.querySelector(TRIGGER)!.textContent).toContain("Basil, Dill");
    expect(sheet()).not.toBeNull();
    await userEvent.click(page.getByRole("button", { name: "Fertig" }).first());
    await expect.poll(sheet).toBeNull();
  });

  it("keeps the popup on a landscape phone, past the sm breakpoint", async () => {
    await page.viewport(844, 390);
    const host = await render(<Combobox label="Herb" items={herbs} />);
    expect(host.querySelector(TRIGGER)).toBeNull();
    const input = host.querySelector<HTMLInputElement>('input[role="combobox"]')!;
    expect(parseFloat(getComputedStyle(input).fontSize)).toBeGreaterThanOrEqual(16);
    expect(host.querySelector<HTMLElement>("[data-ouro-input-group]")!.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
  });

  it("keeps the input in the field with allowCustomValue, since the text is the value", async () => {
    const host = await render(<Combobox label="Cuisine" allowCustomValue items={["Thai"]} />);
    expect(host.querySelector(TRIGGER)).toBeNull();
    expect(host.querySelector('input[role="combobox"]')).not.toBeNull();
  });

  it("gives chip remove buttons a 44px hit area", async () => {
    await page.viewport(844, 390);
    const host = await render(<Combobox label="Herbs" multiple items={herbs} defaultValue={["Basil"]} />);
    const remove = host.querySelector<HTMLElement>('button[aria-label="Remove Basil"]')!;
    const rect = remove.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    expect(document.elementFromPoint(cx, cy - 21)?.closest("button")).toBe(remove);
    expect(document.elementFromPoint(cx, cy + 21)?.closest("button")).toBe(remove);
  });
});
