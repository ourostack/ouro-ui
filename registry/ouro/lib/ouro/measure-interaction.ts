import { devWarn } from "@/registry/ouro/lib/ouro/dev";

export { measureInteraction, onInteraction };
export type { InteractionReport, InteractionSink };

/**
 * One interaction, measured from the input to the next paint.
 *
 * - `name`: the label `measureInteraction` gave it, or else the event's type (`click`, `keydown`).
 * - `durationMs`: from the input to the paint after its handlers ran, in milliseconds.
 * - `target`: the element the input went to, or `null` when the page has removed it.
 */
interface InteractionReport {
  name: string;
  durationMs: number;
  target: Element | null;
}

/** Where `onInteraction` sends its reports: your analytics, a test's list, a console. */
type InteractionSink = (report: InteractionReport) => void;

/** An Event Timing entry, as far as this file reads it. */
interface EventEntry {
  name: string;
  startTime: number;
  duration: number;
  interactionId?: number;
  target?: Node | null;
}

/** A label `measureInteraction` gave the event it ran in, until that event is reported. */
interface Label {
  name: string;
  type: string | undefined;
  timeStamp: number;
  target: Element | null;
  reported: boolean;
}

// Event Timing reports an event only when it took this long or longer; 16 ms is its floor.
const DURATION_THRESHOLD = 16;
// The events that end an interaction: once one is reported, the interaction is whole.
const LAST_EVENTS = new Set(["click", "keyup"]);
// How many labels and reported interactions to remember, so a page that runs for days stays small.
const REMEMBERED = 64;

const sinks = new Set<InteractionSink>();
// Stryker disable next-line ArrayDeclaration: a stray first element matches no entry, and the cap shifts it out with no other change
const labels: Label[] = [];
// Stryker disable next-line ArrayDeclaration: a stray first element equals no interaction id, and the cap shifts it out with no other change
const reported: number[] = [];
const pending = new Map<number, EventEntry>();
let observer: PerformanceObserver | null = null;

const elementOf = (node: EventTarget | Node | null | undefined): Element | null => (node instanceof Element ? node : null);

function report(name: string, durationMs: number, target: Element | null) {
  for (const sink of [...sinks]) sink({ name, durationMs, target });
}

function remember<T>(list: T[], item: T) {
  list.push(item);
  if (list.length > REMEMBERED) list.shift();
}

function eventTimingSupported() {
  return (
    typeof PerformanceObserver !== "undefined" &&
    PerformanceObserver.supportedEntryTypes.includes("event") &&
    typeof PerformanceEventTiming !== "undefined" &&
    "interactionId" in PerformanceEventTiming.prototype
  );
}

// Reports the interaction an earlier entry left waiting, with its longest event.
function flush(id: number) {
  const longest = pending.get(id)!;
  pending.delete(id);
  remember(reported, id);
  report(longest.name, longest.duration, elementOf(longest.target));
}

function read(entries: EventEntry[]) {
  for (const entry of entries) {
    const id = entry.interactionId ?? 0;
    const label = labels.find((candidate) => candidate.type === entry.name && candidate.timeStamp === entry.startTime);
    if (label) {
      remember(reported, id);
      const earlier = pending.get(id);
      pending.delete(id);
      if (!label.reported) {
        label.reported = true;
        report(label.name, Math.max(entry.duration, earlier?.duration ?? 0), elementOf(entry.target) ?? label.target);
      }
      continue;
    }
    if (id === 0 || reported.includes(id)) continue;
    // Interaction ids only grow, so a new one means every interaction before it has ended.
    for (const older of [...pending.keys()]) if (older < id) flush(older);
    const longest = pending.get(id);
    if (!longest || entry.duration > longest.duration) pending.set(id, entry);
    if (LAST_EVENTS.has(entry.name)) flush(id);
  }
}

/**
 * Sends the page's interactions to `sink`, measured from the input to the next paint, so an app
 * can hold them to a budget. It reads the browser's Event Timing (a `PerformanceObserver` of
 * `event` entries, grouped by `interactionId`),
 * and reports an interaction once it ends: at its `click` or `keyup`, or, for one with neither,
 * when the next one starts. An interaction is named by its longest event's type unless
 * `measureInteraction` labelled it. In a browser without Event Timing, only labelled interactions are
 * reported. Returns the function that stops sending to `sink`.
 *
 * It costs nothing at idle: no timer and no listener, only the observer, which it starts with the
 * first sink and disconnects after the last one stops. Event Timing reports an event that took
 * 16 ms or longer, so a quicker unlabelled interaction is not reported.
 *
 * Use `measureInteraction` instead when you want a name for one interaction, or a measurement in a
 * browser without Event Timing.
 *
 * @claim "reports an interaction once it" registry/ouro/lib/ouro/measure-interaction.test.ts verify:testExists(registry/ouro/lib/ouro/measure-interaction.test.ts::onInteraction > reports a click once, named by its type, with its target, from the press to the paint)
 * @claim "for one with neither, when" registry/ouro/lib/ouro/measure-interaction.test.ts verify:testExists(registry/ouro/lib/ouro/measure-interaction.test.ts::onInteraction > reports an interaction that ends without a click or keyup when the next one starts, with its longest event)
 * @claim "In a browser without Event" registry/ouro/lib/ouro/measure-interaction.test.ts verify:testExists(registry/ouro/lib/ouro/measure-interaction.test.ts::without Event Timing > reports only labelled interactions, timed to the second animation frame (%s))
 * @claim "It costs nothing at idle" registry/ouro/lib/ouro/measure-interaction.test.ts verify:testExists(registry/ouro/lib/ouro/measure-interaction.test.ts::onInteraction > starts one observer with the first sink, adds no timer or listener, and disconnects after the last)
 * @claim "Event Timing reports an event" https://www.w3.org/TR/event-timing/ verify:urlOk(https://www.w3.org/TR/event-timing/)
 * @group App setup
 *
 * @example
 * const stop = onInteraction(({ name, durationMs }) => {
 *   if (durationMs > 100) analytics.track("slow interaction", { name, durationMs });
 * });
 */
function onInteraction(sink: InteractionSink): () => void {
  sinks.add(sink);
  if (!observer && eventTimingSupported()) {
    observer = new PerformanceObserver((list) => read(list.getEntries() as EventEntry[]));
    observer.observe({ type: "event", durationThreshold: DURATION_THRESHOLD } as PerformanceObserverInit);
  }
  return () => {
    sinks.delete(sink);
    if (sinks.size === 0) {
      observer?.disconnect();
      observer = null;
      labels.length = 0;
      reported.length = 0;
      pending.clear();
    }
  };
}

/**
 * Runs `fn` in an event handler and names the interaction it belongs to, so the reports
 * `onInteraction` sends carry `name`. The report measures from the input to the next paint: the
 * Event Timing entry for this event, or, where none has arrived by the second animation frame
 * after it (in a browser without Event Timing, or for an event quicker than 16 ms), the time from
 * the event to that frame. Each labelled interaction is reported once. Returns what `fn` returns. Call it inside the handler: outside one,
 * it times from the call, and says so in development. With no sink it only runs `fn`.
 *
 * Use `onInteraction` instead to measure every interaction without naming it.
 *
 * @claim "Each labelled interaction is reported" registry/ouro/lib/ouro/measure-interaction.test.ts verify:testExists(registry/ouro/lib/ouro/measure-interaction.test.ts::measureInteraction > reports a labelled click once, by its label, from the press to the paint)
 * @claim "where none has arrived by" registry/ouro/lib/ouro/measure-interaction.test.ts verify:testExists(registry/ouro/lib/ouro/measure-interaction.test.ts::without Event Timing > reports only labelled interactions, timed to the second animation frame (%s))
 * @claim "it times from the call" registry/ouro/lib/ouro/measure-interaction.test.ts verify:testExists(registry/ouro/lib/ouro/measure-interaction.test.ts::measureInteraction > outside an event handler times from the call and says so in development, once per name)
 * @claim "With no sink it only" registry/ouro/lib/ouro/measure-interaction.test.ts verify:testExists(registry/ouro/lib/ouro/measure-interaction.test.ts::measureInteraction > with no sink only runs fn and returns its result, scheduling nothing)
 * @group App setup
 *
 * @example
 * <Button onClick={() => measureInteraction("open filters", () => setOpen(true))}>Filters</Button>
 */
function measureInteraction<T>(name: string, fn: () => T): T {
  if (sinks.size === 0) return fn();
  const event = (globalThis as { event?: Event | undefined }).event;
  if (!event && process.env.NODE_ENV !== "production") {
    devWarn(
      "measureInteraction",
      `"${name}" ran outside an event handler, so it is timed from the call, not from the input`,
      `onClick={() => measureInteraction("${name}", () => …)}`,
    );
  }
  const label: Label = {
    name,
    type: event?.type,
    timeStamp: event?.timeStamp ?? performance.now(),
    target: elementOf(event?.target),
    reported: false,
  };
  remember(labels, label);
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      if (label.reported || !sinks.size) return;
      label.reported = true;
      report(label.name, performance.now() - label.timeStamp, label.target);
    }),
  );
  return fn();
}
