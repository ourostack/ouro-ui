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

  it("reports a press the fallback reported once, leaving out its earlier event that was waiting", async () => {
    const { emit } = fakeEventTiming();
    const reports = listen();
    const { button, timeStamp } = dispatch("click", () => measureInteraction("save", () => undefined));
    const other = document.createElement("button");
    emit({ name: "pointerdown", startTime: timeStamp - 30, duration: 40, interactionId: 5, target: button });
    await expect.poll(() => reports.map((report) => report.name)).toEqual(["save"]);
    emit({ name: "pointerdown", startTime: timeStamp + 1500, duration: 40, interactionId: 6, target: other });
    emit({ name: "keydown", startTime: timeStamp + 2000, duration: 24, interactionId: 7 }, { name: "keyup", startTime: timeStamp + 2050, duration: 16, interactionId: 7 });
    expect(reports.map((report) => report.name)).toEqual(["save", "pointerdown", "keydown"]);
    expect(reports[1]!.target).toBe(other);
  });

  it("leaves out the rest of a press's interaction once the fallback took its earlier event", async () => {
    const { emit } = fakeEventTiming();
    const reports = listen();
    const { button, timeStamp } = dispatch("click", () => measureInteraction("save", () => undefined));
    emit({ name: "pointerdown", startTime: timeStamp - 30, duration: 40, interactionId: 5, target: button });
    await expect.poll(() => reports.map((report) => report.name)).toEqual(["save"]);
    emit({ name: "click", startTime: timeStamp + 5, duration: 30, interactionId: 5, target: button });
    expect(reports.map((report) => report.name)).toEqual(["save"]);
  });

  it("keeps waiting on another press's event when the fallback reports a label", async () => {
    const { emit } = fakeEventTiming();
    const reports = listen();
    dispatch("click", () => measureInteraction("save", () => undefined));
    const other = document.createElement("button");
    emit({ name: "pointerdown", startTime: 5, duration: 40, interactionId: 5, target: other });
    await expect.poll(() => reports.map((report) => report.name)).toEqual(["save"]);
    emit({ name: "keydown", startTime: 9000, duration: 24, interactionId: 7 });
    expect(reports.map((report) => report.name)).toEqual(["save", "pointerdown"]);
  });

  it("leaves out a later event of a press the fallback reported, but not another press, an event with no target or one long after", async () => {
    const { emit } = fakeEventTiming();
    const reports = listen();
    const { button, timeStamp } = dispatch("keydown", () => measureInteraction("next row", () => undefined));
    await expect.poll(() => reports.length).toBe(1);
    emit({ name: "keyup", startTime: timeStamp + 50, duration: 24, interactionId: 8, target: button });
    expect(reports).toHaveLength(1);
    emit({ name: "keydown", startTime: timeStamp + 100, duration: 20, interactionId: 9, target: button }, { name: "keyup", startTime: timeStamp + 150, duration: 16, interactionId: 9, target: button });
    emit({ name: "click", startTime: timeStamp + 200, duration: 28, interactionId: 10 });
    emit({ name: "click", startTime: timeStamp + 5000, duration: 32, interactionId: 11, target: button });
    expect(reports.map((report) => [report.name, report.durationMs])).toEqual([
      ["next row", reports[0]!.durationMs],
      ["keydown", 20],
      ["click", 28],
      ["click", 32],
    ]);
  });

  it("takes another event for the reported press within a second of the label, on its target", async () => {
    const { emit } = fakeEventTiming();
    const reports = listen();
    const labelled = [0, 1, 2, 3].map((index) => dispatch("keydown", () => measureInteraction(`row ${index}`, () => undefined)));
    await expect.poll(() => reports.length).toBe(4);
    const [first, second, third, fourth] = labelled as [ReturnType<typeof dispatch>, ReturnType<typeof dispatch>, ReturnType<typeof dispatch>, ReturnType<typeof dispatch>];
    emit({ name: "keyup", startTime: first.timeStamp - 1000, duration: 20, interactionId: 20, target: first.button });
    emit({ name: "keyup", startTime: second.timeStamp + 1000, duration: 20, interactionId: 21, target: second.button });
    emit({ name: "keyup", startTime: third.timeStamp - 1001, duration: 20, interactionId: 22, target: third.button });
    emit({ name: "keyup", startTime: fourth.timeStamp + 1001, duration: 20, interactionId: 23, target: fourth.button });
    expect(reports.slice(4).map((report) => report.target)).toEqual([third.button, fourth.button]);
  });

  it("takes a press's event that comes after one it could not place, and leaves out the rest of its interaction", async () => {
    const { emit } = fakeEventTiming();
    const reports = listen();
    const { button, timeStamp } = dispatch("click", () => measureInteraction("save", () => undefined));
    emit({ name: "pointerdown", startTime: timeStamp - 30, duration: 40, interactionId: 5 });
    await expect.poll(() => reports.map((report) => report.name)).toEqual(["save"]);
    emit({ name: "pointerup", startTime: timeStamp - 10, duration: 32, interactionId: 5, target: button });
    emit({ name: "click", startTime: timeStamp + 5, duration: 30, interactionId: 5, target: button });
    emit({ name: "keydown", startTime: timeStamp + 3000, duration: 24, interactionId: 7 }, { name: "keyup", startTime: timeStamp + 3050, duration: 16, interactionId: 7 });
    expect(reports.map((report) => report.name)).toEqual(["save", "keydown"]);
  });

  it("drops a fallback when the page was or became hidden before the second frame, and stops listening", async () => {
    fakeEventTiming();
    const reports = listen();
    const removed = vi.spyOn(document, "removeEventListener");
    const hide = () => Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    const show = () => Reflect.deleteProperty(document, "visibilityState");
    try {
      dispatch("click", () => measureInteraction("stays visible", () => undefined));
      document.dispatchEvent(new Event("visibilitychange"));
      await frames();
      hide();
      dispatch("click", () => measureInteraction("hidden first", () => undefined));
      show();
      await frames();
      dispatch("click", () => measureInteraction("hides", () => undefined));
      hide();
      document.dispatchEvent(new Event("visibilitychange"));
      show();
      await frames();
      expect(reports.map((report) => report.name)).toEqual(["stays visible"]);
      expect(removed.mock.calls.filter(([type]) => type === "visibilitychange")).toHaveLength(3);
    } finally {
      show();
    }
  });

  it("outside an event handler times from the call and says so in development, once per name", async () => {
    const { emit } = fakeEventTiming();
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
    emit({ name: "click", startTime: performance.now(), duration: 24, interactionId: 30, target: document.body });
    expect(reports.map((report) => report.name)).toEqual(["sync now", "sync now", "click"]);
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
