# Ouro AX outcomes

An agent interface is judged by what comes back. Under Ouro AX, an action returns one envelope, the outcome, with the same fields over a CLI's `--json`, an HTTP route and an MCP tool. A wait returns a second envelope, the wait. `lib-ax-outcome` holds both as types, small builders and a validator, in one file without imports.[^no-imports]

```sh
npx shadcn@latest add ourostack/ouro-ui/lib-ax-outcome#ax-probe/outcomes
```

This is a probe on the `ax-probe/outcomes` branch, not a release. Tandem's agent interface (`m365tandem`) is its first adopter.

## The outcome

```json
{
  "ax": "ax.outcome/1",
  "action": "message.send",
  "effect": "others",
  "audience": { "only": false, "who": "everyone in \"Design sync\"" },
  "scope": { "kind": "conversation", "id": "19:design@thread.v2", "name": "Design sync" },
  "state": "queued",
  "summary": "Queued: sending to \"Design sync\" as the person once the Tandem window takes it.",
  "postcondition": { "checked": false, "holds": null, "how": "not performed yet: no Tandem window has taken it" },
  "receipt": { "id": "a1b2c3d4e5f6", "at": "2026-10-30T20:00:00.000Z", "by": "agent:planner", "why": "Sam asked me to tell Design sync the build is green" },
  "next": [{ "command": "m365tandem outcome a1b2c3d4e5f6 --wait 2m", "why": "wait for it to be sent; do not send it again meanwhile" }]
}
```

| Field | What it answers |
| --- | --- |
| `action` | Which action ran, by its stable id. |
| `effect`, `audience` | Who is affected (`private`: only the person and their agents; `others`), and who can see it, in words. |
| `scope` | The exact resource, so a wrong team, chat or meeting is visible. |
| `state` | What became of it (below). |
| `postcondition` | Whether the effect was checked separately from the transport's answer, whether it holds (`null`: not observable yet) and what was read. A transport success is not evidence. |
| `receipt` | The id that finds the request again, when, by whom and why. |
| `next` | Exact commands that are valid now, with their reasons.[^steps] |
| `error` | A stable code and one line that says what to do instead. |
| `human` | Only on `needs-human`: why only a person can go on, and the step that resumes. |

### States

| State | Meaning |
| --- | --- |
| `done` | It happened; the postcondition says how that is known. |
| `planned` | A dry run (`--plan`); nothing happened. |
| `queued` | Accepted, not performed yet; follow the receipt. |
| `uncertain` | It may or may not have happened; reconcile before any retry. |
| `failed` | Tried and proven not done. |
| `refused` | Checked and not done, with the reason. |
| `needs-human` | Only a person can take the next step. |

`exitCodeOf(state)` gives a CLI's exit code for each state: done and planned exit 0, failed 1, refused 2, queued and uncertain 7, and needs-human 8.[^exit] An interface with its own exit codes keeps them and maps its states onto them.

## The validator

`validateOutcome(value)` checks meaning, not only shape, and returns `{ ok, errors, warnings }`:

- `done` never rests on a postcondition that failed. A `done` that was not checked independently is a warning, so the interface says what it relied on.
- `refused` and `failed` carry an error. Their postcondition cannot say the effect holds.
- `queued` and `uncertain` carry a receipt and a next step. `uncertain` cannot claim to know.
- An effect other people see that happened, or may have, carries a receipt with a why.
- `needs-human` carries the reason and the resume step.
- A next step is an exact command with its why.[^steps]

`validateWait(value)` checks that a wait which can go on names how to resume it, and that a satisfied wait carries what happened.

## The wait

An agent waiting on a person, or on fresh data, gets a typed wait instead of polling blindly.

```json
{
  "ax": "ax.wait/1",
  "for": "a reply in \"Design sync\" from someone other than the person",
  "scope": { "kind": "conversation", "id": "19:design@thread.v2", "name": "Design sync" },
  "state": "timed-out",
  "since": "2026-10-30T20:00:00.000Z",
  "cursor": "1767225600000",
  "events": [],
  "fresh": { "state": "live", "asOf": "2026-10-30T20:10:00.000Z" },
  "resume": { "command": "m365tandem watch abc123 --after 1767225600000", "why": "wait again from the same place" },
  "callback": "/api/wait?conversation=19%3Adesign%40thread.v2&after=1767225600000",
  "next": []
}
```

- `state`: `satisfied` (the events say what happened), `waiting`, `timed-out` or `gone` (it cannot happen any more).
- `cursor` and `resume`: where to continue, so a resumed wait neither misses nor repeats an event.
- `fresh`: how current the source is, so an agent can tell "nothing happened" from "nothing was seen".
- `callback`: a route to subscribe to instead of polling.

## Builders

```ts
import { nextStep, outcome, validateOutcome } from "@/lib/ouro/ax-outcome";

const result = outcome({
  action: "draft.edit",
  state: "done",
  summary: 'Draft saved in "Design sync". Only you see it; nothing was sent.',
  postcondition: { checked: true, holds: true, how: "read the draft back: version 4 has this text" },
  next: [nextStep("m365tandem send abc123 --draft --agent <name> --why \"<who asked>\"", "send it, only when a person asked")],
});
validateOutcome(result).ok; // true
```

`outcome()` fills honest defaults: private, only you, nothing checked, without a receipt or next steps.[^defaults] `outcomeLine()` prints an outcome for a person, with its next steps.

[^no-imports]: registry/ouro/lib/ouro/ax-outcome.ts verify:fileLine(registry/ouro/lib/ouro/ax-outcome.ts, /^export \{ axError/)
[^steps]: registry/ouro/lib/ouro/ax-outcome.test.ts verify:testExists(registry/ouro/lib/ouro/ax-outcome.test.ts::validateOutcome > names every broken field)
[^exit]: registry/ouro/lib/ouro/ax-outcome.test.ts verify:testExists(registry/ouro/lib/ouro/ax-outcome.test.ts::exitCodeOf and outcomeLine > gives every state its exit code)
[^defaults]: registry/ouro/lib/ouro/ax-outcome.test.ts verify:testExists(registry/ouro/lib/ouro/ax-outcome.test.ts::outcome > fills honest defaults: private, only you, nothing checked, no receipt)
