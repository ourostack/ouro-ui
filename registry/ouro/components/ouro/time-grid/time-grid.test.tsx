import { createRef, type ReactNode } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { TimeGrid, type TimeGridEvent, type TimeGridProps } from "@/registry/ouro/components/ouro/time-grid/time-grid";
import {
  allDayLanes,
  layoutDay,
  lineCount,
  minuteClock,
  stepTo,
  toInstant,
  viewDays,
  weekendDays,
  zonedClock,
} from "@/registry/ouro/components/ouro/time-grid/time-grid-styles";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

// Runs in Chromium and WebKit. The grid's clock reads New York, where March 12, 2026 is a
// Thursday in daylight saving time (UTC-4), and the clock is held at 10:41 that morning.

const zone = "America/New_York";
const now = "2026-03-12T10:41:00-04:00";
const at = (day: number, time: string) => `2026-03-${String(day).padStart(2, "0")}T${time}:00-04:00`;
/** Text with every run of white space (Intl's narrow and thin spaces too) as one plain space. */
const plain = (text: string | null | undefined) => (text ?? "").replace(/\s+/g, " ");

const roots: Root[] = [];
let mounted: Element[] = [];

const base: TimeGridProps = { label: "Team calendar", date: "2026-03-12", events: [], timeZone: zone, now, className: "h-[30rem]" };

async function render(props: Partial<TimeGridProps> = {}, wrap: (grid: ReactNode) => ReactNode = (grid) => grid) {
  const host = document.createElement("div");
  host.style.width = "1000px";
  document.body.append(host);
  mounted.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(wrap(<TimeGrid {...base} {...props} />)));
  return {
    host,
    grid: host.querySelector<HTMLElement>('[data-ouro="time-grid"]')!,
    rerender: (next: Partial<TimeGridProps>) => act(async () => root.render(wrap(<TimeGrid {...base} {...next} />))),
  };
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
const events = () => [...document.querySelectorAll<HTMLElement>('[data-ouro="time-grid"] [data-ouro-event-key]')];
const named = (name: string) => events().find((element) => plain(element.getAttribute("aria-label")).startsWith(name))!;
const titled = (title: string) => events().find((element) => element.getAttribute("aria-label")!.includes(`, ${title}`))!;
const dayLists = () => [...document.querySelectorAll<HTMLElement>('[data-ouro-time-grid-body] ul[role="list"]')];
const viewport = () => document.querySelector<HTMLElement>('[data-ouro="time-grid"] [data-scroll-viewport]')!;
/** A range as the grid writes one across days, which browsers word differently ("Tuesday, March 10 at 9:00 AM"). */
const acrossDays = (start: string, end: string) =>
  plain(new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: zone }).formatRange(new Date(start), new Date(end)));
/** Where an event's piece sits in its day, in hours: its top and its height (with the 1px gap below it). */
const hours = (element: Element) => {
  const item = element.closest("li")!;
  return [item.offsetTop / 48, (item.offsetHeight + 1) / 48];
};
const press = async (keys: string) => {
  await userEvent.keyboard(keys);
  await act(async () => {});
};

const forum: TimeGridEvent = { id: "forum", title: "Architecture forum", start: at(12, "10:00"), end: at(12, "11:00"), status: "unanswered", description: "Main auditorium" };
const focus: TimeGridEvent = { id: "focus", title: "Focus time", start: at(12, "10:30"), end: at(12, "12:00"), tone: "secondary" };
const standup: TimeGridEvent = { id: "standup", title: "Standup", start: at(11, "09:30"), end: at(11, "09:45") };
/** An hour each morning, Sunday the 8th to Saturday the 14th, and a holiday on the Friday. */
const everyDay: TimeGridEvent[] = [
  ...[8, 9, 10, 11, 12, 13, 14].map((day) => ({ id: `morning-${day}`, title: "Morning", start: at(day, "08:00"), end: at(day, "09:00") })),
  { id: "holiday", title: "Holiday", start: "2026-03-13" },
];
const demo: TimeGridEvent = { id: "demo", title: "Demo day", start: at(13, "13:00"), end: at(13, "15:00"), tone: "success" };

describe("TimeGrid date and layout math", () => {
  it("lays overlapping events side by side, spreading each over the columns free beside it", () => {
    expect(
      layoutDay([
        { key: "a", start: 600, end: 660 },
        { key: "b", start: 630, end: 720 },
        { key: "c", start: 660, end: 690 },
        { key: "d", start: 800, end: 860 },
      ]),
    ).toEqual([
      { key: "a", top: 600, bottom: 660, column: 0, span: 1, columns: 2 },
      { key: "b", top: 630, bottom: 720, column: 1, span: 1, columns: 2 },
      { key: "c", top: 660, bottom: 690, column: 0, span: 1, columns: 2 },
      { key: "d", top: 800, bottom: 860, column: 0, span: 1, columns: 1 },
    ]);
    // c sits under a in the first column, and b, which a overlaps, keeps the second; e spreads
    // over both columns once nothing overlaps it in the second.
    expect(
      layoutDay([
        { key: "a", start: 0, end: 120 },
        { key: "b", start: 60, end: 90 },
        { key: "e", start: 90, end: 110 },
      ]),
    ).toEqual([
      { key: "a", top: 0, bottom: 120, column: 0, span: 1, columns: 2 },
      { key: "b", top: 60, bottom: 90, column: 1, span: 1, columns: 2 },
      { key: "e", top: 90, bottom: 120, column: 1, span: 1, columns: 2 },
    ]);
    expect(
      layoutDay([
        { key: "long", start: 540, end: 720 },
        { key: "short", start: 540, end: 570 },
        { key: "late", start: 600, end: 660 },
      ]),
    ).toEqual([
      { key: "long", top: 540, bottom: 720, column: 0, span: 1, columns: 2 },
      { key: "short", top: 540, bottom: 570, column: 1, span: 1, columns: 2 },
      { key: "late", top: 600, bottom: 660, column: 1, span: 1, columns: 2 },
    ]);
  });

  it("orders events that start together longest first, and starts a new group where the last one ends", () => {
    for (const items of [
      [
        { key: "short", start: 540, end: 570 },
        { key: "long", start: 540, end: 720 },
      ],
      [
        { key: "long", start: 540, end: 720 },
        { key: "short", start: 540, end: 570 },
      ],
    ]) {
      expect(layoutDay(items).map(({ key, column }) => [key, column])).toEqual([
        ["long", 0],
        ["short", 1],
      ]);
    }
    expect(
      layoutDay([
        { key: "a", start: 0, end: 60 },
        { key: "b", start: 0, end: 60 },
        { key: "c", start: 60, end: 90 },
      ]),
    ).toEqual([
      { key: "a", top: 0, bottom: 60, column: 0, span: 1, columns: 2 },
      { key: "b", top: 0, bottom: 60, column: 1, span: 1, columns: 2 },
      { key: "c", top: 60, bottom: 90, column: 0, span: 1, columns: 1 },
    ]);
    // x spreads into the third column, whose events end before it starts or start after it ends.
    expect(
      layoutDay([
        { key: "a", start: 0, end: 120 },
        { key: "b", start: 0, end: 30 },
        { key: "w", start: 0, end: 30 },
        { key: "x", start: 30, end: 60 },
        { key: "z", start: 60, end: 120 },
        { key: "y", start: 90, end: 120 },
      ]).map(({ key, column, span }) => [key, column, span]),
    ).toEqual([
      ["a", 0, 1],
      ["b", 1, 1],
      ["w", 2, 1],
      ["x", 1, 2],
      ["z", 1, 1],
      ["y", 2, 1],
    ]);
    // e spreads into the third column, whose events end before it starts.
    expect(
      layoutDay([
        { key: "a", start: 0, end: 120 },
        { key: "b", start: 0, end: 60 },
        { key: "c", start: 0, end: 30 },
        { key: "d", start: 30, end: 60 },
        { key: "e", start: 60, end: 120 },
      ]).map(({ key, column, span, columns }) => [key, column, span, columns]),
    ).toEqual([
      ["a", 0, 1, 3],
      ["b", 1, 1, 3],
      ["c", 2, 1, 3],
      ["d", 2, 1, 3],
      ["e", 1, 2, 3],
    ]);
  });

  it("draws an event at least half an hour tall, never past midnight, and spreads it where its neighbours end", () => {
    expect(
      layoutDay([
        { key: "a", start: 600, end: 610 },
        { key: "b", start: 615, end: 700 },
        { key: "late", start: 1430, end: 1440 },
      ]),
    ).toEqual([
      { key: "a", top: 600, bottom: 630, column: 0, span: 1, columns: 2 },
      { key: "b", top: 615, bottom: 700, column: 1, span: 1, columns: 2 },
      { key: "late", top: 1430, bottom: 1440, column: 0, span: 1, columns: 1 },
    ]);
    expect(
      layoutDay([
        { key: "a", start: 0, end: 60 },
        { key: "b", start: 0, end: 30 },
        { key: "c", start: 0, end: 30 },
        { key: "d", start: 30, end: 60 },
      ]),
    ).toEqual([
      { key: "a", top: 0, bottom: 60, column: 0, span: 1, columns: 3 },
      { key: "b", top: 0, bottom: 30, column: 1, span: 1, columns: 3 },
      { key: "c", top: 0, bottom: 30, column: 2, span: 1, columns: 3 },
      { key: "d", top: 30, bottom: 60, column: 1, span: 2, columns: 3 },
    ]);
  });

  it("stacks all-day events in the first row free across their days", () => {
    expect(
      allDayLanes([
        { key: "b", first: 2, last: 3 },
        { key: "a", first: 0, last: 2 },
        { key: "c", first: 3, last: 3 },
        { key: "d", first: 0, last: 0 },
      ]),
    ).toEqual([
      { key: "a", first: 0, last: 2, lane: 0 },
      { key: "d", first: 0, last: 0, lane: 1 },
      { key: "b", first: 2, last: 3, lane: 1 },
      { key: "c", first: 3, last: 3, lane: 0 },
    ]);
  });

  it("stacks all-day events that start together longest first", () => {
    for (const items of [
      [
        { key: "one", first: 1, last: 1 },
        { key: "three", first: 1, last: 3 },
      ],
      [
        { key: "three", first: 1, last: 3 },
        { key: "one", first: 1, last: 1 },
      ],
    ]) {
      expect(allDayLanes(items).map(({ key, lane }) => [key, lane])).toEqual([
        ["three", 0],
        ["one", 1],
      ]);
    }
  });

  it("counts the lines an event's height holds", () => {
    expect([15, 30, 44, 45, 60, 90, 120].map(lineCount)).toEqual([1, 1, 1, 2, 2, 4, 5]);
  });

  it("finds the week's days from the locale, without its weekend for a work week", () => {
    expect(viewDays("2026-03-12", "day", "en-US")).toEqual(["2026-03-12"]);
    expect(viewDays("2026-03-12", "week", "en-US")).toEqual(["2026-03-08", "2026-03-09", "2026-03-10", "2026-03-11", "2026-03-12", "2026-03-13", "2026-03-14"]);
    expect(viewDays("2026-03-08", "week", "en-GB")).toEqual(["2026-03-02", "2026-03-03", "2026-03-04", "2026-03-05", "2026-03-06", "2026-03-07", "2026-03-08"]);
    expect(viewDays("2026-03-12", "work-week", "en-US")).toEqual(["2026-03-09", "2026-03-10", "2026-03-11", "2026-03-12", "2026-03-13"]);
    expect(viewDays("2026-03-12", "work-week", "ar-EG")).toEqual(["2026-03-08", "2026-03-09", "2026-03-10", "2026-03-11", "2026-03-12"]);
    expect(weekendDays("en-US")).toEqual([6, 0]);
    expect(weekendDays("ar-EG")).toEqual([5, 6]);
    // India's weekend is Sunday alone, where the browser knows it (Chromium does).
    const india = new Intl.Locale("hi-IN") as Intl.Locale & { getWeekInfo?: () => { weekend: number[] }; weekInfo?: { weekend: number[] } };
    const known = india.getWeekInfo?.() ?? india.weekInfo;
    expect(weekendDays("hi-IN")).toEqual(known ? [0] : [6, 0]);
  });

  it("reads the weekend from the region where the browser has no week information", () => {
    const proto = Intl.Locale.prototype as unknown as Record<string, unknown>;
    const saved = ["getWeekInfo", "weekInfo"].map((name) => [name, Object.getOwnPropertyDescriptor(proto, name)] as const);
    try {
      for (const [name] of saved) Object.defineProperty(proto, name, { configurable: true, get: () => undefined, set: () => {} });
      expect(weekendDays("en-US")).toEqual([6, 0]);
      expect(weekendDays("ar-EG")).toEqual([5, 6]);
    } finally {
      for (const [name, descriptor] of saved) {
        if (descriptor) Object.defineProperty(proto, name, descriptor);
        else delete proto[name];
      }
    }
  });

  it("reads and writes a time zone's wall clock, across a daylight saving change", () => {
    const newYork = zonedClock(zone);
    expect(newYork.at(Date.parse("2026-03-12T14:41:00Z"))).toEqual({ day: "2026-03-12", minutes: 641 });
    expect(newYork.at(Date.parse("2026-03-13T03:30:00Z"))).toEqual({ day: "2026-03-12", minutes: 1410 });
    expect(newYork.instant("2026-03-12", 641).toISOString()).toBe("2026-03-12T14:41:00.000Z");
    // March 8 springs forward at 2 AM: 1 AM is UTC-5, 3 AM is UTC-4.
    expect(newYork.instant("2026-03-08", 60).toISOString()).toBe("2026-03-08T06:00:00.000Z");
    expect(newYork.instant("2026-03-08", 180).toISOString()).toBe("2026-03-08T07:00:00.000Z");
    expect(zonedClock("Asia/Tokyo").instant("2026-03-12", 0).toISOString()).toBe("2026-03-11T15:00:00.000Z");
  });

  it("reads instants, and nothing that is not one", () => {
    expect(toInstant("2026-03-12T10:00:00Z")?.toISOString()).toBe("2026-03-12T10:00:00.000Z");
    expect(toInstant(0)?.getTime()).toBe(0);
    expect(toInstant("soon")).toBeNull();
  });

  it("moves through events in time order and across days with the arrow keys", () => {
    const pieces = [
      { key: "all", day: 0, start: -1 },
      { key: "a", day: 0, start: 540 },
      { key: "b", day: 0, start: 900 },
      { key: "c", day: 2, start: 600 },
      { key: "d", day: 2, start: 840 },
    ];
    expect(stepTo(pieces, "a", "ArrowDown", false)).toBe("b");
    expect(stepTo(pieces, "a", "ArrowUp", false)).toBe("all");
    expect(stepTo(pieces, "all", "ArrowUp", false)).toBeUndefined();
    expect(stepTo(pieces, "d", "ArrowDown", false)).toBeUndefined();
    expect(stepTo(pieces, "c", "Home", false)).toBe("all");
    expect(stepTo(pieces, "a", "End", false)).toBe("d");
    expect(stepTo(pieces, "b", "ArrowRight", false)).toBe("d");
    expect(stepTo(pieces, "a", "ArrowRight", false)).toBe("c");
    expect(stepTo(pieces, "c", "ArrowLeft", false)).toBe("a");
    expect(stepTo(pieces, "d", "ArrowLeft", false)).toBe("b");
    expect(stepTo(pieces, "a", "ArrowLeft", true)).toBe("c");
    expect(stepTo(pieces, "c", "ArrowRight", true)).toBe("a");
    expect(stepTo(pieces, "a", "ArrowLeft", false)).toBeUndefined();
    expect(stepTo(pieces, "c", "ArrowRight", false)).toBeUndefined();
    expect(stepTo(pieces, "a", "Enter", false)).toBeUndefined();
    // Two events as near in time on the next day: the earlier.
    expect(stepTo([{ key: "x", day: 0, start: 600 }, { key: "early", day: 1, start: 540 }, { key: "late", day: 1, start: 660 }], "x", "ArrowRight", false)).toBe("early");
  });

  it("keeps one clock for every grid, moved on at each minute and stopped when the last one goes", () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    vi.setSystemTime(new Date("2026-03-12T14:41:30Z"));
    const clock = minuteClock();
    expect(clock.read()).toBe(0);
    const first = vi.fn();
    const second = vi.fn();
    const stopFirst = clock.subscribe(first);
    const stopSecond = clock.subscribe(second);
    expect(clock.read()).toBe(Date.parse("2026-03-12T14:41:30Z"));
    vi.advanceTimersByTime(29_999);
    expect(first).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(clock.read()).toBe(Date.parse("2026-03-12T14:42:00Z"));
    expect([first.mock.calls.length, second.mock.calls.length]).toEqual([1, 1]);
    vi.advanceTimersByTime(60_000);
    expect(clock.read()).toBe(Date.parse("2026-03-12T14:43:00Z"));
    stopFirst();
    vi.advanceTimersByTime(60_000);
    expect([first.mock.calls.length, second.mock.calls.length]).toEqual([2, 3]);
    stopSecond();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("TimeGrid", () => {
  it("draws a week of days from the locale's first day, each a list named by its date, today marked", async () => {
    const { grid } = await render({ events: everyDay });
    expect(grid.dataset.view).toBe("week");
    expect(dayLists().map((list) => list.getAttribute("aria-label"))).toEqual([
      "Sunday, March 8",
      "Monday, March 9",
      "Tuesday, March 10",
      "Wednesday, March 11",
      "Thursday, March 12",
      "Friday, March 13",
      "Saturday, March 14",
    ]);
    expect(dayLists().map((list) => list.getAttribute("aria-current"))).toEqual([null, null, null, null, "date", null, null]);
    const heads = [...grid.querySelectorAll<HTMLElement>("[data-ouro-time-grid-head] > [aria-hidden]")];
    expect(heads.map((head) => head.textContent)).toEqual(["", "8Sun", "9Mon", "10Tue", "11Wed", "12Thu", "13Fri", "14Sat", "All day"]);
    expect(heads.map((head) => head.dataset.today)).toEqual([undefined, undefined, undefined, undefined, undefined, "", undefined, undefined, undefined]);
    expect(grid.querySelector("[data-scroll-viewport]")!.getAttribute("aria-label")).toBe("Team calendar");
    expect(grid.querySelector('[data-ouro-time-grid-head] ul[role="list"]')!.getAttribute("aria-label")).toBe("All day");
  });

  it("shows the work week without the weekend, or one day", async () => {
    const { rerender } = await render({ view: "work-week", events: everyDay });
    expect(dayLists().map((list) => list.getAttribute("aria-label"))).toEqual(["Monday, March 9", "Tuesday, March 10", "Wednesday, March 11", "Thursday, March 12", "Friday, March 13"]);
    await rerender({ view: "day", date: "2026-03-14", events: everyDay });
    expect(dayLists().map((list) => list.getAttribute("aria-label"))).toEqual(["Saturday, March 14"]);
    expect(document.querySelector('[data-ouro="time-grid"]')!.getAttribute("data-view")).toBe("day");
  });

  it("writes day names, hours and times in the locale", async () => {
    const { grid } = await render({ locale: "de-DE", view: "day", events: [forum], allDayLabel: "Ganztägig" });
    expect(dayLists()[0]!.getAttribute("aria-label")).toBe("Donnerstag, 12. März");
    expect(plain(grid.querySelector("[data-ouro-time-grid-body] > [aria-hidden] span")!.textContent)).toBe("01 Uhr");
    const hourRange = new Intl.DateTimeFormat("de-DE", { hour: "numeric", timeZone: zone }).formatRange(new Date(forum.start), new Date(forum.end!));
    expect(plain(named("Donnerstag").getAttribute("aria-label"))).toBe(plain(`Donnerstag, ${hourRange}, Architecture forum, needs your answer, Main auditorium`));
    expect(plain(grid.querySelector("[data-ouro-time-grid-now-label]")!.textContent)).toBe("10:41");
    expect(grid.querySelector("[data-ouro-time-grid-head]")!.textContent).toContain("Ganztägig");
    // The now label drops AM and PM, before the time or after it.
    await render({ locale: "ko-KR", view: "day" });
    expect(plain(document.querySelectorAll("[data-ouro-time-grid-now-label]")[1]!.textContent)).toBe("10:41");
    await render({ locale: "ja-JP", view: "day" });
    expect(document.querySelectorAll('[data-ouro="time-grid"]')[2]!.querySelector("[data-ouro-time-grid-head] span span")!.textContent).toBe("12");
  });

  it("places each event by its times on the grid's clock, and moves it with the time zone", async () => {
    const { rerender } = await render({ view: "day", events: [forum] });
    const place = () => named("Thursday").closest("li")!.style;
    expect(hours(named("Thursday"))).toEqual([10, 1]);
    expect(place().insetInlineStart).toBe("0%");
    expect(place().width).toBe("100%");
    await rerender({ view: "day", events: [forum], timeZone: "Europe/London" });
    expect(hours(named("Thursday"))).toEqual([14, 1]);
    expect(plain(named("Thursday").getAttribute("aria-label"))).toBe("Thursday, 2 – 3 PM, Architecture forum, needs your answer, Main auditorium");
  });

  it("shares a day's width between overlapping events", async () => {
    await render({ view: "day", events: [forum, focus] });
    expect([forum, focus].map((event) => titled(event.title).closest("li")!.style.insetInlineStart)).toEqual(["0%", "50%"]);
    expect([forum, focus].map((event) => titled(event.title).closest("li")!.style.width)).toEqual(["50%", "50%"]);
  });

  it("names each event by its day, its time, its title, its status and its description", async () => {
    await render({
      events: [
        forum,
        focus,
        { id: "t", title: "Pairing", start: at(11, "11:30"), end: at(11, "13:00"), status: "tentative" },
        { id: "f", title: "Lunch", start: at(9, "12:00"), end: at(9, "13:00"), status: "free" },
        { id: "c", title: "Retro", start: at(12, "15:00"), end: at(12, "16:00"), status: "cancelled" },
        { id: "b", title: "Planning", start: at(9, "10:00"), end: at(9, "11:00"), status: "busy" },
      ],
    });
    expect(events().map((element) => plain(element.getAttribute("aria-label")))).toEqual([
      "Monday, 10 – 11 AM, Planning",
      "Monday, 12 – 1 PM, Lunch, free",
      "Wednesday, 11:30 AM – 1:00 PM, Pairing, tentative",
      "Thursday, 10 – 11 AM, Architecture forum, needs your answer, Main auditorium",
      "Thursday, 10:30 AM – 12:00 PM, Focus time",
      "Thursday, 3 – 4 PM, Retro, cancelled",
    ]);
    expect(events().map((element) => element.dataset.status)).toEqual(["busy", "free", "tentative", "unanswered", "busy", "cancelled"]);
    expect(events().map((element) => element.dataset.tone)).toEqual(["primary", "primary", "primary", "primary", "secondary", "primary"]);
    expect(warnings()).toEqual([]);
  });

  it("speaks the statuses in the words given", async () => {
    await render({
      view: "day",
      events: [forum, { id: "c", title: "Retro", start: at(12, "15:00"), end: at(12, "16:00"), status: "cancelled" }],
      statusLabels: { unanswered: "awaiting your reply" },
    });
    expect(events().map((element) => plain(element.getAttribute("aria-label")))).toEqual([
      "Thursday, 10 – 11 AM, Architecture forum, awaiting your reply, Main auditorium",
      "Thursday, 3 – 4 PM, Retro, cancelled",
    ]);
  });

  it("shows the title first, then the time and the description as the event's height allows", async () => {
    await render({
      view: "day",
      events: [
        { id: "short", title: "Standup", start: at(12, "09:30"), end: at(12, "09:45") },
        { id: "hour", title: "Design review", start: at(12, "13:00"), end: at(12, "14:00"), description: "Room 2" },
        { id: "long", title: "Launch rehearsal", start: at(12, "15:00"), end: at(12, "16:30"), description: "Room 4" },
        { id: "bare", title: "Writing", start: at(12, "17:00"), end: at(12, "18:30") },
        { id: "three", title: "Workshop", start: at(12, "19:00"), end: at(12, "20:15"), description: "Lab" },
        { id: "half", title: "Check-in", start: at(12, "21:00"), end: at(12, "21:45") },
      ],
    });
    const parts = (title: string) => [...titled(title).querySelectorAll(":scope > span:not([data-ouro-touch-target]) > span")].map((part) => plain(part.textContent));
    expect(parts("Standup")).toEqual(["Standup 9:30 AM"]);
    expect(titled("Standup").querySelector('[dir="auto"]')!.textContent).toBe("Standup");
    expect(parts("Design review")).toEqual(["Design review", "1:00 – 2:00 PM"]);
    expect(parts("Launch rehearsal")).toEqual(["Launch rehearsal", "3:00 – 4:30 PM", "Room 4"]);
    expect(parts("Writing")).toEqual(["Writing", "5:00 – 6:30 PM"]);
    const lines = (title: string) => titled(title).querySelector<HTMLElement>(":scope > span > span[style]")!.style.getPropertyValue("--ouro-lines");
    expect([lines("Design review"), lines("Launch rehearsal"), lines("Writing")]).toEqual(["1", "2", "3"]);
    expect(parts("Workshop")).toEqual(["Workshop", "7:00 – 8:15 PM", "Lab"]);
    expect(titled("Workshop").querySelectorAll('[dir="auto"]')).toHaveLength(2);
    expect(plain(titled("Check-in").getAttribute("aria-label"))).toBe("Thursday, 9:00 – 9:45 PM, Check-in");
  });

  it("puts all-day events in their own row, across the days they cover", async () => {
    const { grid } = await render({
      events: [
        { id: "offsite", title: "Team offsite", start: "2026-03-10", end: "2026-03-11", tone: "success" },
        { id: "closed", title: "Office closed", start: "2026-03-13" },
        { id: "backwards", title: "Typo", start: "2026-03-09", end: "2026-03-01" },
        { id: "trip", title: "Trip", start: "2026-03-01", end: "2026-03-09" },
        { id: "away", title: "Away", start: "2026-03-14", end: "2026-03-20" },
        { id: "gone", title: "Last month", start: "2026-02-10" },
        { id: "later", title: "Next week", start: "2026-03-15" },
      ],
    });
    const row = grid.querySelector('[data-ouro-time-grid-head] ul[role="list"]')!;
    const items = [...row.querySelectorAll("li")];
    expect(items.map((item) => [item.textContent, item.style.gridColumn, item.style.gridRow])).toEqual([
      ["Trip", "1 / 3", "1"],
      ["Typo", "2 / 3", "2"],
      ["Team offsite", "3 / 5", "1"],
      ["Office closed", "6 / 7", "1"],
      ["Away", "7 / 8", "1"],
    ]);
    expect(plain(titled("Team offsite").getAttribute("aria-label"))).toBe("Tuesday, March 10 – Wednesday, March 11, All day, Team offsite");
    expect(plain(titled("Office closed").getAttribute("aria-label"))).toBe("Friday, All day, Office closed");
    expect((row as HTMLElement).style.minHeight).toBe("3.5rem");
    expect(grid.style.getPropertyValue("--ouro-time-grid-head")).toBe("6.75rem");
  });

  it("leaves out an all-day event that falls only on the weekend of a work week, and lists no empty day", async () => {
    const { grid } = await render({ view: "work-week", events: [{ id: "sat", title: "Hike", start: "2026-03-14", end: "2026-03-15" }] });
    expect(events()).toEqual([]);
    expect(grid.querySelectorAll("ul")).toHaveLength(0);
    expect(grid.querySelector<HTMLElement>("[data-ouro-time-grid-head] > div:last-child")!.style.minHeight).toBe("2rem");
  });

  it("puts a timed event of a day or more in the all-day row, and cuts one across midnight into each day", async () => {
    const { grid } = await render({
      events: [
        { id: "conference", title: "Conference", start: at(10, "09:00"), end: at(12, "09:00") },
        { id: "whole", title: "Whole day", start: at(13, "00:00"), end: at(14, "00:00") },
        { id: "days", title: "Two days", start: at(9, "00:00"), end: at(11, "00:00"), status: "free" },
        { id: "late", title: "Release night", start: at(12, "22:00"), end: at(13, "02:00") },
        { id: "midnight", title: "Evening", start: at(9, "21:00"), end: at(10, "00:00") },
        { id: "past", title: "Old trip", start: at(1, "09:00"), end: at(3, "09:00") },
        { id: "border", title: "Long weekend", start: "2026-03-07T12:00:00-05:00", end: at(9, "12:00") },
        { id: "toMidnight", title: "Hackathon", start: at(13, "09:00"), end: at(15, "00:00") },
        { id: "fromMidnight", title: "Fasting", start: at(11, "00:00"), end: at(12, "12:00") },
      ],
    });
    const row = [...grid.querySelectorAll('[data-ouro-time-grid-head] li')].map((item) => [item.textContent, (item as HTMLElement).style.gridColumn]);
    expect(row).toEqual([
      ["Long weekend", "1 / 3"],
      ["Two days", "2 / 4"],
      ["Conference", "3 / 6"],
      ["Fasting", "4 / 6"],
      ["Hackathon", "6 / 8"],
      ["Whole day", "6 / 7"],
    ]);
    expect(plain(titled("Hackathon").getAttribute("aria-label"))).toBe(`${acrossDays(at(13, "09:00"), at(15, "00:00"))}, Hackathon`);
    expect(plain(titled("Fasting").getAttribute("aria-label"))).toBe(`${acrossDays(at(11, "00:00"), at(12, "12:00"))}, Fasting`);
    expect(plain(titled("Two days").getAttribute("aria-label"))).toBe("Monday, March 9 – Tuesday, March 10, All day, Two days, free");
    expect(plain(titled("Conference").getAttribute("aria-label"))).toBe(`${acrossDays(at(10, "09:00"), at(12, "09:00"))}, Conference`);
    expect(plain(titled("Whole day").getAttribute("aria-label"))).toBe("Friday, All day, Whole day");
    const night = events().filter((element) => element.getAttribute("aria-label")!.includes("Release night"));
    expect(night.map(hours)).toEqual([
      [22, 2],
      [0, 2],
    ]);
    expect(night.map((element) => plain(element.querySelectorAll(":scope > span > span")[1]!.textContent))).toEqual(["10:00 PM – 2:00 AM", "10:00 PM – 2:00 AM"]);
    expect(plain(night[0]!.getAttribute("aria-label"))).toBe(`${acrossDays(at(12, "22:00"), at(13, "02:00"))}, Release night`);
    const evening = events().filter((element) => element.getAttribute("aria-label")!.includes("Evening"));
    expect(evening).toHaveLength(1);
    expect(plain(evening[0]!.getAttribute("aria-label"))).toBe("Monday, 9 PM – 12 AM, Evening");
    expect(hours(evening[0]!)).toEqual([21, 3]);
  });

  it("draws an event with no length as a short one, and leaves out events with times it cannot read", async () => {
    await render({
      view: "day",
      events: [
        { id: "point", title: "Deadline", start: at(12, "17:00"), end: at(12, "17:00") },
        { id: "nostart", title: "Broken", start: "soon", end: at(12, "10:00") },
        { id: "noend", title: "Open", start: at(12, "10:00") },
        { id: "backwards", title: "Backwards", start: at(12, "11:00"), end: at(12, "10:00") },
      ],
    });
    expect(events().map((element) => plain(element.getAttribute("aria-label")))).toEqual(["Thursday, 5 PM, Deadline"]);
    expect(warnings().filter((message: string) => message.includes('"point"'))).toEqual([]);
    expect(hours(named("Thursday"))).toEqual([17, 0.5]);
  });

  it("is one Tab stop: the arrow keys move through events in time order and across days", async () => {
    const keys = vi.fn();
    const { grid } = await render({ events: [forum, focus, standup, demo, { id: "closed", title: "Office closed", start: "2026-03-13" }], onKeyDown: keys });
    expect(events().filter((element) => element.tabIndex === 0)).toEqual([titled("Standup")]);
    expect(events().filter((element) => element.tabIndex === -1)).toHaveLength(4);
    titled("Standup").focus();
    // The arrow key is the grid's, so it does not scroll the page as well.
    const key = new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true });
    titled("Standup").dispatchEvent(key);
    expect(key.defaultPrevented).toBe(true);
    await act(async () => {});
    titled("Standup").focus();
    await press("{ArrowDown}");
    expect(document.activeElement).toBe(titled("Architecture forum"));
    expect(events().filter((element) => element.tabIndex === 0)).toEqual([titled("Architecture forum")]);
    await press("{ArrowDown}");
    expect(document.activeElement).toBe(titled("Focus time"));
    await press("{ArrowRight}");
    expect(document.activeElement).toBe(titled("Demo day"));
    await press("{ArrowUp}");
    expect(document.activeElement).toBe(titled("Office closed"));
    await press("{Home}");
    expect(document.activeElement).toBe(titled("Standup"));
    await press("{ArrowLeft}");
    expect(document.activeElement).toBe(titled("Standup"));
    await press("{End}");
    expect(document.activeElement).toBe(titled("Demo day"));
    await press("{ArrowLeft}");
    expect(document.activeElement).toBe(titled("Focus time"));
    // Modifier keys and other keys are the browser's.
    await press("{Alt>}{ArrowDown}{/Alt}");
    await press("{Control>}{ArrowDown}{/Control}");
    await press("{Meta>}{ArrowDown}{/Meta}");
    await press("{PageDown}");
    expect(document.activeElement).toBe(titled("Focus time"));
    expect(keys).toHaveBeenCalled();
    // A key the app handled first is the app's.
    await render({ events: [forum, focus], onKeyDown: (event) => event.preventDefault(), view: "day" });
    const second = [...document.querySelectorAll('[data-ouro="time-grid"]')][1]!;
    second.querySelector<HTMLElement>("[data-ouro-event-key]")!.focus();
    await press("{ArrowDown}");
    expect(document.activeElement).toBe(second.querySelector("[data-ouro-event-key]"));
    // Keys pressed elsewhere in the grid are left alone.
    viewport().focus();
    await press("{ArrowDown}");
    expect(document.activeElement).toBe(viewport());
    expect(grid.contains(document.activeElement)).toBe(true);
  });

  it("takes events that start together longest first", async () => {
    await render({ view: "day", events: [{ id: "quick", title: "Quick sync", start: at(12, "10:00"), end: at(12, "10:15") }, forum] });
    expect(events().filter((element) => element.tabIndex === 0)).toEqual([titled("Architecture forum")]);
  });

  it("swaps Left and Right in a right-to-left page", async () => {
    await render({ events: [forum, standup], locale: "en-US" }, (grid) => <div dir="rtl">{grid}</div>);
    titled("Standup").focus();
    await press("{ArrowLeft}");
    expect(document.activeElement).toBe(titled("Architecture forum"));
    await press("{ArrowRight}");
    expect(document.activeElement).toBe(titled("Standup"));
  });

  it("puts the Tab stop on the selected event, outlines it and marks it current", async () => {
    const { rerender } = await render({ events: [forum, focus, standup], selectedId: "focus" });
    expect(events().filter((element) => element.tabIndex === 0)).toEqual([titled("Focus time")]);
    expect(events().map((element) => element.getAttribute("aria-current"))).toEqual([null, null, "true"]);
    await rerender({ events: [forum, focus, standup], selectedId: "gone" });
    expect(events().filter((element) => element.tabIndex === 0)).toEqual([titled("Standup")]);
    await rerender({ events: [], selectedId: null });
    expect(events()).toEqual([]);
  });

  it("calls onEventSelect with the event pressed, or opened with Enter, and moves the Tab stop there", async () => {
    const select = vi.fn();
    await render({ events: [forum, focus], onEventSelect: select, view: "day" });
    await userEvent.click(titled("Focus time"));
    await act(async () => {});
    expect(select).toHaveBeenLastCalledWith(focus);
    expect(titled("Focus time").tabIndex).toBe(0);
    titled("Architecture forum").focus();
    await press("{Enter}");
    expect(select).toHaveBeenLastCalledWith(forum);
    expect(titled("Architecture forum").tagName).toBe("BUTTON");
    expect(titled("Architecture forum").getAttribute("type")).toBe("button");
    expect(titled("Architecture forum").dataset.ouroControl).toBe("time-grid");
    expect(titled("Architecture forum").dataset.ouroPart).toBe("event");
  });

  it("takes a press on an event without onEventSelect", async () => {
    await render({ view: "day", events: [forum] });
    await userEvent.click(titled("Architecture forum"));
    await act(async () => {});
    expect(titled("Architecture forum").tabIndex).toBe(0);
  });

  it("makes an event with href a link", async () => {
    const select = vi.fn();
    await render({ events: [{ ...forum, href: "#forum" }], onEventSelect: select, view: "day" });
    const link = titled("Architecture forum");
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toBe("#forum");
    expect(link.dataset.ouroPart).toBe("event-link");
    expect(link.dataset.ouroControl).toBe("time-grid");
    await userEvent.click(link);
    expect(select).toHaveBeenCalledWith(expect.objectContaining({ id: "forum" }));
  });

  it("presses an empty slot with onSlotSelect, and shows a mouse the slot first", async () => {
    const slot = vi.fn();
    const { grid, rerender } = await render({ view: "day", onSlotSelect: slot });
    const slots = grid.querySelector<HTMLElement>("[data-ouro-time-grid-slots]")!;
    expect(slots.getAttribute("aria-hidden")).toBe("true");
    const box = slots.getBoundingClientRect();
    const y = (minutes: number) => box.top + (box.height * minutes) / 1440;
    slots.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientY: y(605), pointerType: "mouse" }));
    await act(async () => {});
    expect(plain(grid.querySelector("[data-ouro-time-grid-slot]")!.textContent)).toBe("10:00 AM");
    expect((grid.querySelector("[data-ouro-time-grid-slot]") as HTMLElement).style.top).toBe("calc(var(--ouro-time-grid-hour) * 10)");
    expect((grid.querySelector("[data-ouro-time-grid-slot]") as HTMLElement).style.height).toBe("calc(var(--ouro-time-grid-hour) * 0.5)");
    slots.dispatchEvent(new MouseEvent("click", { bubbles: true, clientY: y(605) }));
    expect(slot).toHaveBeenLastCalledWith({ start: new Date("2026-03-12T10:00:00-04:00"), end: new Date("2026-03-12T10:30:00-04:00") });
    slots.dispatchEvent(new PointerEvent("pointerout", { bubbles: true, pointerType: "mouse", relatedTarget: document.body }));
    await act(async () => {});
    expect(grid.querySelector("[data-ouro-time-grid-slot]")).toBeNull();
    slots.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientY: y(605), pointerType: "touch" }));
    await act(async () => {});
    expect(grid.querySelector("[data-ouro-time-grid-slot]")).toBeNull();
    // The last slot of the day ends at midnight; a 15 or 60 minute slot follows slotMinutes.
    slots.dispatchEvent(new MouseEvent("click", { bubbles: true, clientY: y(1455) }));
    expect(slot).toHaveBeenLastCalledWith({ start: new Date("2026-03-12T23:30:00-04:00"), end: new Date("2026-03-13T00:00:00-04:00") });
    await rerender({ view: "day", onSlotSelect: slot, slotMinutes: 15 });
    slots.dispatchEvent(new MouseEvent("click", { bubbles: true, clientY: y(620) }));
    expect(slot).toHaveBeenLastCalledWith({ start: new Date("2026-03-12T10:15:00-04:00"), end: new Date("2026-03-12T10:30:00-04:00") });
    await rerender({ view: "day", onSlotSelect: slot, slotMinutes: 60 });
    slots.dispatchEvent(new MouseEvent("click", { bubbles: true, clientY: y(-5) }));
    expect(slot).toHaveBeenLastCalledWith({ start: new Date("2026-03-12T00:00:00-04:00"), end: new Date("2026-03-12T01:00:00-04:00") });
  });

  it("has no slots to press without onSlotSelect", async () => {
    const { grid } = await render({ view: "day" });
    expect(grid.querySelector("[data-ouro-time-grid-slots]")).toBeNull();
  });

  it("runs the now line across today, under the events, with the time beside it", async () => {
    const { grid } = await render({ events: [forum], nowAdornment: <span data-testid="sun">☀</span> });
    const lines = [...grid.querySelectorAll<HTMLElement>("[data-ouro-time-grid-now]")];
    expect(lines.map((line) => line.dataset.ouroTimeGridNow)).toEqual(["", "", "", "", "today", "", ""]);
    expect(lines.every((line) => line.style.top === "calc(var(--ouro-time-grid-hour) * 10.683333333333334)" && line.getAttribute("aria-hidden") === "true")).toBe(true);
    const line = lines[4]!;
    const event = titled("Architecture forum");
    expect(Number(getComputedStyle(line).zIndex)).toBeLessThan(Number(getComputedStyle(event).zIndex));
    expect(getComputedStyle(event).backgroundColor).not.toMatch(/rgba\(.*,\s*0\)|transparent/);
    expect(line.querySelectorAll("span")).toHaveLength(1);
    expect(lines[0]!.querySelectorAll("span")).toHaveLength(0);
    const label = grid.querySelector<HTMLElement>("[data-ouro-time-grid-now-label]")!;
    expect(plain(label.textContent)).toBe("☀10:41");
    expect(label.closest("[aria-hidden]")).not.toBeNull();
    expect(label.style.top).toBe(line.style.top);
    expect([getComputedStyle(line).borderTopWidth, getComputedStyle(lines[0]!).borderTopWidth]).toEqual(["2px", "1px"]);
    // The hour label the now line would cover gives way: 11 AM is 19 minutes away.
    const hours = [...grid.querySelectorAll("[data-ouro-time-grid-body] > [aria-hidden] > span:not([data-ouro-time-grid-now-label])")].map((span) => plain(span.textContent));
    expect(hours).toHaveLength(22);
    expect(hours).not.toContain("11 AM");
    expect(hours).toContain("10 AM");
    const tenLabel = [...grid.querySelectorAll<HTMLElement>("[data-ouro-time-grid-body] > [aria-hidden] > span")].find((span) => plain(span.textContent) === "10 AM")!;
    expect(tenLabel.style.top).toBe("calc(var(--ouro-time-grid-hour) * 10)");
  });

  it("hides the hour the now line is within 20 minutes of, in a day too", async () => {
    const { grid } = await render({ view: "day", now: at(12, "10:40") });
    expect(grid.querySelector('[data-ouro-time-grid-now="today"]')).not.toBeNull();
    const hours = [...grid.querySelectorAll("[data-ouro-time-grid-body] > [aria-hidden] > span:not([data-ouro-time-grid-now-label])")].map((span) => plain(span.textContent));
    expect(hours).not.toContain("11 AM");
    expect(hours).toContain("10 AM");
  });

  it("lays its header, row of whole days and body out in one column per day after the hours", async () => {
    const { grid } = await render({ events: everyDay });
    const tracks = (element: Element) => getComputedStyle(element).gridTemplateColumns.split(" ").length;
    expect(tracks(grid.querySelector("[data-ouro-time-grid-head]")!)).toBe(8);
    expect(tracks(grid.querySelector("[data-ouro-time-grid-body]")!)).toBe(8);
    const row = grid.querySelector('[data-ouro-time-grid-head] ul[role="list"]')!;
    expect([getComputedStyle(row).gridColumnStart, tracks(row)]).toEqual(["2", 7]);
    const { grid: none } = await render({ date: "soon" });
    expect(tracks(none.querySelector("[data-ouro-time-grid-head]")!)).toBe(2);
  });

  it("draws no now line when today is not shown, and keeps every hour", async () => {
    const { grid } = await render({ date: "2026-03-20", events: [{ id: "later", title: "Later", start: "2026-03-20T09:00:00-04:00", end: "2026-03-20T10:00:00-04:00" }] });
    expect(dayLists()).toHaveLength(1);
    expect(grid.querySelector("[data-ouro-time-grid-now]")).toBeNull();
    expect(grid.querySelector("[data-ouro-time-grid-now-label]")).toBeNull();
    expect(dayLists().every((list) => !list.hasAttribute("aria-current"))).toBe(true);
    expect(grid.querySelectorAll("[data-ouro-time-grid-body] > [aria-hidden] > span")).toHaveLength(23);
  });

  it("follows the browser's clock without now, moving the line each minute", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    vi.setSystemTime(new Date("2026-03-12T14:41:30Z"));
    const { grid } = await render({ now: undefined });
    const top = () => grid.querySelector<HTMLElement>('[data-ouro-time-grid-now="today"]')!.style.top;
    expect(top()).toBe("calc(var(--ouro-time-grid-hour) * 10.683333333333334)");
    await act(async () => vi.advanceTimersByTime(30_000));
    expect(top()).toBe("calc(var(--ouro-time-grid-hour) * 10.7)");
    expect(warnings()).toEqual([]);
  });

  it("opens at now when today shows, else half an hour before the working day", async () => {
    const { rerender } = await render();
    const hour = () => document.querySelector<HTMLElement>("[data-ouro-time-grid-body]")!.offsetHeight / 24;
    // Browsers round scrollTop to whole pixels, or not.
    const near = (expected: number) => expect(Math.abs(viewport().scrollTop - expected)).toBeLessThan(1);
    near((hour() * (641 - 90)) / 60);
    await rerender({ date: "2026-03-20" });
    near(hour() * 7.5);
    await rerender({ date: "2026-03-20", workingHours: { start: 0, end: 8 } });
    near(hour() * 7.5);
    await rerender({ date: "2026-03-27", workingHours: { start: 0, end: 8 } });
    expect(viewport().scrollTop).toBe(0);
  });

  it("shades the hours outside the working day, and the weekend", async () => {
    const { grid } = await render({ workingHours: { start: 9.5, end: 18 } });
    const columns = [...grid.querySelectorAll<HTMLElement>("[data-ouro-time-grid-body] > div:not([aria-hidden])")];
    const shades = columns.map((column) => [...column.querySelectorAll<HTMLElement>("[data-ouro-time-grid-off]")].map((shade) => [shade.style.height, shade.style.top]));
    expect(shades[0]).toEqual([["", ""]]);
    expect(shades[6]).toEqual([["", ""]]);
    expect(shades[1]).toEqual([
      ["calc(var(--ouro-time-grid-hour) * 9.5)", ""],
      ["", "calc(var(--ouro-time-grid-hour) * 18)"],
    ]);
    expect(columns.every((column) => [...column.querySelectorAll("[data-ouro-time-grid-off]")].every((shade) => shade.getAttribute("aria-hidden") === "true"))).toBe(true);
  });

  it("takes week as a view without a message", async () => {
    const { grid } = await render({ view: "week", workingHours: { start: 0, end: 24 } });
    expect(grid.dataset.view).toBe("week");
    expect(grid.querySelector<HTMLElement>("[data-ouro-time-grid-off]:not(.inset-0)")!.style.height).toBe("calc(var(--ouro-time-grid-hour) * 0)");
    expect(warnings()).toEqual([]);
  });

  it("draws each status in its event's tone, from the theme", async () => {
    const statusEvent = (status: TimeGridEvent["status"], hour: number, tone: TimeGridEvent["tone"] = "success"): TimeGridEvent => ({
      id: String(status),
      title: String(status),
      start: at(12, `${String(hour).padStart(2, "0")}:00`),
      end: at(12, `${String(hour + 1).padStart(2, "0")}:00`),
      status,
      tone,
    });
    const { grid } = await render({
      view: "day",
      events: [
        statusEvent("busy", 9),
        statusEvent("tentative", 11),
        statusEvent("free", 13),
        statusEvent("unanswered", 15),
        statusEvent("cancelled", 17),
        { ...statusEvent("busy", 19, "warning"), id: "amber" },
        { ...statusEvent("busy", 20, "destructive"), id: "red" },
        { ...statusEvent("busy", 21, "primary"), id: "blue" },
      ],
    });
    expect(events().map((element) => element.dataset.tone)).toEqual(["success", "success", "success", "success", "success", "warning", "destructive", "primary"]);
    expect(warnings()).toEqual([]);
    const probe = document.createElement("span");
    grid.append(probe);
    const color = (value: string) => {
      probe.style.color = value;
      return getComputedStyle(probe).color;
    };
    const style = (title: string) => getComputedStyle(titled(title));
    const [busy, tentative, free, unanswered, cancelled] = ["busy", "tentative", "free", "unanswered", "cancelled"].map(style);
    expect(busy!.borderInlineStartColor).toBe(color("var(--success)"));
    expect(busy!.borderInlineStartWidth).toBe("3px");
    expect([busy!.borderTopWidth, busy!.borderInlineStartStyle]).toEqual(["0px", "solid"]);
    expect(busy!.backgroundColor).not.toBe(color("var(--background)"));
    expect(getComputedStyle(events()[5]!).borderInlineStartColor).toBe(color("var(--warning)"));
    expect(getComputedStyle(events()[5]!).backgroundColor).not.toBe(busy!.backgroundColor);
    expect([tentative!.borderInlineStartStyle, tentative!.backgroundImage.startsWith("repeating-linear-gradient")]).toEqual(["dashed", true]);
    expect([tentative!.backgroundColor, free!.backgroundColor, unanswered!.backgroundColor, cancelled!.backgroundColor]).toEqual(Array(4).fill(color("var(--background)")));
    expect([free!.borderTopWidth, free!.borderTopStyle, free!.borderInlineStartWidth, free!.borderTopColor]).toEqual(["1px", "solid", "3px", color("var(--success)")]);
    expect([unanswered!.borderTopWidth, unanswered!.borderTopStyle]).toEqual(["1px", "dashed"]);
    expect([cancelled!.borderInlineStartStyle, cancelled!.textDecorationLine]).toEqual(["dotted", "line-through"]);
    probe.remove();
  });

  it("takes layout classes on the root and passes its attributes and ref through", async () => {
    const ref = createRef<HTMLDivElement>();
    let called: HTMLDivElement | null = null;
    const { grid } = await render({ ref, id: "calendar", style: { maxWidth: 900 }, className: "h-[20rem] mt-4" });
    expect(ref.current).toBe(grid);
    expect(grid.id).toBe("calendar");
    expect(grid.style.maxWidth).toBe("900px");
    expect(grid.getBoundingClientRect().height).toBe(320);
    expect(getComputedStyle(grid).marginTop).toBe("16px");
    await render({ ref: (element) => void (called = element) });
    expect(called).toBe(document.querySelectorAll('[data-ouro="time-grid"]')[1]);
    expect(warnings()).toEqual([]);
  });

  it("is 36rem tall by default, with 48px hours", async () => {
    const { grid } = await render({ className: undefined });
    expect(grid.getBoundingClientRect().height).toBe(576);
    expect(grid.querySelector<HTMLElement>("[data-ouro-time-grid-body]")!.offsetHeight).toBe(48 * 24);
  });

  it("writes UTC with no now on the server, hydrates without a mismatch, then reads the browser's zone and clock", async () => {
    // The reader is in Tokyo, whatever zone the test browser runs in.
    const { DateTimeFormat } = Intl;
    Object.assign(Intl, {
      DateTimeFormat: class extends DateTimeFormat {
        constructor(locales?: Intl.LocalesArgument, options?: Intl.DateTimeFormatOptions) {
          super(locales, { ...options, timeZone: options?.timeZone ?? "Asia/Tokyo" });
        }
      },
    });
    onTestFinished(() => void Object.assign(Intl, { DateTimeFormat }));
    // 14:41 UTC on the 12th is 23:41 in Tokyo, the same day.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-03-12T14:41:00Z"));
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const props = { ...base, timeZone: undefined, now: undefined, view: "day" as const, events: [{ id: "e", title: "Sync", start: "2026-03-12T14:00:00Z", end: "2026-03-12T15:00:00Z" }] };
    const html = renderToString(<TimeGrid {...props} />);
    expect(html).not.toContain("data-ouro-time-grid-now");
    expect(html).toContain("calc(var(--ouro-time-grid-hour) * 14)");
    const host = document.createElement("div");
    host.innerHTML = html;
    document.body.append(host);
    mounted.push(host);
    let root: Root | undefined;
    await act(async () => {
      root = hydrateRoot(host, <TimeGrid {...props} />);
    });
    roots.push(root!);
    expect(errors).not.toHaveBeenCalled();
    // 14:00 UTC is 23:00 in Tokyo. Once the browser knows it is 23:41, the grid opens 90 minutes before.
    expect(hours(host.querySelector("[data-ouro-event-key]")!)).toEqual([23, 1]);
    expect(host.querySelector('[data-ouro-time-grid-now="today"]')).not.toBeNull();
    const scroller = host.querySelector<HTMLElement>("[data-scroll-viewport]")!;
    // As far down as the area scrolls, short of 22:11.
    expect(Math.abs(scroller.scrollTop - Math.min(((23 * 60 + 41 - 90) / 60) * 48, scroller.scrollHeight - scroller.clientHeight))).toBeLessThan(1);
    expect(scroller.scrollTop).toBeGreaterThan(8 * 48);
  });

  it("draws no now line before the browser knows the time, even on the first day of 1970", () => {
    const html = renderToString(<TimeGrid {...base} now={undefined} timeZone="UTC" date="1970-01-01" view="day" events={[]} />);
    expect(html).not.toContain("data-ouro-time-grid-now");
    expect(html).not.toContain('aria-current="date"');
  });

  it("orders an all-day event before one at midnight, and draws an event of no length at midnight", async () => {
    await render({
      view: "day",
      events: [
        { id: "midnight", title: "Backup", start: at(12, "00:00"), end: at(12, "00:30") },
        { id: "holiday", title: "Holiday", start: "2026-03-12" },
        { id: "reminder", title: "Reminder", start: at(12, "00:00"), end: at(12, "00:00") },
      ],
    });
    expect(events().filter((element) => element.tabIndex === 0)).toEqual([titled("Holiday")]);
    titled("Holiday").focus();
    await press("{ArrowDown}");
    expect(document.activeElement).toBe(titled("Backup"));
    await press("{ArrowDown}");
    expect(document.activeElement).toBe(titled("Reminder"));
    expect(hours(titled("Reminder"))).toEqual([0, 0.5]);
  });

  describe("development messages", () => {
    it("asks for a label and an ISO date, and draws no days without one", async () => {
      await render({ label: "", date: "3/12/2026" });
      expect(dayLists()).toEqual([]);
      expect(warnings()).toEqual(
        expect.arrayContaining([
          '[ouro-ui] TimeGrid: label is required; it names the grid for screen readers. Fix: <TimeGrid label="Team calendar">.',
          '[ouro-ui] TimeGrid: date="3/12/2026" is not an ISO date (YYYY-MM-DD). Fix: <TimeGrid date="2026-03-12">.',
        ]),
      );
    });

    it("shows a week for a view, slot or working day it does not know, and the clock for a now it cannot read", async () => {
      vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
      vi.setSystemTime(new Date("2026-03-12T14:41:00Z"));
      const slot = vi.fn();
      const { grid } = await render({
        view: "month" as never,
        slotMinutes: 20 as never,
        now: "soon",
        workingHours: { start: 18, end: 9 },
        onSlotSelect: slot,
      });
      expect(grid.dataset.view).toBe("week");
      expect(grid.querySelector('[data-ouro-time-grid-now="today"]')).not.toBeNull();
      expect(grid.querySelector<HTMLElement>("[data-ouro-time-grid-off]:not(.inset-0)")!.style.height).toBe("calc(var(--ouro-time-grid-hour) * 8)");
      const slots = grid.querySelectorAll<HTMLElement>("[data-ouro-time-grid-slots]")[4]!;
      const box = slots.getBoundingClientRect();
      slots.dispatchEvent(new MouseEvent("click", { bubbles: true, clientY: box.top + (box.height * 605) / 1440 }));
      expect(slot).toHaveBeenLastCalledWith({ start: new Date("2026-03-12T10:00:00-04:00"), end: new Date("2026-03-12T10:30:00-04:00") });
      await render({ workingHours: { start: -1, end: 9 } });
      await render({ workingHours: { start: 8, end: 25 } });
      await render({ workingHours: { start: 8, end: 8 } });
      expect(warnings()).toEqual(
        expect.arrayContaining([
          '[ouro-ui] TimeGrid: view="month" is not a view; use "day", "work-week" or "week". Fix: <TimeGrid view="week">.',
          "[ouro-ui] TimeGrid: slotMinutes={20} is not a slot length; use 15, 30 or 60. Fix: <TimeGrid slotMinutes={30}>.",
          '[ouro-ui] TimeGrid: now="soon" is not a date. Fix: <TimeGrid now={new Date()}>, or leave it out to follow the clock.',
          '[ouro-ui] TimeGrid: workingHours={"start":18,"end":9} is not a working day; start and end are hours from 0 to 24, start first. Fix: <TimeGrid workingHours={{ start: 8, end: 17 }}>.',
          '[ouro-ui] TimeGrid: workingHours={"start":-1,"end":9} is not a working day; start and end are hours from 0 to 24, start first. Fix: <TimeGrid workingHours={{ start: 8, end: 17 }}>.',
          '[ouro-ui] TimeGrid: workingHours={"start":8,"end":25} is not a working day; start and end are hours from 0 to 24, start first. Fix: <TimeGrid workingHours={{ start: 8, end: 17 }}>.',
          '[ouro-ui] TimeGrid: workingHours={"start":8,"end":8} is not a working day; start and end are hours from 0 to 24, start first. Fix: <TimeGrid workingHours={{ start: 8, end: 17 }}>.',
        ]),
      );
      expect(warnings()).toHaveLength(7);
    });

    it("names what is wrong with an event, and draws it in the defaults", async () => {
      await render({
        view: "day",
        events: [
          { ...forum, tone: "danger" as never, status: "maybe" as never },
          { ...focus, tone: "brand" as never },
          { ...forum, ...({ allDay: true, color: "red" } as object) },
          { ...forum, title: "Forum again" },
          { id: "nostart", title: "Broken", start: "soon", end: at(12, "10:00") },
          { id: "noend", title: "Open", start: at(12, "10:00") },
          { id: "backwards", title: "Backwards", start: at(12, "11:00"), end: at(12, "10:00") },
        ],
      });
      expect(events().map((element) => [element.dataset.tone, element.dataset.status])).toEqual([
        ["primary", "busy"],
        ["primary", "unanswered"],
        ["primary", "unanswered"],
        ["primary", "busy"],
      ]);
      expect(new Set(events().map((element) => element.dataset.ouroEventKey)).size).toBe(4);
      expect(plain(events()[0]!.getAttribute("aria-label"))).toBe("Thursday, 10 – 11 AM, Architecture forum, Main auditorium");
      expect(warnings()).toEqual(
        expect.arrayContaining([
          '[ouro-ui] TimeGrid: event "forum": tone="danger" is not a tone; use "primary", "secondary", "success", "warning" or "destructive". Fix: { tone: "destructive" }.',
          '[ouro-ui] TimeGrid: event "focus": tone="brand" is not a tone; use "primary", "secondary", "success", "warning" or "destructive". Fix: { tone: "primary" }.',
          '[ouro-ui] TimeGrid: event "forum": status="maybe" is not a status; use "busy", "tentative", "free", "unanswered" or "cancelled". Fix: { status: "tentative" }.',
          "[ouro-ui] TimeGrid: event \"forum\": allDay is not a field; an all-day event's start is a date. Fix: { start: \"2026-03-12\" }.",
          '[ouro-ui] TimeGrid: event "forum": color is not a field; colours come from the theme. Fix: { tone: "success" }.',
          '[ouro-ui] TimeGrid: two events have id "forum". Fix: give each event its own id.',
          '[ouro-ui] TimeGrid: event "nostart" has start="soon", which is not a date. Fix: { start: "2026-03-12T09:00:00Z" }, or start: "2026-03-12" for all day.',
          '[ouro-ui] TimeGrid: event "noend" has no end. Fix: { start, end: "2026-03-12T10:00:00Z" }.',
          '[ouro-ui] TimeGrid: event "backwards" ends before it starts. Fix: { start, end } with end after start.',
        ]),
      );
      expect(warnings()).toHaveLength(9);
    });

    it("names the real prop for the props agents guess, and the layout class for appearance", async () => {
      await render({
        ...({ defaultView: "week", defaultDate: "2026-03-12", onSelectEvent: () => {}, onSelectSlot: () => {}, scrollToTime: new Date() } as object),
        className: "bg-red-500",
      });
      expect(warnings()).toEqual(
        expect.arrayContaining([
          '[ouro-ui] TimeGrid: defaultView is not a prop; the app keeps the view. Fix: <TimeGrid view="work-week">.',
          '[ouro-ui] TimeGrid: defaultDate is not a prop; the app keeps the date. Fix: <TimeGrid date="2026-03-12">.',
          "[ouro-ui] TimeGrid: onSelectEvent is not a prop. Fix: <TimeGrid onEventSelect={(event) => open(event.id)}>.",
          "[ouro-ui] TimeGrid: onSelectSlot is not a prop. Fix: <TimeGrid onSlotSelect={({ start, end }) => create(start, end)}>.",
          "[ouro-ui] TimeGrid: scrollToTime is not a prop; the grid opens at now or at the working day's start. Fix: <TimeGrid workingHours={{ start: 8, end: 17 }}>.",
          '[ouro-ui] TimeGrid: "bg-red-500" sets appearance, and className is for layout only. Fix: <TimeGrid className="h-[40rem]" />, and set colors in your theme\'s CSS variables, or tone on an event.',
        ]),
      );
      expect(document.querySelector('[data-ouro="time-grid"]')!.hasAttribute("defaultView")).toBe(false);
    });
  });
});
