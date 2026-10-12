import { createRef, useState, type ReactNode } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { DatePicker, type DatePickerProps } from "@/registry/ouro/components/ouro/calendar/date-picker";
import { formatDateInput, parseDateInput } from "@/registry/ouro/components/ouro/calendar/date-picker-styles";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

// Runs in Chromium and WebKit, with a fine pointer. date-picker.touch.test.tsx covers the
// phone's own picker on a real coarse pointer; here a stubbed media query stands in for it
// where a test compares the two paths.

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
    get input() {
      return host.querySelector<HTMLInputElement>("input:not([type=hidden])")!;
    },
  };
}

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(async () => {
  await page.viewport(1280, 800);
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(async () => {
  vi.restoreAllMocks();
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  for (const node of mounted) node.remove();
  mounted = [];
});

const warnings = () => warn.mock.calls.map((call: unknown[]) => call[0]);
const trigger = () => document.querySelector<HTMLButtonElement>('button[aria-label="Choose date"]')!;
const popup = () => document.querySelector<HTMLElement>('[data-ouro="popover"]');
const day = (iso: string) => document.querySelector<HTMLButtonElement>(`[data-ouro-day="${iso}"]`)!;
const describedBy = (element: Element) => (element.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean);

/** Makes `(pointer: coarse)` match, as on a phone, for the rest of the test. */
function stubTouch() {
  const real = window.matchMedia.bind(window);
  vi.spyOn(window, "matchMedia").mockImplementation((query: string) =>
    query === "(pointer: coarse)" ? ({ ...real(query), matches: true, media: query, addEventListener() {}, removeEventListener() {} } as MediaQueryList) : real(query),
  );
}

/** Waits until the popover has finished its entrance. */
async function settled() {
  await expect
    .poll(() => {
      const element = popup();
      return Boolean(element && !element.hasAttribute("data-starting-style") && element.getAnimations().length === 0);
    })
    .toBe(true);
}

async function open() {
  await userEvent.click(trigger());
  await settled();
}

/** Submits a form and returns what it sent. */
function submitted(form: HTMLFormElement): Record<string, FormDataEntryValue> {
  return Object.fromEntries(new FormData(form));
}

describe("DatePicker", () => {
  it("is a labeled text box with a calendar button, on the Field contract", async () => {
    const { host, input } = await render(<DatePicker label="Delivery date" name="delivery" />);
    expect(host.querySelector('[data-ouro="date-picker"]')).not.toBeNull();
    expect(input.type).toBe("text");
    expect(input.labels![0]!.textContent).toBe("Delivery date");
    await expect.element(page.getByRole("textbox", { name: "Delivery date" })).toBeVisible();
    expect(trigger().getAttribute("aria-haspopup")).toBe("dialog");
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
    // The text box submits nothing itself; the hidden input submits the ISO date.
    expect(input.name).toBe("");
  });

  it("wires description, error, required and disabled through Field", async () => {
    const { host, input, rerender } = await render(
      <DatePicker label="Delivery date" description="We deliver on weekdays." error="Pick a date." required />,
    );
    expect(describedBy(input).map((id) => host.querySelector(`#${CSS.escape(id)}`)!.textContent)).toEqual([
      "We deliver on weekdays.",
      "Pick a date.",
    ]);
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.required).toBe(true);
    expect(input.getAttribute("aria-required")).toBe("true");
    await rerender(<DatePicker label="Delivery date" error={["", ""]} disabled name="delivery" />);
    expect(input.hasAttribute("aria-invalid")).toBe(false);
    expect(input.disabled).toBe(true);
    expect(trigger().disabled).toBe(true);
    expect(host.querySelector<HTMLInputElement>("input[type=hidden]")!.disabled).toBe(true);
  });

  it("puts the description and error ids and aria-invalid in the server HTML, and hydrates cleanly", async () => {
    const node = <DatePicker label="Delivery date" name="delivery" description="Weekdays only." error="Pick a date." defaultValue="2026-10-11" />;
    const html = renderToString(node);
    const host = document.createElement("div");
    host.innerHTML = html;
    document.body.append(host);
    mounted.push(host);
    const input = host.querySelector<HTMLInputElement>("input:not([type=hidden])")!;
    const ids = describedBy(input);
    expect(ids.map((id) => host.querySelector(`#${CSS.escape(id)}`)!.textContent)).toEqual(["Weekdays only.", "Pick a date."]);
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.value).toBe("10/11/2026");
    expect(host.querySelector<HTMLInputElement>("input[type=hidden]")!.value).toBe("2026-10-11");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const recoverable = vi.fn();
    await act(async () => {
      roots.push(hydrateRoot(host, node, { onRecoverableError: recoverable }));
    });
    expect(recoverable).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    expect(describedBy(input)).toEqual(ids);
  });

  describe("the calendar popover", () => {
    it("opens on the selected day, and picking a day fills the box, closes and returns focus to the button", async () => {
      const onValueChange = vi.fn();
      const { input } = await render(<DatePicker label="Delivery date" defaultValue="2026-10-11" onValueChange={onValueChange} />);
      await open();
      await expect.element(page.getByRole("dialog", { name: "Delivery date" })).toBeVisible();
      await expect.element(page.getByRole("grid", { name: "October 2026" })).toBeVisible();
      await expect.poll(() => document.activeElement).toBe(day("2026-10-11"));
      await userEvent.keyboard("{ArrowRight}{Enter}");
      expect(onValueChange).toHaveBeenCalledWith("2026-10-12");
      await expect.poll(() => popup()).toBeNull();
      expect(input.value).toBe("10/12/2026");
      expect(document.activeElement).toBe(trigger());
    });

    it("returns focus to the button after a mouse pick", async () => {
      const { input } = await render(<DatePicker label="Delivery date" defaultValue="2026-10-11" />);
      await open();
      await userEvent.click(day("2026-10-20"));
      await expect.poll(() => popup()).toBeNull();
      expect(input.value).toBe("10/20/2026");
      expect(document.activeElement).toBe(trigger());
    });

    it("returns focus to the button when the button never had focus, as after a click in Safari", async () => {
      const { input } = await render(<DatePicker label="Delivery date" defaultValue="2026-10-11" />);
      await act(async () => input.focus());
      await act(async () => trigger().click());
      await settled();
      await userEvent.click(day("2026-10-20"));
      await expect.poll(() => popup()).toBeNull();
      expect(document.activeElement).toBe(trigger());
    });

    it("closes on Escape back to the button, and has a translated close button for screen readers", async () => {
      await render(<DatePicker label="Lieferdatum" locale="de-DE" chooseDateLabel="Datum wählen" closeLabel="Schließen" previousMonthLabel="Vorheriger Monat" nextMonthLabel="Nächster Monat" defaultValue="2026-10-11" />);
      const button = document.querySelector<HTMLButtonElement>('button[aria-label="Datum wählen"]')!;
      await userEvent.click(button);
      await settled();
      expect(popup()!.querySelector("[data-ouro-popover-close]")!.textContent).toBe("Schließen");
      await expect.element(page.getByRole("button", { name: "Nächster Monat" })).toBeInTheDocument();
      await expect.element(page.getByRole("button", { name: "Vorheriger Monat" })).toBeInTheDocument();
      await expect.element(page.getByRole("grid", { name: "Oktober 2026" })).toBeVisible();
      await userEvent.keyboard("{Escape}");
      await expect.poll(() => popup()).toBeNull();
      expect(document.activeElement).toBe(button);
    });

    it("passes min, max and isDateDisabled to the calendar", async () => {
      await render(<DatePicker label="Date" defaultValue="2026-10-11" min="2026-10-05" max="2026-10-20" isDateDisabled={(date) => date === "2026-10-13"} />);
      await open();
      expect(day("2026-10-04").getAttribute("aria-disabled")).toBe("true");
      expect(day("2026-10-13").getAttribute("aria-disabled")).toBe("true");
      expect(day("2026-10-21").getAttribute("aria-disabled")).toBe("true");
      expect(day("2026-10-12").hasAttribute("aria-disabled")).toBe(false);
    });

    it("opens on today's month when the field is empty", async () => {
      await render(<DatePicker label="Date" />);
      await open();
      expect(document.querySelectorAll('[data-ouro-day][aria-current="date"]')).toHaveLength(1);
      await expect.poll(() => document.activeElement?.getAttribute("aria-current")).toBe("date");
    });

    it("keeps the calendar shut when read-only", async () => {
      const { input } = await render(<DatePicker label="Date" defaultValue="2026-10-11" readOnly />);
      expect(input.readOnly).toBe(true);
      expect(trigger().disabled).toBe(true);
    });
  });

  describe("typing", () => {
    it("reads the locale's numbers or ISO, and writes the date the locale's way on blur", async () => {
      const onValueChange = vi.fn();
      const { input } = await render(<DatePicker label="Date" onValueChange={onValueChange} />);
      await userEvent.type(input, "10/11/26");
      expect(onValueChange).toHaveBeenLastCalledWith("2026-10-11");
      await userEvent.tab();
      expect(input.value).toBe("10/11/2026");
      await userEvent.clear(input);
      expect(onValueChange).toHaveBeenLastCalledWith("");
      await userEvent.type(input, "2027-3-9");
      expect(onValueChange).toHaveBeenLastCalledWith("2027-03-09");
      await userEvent.tab();
      expect(input.value).toBe("03/09/2027");
    });

    it("reads day-first in en-GB", async () => {
      const onValueChange = vi.fn();
      const { input } = await render(<DatePicker label="Date" locale="en-GB" defaultValue="2026-10-11" onValueChange={onValueChange} />);
      expect(input.value).toBe("11/10/2026");
      await userEvent.clear(input);
      await userEvent.type(input, "1.2.2027");
      expect(onValueChange).toHaveBeenLastCalledWith("2027-02-01");
    });

    it("marks what is not an allowed date invalid, with a translatable message, so the form does not submit it", async () => {
      const { input } = await render(
        <DatePicker label="Date" min="2026-10-05" isDateDisabled={(date) => date === "2026-10-13"} invalidDateMessage="Datum ungültig." />,
      );
      await userEvent.type(input, "13/40/2026");
      expect(input.validationMessage).toBe("Datum ungültig.");
      await userEvent.clear(input);
      await userEvent.type(input, "10/01/2026");
      expect(input.validity.customError).toBe(true);
      await userEvent.clear(input);
      await userEvent.type(input, "10/13/2026");
      expect(input.validity.customError).toBe(true);
      await userEvent.clear(input);
      await userEvent.type(input, "10/14/2026");
      expect(input.validity.valid).toBe(true);
      await userEvent.clear(input);
      expect(input.validity.valid).toBe(true);
    });

    it("never reports a typed date outside min and max, and shows the out-of-range message", async () => {
      const onValueChange = vi.fn();
      const { host, input } = await render(
        <form>
          <DatePicker label="Date" name="date" min="2026-10-05" max="2026-10-31" isDateDisabled={(date) => date === "2026-10-13"} onValueChange={onValueChange} />
        </form>,
      );
      const form = host.querySelector("form")!;
      await userEvent.type(input, "10/01/2026");
      expect(input.validationMessage).toBe("Enter a date in the allowed range.");
      expect(onValueChange.mock.calls.flat()).not.toContain("2026-10-01");
      expect(submitted(form)).toEqual({ date: "" });
      await userEvent.tab();
      expect(input.value).toBe("10/01/2026");
      await userEvent.clear(input);
      await userEvent.type(input, "11/02/2026");
      expect(input.validationMessage).toBe("Enter a date in the allowed range.");
      await userEvent.clear(input);
      await userEvent.type(input, "10/13/2026");
      expect(input.validationMessage).toBe("Enter a valid date.");
      expect(onValueChange.mock.calls.flat()).toEqual([]);
      await userEvent.clear(input);
      await userEvent.type(input, "10/14/2026");
      expect(onValueChange).toHaveBeenLastCalledWith("2026-10-14");
    });

    it("reports a typed date once the app relaxes the limit that made it disallowed", async () => {
      const onValueChange = vi.fn();
      const { input, rerender } = await render(<DatePicker label="Date" max="2026-10-20" onValueChange={onValueChange} />);
      await userEvent.type(input, "10/25/2026");
      expect(onValueChange).toHaveBeenLastCalledWith("");
      onValueChange.mockClear();
      await rerender(<DatePicker label="Date" max="2026-12-31" onValueChange={onValueChange} />);
      expect(onValueChange).toHaveBeenCalledTimes(1);
      expect(onValueChange).toHaveBeenLastCalledWith("2026-10-25");
      expect(input.validity.valid).toBe(true);
    });

    it("translates the out-of-range message", async () => {
      const { input } = await render(<DatePicker label="Datum" min="2026-10-05" outOfRangeMessage="Datum außerhalb des Bereichs." />);
      await userEvent.type(input, "10/01/2026");
      expect(input.validationMessage).toBe("Datum außerhalb des Bereichs.");
    });

    it("reads a two-digit year as the year within 50 years of today", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date(2026, 9, 12, 12));
      expect(parseDateInput("03/04/85", "en-US")).toBe("1985-03-04");
      expect(parseDateInput("03/04/76", "en-US")).toBe("1976-03-04");
      expect(parseDateInput("03/04/75", "en-US")).toBe("2075-03-04");
      expect(parseDateInput("03/04/30", "en-US")).toBe("2030-03-04");
      vi.setSystemTime(new Date(2090, 0, 1, 12));
      expect(parseDateInput("03/04/85", "en-US")).toBe("2085-03-04");
      expect(parseDateInput("03/04/30", "en-US")).toBe("2130-03-04");
      vi.useRealTimers();
    });

    it("leaves a half-typed date alone on blur", async () => {
      const { input } = await render(<DatePicker label="Date" defaultValue="2026-10-11" />);
      await userEvent.clear(input);
      await userEvent.type(input, "10/1");
      await userEvent.tab();
      expect(input.value).toBe("10/1");
    });
  });

  describe("value", () => {
    it("follows value when controlled, and rewrites the box when the app changes it", async () => {
      function Controlled() {
        const [value, setValue] = useState("2026-10-11");
        return (
          <>
            <DatePicker label="Date" value={value} onValueChange={setValue} />
            <output>{value}</output>
            <button type="button" onClick={() => setValue("")}>
              Reset
            </button>
          </>
        );
      }
      const { host, input } = await render(<Controlled />);
      expect(input.value).toBe("10/11/2026");
      await userEvent.clear(input);
      await userEvent.type(input, "10/12/2026");
      expect(host.querySelector("output")!.textContent).toBe("2026-10-12");
      await userEvent.click(page.getByRole("button", { name: "Reset" }));
      expect(input.value).toBe("");
    });

    it("reformats when the locale changes, and ignores values that are not ISO dates", async () => {
      const { input, rerender } = await render(<DatePicker label="Date" value="2026-10-11" />);
      await rerender(<DatePicker label="Date" value="2026-10-11" locale="de-DE" />);
      expect(input.value).toBe("11.10.2026");
      await rerender(<DatePicker label="Date" value="11.10.2026" locale="de-DE" />);
      expect(input.value).toBe("");
    });

    it("forwards its ref to the input", async () => {
      const ref = createRef<HTMLInputElement>();
      const { input } = await render(<DatePicker label="Date" ref={ref} />);
      expect(ref.current).toBe(input);
    });
  });

  describe("forms", () => {
    async function formData(props: Partial<DatePickerProps>) {
      const { host } = await render(
        <form>
          <DatePicker label="Delivery date" name="delivery" {...props} />
        </form>,
      );
      return submitted(host.querySelector("form")!);
    }

    it("submits the same ISO value with the popover and with the phone's own picker", async () => {
      const fine = await formData({ defaultValue: "2026-10-11" });
      const fineEmpty = await formData({});
      stubTouch();
      const touch = await formData({ defaultValue: "2026-10-11" });
      const touchEmpty = await formData({});
      expect(fine).toEqual({ delivery: "2026-10-11" });
      expect(touch).toEqual(fine);
      expect(fineEmpty).toEqual({ delivery: "" });
      expect(touchEmpty).toEqual(fineEmpty);
    });

    it("submits nothing when disabled, on either path, as a native input does", async () => {
      const fine = await formData({ defaultValue: "2026-10-11", disabled: true });
      stubTouch();
      const touch = await formData({ defaultValue: "2026-10-11", disabled: true });
      expect(fine).toEqual({});
      expect(touch).toEqual(fine);
    });

    it("submits a picked or typed date", async () => {
      const { host, input } = await render(
        <form>
          <DatePicker label="Delivery date" name="delivery" />
        </form>,
      );
      const form = host.querySelector("form")!;
      await userEvent.type(input, "10/11/2026");
      expect(submitted(form)).toEqual({ delivery: "2026-10-11" });
      await open();
      await userEvent.click(day("2026-10-15"));
      expect(submitted(form)).toEqual({ delivery: "2026-10-15" });
    });
  });

  describe("the phone's own picker", () => {
    it("is a native date input holding the ISO value, with min and max", async () => {
      stubTouch();
      const onValueChange = vi.fn();
      const { host, input } = await render(
        <DatePicker label="Date" name="date" defaultValue="2026-10-11" min="2026-10-01" max="2026-10-31" onValueChange={onValueChange} error="Pick a date." />,
      );
      expect(input.type).toBe("date");
      expect(input.value).toBe("2026-10-11");
      expect(input.min).toBe("2026-10-01");
      expect(input.max).toBe("2026-10-31");
      expect(input.name).toBe("date");
      expect(input.getAttribute("aria-invalid")).toBe("true");
      expect(host.querySelector("button")).toBeNull();
      expect(host.querySelector("input[type=hidden]")).toBeNull();
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "2026-10-12");
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
      expect(onValueChange).toHaveBeenCalledWith("2026-10-12");
    });

    it("links the description and error to the native input", async () => {
      stubTouch();
      const { host, input } = await render(<DatePicker label="Date" description="Weekdays only." error="Pick a date." />);
      expect(input.type).toBe("date");
      expect(describedBy(input).map((id) => host.querySelector(`#${CSS.escape(id)}`)!.textContent)).toEqual(["Weekdays only.", "Pick a date."]);
      expect(input.getAttribute("aria-invalid")).toBe("true");
    });

    it("marks a day isDateDisabled names invalid", async () => {
      stubTouch();
      const { input } = await render(<DatePicker label="Date" defaultValue="2026-10-13" isDateDisabled={(date) => date === "2026-10-13"} />);
      expect(input.validationMessage).toBe("Enter a valid date.");
    });
  });

  it("focuses the input when the box around it is pressed, and leaves the button its own focus", async () => {
    const { host, input } = await render(<DatePicker label="Date" />);
    const group = host.querySelector<HTMLElement>("[data-ouro-input-group]")!;
    const box = group.getBoundingClientRect();
    await userEvent.click(group, { position: { x: 3, y: box.height / 2 } });
    expect(document.activeElement).toBe(input);
  });

  describe("development messages", () => {
    it("names the real prop for the props agents guess", async () => {
      const guesses = {
        errorMessage: "Required.",
        helperText: "Weekdays.",
        isInvalid: true,
        invalid: true,
        isRequired: true,
        isDisabled: true,
        onChange: () => {},
        selected: "2026-10-11",
        minDate: "x",
        maxDate: "x",
        dateFormat: "dd/MM/yyyy",
        format: "dd/MM/yyyy",
      };
      await render(<DatePicker label="Date" {...(guesses as object)} />);
      expect(warnings()).toEqual(
        expect.arrayContaining([
          '[ouro-ui] DatePicker: errorMessage is not a prop. Fix: <DatePicker error="Required.">.',
          '[ouro-ui] DatePicker: helperText is not a prop. Fix: <DatePicker description="Weekdays.">.',
          '[ouro-ui] DatePicker: isInvalid is not a prop. Fix: <DatePicker error="What is wrong">.',
          '[ouro-ui] DatePicker: invalid is not a prop. Fix: <DatePicker error="What is wrong">.',
          "[ouro-ui] DatePicker: isRequired is not a prop. Fix: <DatePicker required>.",
          "[ouro-ui] DatePicker: isDisabled is not a prop. Fix: <DatePicker disabled>.",
          "[ouro-ui] DatePicker: onChange is not a prop; onValueChange gets the ISO date. Fix: <DatePicker onValueChange={setDate}>.",
          "[ouro-ui] DatePicker: selected is not a prop. Fix: <DatePicker value={date} onValueChange={setDate}>.",
          '[ouro-ui] DatePicker: minDate is not a prop. Fix: <DatePicker min="2026-10-11">.',
          '[ouro-ui] DatePicker: maxDate is not a prop. Fix: <DatePicker max="2026-12-31">.',
          '[ouro-ui] DatePicker: dateFormat is not a prop; the locale sets the format. Fix: <DatePicker locale="en-GB">.',
          '[ouro-ui] DatePicker: format is not a prop; the locale sets the format. Fix: <DatePicker locale="en-GB">.',
        ]),
      );
    });

    it("warns about dates that are not ISO dates, and about a missing label and appearance classes, under its own name", async () => {
      await render(<DatePicker label="" defaultValue="10/11/2026" min="2026-1-1" className="bg-red-500" />);
      expect(warnings()).toEqual(
        expect.arrayContaining([
          '[ouro-ui] DatePicker: defaultValue="10/11/2026" is not an ISO date (YYYY-MM-DD). Fix: <DatePicker defaultValue="2026-10-11">.',
          '[ouro-ui] DatePicker: min="2026-1-1" is not an ISO date (YYYY-MM-DD). Fix: <DatePicker min="2026-10-11">.',
          '[ouro-ui] DatePicker: label is empty, so the control has no name. Fix: <DatePicker label="Email" hideLabel> to hide a label you still need.',
        ]),
      );
      expect(warnings().some((message: string) => message.startsWith('[ouro-ui] DatePicker: "bg-red-500" sets appearance'))).toBe(true);
    });

    it("is quiet for valid props", async () => {
      await render(<DatePicker label="Date" name="date" defaultValue="2026-10-11" min="2026-01-01" max="2026-12-31" required description="Any day." />);
      expect(warnings()).toEqual([]);
    });
  });
});

describe("DatePicker typed dates", () => {
  it("formats and parses the locale's numeric dates", () => {
    expect(formatDateInput("2026-10-11", "en-US")).toBe("10/11/2026");
    expect(formatDateInput("2026-10-11", "en-GB")).toBe("11/10/2026");
    expect(formatDateInput("", "en-US")).toBe("");
    expect(parseDateInput("2026/10/11", "ja-JP")).toBe("2026-10-11");
    expect(parseDateInput("11.10.2026", "de-DE")).toBe("2026-10-11");
    expect(parseDateInput("2/30/2026", "en-US")).toBeNull();
    expect(parseDateInput("10/11", "en-US")).toBeNull();
    expect(parseDateInput("", "en-US")).toBeNull();
    expect(parseDateInput(" 2026-10-11 ", "en-GB")).toBe("2026-10-11");
  });
});
