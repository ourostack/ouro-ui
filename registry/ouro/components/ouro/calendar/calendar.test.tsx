import { useState, type ReactNode } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { Calendar, type CalendarProps, type DateRange } from "@/registry/ouro/components/ouro/calendar/calendar";
import { addMonths, firstDayOfWeek, isIsoDate, monthGrid } from "@/registry/ouro/components/ouro/calendar/calendar-styles";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

// Runs in Chromium and WebKit.

const roots: Root[] = [];
let mounted: Element[] = [];

async function render(node: ReactNode) {
  const host = document.createElement("div");
  host.style.padding = "24px";
  document.body.append(host);
  mounted.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
  return { host, rerender: (next: ReactNode) => act(async () => root.render(next)) };
}

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(async () => {
  await page.viewport(1280, 800);
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  for (const node of mounted) node.remove();
  mounted = [];
});

const warnings = () => warn.mock.calls.map((call: unknown[]) => call[0]);
const day = (iso: string) => document.querySelector<HTMLButtonElement>(`[data-ouro-day="${iso}"]`)!;
const title = () => document.querySelector('[data-ouro="calendar"] h2')!.textContent;
const stop = () => document.querySelector<HTMLElement>('[data-ouro-day][tabindex="0"]')!;
const nav = (name: string) => [...document.querySelectorAll("button")].find((button) => button.getAttribute("aria-label") === name)!;
const headers = () => [...document.querySelectorAll("th")].map((th) => th.getAttribute("abbr"));
const press = async (keys: string) => {
  await userEvent.keyboard(keys);
  await act(async () => {});
};

/** Renders a calendar and puts focus on its Tab stop, as Tab would. */
async function focusCalendar(props: Partial<CalendarProps> = {}) {
  const result = await render(<Calendar label="Delivery date" {...(props as object)} />);
  await act(async () => stop().focus());
  return result;
}

describe("Calendar", () => {
  it("is a labeled grid of the month, with one Tab stop and each day named in full", async () => {
    await render(<Calendar label="Delivery date" defaultValue="2026-10-11" />);
    const group = page.getByRole("group", { name: "Delivery date" });
    await expect.element(group).toBeVisible();
    const grid = page.getByRole("grid", { name: "October 2026" });
    await expect.element(grid).toBeVisible();
    expect(document.querySelectorAll("[data-ouro-day]")).toHaveLength(31);
    expect(document.querySelectorAll('[data-ouro-day][tabindex="0"]')).toHaveLength(1);
    expect(stop().dataset.ouroDay).toBe("2026-10-11");
    expect(day("2026-10-11").getAttribute("aria-label")).toBe("Sunday, October 11, 2026");
    expect(day("2026-10-11").textContent).toBe("11");
    expect(day("2026-10-11").closest("td")!.getAttribute("aria-selected")).toBe("true");
    expect(day("2026-10-12").closest("td")!.getAttribute("aria-selected")).toBe("false");
    expect(document.querySelector('[data-ouro="calendar"] h2')!.getAttribute("aria-live")).toBe("polite");
    // October 2026 starts on a Thursday: four blank cells lead in a Sunday-first week.
    expect(document.querySelector("tbody tr")!.querySelectorAll("td:not(:has(button))")).toHaveLength(4);
  });

  it("marks today with aria-current and opens on today's month without a value", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2027, 2, 9, 12));
    await render(<Calendar label="Delivery date" />);
    expect(title()).toBe("March 2027");
    expect(day("2027-03-09").getAttribute("aria-current")).toBe("date");
    expect(day("2027-03-10").hasAttribute("aria-current")).toBe(false);
    expect(stop().dataset.ouroDay).toBe("2027-03-09");
  });

  describe("locale", () => {
    it("takes the first day of the week from the locale", async () => {
      const { rerender } = await render(<Calendar label="Date" defaultMonth="2026-10-01" locale="en-US" />);
      expect(headers()[0]).toBe("Sunday");
      await rerender(<Calendar label="Date" defaultMonth="2026-10-01" locale="en-GB" />);
      expect(headers()[0]).toBe("Monday");
      expect(headers()).toEqual(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]);
      // October 2026 starts on a Thursday: three blank cells lead in a Monday-first week.
      expect(document.querySelector("tbody tr")!.querySelectorAll("td:not(:has(button))")).toHaveLength(3);
      await rerender(<Calendar label="Date" defaultMonth="2026-10-01" locale="ar-EG" />);
      expect(headers()[0]).toBe("السبت");
    });

    it("names months, weekdays and days in the locale's language and digits", async () => {
      await render(<Calendar label="Datum" defaultValue="2026-10-11" locale="de-DE" />);
      expect(title()).toBe("Oktober 2026");
      expect(day("2026-10-11").getAttribute("aria-label")).toBe("Sonntag, 11. Oktober 2026");
      expect(headers()[0]).toBe("Montag");
      expect(document.querySelector("th")!.textContent).toBe(new Intl.DateTimeFormat("de-DE", { weekday: "short", timeZone: "UTC" }).format(new Date("2023-01-02T00:00:00Z")));
    });

    it("falls back to CLDR's regions where Intl.Locale has no week information", async () => {
      const proto = Intl.Locale.prototype;
      const saved = (["getWeekInfo", "weekInfo"] as const).map((key) => [key, Object.getOwnPropertyDescriptor(proto, key)] as const);
      for (const [key] of saved) Object.defineProperty(proto, key, { configurable: true, get: () => undefined });
      try {
        expect(firstDayOfWeek("en-US")).toBe(0);
        expect(firstDayOfWeek("en-GB")).toBe(1);
        expect(firstDayOfWeek("fa-AF")).toBe(6);
        expect(firstDayOfWeek("und")).toBe(0);
        expect(firstDayOfWeek("es-419")).toBe(1);
        expect(firstDayOfWeek("en-US-u-fw-mon")).toBe(1);
        expect(firstDayOfWeek("en-GB-u-ca-gregory-fw-sun")).toBe(0);
        expect(firstDayOfWeek("dv-MV")).toBe(5);
      } finally {
        for (const [key, descriptor] of saved) {
          if (descriptor) Object.defineProperty(proto, key, descriptor);
          else delete (proto as unknown as Record<string, unknown>)[key];
        }
      }
    });
  });

  describe("keyboard", () => {
    it("moves by day and week with the arrows, and across months", async () => {
      await focusCalendar({ defaultValue: "2026-10-30" });
      await press("{ArrowRight}");
      expect(document.activeElement).toBe(day("2026-10-31"));
      await press("{ArrowRight}");
      expect(title()).toBe("November 2026");
      expect(document.activeElement).toBe(day("2026-11-01"));
      expect(stop()).toBe(document.activeElement);
      await press("{ArrowLeft}");
      expect(title()).toBe("October 2026");
      expect(document.activeElement).toBe(day("2026-10-31"));
      await press("{ArrowUp}");
      expect(document.activeElement).toBe(day("2026-10-24"));
      await press("{ArrowDown}{ArrowDown}");
      expect(document.activeElement).toBe(day("2026-11-07"));
    });

    it("goes to the week's ends with Home and End, by the locale's week", async () => {
      await focusCalendar({ defaultValue: "2026-10-14", locale: "en-GB" });
      await press("{Home}");
      expect(document.activeElement).toBe(day("2026-10-12"));
      await press("{End}");
      expect(document.activeElement).toBe(day("2026-10-18"));
    });

    it("goes to the week's ends in a Saturday-first locale", async () => {
      await focusCalendar({ defaultValue: "2026-10-14", locale: "ar-EG" });
      // October 2026 starts on a Thursday: five blank cells lead in a Saturday-first week.
      expect(document.querySelector("tbody tr")!.querySelectorAll("td:not(:has(button))")).toHaveLength(5);
      await press("{Home}");
      expect(document.activeElement).toBe(day("2026-10-10"));
      await press("{End}");
      expect(document.activeElement).toBe(day("2026-10-16"));
    });

    it("moves across a year boundary with the arrows", async () => {
      await focusCalendar({ defaultValue: "2026-12-31" });
      await press("{ArrowRight}");
      expect(title()).toBe("January 2027");
      expect(document.activeElement).toBe(day("2027-01-01"));
      await press("{ArrowUp}");
      expect(title()).toBe("December 2026");
      expect(document.activeElement).toBe(day("2026-12-25"));
    });

    it("turns months with Page Up and Page Down, and years with Shift", async () => {
      await focusCalendar({ defaultValue: "2026-01-31" });
      await press("{PageDown}");
      expect(title()).toBe("February 2026");
      expect(document.activeElement).toBe(day("2026-02-28"));
      await press("{PageUp}");
      expect(document.activeElement).toBe(day("2026-01-28"));
      await press("{Shift>}{PageDown}{/Shift}");
      expect(title()).toBe("January 2027");
      expect(document.activeElement).toBe(day("2027-01-28"));
      await press("{Shift>}{PageUp}{/Shift}");
      expect(document.activeElement).toBe(day("2026-01-28"));
    });

    it("swaps left and right in a right-to-left layout", async () => {
      const host = document.createElement("div");
      host.dir = "rtl";
      document.body.append(host);
      mounted.push(host);
      const root = createRoot(host);
      roots.push(root);
      await act(async () => root.render(<Calendar label="Date" defaultValue="2026-10-14" />));
      await act(async () => stop().focus());
      await press("{ArrowLeft}");
      expect(document.activeElement).toBe(day("2026-10-15"));
      await press("{ArrowRight}");
      expect(document.activeElement).toBe(day("2026-10-14"));
    });

    it("picks with Enter and Space, and ignores other keys", async () => {
      const onValueChange = vi.fn();
      await focusCalendar({ defaultValue: "2026-10-14", onValueChange });
      await press("{ArrowRight}{Enter}");
      expect(onValueChange).toHaveBeenLastCalledWith("2026-10-15");
      await press("{ArrowRight} ");
      expect(onValueChange).toHaveBeenLastCalledWith("2026-10-16");
      await press("a");
      expect(document.activeElement).toBe(day("2026-10-16"));
    });

    it("stops at min and max", async () => {
      await focusCalendar({ defaultValue: "2026-10-14", min: "2026-10-12", max: "2026-10-20" });
      await press("{ArrowUp}");
      expect(document.activeElement).toBe(day("2026-10-12"));
      await press("{PageDown}");
      expect(document.activeElement).toBe(day("2026-10-20"));
      expect(title()).toBe("October 2026");
    });
  });

  describe("one day", () => {
    it("picks a pressed day, uncontrolled", async () => {
      const onValueChange = vi.fn();
      await render(<Calendar label="Date" defaultValue="2026-10-11" onValueChange={onValueChange} />);
      await userEvent.click(day("2026-10-20"));
      expect(onValueChange).toHaveBeenCalledWith("2026-10-20");
      expect(day("2026-10-20").hasAttribute("data-selected")).toBe(true);
      expect(day("2026-10-11").hasAttribute("data-selected")).toBe(false);
      expect(stop()).toBe(day("2026-10-20"));
    });

    it("follows value when controlled, and shows the month of a new value", async () => {
      function Controlled() {
        const [value, setValue] = useState("2026-10-11");
        return (
          <>
            <Calendar label="Date" value={value} onValueChange={setValue} />
            <button type="button" onClick={() => setValue("2027-01-05")}>
              Jump
            </button>
            <button type="button" onClick={() => setValue("")}>
              Clear
            </button>
          </>
        );
      }
      await render(<Controlled />);
      await userEvent.click(day("2026-10-12"));
      expect(day("2026-10-12").hasAttribute("data-selected")).toBe(true);
      await userEvent.click(page.getByRole("button", { name: "Jump" }));
      expect(title()).toBe("January 2027");
      expect(day("2027-01-05").hasAttribute("data-selected")).toBe(true);
      await userEvent.click(page.getByRole("button", { name: "Clear" }));
      expect(document.querySelectorAll("[data-selected]")).toHaveLength(0);
      expect(title()).toBe("January 2027");
    });

    it("keeps a controlled value the app does not change", async () => {
      const onValueChange = vi.fn();
      await render(<Calendar label="Date" value="2026-10-11" onValueChange={onValueChange} />);
      await userEvent.click(day("2026-10-12"));
      expect(onValueChange).toHaveBeenCalledWith("2026-10-12");
      expect(day("2026-10-11").hasAttribute("data-selected")).toBe(true);
    });

    it("opens on defaultMonth", async () => {
      await render(<Calendar label="Date" defaultValue="2026-10-11" defaultMonth="2027-04-20" />);
      expect(title()).toBe("April 2027");
      expect(stop().dataset.ouroDay).toBe("2027-04-01");
    });
  });

  describe("unavailable days", () => {
    it("marks days outside min and max, and days isDateDisabled names, and never picks them", async () => {
      const onValueChange = vi.fn();
      await render(
        <Calendar
          label="Date"
          defaultMonth="2026-10-01"
          min="2026-10-05"
          max="2026-10-25"
          isDateDisabled={(date) => date === "2026-10-15"}
          onValueChange={onValueChange}
        />,
      );
      for (const iso of ["2026-10-04", "2026-10-15", "2026-10-26"]) {
        expect(day(iso).getAttribute("aria-disabled")).toBe("true");
        await userEvent.click(day(iso), { force: true });
      }
      expect(onValueChange).not.toHaveBeenCalled();
      expect(day("2026-10-05").hasAttribute("aria-disabled")).toBe(false);
      // Unavailable days stay in the arrow-key path, so the Tab stop may sit on one.
      expect(stop()).toBe(day("2026-10-26"));
    });

    it("disables the month buttons at min and max, and moves focus to the day when a press disables one", async () => {
      await render(<Calendar label="Date" defaultValue="2026-11-20" min="2026-10-10" max="2026-12-05" />);
      await userEvent.click(nav("Previous month"));
      expect(title()).toBe("October 2026");
      expect(nav("Previous month").disabled).toBe(true);
      expect(document.activeElement).toBe(day("2026-10-20"));
      await userEvent.click(nav("Next month"));
      expect(title()).toBe("November 2026");
      expect(document.activeElement).toBe(nav("Next month"));
      await userEvent.click(nav("Next month"));
      expect(title()).toBe("December 2026");
      // The 20th is past max, so the Tab stop clamps to it.
      expect(document.activeElement).toBe(day("2026-12-05"));
      expect(nav("Next month").disabled).toBe(true);
    });

    it("turns months with the buttons, which take translated labels", async () => {
      await render(<Calendar label="Datum" defaultValue="2026-10-11" locale="de-DE" previousMonthLabel="Vorheriger Monat" nextMonthLabel="Nächster Monat" />);
      await userEvent.click(page.getByRole("button", { name: "Nächster Monat" }));
      expect(title()).toBe("November 2026");
      await userEvent.click(page.getByRole("button", { name: "Vorheriger Monat" }));
      await userEvent.click(page.getByRole("button", { name: "Vorheriger Monat" }));
      expect(title()).toBe("September 2026");
    });
  });

  describe("range", () => {
    it("picks a start and an end, in either order, and previews the range in between", async () => {
      const onValueChange = vi.fn<(value: DateRange) => void>();
      await render(<Calendar label="Trip" range defaultMonth="2026-10-01" onValueChange={onValueChange} />);
      expect(document.querySelector('[role="grid"]')!.getAttribute("aria-multiselectable")).toBe("true");
      await userEvent.click(day("2026-10-14"));
      expect(onValueChange).not.toHaveBeenCalled();
      expect(day("2026-10-14").hasAttribute("data-selected")).toBe(true);
      await userEvent.hover(day("2026-10-17"));
      expect(day("2026-10-15").hasAttribute("data-in-range")).toBe(true);
      expect(day("2026-10-17").hasAttribute("data-selected")).toBe(true);
      expect(day("2026-10-15").closest("td")!.getAttribute("aria-selected")).toBe("true");
      await userEvent.unhover(day("2026-10-17"));
      await act(async () => document.querySelector("table")!.dispatchEvent(new PointerEvent("pointerleave")));
      expect(day("2026-10-15").hasAttribute("data-in-range")).toBe(false);
      await userEvent.click(day("2026-10-10"));
      expect(onValueChange).toHaveBeenLastCalledWith({ start: "2026-10-10", end: "2026-10-14" });
      expect(day("2026-10-12").hasAttribute("data-in-range")).toBe(true);
      expect(day("2026-10-10").hasAttribute("data-selected")).toBe(true);
      expect(day("2026-10-14").hasAttribute("data-selected")).toBe(true);
      expect(day("2026-10-15").hasAttribute("data-in-range")).toBe(false);
    });

    it("previews with the keyboard, and picks the end with Enter", async () => {
      const onValueChange = vi.fn();
      await focusCalendar({ range: true, defaultValue: { start: "2026-10-01", end: "2026-10-02" }, onValueChange } as unknown as Partial<CalendarProps>);
      expect(day("2026-10-02").hasAttribute("data-selected")).toBe(true);
      await press("{Enter}{ArrowDown}");
      expect(day("2026-10-05").hasAttribute("data-in-range")).toBe(true);
      await press("{Enter}");
      expect(onValueChange).toHaveBeenLastCalledWith({ start: "2026-10-01", end: "2026-10-08" });
    });

    it("never spans an unavailable day: the preview and the end stop before the first booked night", async () => {
      const booked = new Set(["2026-10-15", "2026-10-11"]);
      const onValueChange = vi.fn();
      await render(<Calendar label="Stay" range defaultMonth="2026-10-01" isDateDisabled={(date) => booked.has(date)} onValueChange={onValueChange} />);
      await userEvent.click(day("2026-10-13"));
      await userEvent.hover(day("2026-10-17"));
      expect(day("2026-10-14").hasAttribute("data-selected")).toBe(true);
      for (const iso of ["2026-10-15", "2026-10-16", "2026-10-17"]) {
        expect(day(iso).hasAttribute("data-in-range") || day(iso).hasAttribute("data-selected")).toBe(false);
      }
      await userEvent.click(day("2026-10-17"));
      expect(onValueChange).toHaveBeenLastCalledWith({ start: "2026-10-13", end: "2026-10-14" });
      // Backwards too: from the 17th toward the 9th stops after the booked 15th.
      await userEvent.click(day("2026-10-17"));
      await userEvent.click(day("2026-10-09"));
      expect(onValueChange).toHaveBeenLastCalledWith({ start: "2026-10-16", end: "2026-10-17" });
      expect(onValueChange.mock.calls.every(([range]) => !(range.start <= "2026-10-15" && range.end >= "2026-10-15"))).toBe(true);
    });

    it("cancels a pending start with Escape", async () => {
      const onValueChange = vi.fn();
      await render(<Calendar label="Trip" range defaultMonth="2026-10-01" onValueChange={onValueChange} />);
      await userEvent.click(day("2026-10-14"));
      expect(day("2026-10-14").hasAttribute("data-selected")).toBe(true);
      await press("{Escape}");
      expect(document.querySelectorAll("[data-selected]")).toHaveLength(0);
      await userEvent.click(day("2026-10-20"));
      expect(onValueChange).not.toHaveBeenCalled();
      await userEvent.click(day("2026-10-21"));
      expect(onValueChange).toHaveBeenLastCalledWith({ start: "2026-10-20", end: "2026-10-21" });
    });

    it("follows a controlled range and puts reversed ends in order", async () => {
      await render(<Calendar label="Trip" range value={{ start: "2026-10-20", end: "2026-10-18" }} />);
      expect(day("2026-10-18").hasAttribute("data-selected")).toBe(true);
      expect(day("2026-10-19").hasAttribute("data-in-range")).toBe(true);
      expect(day("2026-10-20").hasAttribute("data-selected")).toBe(true);
    });

    it("picks one-day ranges and keeps a controlled range the app does not change", async () => {
      const onValueChange = vi.fn();
      await render(<Calendar label="Trip" range value={null} defaultMonth="2026-10-01" onValueChange={onValueChange} />);
      await userEvent.click(day("2026-10-14"));
      await userEvent.click(day("2026-10-14"));
      expect(onValueChange).toHaveBeenCalledWith({ start: "2026-10-14", end: "2026-10-14" });
      expect(document.querySelectorAll("[data-selected]")).toHaveLength(0);
    });
  });

  describe("development messages", () => {
    it("names the real prop for the props agents guess", async () => {
      const guesses = { selected: "2026-10-11", onSelect: () => {}, onChange: () => {}, minDate: "x", maxDate: "x", weekStartsOn: 1, disabled: true };
      await render(<Calendar label="Date" {...(guesses as object)} />);
      await render(<Calendar label="Date" {...({ mode: "range" } as object)} />);
      await render(<Calendar label="Date" {...({ mode: "single" } as object)} />);
      expect(warnings()).toEqual(
        expect.arrayContaining([
          "[ouro-ui] Calendar: selected is not a prop. Fix: <Calendar value={date} onValueChange={setDate}>.",
          "[ouro-ui] Calendar: onSelect is not a prop. Fix: <Calendar value={date} onValueChange={setDate}>.",
          "[ouro-ui] Calendar: onChange is not a prop; onValueChange gets the ISO date. Fix: <Calendar onValueChange={setDate}>.",
          '[ouro-ui] Calendar: minDate is not a prop. Fix: <Calendar min="2026-10-11">.',
          '[ouro-ui] Calendar: maxDate is not a prop. Fix: <Calendar max="2026-12-31">.',
          '[ouro-ui] Calendar: weekStartsOn is not a prop; the locale sets the first day. Fix: <Calendar locale="en-GB">, or locale="en-US-u-fw-mon".',
          "[ouro-ui] Calendar: disabled is not a prop. Fix: <Calendar isDateDisabled={(date) => booked.has(date)}>.",
          "[ouro-ui] Calendar: mode is not a prop. Fix: <Calendar range>.",
          "[ouro-ui] Calendar: mode is not a prop. Fix: <Calendar>, which picks one day.",
        ]),
      );
    });

    it("warns about dates that are not ISO dates, and ignores them", async () => {
      await render(<Calendar label="Date" value="10/11/2026" min="2026-13-01" defaultMonth="soon" />);
      await render(<Calendar label="Trip" range defaultValue={{ start: "2026-10-01", end: "tomorrow" }} />);
      await render(<Calendar label="Trip" {...({ range: true, value: "2026-10-01" } as object)} />);
      expect(warnings()).toEqual(
        expect.arrayContaining([
          '[ouro-ui] Calendar: value="10/11/2026" is not an ISO date (YYYY-MM-DD). Fix: <Calendar value="2026-10-11">.',
          '[ouro-ui] Calendar: min="2026-13-01" is not an ISO date (YYYY-MM-DD). Fix: <Calendar min="2026-10-11">.',
          '[ouro-ui] Calendar: defaultMonth="soon" is not an ISO date (YYYY-MM-DD). Fix: <Calendar defaultMonth="2026-10-11">.',
          '[ouro-ui] Calendar: defaultValue.end="tomorrow" is not an ISO date (YYYY-MM-DD). Fix: <Calendar defaultValue.end="2026-10-11">.',
          '[ouro-ui] Calendar: a range takes { start, end }, not one date. Fix: <Calendar range value={{ start: "2026-10-11", end: "2026-10-14" }}>.',
        ]),
      );
      expect(document.querySelectorAll("[data-selected]")).toHaveLength(0);
    });

    it("warns when the label is empty, and about appearance classes", async () => {
      await render(<Calendar label="" className="bg-red-500 mt-4" />);
      expect(warnings()).toEqual(
        expect.arrayContaining([
          '[ouro-ui] Calendar: label is required; it names the calendar for screen readers. Fix: <Calendar label="Delivery date">.',
          `[ouro-ui] Calendar: "bg-red-500" sets appearance, and className is for layout only. Fix: <Calendar className="mt-4" />, and set colors in your theme's CSS variables.`,
        ]),
      );
    });

    it("is quiet for valid props", async () => {
      await render(<Calendar label="Date" defaultValue="2026-10-11" min="2026-01-01" max="2026-12-31" className="mt-4" />);
      expect(warnings()).toEqual([]);
    });
  });

  it("renders on the server and hydrates without a mismatch", async () => {
    const node = <Calendar label="Delivery date" defaultValue="2026-10-11" locale="en-GB" />;
    const html = renderToString(node);
    expect(html).toContain('aria-label="Delivery date"');
    expect(html).toContain("October 2026");
    const host = document.createElement("div");
    host.innerHTML = html;
    document.body.append(host);
    mounted.push(host);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const recoverable = vi.fn();
    await act(async () => {
      roots.push(hydrateRoot(host, node, { onRecoverableError: recoverable }));
    });
    expect(recoverable).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  describe("today across hydration", () => {
    /** Renders on the "server" at one time and hydrates at another, as a server in another zone would. */
    async function hydrateAcross(node: ReactNode, server: Date, client: Date) {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(server);
      const html = renderToString(node);
      vi.setSystemTime(client);
      const host = document.createElement("div");
      host.innerHTML = html;
      document.body.append(host);
      mounted.push(host);
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      const recoverable = vi.fn();
      await act(async () => {
        roots.push(hydrateRoot(host, node, { onRecoverableError: recoverable }));
      });
      return { html, host, error, recoverable };
    }

    it("renders no today on the server, and the browser fills in its own after hydration", async () => {
      const { html, error, recoverable } = await hydrateAcross(<Calendar label="Delivery date" />, new Date(2026, 9, 13, 1), new Date(2026, 9, 12, 18));
      expect(html).not.toContain("aria-current");
      expect(recoverable).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
      expect(document.querySelector('[aria-current="date"]')!.getAttribute("data-ouro-day")).toBe("2026-10-12");
      expect(stop().dataset.ouroDay).toBe("2026-10-12");
    });

    it("hydrates across a month boundary on the browser's month", async () => {
      const { error, recoverable } = await hydrateAcross(<Calendar label="Delivery date" />, new Date(2026, 10, 1, 1), new Date(2026, 9, 31, 18));
      expect(recoverable).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
      expect(title()).toBe("October 2026");
      expect(document.querySelector('[aria-current="date"]')!.getAttribute("data-ouro-day")).toBe("2026-10-31");
    });

    it("keeps a value's month on the server, and marks today after hydration", async () => {
      const { html, error, recoverable } = await hydrateAcross(
        <Calendar label="Delivery date" defaultValue="2026-10-20" />,
        new Date(2026, 9, 13, 1),
        new Date(2026, 9, 12, 18),
      );
      expect(html).toContain("October 2026");
      expect(html).not.toContain("aria-current");
      expect(recoverable).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
      expect(document.querySelector('[aria-current="date"]')!.getAttribute("data-ouro-day")).toBe("2026-10-12");
      expect(stop().dataset.ouroDay).toBe("2026-10-20");
    });
  });

  it("lets app layout classes win on the root, and gives days 36px with a fine pointer", async () => {
    await render(<Calendar label="Date" defaultValue="2026-10-11" className="mt-6" />);
    expect(getComputedStyle(document.querySelector('[data-ouro="calendar"]')!).marginTop).toBe("24px");
    expect(day("2026-10-11").getBoundingClientRect().height).toBe(36);
  });
});

describe("Calendar date math", () => {
  it("checks ISO dates, adds months with clamping and lays out months", () => {
    expect(isIsoDate("2026-02-28")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate(20261011)).toBe(false);
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2024-01-31", 1)).toBe("2024-02-29");
    expect(addMonths("2026-12-15", 1)).toBe("2027-01-15");
    // February 2026 starts on a Sunday: four full weeks.
    expect(monthGrid("2026-02-10", 0)).toHaveLength(4);
    expect(monthGrid("2026-02-10", 1)[0]![0]).toBeNull();
  });
});
