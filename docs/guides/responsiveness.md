# Responsiveness, native: a design note

This note designs [the responsiveness issue](https://github.com/ourostack/ouro-ui/issues/501). The goal is that apps built on Ouro UI feel alive by default, and that code, not taste, decides whether they are fast enough. It is a proposal: the primitives below are planned to land in small pull requests and release waves, with their HX side, their AX side, docs and tests, and any of it can change in review.

The ask, from the app's owner, is quoted in [the issue](https://github.com/ourostack/ouro-ui/issues/501): eager and optimistic loading, and the like, made first-class and native.

## What the primitives share

- **Show something true at once.** A press answers in the next frame. Content that is still on its way holds its place with the shape of what is coming.
- **Never pretend.** Anything shown before the server agrees is marked as pending. When the server refuses, the change rolls back in view, and the person hears why.
- **The agent sees what the person sees.** Pending changes, cache age and queued writes go into the components' AX state, so an agent can read them as the person sees them.
- **Measured, not judged.** Planned checks in `ouro-check` will fail a build when the app is too slow or moves under the reader.
- **Reduced motion keeps the speed.** With reduced motion nothing slides or scales, but nothing waits either. A transition becomes an instant swap or a fade.

## The primitives

### Skeletons sized to the content

This one is under way. In [the Skeleton shapes PR](https://github.com/ourostack/ouro-ui/pull/506), Skeleton takes the size of what it stands in for: lines of Text, an Avatar, an Item row and a Card. [The source-rule PR](https://github.com/ourostack/ouro-ui/pull/503) adds a category to the source rule that counts a spinner standing in for content. [The name-loading PR](https://github.com/ourostack/ouro-ui/pull/515) lets Message and Avatar hold a name that is still loading. The next components to draw their own loading shape are the ones that own a list: MessageList while older history loads, ConversationList while it fills, and Command's results while a search runs.

### Optimistic updates with rollback

- **HX:** a hook, `useOptimisticAction({ apply, commit, describe })`. `apply` changes what is shown at once and `commit` sends the change. A refusal doesn't undo `apply` by hand: the shown state is rebuilt from the server's state with the changes still pending applied again, so overlapping changes to one item survive a refusal of the first, and `describe(reason)` shows in a toast. The control that started the action carries `data-pending` until the server answers. Components that show a pending item, such as Message beside its existing `failed` state, and ReactionBar, draw it quietly, not as an error.
- **AX:** a pending change appears in the component's AX state with what it is, when it started and its outcome once known. Who did it comes from the AX kit's work events (`actor`, `onBehalfOf` in `registry/ouro/ax/work-event.ts`) and the outcome receipt's `by`.
- **Tests to write:** a refusal rolls back in view and says why; a slow commit keeps the change pending without blocking the next press; quick changes to the same item settle in the order they were made.

### Prefetch on intent

- **HX:** a `prefetch` prop on Link, Item and ConversationList rows. It takes the function that warms the data and code for that destination. It runs when a press is likely: the pointer rests on the target, focus lands on it, or a touch starts. It runs once per target until the data goes stale.
- **Budget:** a few prefetches at a time per page, and prefetching stops while the browser reports Save-Data or a metered connection.
- **AX:** an agent's `open` of a target runs the same prefetch first, so both paths are equally fast.

### Stale-while-revalidate cache

- **HX:** `createResourceCache()` once per app, and `useResource(key, load)` in a view. It returns `{ data, age, refreshing, error }`. Views that share a key share its entry, so panes showing the same thing agree. While a refresh runs, the old data stays, and its age shows with RelativeTime where the app chooses to show it.
- **AX:** the resource's age and whether a refresh is running are in the AX state.
- **Tests:** a second view of the same key reads the cache without a second request; a failed refresh keeps the old data and reports the error.

### Instant navigation with view transitions

- **HX:** this is new work. Today OuroProvider's `linkComponent` only renders links, and the app's router navigates. The plan is a navigation hook in OuroProvider that the router adapter calls, running the swap inside `document.startViewTransition` where the browser has it, for links, back and forward. Only the element that moves between views (the opened row's avatar or title) takes a `view-transition-name`, since a name repeated across rows makes the browser skip the transition. Transitions stay short, because presses during one land on the transition's overlay. With reduced motion (OuroProvider's `motion` setting as well as the device's), or where the browser lacks view transitions, the swap is instant.
- **Tests:** a navigation with view transitions and one without leave the same focus and the same announced title.

### Background sync

- **HX:** a write queue under SyncStatus. Writes made offline are kept across a reload, per account and cleared on sign-out, and sent in order when the connection returns, with backoff. A queued write is planned to carry an idempotency key, so a retry after a lost reply doesn't apply it twice. SyncStatus shows how many are waiting, and a waiting item shows as pending, as in the optimistic updates above.
- **AX:** an agent can list the queue, retry it and cancel a queued write. These actions name their actor through the AX kit's work events.

## Measured checks in `ouro-check`

These come after [the ouro-check PR](https://github.com/ourostack/ouro-ui/pull/511) merges. They build on the site's existing latency specs (`site/e2e/*.latency.spec.ts`, with `site/e2e/latency.ts`). A check has a rule id, a budget the app can tighten but not loosen, a captioned finding with a crop of the moment, and a JSON record.

| Rule id | What it measures | How it fails |
|---|---|---|
| `inp` | Input to next paint for the pressable controls a flow presses | A press whose next paint misses the budget |
| `layout-shift` | The cumulative layout shift score while a screen loads, from the first paint until its content settles | A score above the budget, with the elements that moved and the ones that pushed them |
| `first-content` | Time from navigation to the first useful content (the first real row, message or heading, not a skeleton) | First content after the budget |

The budgets live in the check's own settings, so changing a number there moves the apps that use it. `inp` is planned to start at the site's existing latency budget (`LATENCY.p95` in `site/e2e/latency.ts`, on its throttled CPU), which is stricter than the web's published "good" input threshold. `layout-shift` and `first-content` are planned to start at the web's published "good" thresholds. A finding names the component that caused it, so a fix goes into Ouro first when the cause is a component.

## Order of work

1. Skeletons sized to the content (in review).
2. The measured checks, once `ouro-check` lands, so the next primitives are measured from their first PR.
3. Optimistic updates with rollback, then the cache, then prefetch, which uses it.
4. View transitions, then background sync.

The first adopters are Tandem, through its polish lane, and CIT Pages.

## Open questions

- Should the cache live in Ouro UI, or should Ouro UI define the interface and let the app bring its own store?
- What is the budget for `first-content` on an app whose first content depends on a slow service? The check could measure from the service's answer instead of from navigation.
- How much of the AX side of pending changes belongs in the AX kit, and how much in each component's AX declaration?
