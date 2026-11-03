export { createPeopleCache, readFailure, unknownPerson, webStorage };
export type { PeopleCache, PeopleCacheOptions, PeopleCacheStorage, PersonEntry, PersonRead, StoredPerson };

/**
 * What a read says about one person: `{ value }` when the service has them, `"missing"` when it
 * has nothing for them (no such person, no photo, or a refusal for this person alone), and
 * `"failed"` when the service itself failed (no answer, signed out, throttled or down).
 * @claim "What a read says about" registry/ouro/lib/ouro/people-cache.test.ts verify:testExists(registry/ouro/lib/ouro/people-cache.test.ts::createPeopleCache > makes no one wait when the service refuses one person, and pauses for a person the service failed on)
 */
type PersonRead<T> = { value: T } | "missing" | "failed";

/** A person as storage keeps them: their value, or `missing`, with when they were read (ms since the epoch). */
type StoredPerson<T> = { value: T; at: number } | { missing: true; at: number };

/**
 * Where a person stands in the cache.
 *
 * - `unknown`: not asked for yet.
 * - `queued`, `reading`: a read is waiting for its batch, or under way.
 * - `found`, `missing`: read, until `retryAt`, when a read is due again.
 * - `waiting`: the service failed; read again after its pause, at `retryAt`.
 *
 * `value` is the last value found, kept while the person is read again, so an avatar keeps its photo.
 */
interface PersonEntry<T> {
  status: "unknown" | "queued" | "reading" | "found" | "missing" | "waiting";
  value: T | undefined;
  retryAt: number | undefined;
}

/**
 * Where the cache keeps what it read between visits, such as `webStorage("people")`. `load` runs
 * once, as the cache starts, and reads wait for it; `save` gets each batch's results. Either may
 * return a promise, and a failure in either leaves the cache working from memory.
 * @claim "`load` runs once, as" registry/ouro/lib/ouro/people-cache.test.ts verify:testExists(registry/ouro/lib/ouro/people-cache.test.ts::createPeopleCache > keeps what it read in storage, and starts from it after a reload, reading only who ran out)
 * @claim "a failure in either leaves" registry/ouro/lib/ouro/people-cache.test.ts verify:testExists(registry/ouro/lib/ouro/people-cache.test.ts::createPeopleCache > works from memory when storage fails to load or save, or keeps something unreadable)
 */
interface PeopleCacheStorage<T> {
  load(): Record<string, StoredPerson<T>> | null | undefined | Promise<Record<string, StoredPerson<T>> | null | undefined>;
  save(changes: Record<string, StoredPerson<T>>): void | Promise<void>;
}

/** Options for {@link createPeopleCache}. */
interface PeopleCacheOptions<T> {
  /**
   * Reads a batch of people from the service: a result for each id it has an answer for, or a
   * rejection when the service failed. An id the result leaves out is `"missing"`. A rejection's
   * `retryAfterMs`, if it has one, lengthens the pause, up to `longestPause`.
   * @claim "lengthens the pause, up" registry/ouro/lib/ouro/people-cache.test.ts verify:testExists(registry/ouro/lib/ouro/people-cache.test.ts::createPeopleCache > pauses no longer than longestPause, even when pauseFor or a failure's retryAfterMs asks for longer)
   * @claim "Reads a batch of people" registry/ouro/lib/ouro/people-cache.test.ts verify:testExists(registry/ouro/lib/ouro/people-cache.test.ts::createPeopleCache > keeps a person the service had nothing for, or left out of its answer, as missing until missingFor runs out)
   */
  read: (ids: string[]) => Promise<Record<string, PersonRead<T>>>;
  /** Where to keep what was read between visits. Leave it out to keep it in memory only. */
  storage?: PeopleCacheStorage<T> | undefined;
  /** The limit on ids in one call to `read`. @default 50 */
  batchSize?: number | undefined;
  /** How long a person found stays fresh, in ms. @default 604_800_000 */
  foundFor?: number | undefined;
  /** How long a person the service had nothing for stays fresh, in ms, before they are asked about again. @default 86_400_000 */
  missingFor?: number | undefined;
  /**
   * How long reads wait after the service fails, in ms. The pause doubles with each round of reads
   * that fails, up to `longestPause`, and a read that succeeds, even one that finds nothing, starts
   * it from `pauseFor` again.
   * @default 15_000
   * @claim "The pause doubles with" registry/ouro/lib/ouro/people-cache.test.ts verify:testExists(registry/ouro/lib/ouro/people-cache.test.ts::createPeopleCache > doubles the pause with each round of reads that fails, up to longestPause)
   * @claim "a read that succeeds, even" registry/ouro/lib/ouro/people-cache.test.ts verify:testExists(registry/ouro/lib/ouro/people-cache.test.ts::createPeopleCache > starts the pause from pauseFor again after a read that succeeds, even one that finds nothing)
   */
  pauseFor?: number | undefined;
  /**
   * The longest pause after the service fails, in ms, even when `pauseFor` or a failure's
   * `retryAfterMs` asks for longer.
   * @default 600_000
   * @claim "The longest pause after" registry/ouro/lib/ouro/people-cache.test.ts verify:testExists(registry/ouro/lib/ouro/people-cache.test.ts::createPeopleCache > pauses no longer than longestPause, even when pauseFor or a failure's retryAfterMs asks for longer)
   */
  longestPause?: number | undefined;
}

/** A cache of people's names, photos or profiles, from {@link createPeopleCache}. */
interface PeopleCache<T> {
  /** Where the person stands now, without reading anything. The same object until it changes. */
  get(id: string): PersonEntry<T>;
  /** Reads the person unless they are fresh, and resolves once they are found, missing or waiting. */
  load(id: string): Promise<PersonEntry<T>>;
  /**
   * Keeps the person read while it is watched: now, unless they are fresh, and again whenever their
   * entry runs out. `onChange` runs when their entry changes. Returns the function that stops watching.
   */
  watch(id: string, onChange: () => void): () => void;
  /** Stores a value the app already has for the person, such as a name that came with a message. */
  set(id: string, value: T): void;
}

/** The entry of a person the cache has not been asked about. */
const unknownPerson: PersonEntry<never> = Object.freeze({ status: "unknown", value: undefined, retryAt: undefined });

/** The longest wait `setTimeout` takes; it runs a longer one at once. */
const LONGEST_WAIT = 2_147_483_647;

/**
 * A cache of people's names, photos or profiles for an app's avatars and message names, read from
 * your service in batches. A person asked for again while their read is queued or under way joins
 * that read. A person the service has nothing for is kept as `missing` until `missingFor` runs out,
 * so they are not asked about on every load. When the service fails, every read pauses, and the
 * people in that read are asked again after it; the pause starts at `pauseFor` and doubles with each
 * round that fails, up to `longestPause`, however many reads fail in a round. A person refused alone
 * is `missing` and makes no one wait. With `storage`, what was read survives a reload; an entry whose time has run
 * out is read again when next asked for, or at once while it is watched.
 *
 * Use one cache per kind of thing (names, photos), made once outside your components, and read it
 * with `usePerson` in React or `get`, `load` and `watch` elsewhere.
 *
 * @claim "A person asked for again" registry/ouro/lib/ouro/people-cache.test.ts verify:testExists(registry/ouro/lib/ouro/people-cache.test.ts::createPeopleCache > joins a person asked for again while their read is queued or under way to that read)
 * @claim "read from your service in" registry/ouro/lib/ouro/people-cache.test.ts verify:testExists(registry/ouro/lib/ouro/people-cache.test.ts::createPeopleCache > reads the people asked for in the same moment in batches of batchSize, and answers each)
 * @claim "A person the service has" registry/ouro/lib/ouro/people-cache.test.ts verify:testExists(registry/ouro/lib/ouro/people-cache.test.ts::createPeopleCache > keeps a person the service had nothing for, or left out of its answer, as missing until missingFor runs out)
 * @claim "When the service fails, every" registry/ouro/lib/ouro/people-cache.test.ts verify:testExists(registry/ouro/lib/ouro/people-cache.test.ts::createPeopleCache > pauses every read for pauseFor when the service fails, and reads the people in that read again after it)
 * @claim "the pause starts at" registry/ouro/lib/ouro/people-cache.test.ts verify:testExists(registry/ouro/lib/ouro/people-cache.test.ts::createPeopleCache > doubles the pause with each round of reads that fails, up to longestPause)
 * @claim "the pause starts at" registry/ouro/lib/ouro/people-cache.test.ts verify:testExists(registry/ouro/lib/ouro/people-cache.test.ts::createPeopleCache > steps the pause once for reads that fail in the same round)
 * @claim "A person refused alone" registry/ouro/lib/ouro/people-cache.test.ts verify:testExists(registry/ouro/lib/ouro/people-cache.test.ts::createPeopleCache > makes no one wait when the service refuses one person, and pauses for a person the service failed on)
 * @claim "With `storage`, what was read" registry/ouro/lib/ouro/people-cache.test.ts verify:testExists(registry/ouro/lib/ouro/people-cache.test.ts::createPeopleCache > keeps what it read in storage, and starts from it after a reload, reading only who ran out)
 * @claim "an entry whose time has run" registry/ouro/lib/ouro/people-cache.test.ts verify:testExists(registry/ouro/lib/ouro/people-cache.test.ts::createPeopleCache > reads a person found again once foundFor runs out, keeping their value while it reads)
 * @claim "an entry whose time has run" registry/ouro/lib/ouro/people-cache.test.ts verify:testExists(registry/ouro/lib/ouro/people-cache.test.ts::createPeopleCache > reads a watched person now and again whenever their entry runs out, calling onChange on each change)
 * @claim "an entry whose time has run" registry/ouro/lib/ouro/people-cache.test.ts verify:testExists(registry/ouro/lib/ouro/people-cache.test.ts::createPeopleCache > reads a watched person whose stored entry already ran out at once, and one whose read failed once the pause ends)
 * @group Chat
 *
 * @example
 * const photos = createPeopleCache<string>({
 *   read: async (ids) => {
 *     const entries = await Promise.all(ids.map(async (id) => {
 *       const response = await fetch(`/api/people/${id}/photo`);
 *       if (!response.ok) return [id, readFailure(response.status)] as const;
 *       return [id, { value: URL.createObjectURL(await response.blob()) }] as const;
 *     }));
 *     return Object.fromEntries(entries);
 *   },
 *   storage: webStorage("people-photos"),
 * });
 */
function createPeopleCache<T>(options: PeopleCacheOptions<T>): PeopleCache<T> {
  const { read, storage, batchSize = 50, foundFor = 604_800_000, missingFor = 86_400_000, pauseFor = 15_000, longestPause = 600_000 } = options;
  const entries = new Map<string, PersonEntry<T>>();
  const watchers = new Map<string, Set<() => void>>();
  const waiters = new Map<string, ((entry: PersonEntry<T>) => void)[]>();
  const queue = new Set<string>();
  let pausedUntil = 0;
  // The last pause's length, or 0 once a read succeeds.
  let pause = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const get = (id: string): PersonEntry<T> => entries.get(id) ?? unknownPerson;
  const fresh = (entry: PersonEntry<T>) => (entry.status === "found" || entry.status === "missing") && entry.retryAt! > Date.now();
  const busy = (entry: PersonEntry<T>) => entry.status === "queued" || entry.status === "reading";
  const update = (id: string, entry: PersonEntry<T>) => {
    entries.set(id, entry);
    for (const onChange of watchers.get(id) ?? []) onChange();
  };
  const settle = (id: string, stored: StoredPerson<T>) =>
    update(id, "missing" in stored ? { status: "missing", value: undefined, retryAt: stored.at + missingFor } : { status: "found", value: stored.value, retryAt: stored.at + foundFor });
  const answer = (id: string) => {
    for (const resolve of waiters.get(id) ?? []) resolve(get(id));
    // Stryker disable next-line all: a promise already resolved ignores resolving again; deleting the list only frees memory.
    waiters.delete(id);
  };
  // Stryker disable next-line OptionalChaining: without storage, the call that throws is caught at once, as a save that does nothing.
  const save = (changes: Record<string, StoredPerson<T>>) => void Promise.resolve(changes).then((saved) => storage?.save(saved)).catch(() => {});

  // What storage kept, under anyone the app has not told the cache about since.
  // Stryker disable next-line OptionalChaining: without storage, the call that throws is caught below, as storage that kept nothing.
  const kept = () => storage?.load();
  const ready = Promise.resolve()
    .then(kept)
    .then((stored) => {
      for (const [id, person] of Object.entries(stored ?? {})) if (["unknown", "queued"].includes(get(id).status)) settle(id, person);
    })
    .catch(() => {});

  const want = (id: string) => {
    const entry = get(id);
    if (busy(entry)) return;
    queue.add(id);
    update(id, { ...entry, status: "queued" });
    schedule();
  };

  // One timer: the queue's flush (after the pause), or the soonest a watched entry runs out.
  function schedule() {
    clearTimeout(timer);
    let next = queue.size > 0 ? pausedUntil : Infinity;
    for (const id of watchers.keys()) {
      const entry = get(id);
      // A watched person who is not being read has been read: found, missing or waiting, each with a time.
      if (!busy(entry)) next = Math.min(next, entry.retryAt!);
    }
    if (next !== Infinity) timer = setTimeout(tick, Math.min(LONGEST_WAIT, next - Date.now()));
  }

  function tick() {
    for (const id of watchers.keys()) {
      const entry = get(id);
      if (!busy(entry) && entry.retryAt! <= Date.now()) want(id);
    }
    void flush();
  }

  async function flush() {
    await ready;
    if (Date.now() < pausedUntil) return schedule();
    const ids = [...queue];
    queue.clear();
    const due = ids.filter((id) => !fresh(get(id)));
    // Fresh from storage, or set by the app since they were asked for.
    for (const id of ids) if (fresh(get(id))) answer(id);
    for (let start = 0; start < due.length; start += batchSize) void readBatch(due.slice(start, start + batchSize));
    schedule();
  }

  async function readBatch(ids: string[]) {
    for (const id of ids) update(id, { ...get(id), status: "reading" });
    let results: Record<string, PersonRead<T>> | undefined;
    let retryAfter = 0;
    try {
      results = await read(ids);
    } catch (error) {
      retryAfter = Number((error as { retryAfterMs?: unknown } | null)?.retryAfterMs) || 0;
    }
    const at = Date.now();
    const changes: Record<string, StoredPerson<T>> = {};
    const failed: string[] = [];
    for (const id of ids) {
      const result = results === undefined ? "failed" : Object.hasOwn(results, id) ? results[id]! : "missing";
      if (result === "failed") failed.push(id);
      else changes[id] = result === "missing" ? { missing: true, at } : { value: result.value, at };
    }
    if (failed.length === 0) pause = 0;
    else {
      // One step per round: a read that fails while a pause is in force started before it, in the round that set it.
      if (at >= pausedUntil) {
        pause = Math.min(longestPause, pause === 0 ? pauseFor : pause * 2);
        pausedUntil = at + pause;
      }
      pausedUntil = Math.max(pausedUntil, at + Math.min(longestPause, retryAfter));
    }
    for (const id of ids) {
      if (Object.hasOwn(changes, id)) settle(id, changes[id]!);
      else update(id, { ...get(id), status: "waiting", retryAt: pausedUntil });
      answer(id);
    }
    if (Object.keys(changes).length > 0) save(changes);
    schedule();
  }

  return {
    get,
    load(id) {
      const entry = get(id);
      if (fresh(entry)) return Promise.resolve(entry);
      return new Promise((resolve) => {
        waiters.set(id, [...(waiters.get(id) ?? []), resolve]);
        want(id);
      });
    },
    watch(id, onChange) {
      const own = watchers.get(id) ?? new Set();
      watchers.set(id, own.add(onChange));
      // Someone not read yet is read now; an entry that ran out, or waits for a pause, when the timer comes.
      if (get(id).retryAt === undefined) want(id);
      schedule();
      return () => {
        own.delete(onChange);
        if (own.size === 0) watchers.delete(id);
        schedule();
      };
    },
    set(id, value) {
      const stored = { value, at: Date.now() };
      settle(id, stored);
      answer(id);
      save({ [id]: stored });
    },
  };
}

/**
 * Whether a failed read's HTTP status is the service's (`"failed"`: no answer, signed out,
 * throttled, timed out or failing, so every read waits) or this person's (`"missing"`: the
 * service refused them alone, so they are kept as missing and no one waits).
 * @claim "Whether a failed read's" registry/ouro/lib/ouro/people-cache.test.ts verify:testExists(registry/ouro/lib/ouro/people-cache.test.ts::readFailure > counts no answer, signed out, forbidden, timed out, throttled and server errors as the service's, and other refusals as the person's)
 *
 * @group Chat
 *
 * @example
 * if (!response.ok) return [id, readFailure(response.status)];
 */
function readFailure(status: number | undefined): "missing" | "failed" {
  return !status || status === 401 || status === 403 || status === 408 || status === 429 || status >= 500 ? "failed" : "missing";
}

/**
 * Storage for {@link createPeopleCache} in `localStorage`, or another `Storage`, under one key. A
 * full or unreadable store leaves the cache working from memory.
 * @claim "A full or unreadable store" registry/ouro/lib/ouro/people-cache.test.ts verify:testExists(registry/ouro/lib/ouro/people-cache.test.ts::webStorage > takes another Storage, and starts empty from a key that is unreadable or holds null, and from a store that is full)
 *
 * @group Chat
 *
 * @example
 * const names = createPeopleCache<string>({ read: readNames, storage: webStorage("people-names") });
 */
function webStorage<T>(key: string, store: Storage = localStorage): PeopleCacheStorage<T> {
  const load = (): Record<string, StoredPerson<T>> => {
    try {
      // Stryker disable next-line StringLiteral: an empty string fails to parse, and the catch gives the same empty start.
      return JSON.parse(store.getItem(key) ?? "{}") ?? {};
    } catch {
      return {};
    }
  };
  return {
    load,
    save(changes) {
      try {
        store.setItem(key, JSON.stringify({ ...load(), ...changes }));
      } catch {
        // A full store: the cache keeps working from memory.
      }
    },
  };
}
