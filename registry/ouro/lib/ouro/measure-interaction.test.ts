import { afterEach, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { measureInteraction, onInteraction, type InteractionReport } from "@/registry/ouro/lib/ouro/measure-interaction";

type Entry = { name: string; startTime: number; duration: number; interactionId?: number; target?: Node | null };
type Observed = { callback: (list: { getEntries(): Entry[] }) => void; options: unknown[]; disconnected: boolean };

const stops: (() => void)[] = [];
const listen = () => {
  const reports: InteractionReport[] = [];
  stops.push(onInteraction((report) => reports.push(report)));
  return reports;
};
const frames = (count = 3) =>
  new Promise<void>((resolve) => {
    const step = (left: number) => (left === 0 ? resolve() : requestAnimationFrame(() => step(left - 1)));
    step(count);
  });

/** A stand-in for the browser's Event Timing: the test emits the entries an observer would get. */
function fakeEventTiming() {
  const observed: Observed[] = [];
  class FakeObserver {
    static supportedEntryTypes = ["event", "paint"];
    record: Observed;
    constructor(callback: Observed["callback"]) {
      this.record = { callback, options: [], disconnected: false };
      observed.push(this.record);
    }
    observe(options: unknown) {
      this.record.options.push(options);
    }
    disconnect() {
      this.record.disconnected = true;
    }
  }
  function FakeEventTiming() {}
  FakeEventTiming.prototype.interactionId = 0;
  vi.stubGlobal("PerformanceObserver", FakeObserver);
  vi.stubGlobal("PerformanceEventTiming", FakeEventTiming);
  const emit = (...entries: Entry[]) => {
    for (const record of observed) if (!record.disconnected) record.callback({ getEntries: () => entries });
  };
  return { observed, emit };
}

/** Dispatches `type` on a new button and runs `inside` in its listener, as a handler would. */
function dispatch<T>(type: string, inside: () => T) {
  const button = document.createElement("button");
  document.body.append(button);
  let timeStamp = 0;
  let result: T | undefined;
  button.addEventListener(type, (event) => {
    timeStamp = event.timeStamp;
    result = inside();
  });
  button.dispatchEvent(new Event(type));
  return { button, timeStamp, result };
}

afterEach(() => {
  for (const stop of stops.splice(0)) stop();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("onInteraction", () => {
  it("starts one observer with the first sink, adds no timer or listener, and disconnects after the last", () => {
    const { observed } = fakeEventTiming();
    const timers = [vi.spyOn(globalThis, "setTimeout"), vi.spyOn(globalThis, "setInterval"), vi.spyOn(globalThis, "requestAnimationFrame")];
    const listeners = [vi.spyOn(window, "addEventListener"), vi.spyOn(document, "addEventListener")];
    const first = onInteraction(() => {});
    const second = onInteraction(() => {});
    expect(observed).toHaveLength(1);
    expect(observed[0]!.options).toEqual([{ type: "event", durationThreshold: 16 }]);
    for (const spy of [...timers, ...listeners]) expect(spy).not.toHaveBeenCalled();
    first();
    expect(observed[0]!.disconnected).toBe(false);
    second();
    expect(observed[0]!.disconnected).toBe(true);
    stops.push(onInteraction(() => {}));
    expect(observed).toHaveLength(2);
  });

  it("reports a click once, named by its type, with its target, from the press to the paint", () => {
    const { emit } = fakeEventTiming();
    const reports = listen();
    const button = document.createElement("button");
    emit({ name: "pointerdown", startTime: 10, duration: 24, interactionId: 5, target: button }, { name: "pointerup", startTime: 30, duration: 16, interactionId: 5, target: button });
    expect(reports).toEqual([]);
    emit({ name: "click", startTime: 31, duration: 40, interactionId: 5, target: button });
    expect(reports).toEqual([{ name: "click", durationMs: 40, target: button }]);
    emit({ name: "click", startTime: 31, duration: 64, interactionId: 5, target: button });
    expect(reports).toHaveLength(1);
  });

  it("names an interaction by its longest event, and reports a keyup's interaction to every sink", () => {
    const { emit } = fakeEventTiming();
    const first = listen();
    const second = listen();
    emit({ name: "pointerdown", startTime: 10, duration: 48, interactionId: 2 }, { name: "click", startTime: 40, duration: 24, interactionId: 2, target: document.createTextNode("x") });
    emit({ name: "keydown", startTime: 90, duration: 32, interactionId: 3 }, { name: "keyup", startTime: 120, duration: 16, interactionId: 3 });
    const expected = [
      { name: "pointerdown", durationMs: 48, target: null },
      { name: "keydown", durationMs: 32, target: null },
    ];
    expect(first).toEqual(expected);
    expect(second).toEqual(expected);
  });

  it("reports an interaction that ends without a click or keyup when the next one starts, with its longest event", () => {
    const { emit } = fakeEventTiming();
    const reports = listen();
    emit({ name: "pointerdown", startTime: 10, duration: 32, interactionId: 7 });
    emit({ name: "pointerup", startTime: 60, duration: 40, interactionId: 7 });
    expect(reports).toEqual([]);
    emit({ name: "keydown", startTime: 200, duration: 20, interactionId: 9 });
    expect(reports).toEqual([{ name: "pointerup", durationMs: 40, target: null }]);
    emit({ name: "keyup", startTime: 230, duration: 24, interactionId: 9 });
    expect(reports.map((report) => report.name)).toEqual(["pointerup", "keyup"]);
  });

  it("names an interaction by the first of its equally long events", () => {
    const { emit } = fakeEventTiming();
    const reports = listen();
    emit({ name: "pointerdown", startTime: 10, duration: 32, interactionId: 7 }, { name: "pointerup", startTime: 60, duration: 32, interactionId: 7 });
    emit({ name: "keydown", startTime: 200, duration: 20, interactionId: 9 });
    expect(reports).toEqual([{ name: "pointerdown", durationMs: 32, target: null }]);
  });

  it("forgets an interaction it was waiting on once the last sink stops", () => {
    const { emit } = fakeEventTiming();
    const stop = onInteraction(() => {});
    emit({ name: "pointerdown", startTime: 10, duration: 32, interactionId: 7 });
    stop();
    const reports = listen();
    emit({ name: "keydown", startTime: 200, duration: 20, interactionId: 9 }, { name: "keyup", startTime: 230, duration: 16, interactionId: 9 });
    expect(reports).toEqual([{ name: "keydown", durationMs: 20, target: null }]);
  });

  it("leaves out events that are no interaction: a hover or a scroll with no label", () => {
    const { emit } = fakeEventTiming();
    const reports = listen();
    emit({ name: "pointerover", startTime: 10, duration: 40, interactionId: 0 }, { name: "wheel", startTime: 20, duration: 40 });
    expect(reports).toEqual([]);
  });

  it("remembers the last 64 interactions it reported, so a page that runs for days stays small", () => {
    const { emit } = fakeEventTiming();
    const reports = listen();
    for (let id = 1; id <= 65; id += 1) emit({ name: "click", startTime: id, duration: 20, interactionId: id });
    emit({ name: "click", startTime: 1, duration: 20, interactionId: 65 }, { name: "click", startTime: 1, duration: 20, interactionId: 1 });
    expect(reports).toHaveLength(66);
  });

  it("in a browser with Event Timing, measures a real slow click from the press to the paint", async (context) => {
    context.skip(!PerformanceObserver.supportedEntryTypes.includes("event"), "this browser has no Event Timing");
    const reports = listen();
    const button = document.createElement("button");
    button.textContent = "Slow";
    button.addEventListener("click", () => {
      const until = performance.now() + 60;
      while (performance.now() < until);
      button.textContent = "Done";
    });
    document.body.append(button);
    await userEvent.click(button);
    await expect.poll(() => reports.find((report) => report.target === button)?.durationMs ?? 0).toBeGreaterThanOrEqual(60);
  });
});

describe("measureInteraction", () => {
  it("with no sink only runs fn and returns its result, scheduling nothing", () => {
    const frame = vi.spyOn(globalThis, "requestAnimationFrame");
    expect(measureInteraction("save", () => 42)).toBe(42);
    expect(dispatch("click", () => measureInteraction("save", () => "saved")).result).toBe("saved");
    expect(frame).not.toHaveBeenCalled();
  });

  it("reports a labelled click once, by its label, from the press to the paint", async () => {
    const { emit } = fakeEventTiming();
    const reports = listen();
    const { button, timeStamp, result } = dispatch("click", () => measureInteraction("open filters", () => 42));
    expect(result).toBe(42);
    emit({ name: "click", startTime: timeStamp - 500, duration: 20, interactionId: 2 });
    emit({ name: "pointerdown", startTime: timeStamp - 20, duration: 56, interactionId: 3, target: button });
    emit({ name: "pointerup", startTime: timeStamp, duration: 16, interactionId: 3 });
    expect(reports).toHaveLength(1);
    emit({ name: "click", startTime: timeStamp, duration: 32, interactionId: 3, target: button });
    expect(reports).toEqual([
      { name: "click", durationMs: 20, target: null },
      { name: "open filters", durationMs: 56, target: button },
    ]);
    emit({ name: "click", startTime: timeStamp, duration: 32, interactionId: 3, target: button }, { name: "keyup", startTime: timeStamp + 9, duration: 24, interactionId: 3 });
    emit({ name: "click", startTime: timeStamp + 900, duration: 24, interactionId: 4 });
    await frames();
    expect(reports.map((report) => report.name)).toEqual(["click", "open filters", "click"]);
  });

  it("reports a labelled hover by its own event, which belongs to no interaction, falling back to its target", () => {
    const { emit } = fakeEventTiming();
    const reports = listen();
    const { button, timeStamp } = dispatch("pointerenter", () => measureInteraction("show preview", () => undefined));
    emit({ name: "pointerenter", startTime: timeStamp, duration: 16, interactionId: 0 });
    expect(reports).toEqual([{ name: "show preview", durationMs: 16, target: button }]);
  });

  it("reports from the event to the second animation frame when no entry arrives first, and ignores a later entry", async () => {
    const { emit } = fakeEventTiming();
    const reports = listen();
    const { button, timeStamp } = dispatch("click", () => measureInteraction("save", () => undefined));
    await expect.poll(() => reports.length).toBe(1);
    expect(reports[0]!.name).toBe("save");
    expect(reports[0]!.target).toBe(button);
    expect(reports[0]!.durationMs).toBeGreaterThan(0);
    emit({ name: "click", startTime: timeStamp, duration: 300, interactionId: 4, target: button });
    expect(reports).toHaveLength(1);
  });

  it("outside an event handler times from the call and says so in development, once per name", async () => {
    fakeEventTiming();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const reports = listen();
    const before = performance.now();
    measureInteraction("sync now", () => undefined);
    measureInteraction("sync now", () => undefined);
    expect(warn.mock.calls).toEqual([
      ['[ouro-ui] measureInteraction: "sync now" ran outside an event handler, so it is timed from the call, not from the input. Fix: onClick={() => measureInteraction("sync now", () => …)}.'],
    ]);
    await expect.poll(() => reports.length).toBe(2);
    for (const report of reports) {
      expect(report.target).toBeNull();
      expect(report.durationMs).toBeLessThanOrEqual(performance.now() - before);
    }
  });

  it("reports nothing once every sink has stopped, even for an interaction already labelled", async () => {
    fakeEventTiming();
    const reports: InteractionReport[] = [];
    const stop = onInteraction((report) => reports.push(report));
    dispatch("click", () => measureInteraction("save", () => undefined));
    stop();
    await frames();
    expect(reports).toEqual([]);
  });

  it("remembers the last 64 labels, so an entry for an older one is no longer matched", async () => {
    const { emit } = fakeEventTiming();
    const reports = listen();
    const stamps = Array.from({ length: 65 }, (_, index) => dispatch(`press${index}`, () => measureInteraction(`label ${index}`, () => index)).timeStamp);
    emit({ name: "press0", startTime: stamps[0]!, duration: 999, interactionId: 0 }, { name: "press1", startTime: stamps[1]!, duration: 998, interactionId: 0 });
    expect(reports).toEqual([{ name: "label 1", durationMs: 998, target: expect.any(HTMLButtonElement) }]);
    await expect.poll(() => reports.length).toBe(65);
    expect(reports.filter((report) => report.durationMs === 999)).toEqual([]);
  });
});

describe("without Event Timing", () => {
  it.each([
    ["no PerformanceObserver", () => vi.stubGlobal("PerformanceObserver", undefined)],
    ["no event entries", () => vi.stubGlobal("PerformanceObserver", Object.assign(function () {}, { supportedEntryTypes: ["paint"] }))],
    ["no PerformanceEventTiming", () => (fakeEventTiming(), vi.stubGlobal("PerformanceEventTiming", undefined))],
    ["no interactionId", () => (fakeEventTiming(), vi.stubGlobal("PerformanceEventTiming", function () {}))],
  ])("reports only labelled interactions, timed to the second animation frame (%s)", async (_, stub) => {
    stub();
    const reports = listen();
    const { button } = dispatch("click", () => measureInteraction("save", () => undefined));
    await expect.poll(() => reports).toEqual([{ name: "save", durationMs: expect.any(Number), target: button }]);
  });
});
