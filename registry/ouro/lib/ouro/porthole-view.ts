export { PORTHOLE_DEFAULTS, PORTHOLE_PRIORITIES, PORTHOLE_SNAPSHOT_VERSION, formatPortholeAge, portholeStatus, portholeView };
export type {
  PortholeArea,
  PortholeAreaView,
  PortholeItem,
  PortholeItemAction,
  PortholeLabels,
  PortholePriority,
  PortholeSnapshot,
  PortholeSource,
  PortholeState,
  PortholeStatus,
  PortholeStatusRead,
  PortholeView,
  PortholeViewOptions,
};

/**
 * How urgent an item is, most urgent first: `action` (it waits for the person), `error`, `working` and `rest` (news
 * that needs nothing, such as "Up to date"). The most urgent item is the one shown; on a tie, the newest `since` wins.
 *
 * @claim "How urgent an item is" registry/ouro/lib/ouro/porthole-view.test.ts verify:testExists(registry/ouro/lib/ouro/porthole-view.test.ts::portholeView > shows an action over an error, an error over working and working over rest)
 * @claim "The most urgent item is" registry/ouro/lib/ouro/porthole-view.test.ts verify:testExists(registry/ouro/lib/ouro/porthole-view.test.ts::portholeView > shows an action over an error, an error over working and working over rest)
 * @claim "the newest `since` wins" registry/ouro/lib/ouro/porthole-view.test.ts verify:testExists(registry/ouro/lib/ouro/porthole-view.test.ts::portholeView > on a tie in priority, shows the item with the newest since, and the lower id when since ties too)
 */
type PortholePriority = "action" | "error" | "working" | "rest";

/**
 * The priorities, most urgent first.
 *
 * @claim "The priorities, most urgent first" registry/ouro/lib/ouro/porthole-view.test.ts verify:testExists(registry/ouro/lib/ouro/porthole-view.test.ts::portholeView > shows an action over an error, an error over working and working over rest)
 */
const PORTHOLE_PRIORITIES: readonly PortholePriority[] = Object.freeze(["action", "error", "working", "rest"] as const);

/** The snapshot version this view reads; a snapshot with another version reads as "Status unknown". */
const PORTHOLE_SNAPSHOT_VERSION = 1;

/**
 * A button an item offers the person, such as "Restart to update". It is the person's to press: the window maps `id`
 * to its handler.
 */
interface PortholeItemAction {
  id: string;
  label: string;
}

/**
 * One thing the service wants the status spot to say: plain JSON, so the window, a CLI and an agent read the same.
 *
 * - `id`: stable, such as `"sync"`, `"update"` or `"offline"`.
 * - `label`: the short line shown, such as `"Catching up… 40%"` or `"Restart to update"`.
 * - `detail`: the lines shown when the spot is open.
 * - `progress`: 0 to 1, for a `working` item.
 * - `since`: when the item began, in ms since the epoch; on a tie in priority the newest is shown.
 * - `dismissable`: the person may dismiss it, as with "Up to date". The window passes the dismissal to the service,
 *   which removes the item.
 *
 * @claim "0 to 1, for a" registry/ouro/lib/ouro/porthole-view.test.ts verify:testExists(registry/ouro/lib/ouro/porthole-view.test.ts::portholeStatus > reads the rest state with no item, and an item's progress between 0 and 1)
 * @claim "on a tie in priority the newest" registry/ouro/lib/ouro/porthole-view.test.ts verify:testExists(registry/ouro/lib/ouro/porthole-view.test.ts::portholeView > on a tie in priority, shows the item with the newest since, and the lower id when since ties too)
 */
interface PortholeItem {
  id: string;
  priority: PortholePriority;
  label: string;
  detail?: readonly string[] | undefined;
  progress?: number | undefined;
  action?: PortholeItemAction | undefined;
  dismissable?: boolean | undefined;
  since: number;
}

/**
 * What the service has verified about one area of data (chats, activity, calendar): when its data was last verified
 * current (`lastVerifiedAt`, null until it has been once), and when its current read began to hang or fail
 * (`troubleSince`, null otherwise). Only verified facts belong here: an error not seen is not a
 * verification. A time this view cannot read, in either, leaves the area unknown.
 */
interface PortholeArea {
  lastVerifiedAt: number | null;
  troubleSince: number | null;
  /** The area's name in the open spot's lines. @default its key */
  label?: string | undefined;
  /**
   * How long this area stays fresh after it was verified, in ms, in place of the view's `freshWithinMs`: for an area
   * the service reads on an interval rather than hears pushed, the interval plus a margin measured from how long a read
   * takes (`5 * 60_000 + margin` for one read every five minutes). A value that is not a finite number of 0 or more
   * leaves the view's.
   *
   * @claim "in place of the view's `freshWithinMs`" registry/ouro/lib/ouro/porthole-view.test.ts verify:testExists(registry/ouro/lib/ouro/porthole-view.test.ts::portholeView > an area's own freshWithinMs > replaces the view's for that area alone, up to and including the window itself)
   * @claim "A value that is not a" registry/ouro/lib/ouro/porthole-view.test.ts verify:testExists(registry/ouro/lib/ouro/porthole-view.test.ts::portholeView > an area's own freshWithinMs > falls back to the view's for a value it cannot use)
   */
  freshWithinMs?: number | undefined;
  /** The service's few words on how it keeps this area current, such as `"every 5 min"` or `"live"`, for the area's line. */
  note?: string | undefined;
}

/**
 * The service's one truth for the status spot, as plain JSON: the items it wants said and what it has verified per area.
 * The heartbeat is not part of it: the service sends a snapshot when it changes, and beats on its own (see
 * {@link PortholeSource}).
 */
interface PortholeSnapshot {
  version: typeof PORTHOLE_SNAPSHOT_VERSION;
  items: readonly PortholeItem[];
  areas: Readonly<Record<string, PortholeArea>>;
}

/**
 * The window's mirror of the service: the snapshot, with `subscribe` called when it changes (the shape React's
 * `useSyncExternalStore` takes), and apart from it `lastBeatAt`, the last time the service proved it is alive, in ms
 * since the epoch, which the status spot reads when a deadline it scheduled comes.
 */
interface PortholeSource {
  getSnapshot(): PortholeSnapshot;
  subscribe(listener: () => void): () => void;
  lastBeatAt(): number;
}

/**
 * Words for the spot, for apps in other languages. Each is optional and falls back to the English default.
 *
 * @claim "Each is optional and falls" registry/ouro/lib/ouro/porthole-view.test.ts verify:testExists(registry/ouro/lib/ouro/porthole-view.test.ts::portholeView > takes words in another language for every line it writes)
 */
interface PortholeLabels {
  /** At rest and fresh. @default "Updated just now" */
  fresh?: string | undefined;
  /** At rest with an area past fresh, given the oldest area's age (`"4 min"`). @default (age) => `Updated ${age} ago` */
  stale?: ((age: string) => string) | undefined;
  /** When the spot cannot vouch for anything. @default "Status unknown" */
  unknown?: string | undefined;
  /**
   * An age in ms as words (`"less than a minute"`, `"4 min"`, `"3 hr"`, `"2 days"`). The view looks again when
   * `formatPortholeAge`'s words would change, on the minute under an hour, the hour under a day and the day after, so
   * words that step differently refresh on those moments. @default formatPortholeAge
   *
   * @claim "The view looks again when" registry/ouro/lib/ouro/porthole-view.test.ts verify:testExists(registry/ouro/lib/ouro/porthole-view.test.ts::portholeView > nextChangeAt > past fresh, is the moment the oldest age shown reaches its next minute, hour or day)
   */
  age?: ((ms: number) => string) | undefined;
  /**
   * A line in the open spot for an area past fresh, given its label, its age (null until verified, or when not
   * checkable), how long its trouble has lasted (null without trouble) and the area's `note` (null without one).
   * @default `${label}: verified ${age} ago`, or `not verified yet`, then `, in trouble for ${trouble}` and `, ${note}`
   */
  area?: ((label: string, age: string | null, trouble: string | null, note: string | null) => string) | undefined;
  /**
   * A fresh area's line in the open spot, given its label, its age (null while it was verified within the last minute,
   * which reads as "just now") and the area's `note` (null without one). An area fresh for longer than a minute, by its
   * own `freshWithinMs`, gives its age, so its line never says "just now" of a read minutes old.
   * @default `${label}: verified just now`, or `verified ${age} ago`, then `, ${note}`
   *
   * @claim "so its line never says" registry/ouro/lib/ouro/porthole-view.test.ts verify:testExists(registry/ouro/lib/ouro/porthole-view.test.ts::portholeView > an area's own freshWithinMs > gives a fresh area's age past a minute, and its note, in its line)
   */
  areaFresh?: ((label: string, age: string | null, note: string | null) => string) | undefined;
  /** The open spot's line when the heartbeat stopped, given how long ago the last beat was (null when not checkable). */
  silent?: ((age: string | null) => string) | undefined;
}

/** Options for {@link portholeView}. */
interface PortholeViewOptions {
  /**
   * "Updated just now" only while every area was verified within this many ms, or within its own `freshWithinMs`.
   * @default 60_000
   *
  * @claim "only while every area was" registry/ouro/lib/ouro/porthole-view.test.ts verify:testExists(registry/ouro/lib/ouro/porthole-view.test.ts::portholeView > takes its times from the options)
   */
  freshWithinMs?: number | undefined;
  /** "Status unknown" once the last heartbeat is older than this many ms. @default 5_000 */
  heartbeatTimeoutMs?: number | undefined;
  /** An area whose trouble has lasted this many ms stops counting as fresh, whatever its `lastVerifiedAt`. @default 5_000 */
  troubleAfterMs?: number | undefined;
  /** How far ahead of this clock a time from the service may be before it cannot be checked. @default 1_000 */
  skewToleranceMs?: number | undefined;
  labels?: PortholeLabels | undefined;
}

/**
 * What the status spot shows, as `data-porthole-state` names it: at rest and fresh (`rest-fresh`) or past fresh
 * (`rest-stale`), `unknown`, or the priority of the item shown.
 */
type PortholeState = "rest-fresh" | "rest-stale" | "unknown" | "action" | "error" | "working";

/** The state as the agent read names it: `action` is `needs-person`, and both rest states are `rest`. */
type PortholeStatus = "rest" | "working" | "error" | "needs-person" | "unknown";

/** One area as the view judged it on this clock. */
interface PortholeAreaView {
  id: string;
  label: string;
  lastVerifiedAt: number | null;
  /** Ms since it was verified, null until verified or when verified at a time too far ahead of this clock. */
  ageMs: number | null;
  /** `ageMs` as words, or null. */
  age: string | null;
  /** How long this area stays fresh after it was verified: its own `freshWithinMs`, or the view's. */
  freshWithinMs: number;
  /** The service's words on how it keeps this area current, or null. */
  note: string | null;
  troubleSince: number | null;
  /** Ms its trouble has lasted, null without trouble or when it began at a time too far ahead of this clock to time. */
  troubleMs: number | null;
  fresh: boolean;
  /** The area's line in the open spot. */
  line: string;
}

/** What the status spot shows now, from {@link portholeView}. */
interface PortholeView {
  state: PortholeState;
  status: PortholeStatus;
  /** The one line shown. */
  text: string;
  /** The item shown, or null when the spot is at rest or unknown. */
  item: PortholeItem | null;
  /**
   * The item that waits behind the line shown: a `rest` item while an area is past fresh or the status is unknown, or
   * an item a stopped heartbeat outranks. Null when nothing waits.
   */
  waiting: PortholeItem | null;
  /**
   * The lines the open spot shows: the shown item's own, or the waiting item's label and lines, then one per area, then
   * the heartbeat's when it stopped.
   */
  detail: readonly string[];
  areas: readonly PortholeAreaView[];
  /** The age of the area verified longest ago, null when any area cannot be dated. */
  oldestAgeMs: number | null;
  heartbeatAt: number;
  /** Ms since the last heartbeat, null when it cannot be checked. */
  heartbeatAgeMs: number | null;
  /** Whether the heartbeat is current, and so whether the snapshot can be trusted as live. */
  alive: boolean;
  /**
   * Whether every area is fresh and the heartbeat current, whatever item is shown.
   *
   * @claim "Whether every area is fresh" registry/ouro/lib/ouro/porthole-view.test.ts verify:testExists(registry/ouro/lib/ouro/porthole-view.test.ts::portholeStatus > says whether the data is fresh and the heartbeat alive, whatever is shown, as of the clock it was judged at)
   */
  fresh: boolean;
  /** The `now` the view was judged at. */
  asOf: number;
  /** What is shown (an item's id, `rest` or `unknown`) and why it wins. */
  priority: { shown: string; why: string };
  /**
   * The earliest time, in ms since the epoch on this clock, at which this view could change with no new snapshot and no
   * new beat: an area's fresh time running out, an age shown reaching its next minute, hour or day, the heartbeat
   * timing out, an area's trouble reaching `troubleAfterMs`, or, while the heartbeat is stopped, a look for its return
   * `heartbeatTimeoutMs` on, since beats do not notify the view. Null when nothing shown changes with time alone, as
   * for a snapshot of another version. Schedule one timeout for it, and again whenever the snapshot changes.
   *
  * @claim "at which this view could" registry/ouro/lib/ouro/porthole-view.test.ts verify:testExists(registry/ouro/lib/ouro/porthole-view.test.ts::portholeView > nextChangeAt > at rest and fresh, is the first of the heartbeat timing out and an area's fresh time running out)
   * @claim "a look for its return" registry/ouro/lib/ouro/porthole-view.test.ts verify:testExists(registry/ouro/lib/ouro/porthole-view.test.ts::portholeView > nextChangeAt > with the heartbeat stopped, looks for its return a heartbeat timeout on, and sees it come back from a stale, a missing or a NaN beat)
   */
  nextChangeAt: number | null;
}

/** The agent read of the status spot, the same JSON a CLI status command prints. */
interface PortholeStatusRead {
  version: typeof PORTHOLE_SNAPSHOT_VERSION;
  /** The `now` the view was judged at, in ms since the epoch. */
  asOf: number;
  state: PortholeStatus;
  headline: string;
  /**
   * Whether every area is fresh and the heartbeat current, whatever item is shown.
   *
   * @claim "Whether every area is fresh" registry/ouro/lib/ouro/porthole-view.test.ts verify:testExists(registry/ouro/lib/ouro/porthole-view.test.ts::portholeStatus > says whether the data is fresh and the heartbeat alive, whatever is shown, as of the clock it was judged at)
   */
  fresh: boolean;
  /** Whether the heartbeat is current, judged at `asOf`. */
  alive: boolean;
  heartbeatAt: number;
  /** Ms from the last beat to `asOf`, null when it cannot be checked. */
  heartbeatAgeMs: number | null;
  /**
   * Each area as the person reads it, with the window it was judged fresh by (`freshWithinMs`) and the service's
   * `note`, null without one.
   *
   * @claim "with the window it was judged" registry/ouro/lib/ouro/porthole-view.test.ts verify:testExists(registry/ouro/lib/ouro/porthole-view.test.ts::portholeStatus > gives each area the window it was judged fresh by and its note)
   */
  areas: {
    id: string;
    lastVerifiedAt: number | null;
    age: string | null;
    ageMs: number | null;
    freshWithinMs: number;
    note: string | null;
    troubleSince: number | null;
    troubleMs: number | null;
  }[];
  priority: { shown: string; why: string };
  /**
   * The item shown. `action` and `actionLabel` are the person's action, by id and by its words, for the person to press.
   */
  shown: {
    id: string;
    priority: PortholePriority;
    label: string;
    detail: string[];
    progress: number | null;
    action: string | null;
    actionLabel: string | null;
  } | null;
}

/**
 * The defaults of {@link PortholeViewOptions}' times: fresh within a minute, and a heartbeat or a known trouble over
 * five seconds ends "fresh".
 *
 * @claim "fresh within a minute" registry/ouro/lib/ouro/porthole-view.test.ts verify:testExists(registry/ouro/lib/ouro/porthole-view.test.ts::portholeView > uses a minute for fresh, five seconds for the heartbeat and for trouble, and a second for skew by default)
 */
const PORTHOLE_DEFAULTS = Object.freeze({ freshWithinMs: 60_000, heartbeatTimeoutMs: 5_000, troubleAfterMs: 5_000, skewToleranceMs: 1_000 });

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * An age in ms as short English words, rounded down so it never claims more recent than it is: `"less than a minute"`,
 * `"4 min"`, `"3 hr"`, `"1 day"`, `"2 days"`. It never counts seconds, so the words change at most once a minute.
 *
 * @claim "It never counts seconds" registry/ouro/lib/ouro/porthole-view.test.ts verify:testExists(registry/ouro/lib/ouro/porthole-view.test.ts::formatPortholeAge > rounds down to minutes, hours and days, and never counts seconds)
 * @group Feedback
 * @example
 * formatPortholeAge(4 * 60_000 + 59_000); // "4 min"
 * @claim "rounded down so it never" registry/ouro/lib/ouro/porthole-view.test.ts verify:testExists(registry/ouro/lib/ouro/porthole-view.test.ts::formatPortholeAge > rounds down to minutes, hours and days, and never counts seconds)
 */
function formatPortholeAge(age: number): string {
  if (age < MINUTE) return "less than a minute";
  if (age < HOUR) return `${Math.floor(age / MINUTE)} min`;
  if (age < DAY) return `${Math.floor(age / HOUR)} hr`;
  const days = Math.floor(age / DAY);
  return `${days} ${days === 1 ? "day" : "days"}`;
}

const rank: Readonly<Record<PortholePriority, number>> = { action: 0, error: 1, working: 2, rest: 3 };
const statusOf: Readonly<Record<PortholeState, PortholeStatus>> = {
  "rest-fresh": "rest",
  "rest-stale": "rest",
  unknown: "unknown",
  action: "needs-person",
  error: "error",
  working: "working",
};
const finite = (value: unknown): value is number => Number.isFinite(value);
const whyOf: Readonly<Record<PortholePriority, string>> = {
  action: "waits for the person, which outranks every other item",
  error: "is a problem, which outranks working and rest items",
  working: "is under way, and nothing waits for the person or has failed",
  rest: "is news that needs nothing, and nothing else is under way",
};

function usable(item: PortholeItem): boolean {
  return (
    typeof item?.id === "string" &&
    typeof item.label === "string" &&
    Object.hasOwn(rank, item.priority) &&
    finite(item.since)
  );
}

// Most urgent first; on a tie the newest `since`, then the lower id, so the order sent does not matter.
function compare(a: PortholeItem, b: PortholeItem): number {
  return rank[a.priority] - rank[b.priority] || b.since - a.since || (a.id < b.id ? -1 : 1);
}

/**
 * Decides what the status spot shows, as a pure function of the service's snapshot, its last heartbeat and this clock,
 * so a window, a CLI and a test reach the same answer.
 *
 * One item at a time: the most urgent (`action`, then `error`, `working`, `rest`); on a tie, the newest `since`. At
 * rest it says "Updated just now" only while every area was verified within `freshWithinMs` (the area's own, for one
 * the service reads on an interval) and none has been in trouble for `troubleAfterMs`; otherwise the real age of the area verified longest ago ("Updated 4 min ago"). A `rest`
 * item, such as "Up to date", shows over "Updated just now" only: past fresh, or unknown, the age line or "Status
 * unknown" wins and the item waits in the open spot's lines. It says "Status unknown" when an area has never been
 * verified, when the snapshot has no areas or another version, or when the heartbeat is older than
 * `heartbeatTimeoutMs` or too far ahead of this clock to check. A stopped heartbeat outranks every item, an `action`
 * too: nothing the service said can be trusted as live, and the action's button would reach a service that cannot
 * answer, so the item waits in the open spot's lines. `nextChangeAt` is the one moment to look again.
 *
 * Use `portholeStatus` instead for the JSON an agent or a CLI reads, and the `Porthole` component to show it.
 *
 * @group Feedback
 * @example
 * const view = portholeView(source.getSnapshot(), source.lastBeatAt(), Date.now());
 * view.text; // "Updated just now"
 * @claim "One item at a time: the" registry/ouro/lib/ouro/porthole-view.test.ts verify:testExists(registry/ouro/lib/ouro/porthole-view.test.ts::portholeView > shows an action over an error, an error over working and working over rest)
 * @claim "otherwise the real age of" registry/ouro/lib/ouro/porthole-view.test.ts verify:testExists(registry/ouro/lib/ouro/porthole-view.test.ts::portholeView > at rest, says the real age of the area verified longest ago once any area is past fresh)
 * @claim "when an area has never been" registry/ouro/lib/ouro/porthole-view.test.ts verify:testExists(registry/ouro/lib/ouro/porthole-view.test.ts::portholeView > says Status unknown at rest while any area has never been verified)
 * @claim "A `rest` item, such as" registry/ouro/lib/ouro/porthole-view.test.ts verify:testExists(registry/ouro/lib/ouro/porthole-view.test.ts::portholeView > a rest item shows over Updated just now only, and waits in the open lines while an area is past fresh or the status is unknown)
 * @claim "A stopped heartbeat outranks every" registry/ouro/lib/ouro/porthole-view.test.ts verify:testExists(registry/ouro/lib/ouro/porthole-view.test.ts::portholeView > a stopped heartbeat outranks every item, an action too, which waits in the open lines)
 * @claim "the area's own, for one" registry/ouro/lib/ouro/porthole-view.test.ts verify:testExists(registry/ouro/lib/ouro/porthole-view.test.ts::portholeView > an area's own freshWithinMs > replaces the view's for that area alone, up to and including the window itself)
 */
function portholeView(snapshot: PortholeSnapshot, heartbeatAt: number, now: number, options: PortholeViewOptions = {}): PortholeView {
  const freshWithinMs = options.freshWithinMs ?? PORTHOLE_DEFAULTS.freshWithinMs;
  const heartbeatTimeoutMs = options.heartbeatTimeoutMs ?? PORTHOLE_DEFAULTS.heartbeatTimeoutMs;
  const troubleAfterMs = options.troubleAfterMs ?? PORTHOLE_DEFAULTS.troubleAfterMs;
  const skew = options.skewToleranceMs ?? PORTHOLE_DEFAULTS.skewToleranceMs;
  const labels = options.labels ?? {};
  const age = labels.age ?? formatPortholeAge;
  const words = {
    fresh: labels.fresh ?? "Updated just now",
    stale: labels.stale ?? ((a: string) => `Updated ${a} ago`),
    unknown: labels.unknown ?? "Status unknown",
    area:
      labels.area ??
      ((label: string, a: string | null, trouble: string | null, note: string | null) =>
        `${label}: ${a === null ? "not verified yet" : `verified ${a} ago`}${trouble === null ? "" : `, in trouble for ${trouble}`}${noted(note)}`),
    areaFresh: labels.areaFresh ?? ((label: string, a: string | null, note: string | null) => `${label}: verified ${a === null ? "just now" : `${a} ago`}${noted(note)}`),
    silent: labels.silent ?? ((a: string | null) => (a === null ? "No heartbeat this clock can check" : `No heartbeat for ${a}`)),
  };

  // Ms from `at` to now, clamped at 0 within the skew tolerance; null when unknowable or too far ahead.
  const since = (at: unknown): number | null => (finite(at) && at - now <= skew ? Math.max(0, now - at) : null);

  const readable = snapshot?.version === PORTHOLE_SNAPSHOT_VERSION;
  const rawAreas = readable && typeof snapshot.areas === "object" && snapshot.areas !== null ? Object.entries(snapshot.areas) : [];
  // Areas whose trouble this view cannot read (an ISO string, say), which leaves them unknown as an unreadable
  // lastVerifiedAt does, and areas whose trouble is stamped too far ahead of this clock to time.
  const unreadableTrouble = new Set<string>();
  const troubleAhead = new Set<string>();
  const areas: PortholeAreaView[] = rawAreas.map(([id, area]) => {
    const lastVerifiedAt = finite(area?.lastVerifiedAt) ? area.lastVerifiedAt : null;
    const troubleSince = finite(area?.troubleSince) ? area.troubleSince : null;
    if (troubleSince === null && area?.troubleSince !== null && area?.troubleSince !== undefined) unreadableTrouble.add(id);
    const ageMs = since(lastVerifiedAt);
    const window = finite(area?.freshWithinMs) && area.freshWithinMs >= 0 ? area.freshWithinMs : freshWithinMs;
    const note = typeof area?.note === "string" && area.note !== "" ? area.note : null;
    // Trouble stamped too far ahead is trouble all the same, never waved away by skew, but no one measured how long
    // it has lasted, so its length is null.
    const troubleMs = since(troubleSince);
    if (troubleSince !== null && troubleMs === null) troubleAhead.add(id);
    const fresh =
      ageMs !== null && ageMs <= window && !unreadableTrouble.has(id) && !troubleAhead.has(id) && (troubleMs === null || troubleMs < troubleAfterMs);
    const label = typeof area?.label === "string" && area.label !== "" ? area.label : id;
    const ageText = ageMs === null ? null : age(ageMs);
    return {
      id,
      label,
      lastVerifiedAt,
      ageMs,
      age: ageText,
      freshWithinMs: window,
      note,
      troubleSince,
      troubleMs,
      fresh,
      line: fresh ? words.areaFresh(label, ageMs! > MINUTE ? ageText : null, note) : words.area(label, ageText, troubleMs === null ? null : age(troubleMs), note),
    };
  });

  const heartbeatAgeMs = since(heartbeatAt);
  const alive = heartbeatAgeMs !== null && heartbeatAgeMs <= heartbeatTimeoutMs;

  const items: PortholeItem[] = readable && Array.isArray(snapshot.items) ? snapshot.items.filter(usable).sort(compare) : [];
  const top = items[0] ?? null;
  const ties = (priority: PortholePriority) => items.filter((item) => item.priority === priority).length;

  const undated = areas.find((area) => area.ageMs === null || unreadableTrouble.has(area.id));
  const oldest = undated || areas.length === 0 ? null : areas.reduce((a, b) => (b.ageMs! > a.ageMs! ? b : a));
  const oldestAgeMs = oldest === null ? null : oldest.ageMs;

  let state: PortholeState;
  let item: PortholeItem | null = null;
  let text: string;
  let why: string;
  const silentWhy =
    heartbeatAgeMs === null
      ? "The service's heartbeat is missing or stamped too far ahead of this clock to check, so nothing it said can be trusted as live"
      : `The service has not proved it is alive for ${age(heartbeatAgeMs!)}, past its ${heartbeatTimeoutMs / 1000} s limit, so nothing it said can be trusted as live`;

  if (!readable) {
    state = "unknown";
    text = words.unknown;
    why = `The snapshot is not version ${PORTHOLE_SNAPSHOT_VERSION}, so this view cannot read it`;
  } else if (top !== null && alive && top.priority !== "rest") {
    state = top.priority as PortholeState;
    item = top;
    text = top.label;
    why = `"${top.id}" ${whyOf[top.priority]}${ties(top.priority) > 1 ? `, and is the newest of ${ties(top.priority)} ${top.priority} items` : ""}`;
  } else if (!alive) {
    state = "unknown";
    text = words.unknown;
    why = silentWhy;
  } else if (areas.length === 0) {
    state = "unknown";
    text = words.unknown;
    why = "The service reports no areas, so nothing is verified";
  } else if (undated) {
    state = "unknown";
    text = words.unknown;
    why = unreadableTrouble.has(undated.id)
      ? `"${undated.id}" reports trouble at a time this view cannot read`
      : undated.lastVerifiedAt === null
        ? `"${undated.id}" has never been verified`
        : `"${undated.id}" was verified at a time too far ahead of this clock to check`;
  } else {
    const allFresh = areas.every((area) => area.fresh);
    state = allFresh ? "rest-fresh" : "rest-stale";
    const troubled = areas.find((area) => troubleAhead.has(area.id) || (area.troubleMs !== null && area.troubleMs >= troubleAfterMs));
    // Past fresh and in no trouble: the area past its window verified longest ago, which is the oldest area unless an
    // older one is still within a longer window of its own.
    const pastWhy = () => {
      const past = areas.filter((area) => !area.fresh).reduce((a, b) => (b.ageMs! > a.ageMs! ? b : a));
      return past === oldest
        ? `"${oldest!.id}" was verified longest ago, past ${oldest!.freshWithinMs / 1000} s`
        : `"${past.id}" is past its ${past.freshWithinMs / 1000} s, and "${oldest!.id}" was verified longest ago`;
    };
    const restWhy = allFresh
      ? areas.every((area) => area.freshWithinMs === freshWithinMs)
        ? `every area was verified within ${freshWithinMs / 1000} s`
        : `every area was verified within its window (${areas.map((area) => `"${area.id}" ${area.freshWithinMs / 1000} s`).join(", ")})`
      : troubled
        ? `"${troubled.id}" ${troubled.troubleMs === null ? "is in trouble since a time too far ahead of this clock to time" : `has been in trouble for ${age(troubled.troubleMs)}`}, and "${oldest!.id}" was verified longest ago`
        : pastWhy();
    if (top !== null && allFresh) {
      item = top;
      text = top.label;
      why = `"${top.id}" ${whyOf.rest}${ties(top.priority) > 1 ? `, and is the newest of ${ties(top.priority)} rest items` : ""}; ${restWhy}`;
    } else {
      text = allFresh ? words.fresh : words.stale(age(oldestAgeMs!));
      why = top === null ? `Nothing is under way, and ${restWhy}` : `The age line outranks "${top.id}" while not every area is fresh: ${restWhy}`;
    }
  }

  const waiting = item === null ? top : null;
  const detail = [...(item?.detail ?? []), ...(waiting === null ? [] : [waiting.label, ...(waiting.detail ?? [])]), ...areas.map((area) => area.line), ...(readable && !alive ? [words.silent(heartbeatAgeMs === null ? null : age(heartbeatAgeMs))] : [])];

  // Each moment something shown could turn: a time becoming checkable, fresh or trouble running out, the heartbeat timing
  // out or coming back, or an age shown in words reaching its next minute, hour or day.
  const moments: number[] = [];
  const checkable = (at: unknown) => {
    if (finite(at) && at - now > skew) moments.push(at - skew);
  };
  const aged = (at: number) => moments.push(at + nextWordAfter(now - at));
  if (readable) {
    checkable(heartbeatAt);
    if (alive) moments.push(heartbeatAt + heartbeatTimeoutMs + 1);
    else {
      if (heartbeatAgeMs !== null) aged(heartbeatAt);
      // Beats do not notify the view, so while the heartbeat is stopped it looks for one each heartbeatTimeoutMs.
      moments.push(now + heartbeatTimeoutMs);
    }
    for (const area of areas) {
      checkable(area.lastVerifiedAt);
      checkable(area.troubleSince);
      if (area.troubleMs !== null && area.troubleMs < troubleAfterMs) moments.push(now + troubleAfterMs - area.troubleMs);
      if (area.troubleSince !== null && !area.fresh) aged(area.troubleSince);
      if (area.ageMs === null) continue;
      if (!area.fresh) aged(Math.min(area.lastVerifiedAt!, now));
      else {
        moments.push(area.lastVerifiedAt! + area.freshWithinMs + 1);
        // A fresh line says "just now" up to a minute, then its age, which grows by the minute while it stays fresh.
        if (area.ageMs > MINUTE) aged(area.lastVerifiedAt!);
        else moments.push(area.lastVerifiedAt! + MINUTE + 1);
      }
    }
  }
  const nextChangeAt = moments.length === 0 ? null : Math.min(...moments);

  return {
    state,
    status: statusOf[state],
    text,
    item,
    waiting,
    detail,
    areas,
    oldestAgeMs,
    heartbeatAt,
    heartbeatAgeMs,
    alive,
    fresh: alive && areas.length > 0 && areas.every((area) => area.fresh),
    asOf: now,
    priority: { shown: item?.id ?? (state === "unknown" ? "unknown" : "rest"), why },
    nextChangeAt,
  };
}

function noted(note: string | null): string {
  return note === null ? "" : `, ${note}`;
}

/** Ms from an age until its words next change: the next whole minute under an hour, hour under a day, then day. */
function nextWordAfter(age: number): number {
  const unit = age < HOUR ? MINUTE : age < DAY ? HOUR : DAY;
  return (Math.floor(age / unit) + 1) * unit;
}

/**
 * The agent read of a view: the stable, versioned JSON an agent reads through the status spot's `status` read and a
 * CLI status command prints, so a person, the window and an agent see one truth. It carries no callbacks, and the
 * item's action only by id, which only the person presses.
 *
 * Use `portholeView` instead for everything the window shows, such as the open spot's lines.
 *
 * @group Feedback
 * @example
 * console.log(JSON.stringify(portholeStatus(portholeView(snapshot, heartbeatAt, Date.now()))));
 * @claim "It carries no callbacks" registry/ouro/lib/ouro/porthole-view.test.ts verify:testExists(registry/ouro/lib/ouro/porthole-view.test.ts::portholeStatus > reads as versioned JSON with needs-person for an action, and survives a round trip)
 * @claim "the stable, versioned JSON an" registry/ouro/lib/ouro/porthole-view.test.ts verify:testExists(registry/ouro/lib/ouro/porthole-view.test.ts::portholeStatus > reads as versioned JSON with needs-person for an action, and survives a round trip)
 */
function portholeStatus(view: PortholeView): PortholeStatusRead {
  const item = view.item;
  return {
    version: PORTHOLE_SNAPSHOT_VERSION,
    asOf: view.asOf,
    state: view.status,
    headline: view.text,
    fresh: view.fresh,
    alive: view.alive,
    heartbeatAt: view.heartbeatAt,
    heartbeatAgeMs: view.heartbeatAgeMs,
    areas: view.areas.map((area) => ({
      id: area.id,
      lastVerifiedAt: area.lastVerifiedAt,
      age: area.age,
      ageMs: area.ageMs,
      freshWithinMs: area.freshWithinMs,
      note: area.note,
      troubleSince: area.troubleSince,
      troubleMs: area.troubleMs,
    })),
    priority: { ...view.priority },
    shown:
      item === null
        ? null
        : {
            id: item.id,
            priority: item.priority,
            label: item.label,
            detail: [...(item.detail ?? [])],
            progress: finite(item.progress) ? Math.min(1, Math.max(0, item.progress)) : null,
            action: item.action?.id ?? null,
            actionLabel: item.action?.label ?? null,
          },
  };
}
