import { describe, expect, it } from "vitest";
import {
  PORTHOLE_DEFAULTS,
  PORTHOLE_PRIORITIES,
  PORTHOLE_SNAPSHOT_VERSION,
  formatPortholeAge,
  portholeStatus,
  portholeView,
  type PortholeArea,
  type PortholeItem,
  type PortholeSnapshot,
  type PortholeViewOptions,
} from "@/registry/ouro/lib/ouro/porthole-view";

const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const NOW = Date.UTC(2026, 10, 3, 18, 40);

const area = (lastVerifiedAt: number | null, troubleSince: number | null = null): PortholeArea => ({ lastVerifiedAt, troubleSince });
const item = (id: string, priority: PortholeItem["priority"], since = NOW - SECOND, extra: Partial<PortholeItem> = {}): PortholeItem => ({
  id,
  priority,
  label: `${id} label`,
  since,
  ...extra,
});
const snap = (items: PortholeItem[] = [], areas: Record<string, PortholeArea> = { chats: area(NOW - SECOND) }): PortholeSnapshot => ({
  version: 1,
  items,
  areas,
});
const view = (snapshot: PortholeSnapshot, beat = NOW, options?: PortholeViewOptions) => portholeView(snapshot, beat, NOW, options);

describe("formatPortholeAge", () => {
  it("rounds down to minutes, hours and days, and never counts seconds", () => {
    expect(formatPortholeAge(-5)).toBe("less than a minute");
    expect(formatPortholeAge(0)).toBe("less than a minute");
    expect(formatPortholeAge(MINUTE - 1)).toBe("less than a minute");
    expect(formatPortholeAge(MINUTE)).toBe("1 min");
    expect(formatPortholeAge(4 * MINUTE + 59 * SECOND)).toBe("4 min");
    expect(formatPortholeAge(HOUR - 1)).toBe("59 min");
    expect(formatPortholeAge(HOUR)).toBe("1 hr");
    expect(formatPortholeAge(DAY - 1)).toBe("23 hr");
    expect(formatPortholeAge(DAY)).toBe("1 day");
    expect(formatPortholeAge(2 * DAY - 1)).toBe("1 day");
    expect(formatPortholeAge(2 * DAY)).toBe("2 days");
  });
});

describe("portholeView", () => {
  it("uses a minute for fresh, five seconds for the heartbeat and for trouble, and a second for skew by default", () => {
    expect(PORTHOLE_DEFAULTS).toEqual({ freshWithinMs: 60_000, heartbeatTimeoutMs: 5_000, troubleAfterMs: 5_000, skewToleranceMs: 1_000 });
    expect(Object.isFrozen(PORTHOLE_DEFAULTS)).toBe(true);
    expect(view(snap([], { chats: area(NOW - MINUTE) })).state).toBe("rest-fresh");
    expect(view(snap([], { chats: area(NOW - MINUTE - 1) })).state).toBe("rest-stale");
    expect(view(snap(), NOW - 5 * SECOND).state).toBe("rest-fresh");
    expect(view(snap(), NOW - 5 * SECOND - 1).state).toBe("unknown");
    expect(view(snap([], { chats: area(NOW, NOW - 5 * SECOND + 1) })).state).toBe("rest-fresh");
    expect(view(snap([], { chats: area(NOW, NOW - 5 * SECOND) })).state).toBe("rest-stale");
    expect(view(snap(), NOW + SECOND).state).toBe("rest-fresh");
    expect(view(snap(), NOW + SECOND + 1).state).toBe("unknown");
  });

  it("takes its times from the options", () => {
    const options = { freshWithinMs: 10 * SECOND, heartbeatTimeoutMs: 2 * SECOND, troubleAfterMs: 3 * SECOND, skewToleranceMs: 100 };
    expect(view(snap([], { chats: area(NOW - 10 * SECOND) }), NOW, options).state).toBe("rest-fresh");
    expect(view(snap([], { chats: area(NOW - 10 * SECOND - 1) }), NOW, options).state).toBe("rest-stale");
    expect(view(snap(), NOW - 2 * SECOND, options).state).toBe("rest-fresh");
    expect(view(snap(), NOW - 2 * SECOND - 1, options).state).toBe("unknown");
    expect(view(snap([], { chats: area(NOW, NOW - 3 * SECOND + 1) }), NOW, options).state).toBe("rest-fresh");
    expect(view(snap([], { chats: area(NOW, NOW - 3 * SECOND) }), NOW, options).state).toBe("rest-stale");
    expect(view(snap(), NOW + 100, options).state).toBe("rest-fresh");
    expect(view(snap(), NOW + 101, options).state).toBe("unknown");
  });

  it("says Updated just now while every area was verified within freshWithinMs", () => {
    const result = view(snap([], { chats: area(NOW - 30 * SECOND), calendar: area(NOW - 59 * SECOND) }));
    expect(result).toMatchObject({
      state: "rest-fresh",
      status: "rest",
      text: "Updated just now",
      item: null,
      alive: true,
      heartbeatAt: NOW,
      heartbeatAgeMs: 0,
      oldestAgeMs: 59 * SECOND,
      priority: { shown: "rest", why: "Nothing is under way, and every area was verified within 60 s" },
    });
    expect(result.detail).toEqual(["chats: verified just now", "calendar: verified just now"]);
    expect(result.areas.map((a) => [a.id, a.fresh, a.ageMs, a.age])).toEqual([
      ["chats", true, 30 * SECOND, "less than a minute"],
      ["calendar", true, 59 * SECOND, "less than a minute"],
    ]);
  });

  it("at rest, says the real age of the area verified longest ago once any area is past fresh", () => {
    const result = view(snap([], { chats: area(NOW - SECOND), calendar: area(NOW - 4 * MINUTE - 59 * SECOND), activity: area(NOW - 2 * MINUTE) }));
    expect(result).toMatchObject({
      state: "rest-stale",
      status: "rest",
      text: "Updated 4 min ago",
      oldestAgeMs: 4 * MINUTE + 59 * SECOND,
      priority: { shown: "rest", why: 'Nothing is under way, and "calendar" was verified longest ago, past 60 s' },
    });
    expect(result.detail).toEqual(["chats: verified just now", "calendar: verified 4 min ago", "activity: verified 2 min ago"]);
  });

  it("names the first of the areas verified equally long ago", () => {
    const result = view(snap([], { chats: area(NOW - 3 * MINUTE), calendar: area(NOW - 3 * MINUTE) }));
    expect(result.priority.why).toBe('Nothing is under way, and "chats" was verified longest ago, past 60 s');
  });

  it("says Status unknown at rest while any area has never been verified", () => {
    const result = view(snap([], { chats: area(NOW - SECOND), calendar: area(null) }));
    expect(result).toMatchObject({
      state: "unknown",
      status: "unknown",
      text: "Status unknown",
      item: null,
      oldestAgeMs: null,
      priority: { shown: "unknown", why: '"calendar" has never been verified' },
    });
    expect(result.detail).toEqual(["chats: verified just now", "calendar: not verified yet"]);
  });

  it("says Status unknown when the snapshot has no areas", () => {
    for (const areas of [{}, null, "chats"]) {
      const result = view({ version: 1, items: [], areas } as unknown as PortholeSnapshot);
      expect(result).toMatchObject({ state: "unknown", text: "Status unknown", oldestAgeMs: null, priority: { why: "The service reports no areas, so nothing is verified" } });
      expect(result.areas).toEqual([]);
    }
  });

  it("says Status unknown for a snapshot of another version, whatever its items", () => {
    expect(PORTHOLE_SNAPSHOT_VERSION).toBe(1);
    for (const snapshot of [{ ...snap([item("update", "action")]), version: 2 }, null, "nonsense"]) {
      const result = portholeView(snapshot as unknown as PortholeSnapshot, NOW - HOUR, NOW);
      expect(result).toMatchObject({
        state: "unknown",
        status: "unknown",
        text: "Status unknown",
        item: null,
        nextChangeAt: null,
        priority: { shown: "unknown", why: "The snapshot is not version 1, so this view cannot read it" },
      });
      expect(result.detail).toEqual([]);
      expect(result.areas).toEqual([]);
    }
  });

  it("shows an action over an error, an error over working and working over rest", () => {
    const action = item("update", "action", NOW - 3 * MINUTE, { action: { id: "restart", label: "Restart" } });
    const error = item("offline", "error");
    const working = item("sync", "working", NOW, { progress: 0.4 });
    const rest = item("current", "rest", NOW);
    expect(view(snap([rest, working, error, action]))).toMatchObject({
      state: "action",
      status: "needs-person",
      text: "update label",
      item: action,
      priority: { shown: "update", why: '"update" waits for the person, which outranks every other item' },
    });
    expect(view(snap([rest, working, error]))).toMatchObject({
      state: "error",
      status: "error",
      item: error,
      priority: { why: '"offline" is a problem, which outranks working and rest items' },
    });
    expect(view(snap([rest, working]))).toMatchObject({
      state: "working",
      status: "working",
      item: working,
      priority: { why: '"sync" is under way, and nothing waits for the person or has failed' },
    });
    expect(view(snap([rest]))).toMatchObject({ state: "rest-fresh", status: "rest", item: rest });
    expect(PORTHOLE_PRIORITIES).toEqual(["action", "error", "working", "rest"]);
  });

  it("on a tie in priority, shows the item with the newest since, and the lower id when since ties too", () => {
    const older = item("a-older", "error", NOW - MINUTE);
    const newer = item("z-newer", "error", NOW - SECOND);
    expect(view(snap([older, newer])).item).toBe(newer);
    expect(view(snap([newer, older])).item).toBe(newer);
    expect(view(snap([older, newer])).priority.why).toBe('"z-newer" is a problem, which outranks working and rest items, and is the newest of 2 error items');
    const b = item("b", "working", NOW);
    const a = item("a", "working", NOW);
    expect(view(snap([b, a])).item).toBe(a);
    expect(view(snap([a, b])).item).toBe(a);
    const twin = item("a", "working", NOW, { label: "twin" });
    expect(view(snap([a, twin])).item).toBe(a);
    expect(view(snap([twin, a])).item).toBe(twin);
  });

  it("a stopped heartbeat outranks every item, an action too, which waits in the open lines", () => {
    const dead = NOW - 12 * SECOND;
    for (const shown of [item("update", "action"), item("offline", "error"), item("sync", "working"), item("current", "rest")]) {
      const result = view(snap([shown]), dead);
      expect(result).toMatchObject({
        state: "unknown",
        text: "Status unknown",
        item: null,
        alive: false,
        heartbeatAgeMs: 12 * SECOND,
        priority: { shown: "unknown", why: "The service has not proved it is alive for less than a minute, past its 5 s limit, so nothing it said can be trusted as live" },
      });
      expect(result.waiting).toBe(shown);
      expect(result.detail).toEqual([shown.label, "chats: verified just now", "No heartbeat for less than a minute"]);
    }
    // The action waits with its own lines, and comes back with the next beat.
    const action = item("update", "action", NOW, { detail: ["Version 2 is ready"] });
    const result = view(snap([action, item("offline", "error")]), dead);
    expect(result).toMatchObject({ state: "unknown", status: "unknown", item: null, waiting: action, alive: false });
    expect(result.detail).toEqual(["update label", "Version 2 is ready", "chats: verified just now", "No heartbeat for less than a minute"]);
    expect(view(snap([action, item("offline", "error")]))).toMatchObject({ state: "action", item: action, alive: true });
  });

  it("says Status unknown when the heartbeat is stamped too far ahead of this clock, or missing, and accepts skew within the tolerance", () => {
    expect(view(snap(), NOW + SECOND)).toMatchObject({ state: "rest-fresh", heartbeatAgeMs: 0, alive: true });
    for (const beat of [NOW + SECOND + 1, Number.NaN]) {
      const result = view(snap([item("sync", "working")]), beat);
      expect(result).toMatchObject({
        state: "unknown",
        alive: false,
        heartbeatAgeMs: null,
        priority: { why: "The service's heartbeat is missing or stamped too far ahead of this clock to check, so nothing it said can be trusted as live" },
      });
      expect(result.detail).toEqual(["sync label", "chats: verified just now", "No heartbeat this clock can check"]);
    }
  });

  it("counts an area verified a little ahead of this clock as just verified, and one far ahead as unknown", () => {
    const near = view(snap([], { chats: area(NOW + 500) }));
    expect(near).toMatchObject({ state: "rest-fresh" });
    expect(near.areas[0]).toMatchObject({ ageMs: 0, lastVerifiedAt: NOW + 500 });
    const far = view(snap([], { chats: area(NOW + SECOND + 1) }));
    expect(far).toMatchObject({ state: "unknown", priority: { why: '"chats" was verified at a time too far ahead of this clock to check' } });
    expect(far.areas[0]).toMatchObject({ ageMs: null, age: null, fresh: false, line: "chats: not verified yet" });
  });

  it("a trouble-free area is fresh at 4.9 s, in trouble for 5 s it is not, and it is fresh again once the trouble clears", () => {
    expect(view(snap([], { chats: area(NOW - 4_900) })).state).toBe("rest-fresh");
    expect(view(snap([], { chats: area(NOW - 4_900, NOW - 4_900) })).state).toBe("rest-fresh");
    const troubled = view(snap([], { chats: area(NOW - 4_900, NOW - 5 * SECOND), calendar: area(NOW - 2 * SECOND) }));
    expect(troubled).toMatchObject({
      state: "rest-stale",
      text: "Updated less than a minute ago",
      priority: { why: 'Nothing is under way, and "chats" has been in trouble for less than a minute, and "chats" was verified longest ago' },
    });
    expect(troubled.areas[0]).toMatchObject({ troubleSince: NOW - 5 * SECOND, troubleMs: 5 * SECOND, fresh: false });
    expect(troubled.detail).toEqual(["chats: verified less than a minute ago, in trouble for less than a minute", "calendar: verified just now"]);
    expect(view(snap([], { chats: area(NOW - 4_900, null) })).state).toBe("rest-fresh");
  });

  it("names a troubled area only when its trouble reached troubleAfterMs", () => {
    expect(view(snap([], { chats: area(NOW, NOW - SECOND), calendar: area(NOW - 3 * MINUTE) })).priority.why).toBe(
      'Nothing is under way, and "calendar" was verified longest ago, past 60 s',
    );
    expect(view(snap([], { calendar: area(NOW - 3 * MINUTE), chats: area(NOW, NOW) }), NOW, { troubleAfterMs: 0 }).priority.why).toBe(
      'Nothing is under way, and "chats" has been in trouble for less than a minute, and "calendar" was verified longest ago',
    );
  });

  it("with troubleAfterMs at 0, any trouble stops fresh at once and none leaves it fresh", () => {
    expect(view(snap([], { chats: area(NOW - SECOND) }), NOW, { troubleAfterMs: 0 })).toMatchObject({ state: "rest-fresh", priority: { why: "Nothing is under way, and every area was verified within 60 s" } });
    expect(view(snap([], { chats: area(NOW - SECOND, NOW) }), NOW, { troubleAfterMs: 0 })).toMatchObject({
      state: "rest-stale",
      priority: { why: 'Nothing is under way, and "chats" has been in trouble for less than a minute, and "chats" was verified longest ago' },
    });
  });

  it("names the troubled area apart from the area verified longest ago", () => {
    const result = view(snap([], { chats: area(NOW - SECOND, NOW - 6 * SECOND), calendar: area(NOW - 3 * MINUTE) }));
    expect(result).toMatchObject({
      text: "Updated 3 min ago",
      priority: { why: 'Nothing is under way, and "chats" has been in trouble for less than a minute, and "calendar" was verified longest ago' },
    });
  });

  it("an error item outranks known trouble", () => {
    const error = item("chats-failed", "error");
    expect(view(snap([error], { chats: area(NOW - SECOND, NOW - 10 * SECOND) }))).toMatchObject({ state: "error", item: error });
  });

  it("counts trouble stamped too far ahead of this clock at once, with no length since none was measured, and trouble a little ahead from now", () => {
    const ahead = view(snap([], { chats: area(NOW - SECOND, NOW + 10 * SECOND) }));
    expect(ahead.areas[0]).toMatchObject({ fresh: false, troubleSince: NOW + 10 * SECOND, troubleMs: null, line: "chats: verified less than a minute ago" });
    expect(ahead).toMatchObject({
      state: "rest-stale",
      priority: { why: 'Nothing is under way, and "chats" is in trouble since a time too far ahead of this clock to time, and "chats" was verified longest ago' },
    });
    expect(portholeStatus(ahead).areas[0]).toMatchObject({ troubleSince: NOW + 10 * SECOND, troubleMs: null });
    expect(view(snap([], { chats: area(NOW - SECOND, NOW + SECOND) })).areas[0]).toMatchObject({ fresh: true, troubleMs: 0 });
  });

  it("says Status unknown for an area whose trouble time it cannot read, as for a lastVerifiedAt it cannot read", () => {
    for (const troubleSince of ["2026-11-03T18:40:00Z", Number.NaN, {}]) {
      const result = view(snap([], { chats: { lastVerifiedAt: NOW - SECOND, troubleSince } as unknown as PortholeArea, calendar: area(NOW - SECOND) }));
      expect(result).toMatchObject({ state: "unknown", text: "Status unknown", oldestAgeMs: null, priority: { why: '"chats" reports trouble at a time this view cannot read' } });
      expect(result.areas[0]).toMatchObject({ troubleSince: null, troubleMs: null, fresh: false });
    }
    // Missing trouble is no trouble.
    expect(view(snap([], { chats: { lastVerifiedAt: NOW - SECOND } as unknown as PortholeArea })).state).toBe("rest-fresh");
  });

  it("a rest item that offers an action reads as an action, for the person, and as needs-person to an agent", () => {
    const news = item("current", "rest", NOW, { label: "Version 2 is installed", action: { id: "notes", label: "See what's new" } });
    const result = view(snap([news]));
    expect(result).toMatchObject({
      state: "action",
      status: "needs-person",
      item: news,
      text: "Version 2 is installed",
      priority: { shown: "current", why: '"current" is news that needs nothing, and nothing else is under way; every area was verified within 60 s; it offers "See what\'s new"' },
    });
    expect(portholeStatus(result)).toMatchObject({ state: "needs-person", shown: { action: "notes", actionLabel: "See what's new" } });
    // Without the action it is plain rest; past fresh it waits like any rest item.
    expect(view(snap([{ ...news, action: undefined }])).state).toBe("rest-fresh");
    expect(view(snap([news], { chats: area(NOW - 2 * MINUTE) }))).toMatchObject({ state: "rest-stale", item: null, waiting: news });
  });

  it("ignores items it cannot rank: an unknown priority, a missing id or label, or no since", () => {
    const bad = [
      null,
      "sync",
      { ...item("a", "error"), priority: "urgent" },
      { ...item("b", "error"), priority: "toString" },
      { ...item("c", "error"), id: 3 },
      { ...item("d", "error"), label: undefined },
      { ...item("e", "error"), since: Number.NaN },
      { ...item("f", "error"), since: "now" },
    ] as unknown as PortholeItem[];
    expect(view(snap(bad))).toMatchObject({ state: "rest-fresh", item: null });
    expect(view({ version: 1, items: "none", areas: { chats: area(NOW) } } as unknown as PortholeSnapshot)).toMatchObject({ state: "rest-fresh", item: null });
  });

  it("a rest item shows over Updated just now only, and waits in the open lines while an area is past fresh or the status is unknown", () => {
    const current = item("current", "rest", NOW, { label: "Up to date", detail: ["Version 2.1"], dismissable: true });
    expect(view(snap([current]))).toMatchObject({
      state: "rest-fresh",
      status: "rest",
      text: "Up to date",
      item: current,
      waiting: null,
      detail: ["Version 2.1", "chats: verified just now"],
      priority: { shown: "current", why: '"current" is news that needs nothing, and nothing else is under way; every area was verified within 60 s' },
    });
    expect(view(snap([current, item("older", "rest", NOW - MINUTE)])).priority.why).toBe(
      '"current" is news that needs nothing, and nothing else is under way, and is the newest of 2 rest items; every area was verified within 60 s',
    );
    expect(view(snap([current], { chats: area(NOW - 2 * MINUTE) }))).toMatchObject({
      state: "rest-stale",
      text: "Updated 2 min ago",
      item: null,
      waiting: current,
      detail: ["Up to date", "Version 2.1", "chats: verified 2 min ago"],
      priority: { shown: "rest", why: 'The age line outranks "current" while not every area is fresh: "chats" was verified longest ago, past 60 s' },
    });
    expect(view(snap([current], { chats: area(NOW, NOW - 6 * SECOND) }))).toMatchObject({ state: "rest-stale", text: "Updated less than a minute ago", item: null, waiting: current });
    expect(view(snap([current], { chats: area(null) }))).toMatchObject({ state: "unknown", text: "Status unknown", item: null, waiting: current });
    expect(view(snap([current]), NOW - MINUTE)).toMatchObject({ state: "unknown", text: "Status unknown", item: null, waiting: current });
    expect(view(snap([current], {}))).toMatchObject({ state: "unknown", item: null, waiting: current });
    expect(view(snap())).toMatchObject({ item: null, waiting: null });
  });

  it("lists the item's own lines, then a line per area, then the heartbeat's when it stopped", () => {
    const sync = item("sync", "working", NOW, { detail: ["Catching up on chats"] });
    const areas = {
      chats: { ...area(NOW - SECOND), label: "Chats" },
      calendar: { ...area(NOW - 4 * MINUTE, NOW - 2 * MINUTE), label: "Calendar" },
      activity: { ...area(null), label: "" },
      broken: null as unknown as PortholeArea,
    };
    expect(view(snap([sync], areas)).detail).toEqual([
      "Catching up on chats",
      "Chats: verified just now",
      "Calendar: verified 4 min ago, in trouble for 2 min",
      "activity: not verified yet",
      "broken: not verified yet",
    ]);
    expect(view(snap([item("sync", "working")])).detail).toEqual(["chats: verified just now"]);
    expect(view(snap([sync]), NOW - 3 * MINUTE).detail).toEqual(["sync label", "Catching up on chats", "chats: verified just now", "No heartbeat for 3 min"]);
  });

  it("takes words in another language for every line it writes", () => {
    const labels = {
      fresh: "Gerade aktualisiert",
      stale: (a: string) => `Vor ${a} aktualisiert`,
      unknown: "Status unbekannt",
      age: (ms: number) => `${Math.floor(ms / MINUTE)} Min.`,
      area: (label: string, a: string | null, trouble: string | null) => `${label}: ${a ?? "nie"} / ${trouble ?? "ok"}`,
      areaFresh: (label: string) => `${label}: gerade`,
      silent: (a: string | null) => `Kein Lebenszeichen: ${a ?? "?"}`,
    };
    expect(view(snap(), NOW, { labels })).toMatchObject({ text: "Gerade aktualisiert", detail: ["chats: gerade"] });
    expect(view(snap([], { chats: area(NOW - 4 * MINUTE, NOW - 2 * MINUTE) }), NOW, { labels })).toMatchObject({
      text: "Vor 4 Min. aktualisiert",
      detail: ["chats: 4 Min. / 2 Min."],
    });
    expect(view(snap([], { chats: area(null) }), NOW - 3 * MINUTE, { labels })).toMatchObject({
      text: "Status unbekannt",
      detail: ["chats: nie / ok", "Kein Lebenszeichen: 3 Min."],
    });
    expect(view(snap(), Number.NaN, { labels }).detail).toEqual(["chats: gerade", "Kein Lebenszeichen: ?"]);
    expect(view(snap(), NOW, { labels: {} }).text).toBe("Updated just now");
  });

  describe("nextChangeAt", () => {
    it("at rest and fresh, is the first of the heartbeat timing out and an area's fresh time running out", () => {
      expect(view(snap([], { chats: area(NOW - 50 * SECOND) })).nextChangeAt).toBe(NOW + 5 * SECOND + 1);
      expect(view(snap([], { chats: area(NOW - 50 * SECOND) }), NOW - 2 * SECOND).nextChangeAt).toBe(NOW + 3 * SECOND + 1);
      expect(view(snap([], { chats: area(NOW - 58 * SECOND) })).nextChangeAt).toBe(NOW + 2 * SECOND + 1);
      expect(view(snap([], { chats: area(NOW - 50 * SECOND) }), NOW, { heartbeatTimeoutMs: 20 * SECOND }).nextChangeAt).toBe(NOW + 10 * SECOND + 1);
    });

    it("past fresh, is the moment the oldest age shown reaches its next minute, hour or day", () => {
      const at = (lastVerifiedAt: number) => view(snap([], { chats: area(lastVerifiedAt) }), NOW, { heartbeatTimeoutMs: 10 * DAY }).nextChangeAt;
      expect(at(NOW - 4 * MINUTE - 30 * SECOND)).toBe(NOW + 30 * SECOND);
      expect(at(NOW - 2 * HOUR - 10 * MINUTE)).toBe(NOW + 50 * MINUTE);
      expect(at(NOW - DAY - 3 * HOUR)).toBe(NOW + 21 * HOUR);
      expect(at(NOW - 2 * MINUTE)).toBe(NOW + MINUTE);
      expect(at(NOW - HOUR)).toBe(NOW + HOUR);
      expect(at(NOW - DAY)).toBe(NOW + DAY);
    });

    it("with trouble, is the moment the trouble reaches troubleAfterMs, then each minute it lasts", () => {
      expect(view(snap([], { chats: area(NOW, NOW - 2 * SECOND) }), NOW, { heartbeatTimeoutMs: HOUR }).nextChangeAt).toBe(NOW + 3 * SECOND);
      expect(view(snap([], { chats: area(NOW, NOW - 20 * SECOND) }), NOW, { heartbeatTimeoutMs: HOUR }).nextChangeAt).toBe(NOW + 40 * SECOND);
      expect(view(snap([], { chats: area(NOW, NOW + 10 * SECOND) }), NOW, { heartbeatTimeoutMs: HOUR }).nextChangeAt).toBe(NOW + 9 * SECOND);
      expect(view(snap([], { chats: area(NOW - 30 * SECOND, NOW + 10 * MINUTE) }), NOW, { heartbeatTimeoutMs: HOUR }).nextChangeAt).toBe(NOW + 30 * SECOND);
      // Trouble that has just reached troubleAfterMs has already stopped fresh; next its age turns a minute.
      expect(view(snap([], { chats: area(NOW, NOW - 5 * SECOND) }), NOW, { heartbeatTimeoutMs: HOUR }).nextChangeAt).toBe(NOW + 55 * SECOND);
    });

    it("waits on an area never verified for nothing but the heartbeat, since it has no age to grow", () => {
      expect(view(snap([], { chats: area(null) }), NOW, { heartbeatTimeoutMs: 10 * DAY }).nextChangeAt).toBe(NOW + 10 * DAY + 1);
    });

    it("with the heartbeat stopped, is the moment its age shown next changes, or the look for its return when that comes first", () => {
      const stopped = NOW - 3 * MINUTE - 20 * SECOND;
      expect(view(snap([], { chats: area(null) }), stopped, { heartbeatTimeoutMs: MINUTE }).nextChangeAt).toBe(NOW + 40 * SECOND);
      expect(view(snap([], { chats: area(null) }), stopped).nextChangeAt).toBe(NOW + 5 * SECOND);
    });

    it("with the heartbeat stopped, looks for its return a heartbeat timeout on, and sees it come back from a stale, a missing or a NaN beat", () => {
      for (const beat of [NOW - 12 * SECOND, undefined as unknown as number, Number.NaN]) {
        const stopped = portholeView(snap([item("update", "action")], { chats: area(NOW) }), beat, NOW);
        expect(stopped).toMatchObject({ state: "unknown", alive: false, nextChangeAt: NOW + 5 * SECOND });
        // At that moment, with a beat that came back meanwhile, the view is live again.
        const back = portholeView(snap([item("update", "action")], { chats: area(NOW) }), NOW + 4 * SECOND, stopped.nextChangeAt!);
        expect(back).toMatchObject({ state: "action", alive: true, fresh: true });
        expect(portholeStatus(back)).toMatchObject({ state: "needs-person", alive: true, heartbeatAgeMs: SECOND });
      }
      expect(view(snap(), Number.NaN, { heartbeatTimeoutMs: 20 * SECOND }).nextChangeAt).toBe(NOW + 20 * SECOND);
    });

    it("is the moment a time stamped too far ahead becomes checkable", () => {
      expect(view(snap(), NOW + SECOND).nextChangeAt).toBe(NOW + 6 * SECOND + 1);
      expect(view(snap([], { chats: area(NOW + SECOND) }), NOW, { heartbeatTimeoutMs: HOUR }).nextChangeAt).toBe(NOW + MINUTE + SECOND + 1);
      expect(view(snap([], { chats: area(null) }), NOW + 4 * SECOND).nextChangeAt).toBe(NOW + 3 * SECOND);
      expect(view(snap([], { chats: area(NOW + 3 * SECOND) }), NOW, { heartbeatTimeoutMs: HOUR }).nextChangeAt).toBe(NOW + 2 * SECOND);
    });

    it("is null when nothing shown changes with time alone, as for a snapshot of another version", () => {
      expect(portholeView({ ...snap([], { chats: area(null) }), version: 2 } as unknown as PortholeSnapshot, Number.NaN, NOW).nextChangeAt).toBeNull();
      expect(portholeView(null as unknown as PortholeSnapshot, NOW, NOW).nextChangeAt).toBeNull();
    });
  });
});

describe("portholeStatus", () => {
  it("says whether the data is fresh and the heartbeat alive, whatever is shown, as of the clock it was judged at", () => {
    const at = (snapshot: PortholeSnapshot, beat: number) => {
      const { fresh, alive, heartbeatAgeMs, asOf } = portholeStatus(portholeView(snapshot, beat, NOW + 7));
      return { fresh, alive, heartbeatAgeMs, asOf };
    };
    expect(at(snap([item("sync", "working")]), NOW)).toEqual({ fresh: true, alive: true, heartbeatAgeMs: 7, asOf: NOW + 7 });
    expect(at(snap([], { chats: area(NOW - 2 * MINUTE) }), NOW)).toEqual({ fresh: false, alive: true, heartbeatAgeMs: 7, asOf: NOW + 7 });
    expect(at(snap(), NOW - MINUTE)).toEqual({ fresh: false, alive: false, heartbeatAgeMs: MINUTE + 7, asOf: NOW + 7 });
    expect(at(snap([], {}), NOW)).toMatchObject({ fresh: false, alive: true });
    expect(at(snap([], { chats: area(NOW), calendar: area(NOW - 2 * MINUTE) }), NOW).fresh).toBe(false);
  });

  it("reads as versioned JSON with needs-person for an action, and survives a round trip", () => {
    const action = item("update", "action", NOW, { label: "Restart to update", detail: ["Version 2"], action: { id: "restart", label: "Restart" }, progress: 2 });
    const read = portholeStatus(view(snap([action], { chats: area(NOW - 2 * MINUTE, NOW - MINUTE) })));
    expect(read).toEqual({
      version: 1,
      asOf: NOW,
      state: "needs-person",
      headline: "Restart to update",
      fresh: false,
      alive: true,
      heartbeatAt: NOW,
      heartbeatAgeMs: 0,
      areas: [{ id: "chats", lastVerifiedAt: NOW - 2 * MINUTE, age: "2 min", ageMs: 2 * MINUTE, troubleSince: NOW - MINUTE, troubleMs: MINUTE }],
      priority: { shown: "update", why: '"update" waits for the person, which outranks every other item' },
      shown: { id: "update", priority: "action", label: "Restart to update", detail: ["Version 2"], progress: 1, action: "restart", actionLabel: "Restart" },
    });
    expect(JSON.parse(JSON.stringify(read))).toEqual(read);
  });

  it("reads the rest state with no item, and an item's progress between 0 and 1", () => {
    expect(portholeStatus(view(snap()))).toMatchObject({ state: "rest", headline: "Updated just now", shown: null, priority: { shown: "rest" } });
    expect(portholeStatus(view(snap([], { chats: area(NOW - 2 * MINUTE) })))).toMatchObject({ state: "rest", headline: "Updated 2 min ago" });
    expect(portholeStatus(view(snap(), NOW - MINUTE))).toMatchObject({ state: "unknown", shown: null });
    const progress = (value: unknown) => portholeStatus(view(snap([item("sync", "working", NOW, { progress: value as number })]))).shown?.progress;
    expect(progress(0.4)).toBe(0.4);
    expect(progress(-1)).toBe(0);
    expect(progress(undefined)).toBeNull();
    expect(progress(Number.NaN)).toBeNull();
    expect(portholeStatus(view(snap([item("sync", "working")]))).shown).toEqual({ id: "sync", priority: "working", label: "sync label", detail: [], progress: null, action: null, actionLabel: null });
  });

  it("returns a read the caller can change without changing the view", () => {
    const shown = view(snap([item("sync", "working", NOW, { detail: ["a"] })]));
    const read = portholeStatus(shown);
    read.priority.why = "changed";
    read.shown!.detail.push("b");
    expect(shown.priority.why).not.toBe("changed");
    expect(shown.item!.detail).toEqual(["a"]);
  });
});
