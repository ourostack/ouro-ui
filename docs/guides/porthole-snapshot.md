# The Porthole snapshot

Porthole is a small round window onto how current an app's data is: one line at a time, opened for detail. This page describes the contract it reads: the snapshot a service produces, the heartbeat beside it, and `portholeView`, the pure function that decides what to show. The window, a CLI status command and an agent read the same snapshot, so they agree.

## The snapshot

The service produces one snapshot, plain JSON, and sends it again only when it changes:

```ts
const snapshot: PortholeSnapshot = {
  version: 1,
  items: [{ id: "sync", priority: "working", label: "Catching up… 40%", progress: 0.4, since: 1793731200000 }],
  areas: {
    chats: { lastVerifiedAt: 1793731195000, troubleSince: null },
    calendar: { lastVerifiedAt: null, troubleSince: null, label: "Calendar", freshWithinMs: 5 * 60_000 + 30_000, note: "every 5 min" },
  },
};
```

- `items` are what the service wants said. An item's `priority` is `action` (it waits for the person), `error`, `working` or `rest` (news that needs nothing, such as "Version 2.1 is installed"). The app's source fills `label` and `detail` with words.
- `areas` hold verified facts only: `lastVerifiedAt`, when the area's data was last verified current (null until it has been once), and `troubleSince`, when its current read began to hang or fail (null when it has not).
- An area the service reads on an interval rather than hears pushed sets its own `freshWithinMs`: the interval plus a margin measured from how long a read takes. Live areas keep the view's minute.[^own] Its `note` says in a few words how the service keeps it current ("every 5 min", "live"), and the area's line in the open spot ends with it, after the area's age once it is over a minute old, as in "Calendar: verified 3 min ago, every 5 min".[^note]
- A snapshot of another `version` reads as "Status unknown".[^version]

## The heartbeat

The heartbeat is not in the snapshot. The source exposes it apart, as `lastBeatAt()`, and the service beats on its event stream's keepalive:

```ts
const source: PortholeSource = {
  getSnapshot: () => latest,
  subscribe: (listener) => stream.on("snapshot", listener),
  lastBeatAt: () => lastKeepalive,
};
```

## What shows

`portholeView(snapshot, lastBeatAt, now, options)` returns the state, the one line, the item shown and the open spot's lines:

1. One item at a time: an action over an error, an error over working, working over rest; on a tie, the newest `since` wins.[^priority][^tie]
2. At rest, "Up to date" only while every area was verified within its `freshWithinMs` (the view's, a minute by default, or the area's own); past it, the real age of the area verified longest ago, such as "Updated 4 min ago".[^defaults][^stale]
3. An area whose trouble has lasted `troubleAfterMs` (five seconds by default) stops counting as fresh at once, whatever its `lastVerifiedAt`.[^trouble]
4. "Status unknown" while any area has never been verified, and once the last beat is older than `heartbeatTimeoutMs` (five seconds by default) or stamped too far ahead of this clock to check.[^defaults] A stopped heartbeat outranks every item, an action too, since the action's button would reach a service that cannot answer; the item waits in the open spot's lines.[^unknown][^stopped][^skew]
5. A rest item shows over "Up to date" only; past fresh, or unknown, it waits in the open spot's lines.[^rest]

`state` is what `data-porthole-state` carries for a fault-injection check: `rest-fresh`, `rest-stale`, `unknown`, `action`, `error` or `working`. `status` is the agent read's name for it, with `needs-person` for an action.

## Looking again without a ticking clock

`nextChangeAt` is the earliest moment the view could change with no new snapshot and no new beat: an area's fresh time running out, an age shown reaching its next minute, the heartbeat timing out, or trouble reaching `troubleAfterMs`.[^next] Beats do not notify the view, so while the heartbeat is stopped it also looks for its return `heartbeatTimeoutMs` on.[^return] Schedule one timeout for it, read `lastBeatAt()` again when it fires, and render only when the view changed. The age words never count seconds, so they change at most once a minute.[^age]

## The agent read

`portholeStatus(view)` is the versioned JSON an agent reads and a CLI status command prints: the state, the headline, whether the data is fresh and the heartbeat alive (with its age), each area's `lastVerifiedAt`, age, the `freshWithinMs` it was judged by, its `note`, `troubleSince` and `troubleMs`, what is shown and why it wins, and `asOf`, the clock it was judged at, so an agent never judges liveness on its own clock.[^status][^live][^windows] It names the person's action by id and label (`action`, `actionLabel`), and only the person presses it.

[^version]: test:registry/ouro/lib/ouro/porthole-view.test.ts::portholeView > says Status unknown for a snapshot of another version, whatever its items verify:testExists(registry/ouro/lib/ouro/porthole-view.test.ts::portholeView > says Status unknown for a snapshot of another version, whatever its items)
[^priority]: test:registry/ouro/lib/ouro/porthole-view.test.ts::portholeView > shows an action over an error, an error over working and working over rest verify:testExists(registry/ouro/lib/ouro/porthole-view.test.ts::portholeView > shows an action over an error, an error over working and working over rest)
[^tie]: test:registry/ouro/lib/ouro/porthole-view.test.ts::portholeView > on a tie in priority, shows the item with the newest since, and the lower id when since ties too verify:testExists(registry/ouro/lib/ouro/porthole-view.test.ts::portholeView > on a tie in priority, shows the item with the newest since, and the lower id when since ties too)
[^defaults]: test:registry/ouro/lib/ouro/porthole-view.test.ts::portholeView > uses a minute for fresh, five seconds for the heartbeat and for trouble, and a second for skew by default verify:testExists(registry/ouro/lib/ouro/porthole-view.test.ts::portholeView > uses a minute for fresh, five seconds for the heartbeat and for trouble, and a second for skew by default)
[^stale]: test:registry/ouro/lib/ouro/porthole-view.test.ts::portholeView > at rest, says the real age of the area verified longest ago once any area is past fresh verify:testExists(registry/ouro/lib/ouro/porthole-view.test.ts::portholeView > at rest, says the real age of the area verified longest ago once any area is past fresh)
[^trouble]: test:registry/ouro/lib/ouro/porthole-view.test.ts::portholeView > a trouble-free area is fresh at 4.9 s, in trouble for 5 s it is not, and it is fresh again once the trouble clears verify:testExists(registry/ouro/lib/ouro/porthole-view.test.ts::portholeView > a trouble-free area is fresh at 4.9 s, in trouble for 5 s it is not, and it is fresh again once the trouble clears)
[^unknown]: test:registry/ouro/lib/ouro/porthole-view.test.ts::portholeView > says Status unknown at rest while any area has never been verified verify:testExists(registry/ouro/lib/ouro/porthole-view.test.ts::portholeView > says Status unknown at rest while any area has never been verified)
[^stopped]: test:registry/ouro/lib/ouro/porthole-view.test.ts::portholeView > a stopped heartbeat outranks every item, an action too, which waits in the open lines verify:testExists(registry/ouro/lib/ouro/porthole-view.test.ts::portholeView > a stopped heartbeat outranks every item, an action too, which waits in the open lines)
[^skew]: test:registry/ouro/lib/ouro/porthole-view.test.ts::portholeView > says Status unknown when the heartbeat is stamped too far ahead of this clock, or missing, and accepts skew within the tolerance verify:testExists(registry/ouro/lib/ouro/porthole-view.test.ts::portholeView > says Status unknown when the heartbeat is stamped too far ahead of this clock, or missing, and accepts skew within the tolerance)
[^rest]: test:registry/ouro/lib/ouro/porthole-view.test.ts::portholeView > a rest item shows over Up to date only, and waits in the open lines while an area is past fresh or the status is unknown verify:testExists(registry/ouro/lib/ouro/porthole-view.test.ts::portholeView > a rest item shows over Up to date only, and waits in the open lines while an area is past fresh or the status is unknown)
[^next]: test:registry/ouro/lib/ouro/porthole-view.test.ts::portholeView > nextChangeAt > at rest and fresh, is the first of the heartbeat timing out and an area's fresh time running out verify:testExists(registry/ouro/lib/ouro/porthole-view.test.ts::portholeView > nextChangeAt > at rest and fresh, is the first of the heartbeat timing out and an area's fresh time running out)
[^return]: test:registry/ouro/lib/ouro/porthole-view.test.ts::portholeView > nextChangeAt > with the heartbeat stopped, looks for its return a heartbeat timeout on, and sees it come back from a stale, a missing or a NaN beat verify:testExists(registry/ouro/lib/ouro/porthole-view.test.ts::portholeView > nextChangeAt > with the heartbeat stopped, looks for its return a heartbeat timeout on, and sees it come back from a stale, a missing or a NaN beat)
[^age]: test:registry/ouro/lib/ouro/porthole-view.test.ts::formatPortholeAge > rounds down to minutes, hours and days, and never counts seconds verify:testExists(registry/ouro/lib/ouro/porthole-view.test.ts::formatPortholeAge > rounds down to minutes, hours and days, and never counts seconds)
[^status]: test:registry/ouro/lib/ouro/porthole-view.test.ts::portholeStatus > reads as versioned JSON with needs-person for an action, and survives a round trip verify:testExists(registry/ouro/lib/ouro/porthole-view.test.ts::portholeStatus > reads as versioned JSON with needs-person for an action, and survives a round trip)
[^live]: test:registry/ouro/lib/ouro/porthole-view.test.ts::portholeStatus > says whether the data is fresh and the heartbeat alive, whatever is shown, as of the clock it was judged at verify:testExists(registry/ouro/lib/ouro/porthole-view.test.ts::portholeStatus > says whether the data is fresh and the heartbeat alive, whatever is shown, as of the clock it was judged at)
[^own]: test:registry/ouro/lib/ouro/porthole-view.test.ts::portholeView > an area's own freshWithinMs > replaces the view's for that area alone, up to and including the window itself verify:testExists(registry/ouro/lib/ouro/porthole-view.test.ts::portholeView > an area's own freshWithinMs > replaces the view's for that area alone, up to and including the window itself)
[^note]: test:registry/ouro/lib/ouro/porthole-view.test.ts::portholeView > an area's own freshWithinMs > gives a fresh area's age past a minute, and its note, in its line verify:testExists(registry/ouro/lib/ouro/porthole-view.test.ts::portholeView > an area's own freshWithinMs > gives a fresh area's age past a minute, and its note, in its line)
[^windows]: test:registry/ouro/lib/ouro/porthole-view.test.ts::portholeStatus > gives each area the window it was judged fresh by and its note verify:testExists(registry/ouro/lib/ouro/porthole-view.test.ts::portholeStatus > gives each area the window it was judged fresh by and its note)
