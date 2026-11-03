import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPeopleCache, readFailure, unknownPerson, webStorage, type PeopleCacheStorage, type PersonRead, type StoredPerson } from "@/registry/ouro/lib/ouro/people-cache";

const MINUTE = 60_000;
const DAY = 86_400_000;
const START = Date.UTC(2026, 0, 1, 12);

/** Runs the timers due in `ms` and lets the reads they start finish. */
async function run(ms = 0) {
  await vi.advanceTimersByTimeAsync(ms);
  await vi.advanceTimersByTimeAsync(0);
}

/** A service that answers from `answer`, recording each batch it was asked for. */
function service<T>(answer: (id: string) => PersonRead<T> | undefined) {
  const batches: string[][] = [];
  const read = vi.fn(async (ids: string[]) => {
    batches.push(ids);
    return Object.fromEntries(ids.flatMap((id) => {
      const result = answer(id);
      return result === undefined ? [] : [[id, result]];
    }));
  });
  return { read, batches };
}

/** A read that waits until the test settles it. */
function held() {
  const calls: { ids: string[]; resolve: (result: Record<string, PersonRead<string>>) => void; reject: (error: unknown) => void }[] = [];
  const read = vi.fn((ids: string[]) => new Promise<Record<string, PersonRead<string>>>((resolve, reject) => calls.push({ ids, resolve, reject })));
  return { read, calls };
}

/** Storage in memory, recording what was saved. */
function memory(initial: Record<string, StoredPerson<string>> = {}) {
  const saved: Record<string, StoredPerson<string>>[] = [];
  const storage: PeopleCacheStorage<string> = {
    load: () => Promise.resolve(structuredClone(initial)),
    save: (changes) => void saved.push(changes),
  };
  return { storage, saved };
}

const names = (id: string): PersonRead<string> => ({ value: `Name of ${id}` });

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"], now: START });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("createPeopleCache", () => {
  it("reads the people asked for in the same moment in batches of batchSize, and answers each", async () => {
    const { read, batches } = service(names);
    const cache = createPeopleCache({ read, batchSize: 2 });
    expect(cache.get("a")).toBe(unknownPerson);
    expect(unknownPerson).toEqual({ status: "unknown", value: undefined, retryAt: undefined });
    const loads = ["a", "b", "c"].map((id) => cache.load(id));
    expect(cache.get("a")).toEqual({ status: "queued", value: undefined, retryAt: undefined });
    await run();
    expect(batches).toEqual([["a", "b"], ["c"]]);
    expect(await Promise.all(loads)).toEqual(["a", "b", "c"].map((id) => ({ status: "found", value: `Name of ${id}`, retryAt: START + 7 * DAY })));
    expect(cache.get("c")).toEqual({ status: "found", value: "Name of c", retryAt: START + 7 * DAY });
  });

  it("joins a person asked for again while their read is queued or under way to that read", async () => {
    const { read, calls } = held();
    const cache = createPeopleCache({ read });
    const seen: string[] = [];
    cache.watch("a", () => seen.push(cache.get("a").status));
    const first = cache.load("a");
    const queued = cache.load("a");
    await run();
    expect(cache.get("a").status).toBe("reading");
    const reading = cache.load("a");
    await run();
    expect(read).toHaveBeenCalledTimes(1);
    calls[0]!.resolve({ a: { value: "Ana" } });
    const entries = await Promise.all([first, queued, reading]);
    expect(entries.map((entry) => entry.value)).toEqual(["Ana", "Ana", "Ana"]);
    expect(seen).toEqual(["queued", "reading", "found"]);
    // Fresh: asked for again, it is answered from the cache.
    expect(await cache.load("a")).toBe(entries[0]);
    await run();
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("reads a person found again once foundFor runs out, keeping their value while it reads", async () => {
    let name = "Ana";
    const { read, calls } = held();
    const cache = createPeopleCache({ read, foundFor: 10 * MINUTE });
    const first = cache.load("a");
    await run();
    calls[0]!.resolve({ a: { value: name } });
    expect((await first).retryAt).toBe(START + 10 * MINUTE);
    await run(10 * MINUTE - 1);
    await cache.load("a");
    expect(read).toHaveBeenCalledTimes(1);
    await run(1);
    name = "Ana Lind";
    const again = cache.load("a");
    await run();
    expect(cache.get("a")).toEqual({ status: "reading", value: "Ana", retryAt: START + 10 * MINUTE });
    calls[1]!.resolve({ a: { value: name } });
    expect(await again).toEqual({ status: "found", value: "Ana Lind", retryAt: START + 20 * MINUTE });
  });

  it("keeps a person the service had nothing for, or left out of its answer, as missing until missingFor runs out", async () => {
    // "constructor" is left out too, and is no property the answer inherits.
    const { read, batches } = service<string>((id) => (id === "a" ? "missing" : id === "c" ? names(id) : undefined));
    const cache = createPeopleCache({ read, missingFor: 5 * MINUTE });
    const loads = Promise.all(["a", "b", "constructor", "c"].map((id) => cache.load(id)));
    await run();
    const missing = { status: "missing", value: undefined, retryAt: START + 5 * MINUTE };
    expect(await loads).toEqual([missing, missing, missing, { status: "found", value: "Name of c", retryAt: START + 7 * DAY }]);
    await run(5 * MINUTE - 1);
    await Promise.all([cache.load("a"), cache.load("b")]);
    expect(batches).toHaveLength(1);
    await run(1);
    const again = Promise.all([cache.load("a"), cache.load("b")]);
    await run();
    await again;
    expect(batches).toEqual([["a", "b", "constructor", "c"], ["a", "b"]]);
  });

  it("pauses every read for pauseFor when the service fails, and reads the people in that read again after it", async () => {
    const { read, calls } = held();
    const cache = createPeopleCache({ read, pauseFor: 2 * MINUTE });
    const first = cache.load("a");
    await run();
    calls[0]!.reject(new Error("offline"));
    expect(await first).toEqual({ status: "waiting", value: undefined, retryAt: START + 2 * MINUTE });
    // Everyone waits: a person asked for during the pause, and the one whose read failed.
    const during = [cache.load("b"), cache.load("a")];
    await run(2 * MINUTE - 1);
    expect(read).toHaveBeenCalledTimes(1);
    expect(cache.get("b").status).toBe("queued");
    await run(1);
    expect(calls[1]!.ids).toEqual(["b", "a"]);
    calls[1]!.resolve({ a: { value: "Ana" }, b: { value: "Bo" } });
    expect((await Promise.all(during)).map((entry) => entry.value)).toEqual(["Bo", "Ana"]);
  });

  it.each([
    [5 * MINUTE, 5 * MINUTE],
    [MINUTE, 2 * MINUTE],
    ["soon", 2 * MINUTE],
    [undefined, 2 * MINUTE],
  ])("pauses for a failure's retryAfterMs when it is longer than pauseFor, else for pauseFor: %s gives %i ms", async (retryAfterMs, pause) => {
    const { read, calls } = held();
    const cache = createPeopleCache({ read, pauseFor: 2 * MINUTE });
    const load = cache.load("a");
    await run();
    calls[0]!.reject(retryAfterMs === undefined ? null : Object.assign(new Error("throttled"), { retryAfterMs }));
    expect((await load).retryAt).toBe(START + pause);
  });

  it("makes no one wait when the service refuses one person, and pauses for a person the service failed on", async () => {
    const { read, batches } = service<string>((id) => (id === "refused" ? readFailure(404) : id === "throttled" ? readFailure(429) : names(id)));
    const cache = createPeopleCache({ read, pauseFor: MINUTE });
    const first = Promise.all(["refused", "b"].map((id) => cache.load(id)));
    await run();
    expect((await first).map((entry) => entry.status)).toEqual(["missing", "found"]);
    const second = cache.load("c");
    await run();
    expect((await second).status).toBe("found");
    const third = Promise.all(["throttled", "d"].map((id) => cache.load(id)));
    await run();
    expect((await third).map((entry) => entry.status)).toEqual(["waiting", "found"]);
    const fourth = cache.load("e");
    await run(MINUTE - 1);
    expect(batches).toHaveLength(3);
    await run(1);
    expect((await fourth).status).toBe("found");
  });

  it("keeps what it read in storage, and starts from it after a reload, reading only who ran out", async () => {
    const { storage, saved } = memory();
    const { read, batches } = service<string>((id) => (id === "gone" ? "missing" : names(id)));
    const cache = createPeopleCache({ read, storage });
    const loads = Promise.all(["a", "gone"].map((id) => cache.load(id)));
    await run();
    await loads;
    expect(saved).toEqual([{ a: { value: "Name of a", at: START }, gone: { missing: true, at: START } }]);
    // A reload a day and a minute later: the missing entry ran out, the found one did not.
    await run(DAY + MINUTE);
    const reloaded = createPeopleCache({ read, storage: memory(saved[0]).storage });
    expect(reloaded.get("a")).toBe(unknownPerson);
    const after = Promise.all(["a", "gone"].map((id) => reloaded.load(id)));
    await run();
    expect(await after).toEqual([
      { status: "found", value: "Name of a", retryAt: START + 7 * DAY },
      { status: "missing", value: undefined, retryAt: Date.now() + DAY },
    ]);
    expect(batches).toEqual([["a", "gone"], ["gone"]]);
  });

  it("keeps what the app set before storage loads over what storage kept, and fills in the rest", async () => {
    const changes: string[] = [];
    const storage = memory({ a: { value: "Stored Ana", at: START }, b: { value: "Stored Bo", at: START }, c: { value: "Stored Cy", at: START } }).storage;
    const cache = createPeopleCache({ read: service(names).read, storage });
    const unwatch = cache.watch("b", () => changes.push(cache.get("b").status));
    cache.set("a", "Ana");
    await run();
    expect(cache.get("a").value).toBe("Ana");
    expect(cache.get("b").value).toBe("Stored Bo");
    // Never asked for, and there once storage has loaded.
    expect(cache.get("c").value).toBe("Stored Cy");
    expect(changes).toEqual(["queued", "found"]);
    unwatch();
  });

  it("works from memory when storage fails to load or save, or keeps something unreadable", async () => {
    const failing: PeopleCacheStorage<string>[] = [
      { load: () => Promise.reject(new Error("blocked")), save: () => Promise.reject(new Error("full")) },
      {
        load: () => {
          throw new Error("blocked");
        },
        save: () => {
          throw new Error("full");
        },
      },
      { load: () => ({ a: "not an entry" }) as never, save: () => {} },
      { load: () => null, save: () => {} },
    ];
    for (const storage of failing) {
      const cache = createPeopleCache({ read: service(names).read, storage });
      const load = cache.load("a");
      await run();
      expect(await load).toEqual({ status: "found", value: "Name of a", retryAt: Date.now() + 7 * DAY });
      cache.set("b", "Bo");
      await run();
      expect(cache.get("b").value).toBe("Bo");
    }
  });

  it("reads a watched person now and again whenever their entry runs out, calling onChange on each change", async () => {
    let calls = 0;
    const { read } = service<string>((id) => (++calls === 2 ? "missing" : names(id)));
    const cache = createPeopleCache({ read, foundFor: 10 * MINUTE, missingFor: 5 * MINUTE });
    const seen: string[] = [];
    const unwatch = cache.watch("a", () => seen.push(cache.get("a").status));
    // A second watcher, gone at once, leaves the first watching.
    cache.watch("a", () => {})();
    await run();
    expect(seen).toEqual(["queued", "reading", "found"]);
    await run(10 * MINUTE);
    expect(seen).toEqual(["queued", "reading", "found", "queued", "reading", "missing"]);
    await run(5 * MINUTE);
    expect(cache.get("a").value).toBe("Name of a");
    expect(read).toHaveBeenCalledTimes(3);
    // Unwatched, it is read again only when asked for.
    unwatch();
    await run(20 * MINUTE);
    expect(read).toHaveBeenCalledTimes(3);
    expect(seen).toHaveLength(9);
  });

  it("reads a watched person whose stored entry already ran out at once, and one whose read failed once the pause ends", async () => {
    const storage = memory({ old: { value: "Old", at: START - 7 * DAY + MINUTE } }).storage;
    const { read, calls } = held();
    const cache = createPeopleCache({ read, storage, pauseFor: MINUTE });
    const loaded = cache.load("old");
    await run();
    await loaded;
    // Answered from storage; a minute later it has run out, with nothing watching it.
    await run(MINUTE);
    expect(read).not.toHaveBeenCalled();
    const stops = [cache.watch("old", () => {})];
    await run();
    expect(calls[0]!.ids).toEqual(["old"]);
    expect(cache.get("old")).toEqual({ status: "reading", value: "Old", retryAt: START + MINUTE });
    // Nothing to wake for while its read is under way.
    expect(vi.getTimerCount()).toBe(0);
    calls[0]!.reject(new Error("down"));
    await run();
    expect(cache.get("old")).toEqual({ status: "waiting", value: "Old", retryAt: START + 2 * MINUTE });
    stops.push(cache.watch("other", () => {}));
    await run(MINUTE - 1);
    expect(read).toHaveBeenCalledTimes(1);
    expect(cache.get("other").status).toBe("queued");
    await run(1);
    expect(calls[1]!.ids).toEqual(["other", "old"]);
    stops.forEach((stop) => stop());
  });

  it("waits for the pause before reading a watched person whose entry runs out during it", async () => {
    const { read, calls } = held();
    const cache = createPeopleCache({ read, foundFor: MINUTE, pauseFor: 5 * MINUTE });
    cache.watch("a", () => {});
    await run();
    calls[0]!.resolve({ a: { value: "Ana" } });
    const failing = cache.load("b");
    await run();
    calls[1]!.reject(new Error("down"));
    await failing;
    await run(MINUTE);
    expect(cache.get("a").status).toBe("queued");
    await run(4 * MINUTE - 1);
    expect(read).toHaveBeenCalledTimes(2);
    await run(1);
    expect(calls[2]!.ids).toEqual(["a"]);
  });

  it("keeps one timer for a watched entry that runs out later than setTimeout can wait, and reads it then", async () => {
    const { read } = service(names);
    const cache = createPeopleCache({ read, foundFor: 30 * DAY });
    const unwatch = cache.watch("a", () => {});
    await run();
    expect(read).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(1);
    await run(25 * DAY);
    expect(read).toHaveBeenCalledTimes(1);
    await run(5 * DAY);
    expect(read).toHaveBeenCalledTimes(2);
    unwatch();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("stores a value the app sets without reading the person, and answers a read waiting for them with it", async () => {
    const { storage, saved } = memory();
    const { read, calls } = held();
    const cache = createPeopleCache({ read, storage, pauseFor: MINUTE });
    const seen: string[] = [];
    cache.watch("a", () => seen.push(`${cache.get("a").status} ${cache.get("a").value}`));
    cache.set("b", "Bo");
    expect(cache.get("b")).toEqual({ status: "found", value: "Bo", retryAt: START + 7 * DAY });
    await run();
    calls[0]!.reject(new Error("down"));
    await run();
    // During the pause, the app learns the name from a message.
    const waiting = cache.load("a");
    cache.set("a", "Ana");
    expect(await waiting).toEqual({ status: "found", value: "Ana", retryAt: START + 7 * DAY });
    await run(MINUTE);
    expect(calls.map((call) => call.ids)).toEqual([["a"]]);
    expect(seen).toEqual(["queued undefined", "reading undefined", "waiting undefined", "queued undefined", "found Ana"]);
    expect(saved).toEqual([{ b: { value: "Bo", at: START } }, { a: { value: "Ana", at: START } }]);
  });
});

describe("readFailure", () => {
  it("counts no answer, signed out, forbidden, timed out, throttled and server errors as the service's, and other refusals as the person's", () => {
    for (const status of [undefined, 0, 401, 403, 408, 429, 500, 503]) expect(readFailure(status)).toBe("failed");
    for (const status of [400, 404, 410, 499]) expect(readFailure(status)).toBe("missing");
  });
});

describe("webStorage", () => {
  it("keeps each batch in one key of localStorage, merged with what it kept before", async () => {
    const storage = webStorage<string>("people");
    expect(storage.load()).toEqual({});
    await storage.save({ a: { value: "Ana", at: 1 } });
    await storage.save({ b: { missing: true, at: 2 } });
    expect(JSON.parse(localStorage.getItem("people")!)).toEqual({ a: { value: "Ana", at: 1 }, b: { missing: true, at: 2 } });
    expect(webStorage<string>("people").load()).toEqual({ a: { value: "Ana", at: 1 }, b: { missing: true, at: 2 } });
    expect(webStorage<string>("other").load()).toEqual({});
  });

  it("takes another Storage, and starts empty from a key that is unreadable or holds null, and from a store that is full", async () => {
    sessionStorage.setItem("people", "{ not json");
    expect(webStorage("people", sessionStorage).load()).toEqual({});
    sessionStorage.setItem("people", "null");
    expect(webStorage("people", sessionStorage).load()).toEqual({});
    sessionStorage.removeItem("people");
    const full = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException("Full", "QuotaExceededError");
      },
    } as unknown as Storage;
    const storage = webStorage<string>("people", full);
    expect(() => storage.save({ a: { value: "Ana", at: 1 } })).not.toThrow();
    expect(storage.load()).toEqual({});
  });
});
