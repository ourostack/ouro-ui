# Add Ouro AX to an app you already have

You were going to build this: one typed layer of actions that your buttons call and an agent calls too, with one handler behind both, so the screen and the agent's tool stay together. Ouro AX is that layer, and it comes without Ouro HX. Your components, your styles and your build stay as they are ([Ouro AX](ax.md)).

This guide adds a pair of actions to an app, binds them to buttons the app already has, serves them over MCP and checks the server from outside. The fixture it comes from is [test/ax-standalone-fixture/](../../test/ax-standalone-fixture/), and a test places the kit's files into a copy of it as the registry lists them, and checks the generated projections, that a button and the MCP tool reach one handler, and the server from outside.[^proof]

What this is not: a restyle, or a verdict on your screens. The X-ray here (`ax-xray`) checks the agent's interface. The on-screen X-ray that outlines controls is an Ouro HX component, and it is [a separate step](beside-an-incumbent.md).

## 1. Install only the AX items

```sh
npx shadcn@latest add ourostack/ouro-ui/ouro-ax#v1.3.589
npm pkg set "imports.#ouro-ax/*=./src/lib/ouro/ax/*"
```

`ouro-ax` and the items it needs are `ax-*` items: they add no component, no theme, no stylesheet and no npm package.[^closure] The shared files land in `lib/ouro/ax/`, and the X-ray in `scripts/ouro/ax/`. The second line lets the kit's files import one another by name; use the path your lib alias points to.

## 2. Declare two actions

Write each action once: what it does, who may run it (`consent`), what it takes and what it gives back.

```ts
import { defineAction, defineActions, field } from "./scripts/ouro-actions/ouro-actions.mts";

export const listTasks = defineAction({
  id: "list_tasks",
  consent: "read",
  label: "List tasks",
  description: "See the open and finished tasks.",
  agent: "List the tasks: each one's id, title and whether it is done. Take an id from here for complete_task.",
  input: {},
  output: { tasks: field.string({ label: "Tasks", description: "The tasks, as JSON." }) },
  cli: "tasks list",
});

export const completeTask = defineAction({
  id: "complete_task",
  consent: "write",
  label: "Complete task",
  description: "Mark one task done.",
  agent: "Mark one task done. Take the id from list_tasks.",
  input: { id: field.string({ label: "Task id", description: "The task's id, from list_tasks.", arg: true }) },
  output: { id: field.string({ label: "Task id", description: "The task that was completed." }) },
  cli: "tasks complete",
});

export default defineActions("standalone-tasks", [listTasks, completeTask], { tool: "tasks" });
```

The generator is a single file, `scripts/ouro-actions/ouro-actions.mts`, vendored from [Ouro Actions](https://github.com/ourostack/ouro-ui-core/blob/main/docs/guides/actions.md). Download it with `curl -fsSL --create-dirs -o scripts/ouro-actions/ouro-actions.mts https://raw.githubusercontent.com/ourostack/ouro-ui/main/scripts/ouro-actions/ouro-actions.mts` (the registry has no item for it). Run it to write the projections, and again with `check` in CI to fail when a projection no longer matches the declaration:

```sh
node scripts/ouro-actions/ouro-actions.mts generate tasks.actions.mts generated --targets web,mcp,actions
node scripts/ouro-actions/ouro-actions.mts check tasks.actions.mts generated --targets web,mcp,actions
```

`generated/mcp.json` is the tool list and `generated/web.ts` is what your buttons read.

## 3. Wire the actions to the buttons you have

Keep each button's markup and handler. Spread the control's props on it, so the button announces which action it takes, and make its handler call the app's own function, the one the MCP tool will call:

```tsx
import { controls } from "./generated/web.ts";
import { handlers } from "./tasks.ts"; // the app's existing service

<button {...controls["complete-task"].props} onClick={() => handlers.complete_task({ id })}>
  Complete task
</button>
```

The props add `data-ax-action="complete-task"`. An existing handler stays as it is.

## 4. Serve the same handlers over MCP

An MCP server over stdio is a loop that answers `initialize`, `tools/list` and `tools/call`. The fixture's [src/mcp.mjs](../../test/ax-standalone-fixture/src/mcp.mjs) is a short loop: it lists the tools in `generated/mcp.json` and answers a call with `handlers[name](args)`. A button's click and an agent's call reach one function, so they give one answer.[^same]

## 5. Check it from outside

```sh
echo '{"mcp": ["list_tasks", "complete_task"]}' > inventory.json
node scripts/ouro/ax/xray.ts --mcp "node src/mcp.mjs" --inventory inventory.json --conformance --home .xray-home --md xray.md
```

The X-ray calls the server the way an agent does and reports which claims hold, and for a failure the call it made and the fix. `--conformance` exits non-zero unless the claims marked `must` hold.[^xray] Run it in CI beside `ouro-actions check`. Point it at a mock or test account when the handlers change real data: `--mock` and `--guard` say how ([the X-ray](ax-conformance.md)).

## Next

- To show people and agents which controls on a page are bound to which action, see [beside an incumbent](beside-an-incumbent.md): the Inspector's `controls` option outlines a page's own controls, by role and accessible name, with the bound action.
- To move an existing CLI onto the same declarations, see [make your CLI conformant](ax-adopt.md).

[^proof]: test:scripts/ax-standalone.test.mjs::an app with no Ouro HX declares two actions, and the generated projections match them verify:testExists(scripts/ax-standalone.test.mjs::an app with no Ouro HX declares two actions, and the generated projections match them) verify:testExists(scripts/ax-standalone.test.mjs::a button and the MCP tool call the same handler, so a press and an agent's call give one answer) verify:testExists(scripts/ax-standalone.test.mjs::ax-xray checks the app's MCP server from outside and finds it conformant, with no Ouro HX installed)
[^closure]: test:scripts/ax-standalone.test.mjs::ouro-ax installs only AX items: no Ouro HX component, theme, stylesheet or package verify:testExists(scripts/ax-standalone.test.mjs::ouro-ax installs only AX items: no Ouro HX component, theme, stylesheet or package)
[^same]: test:scripts/ax-standalone.test.mjs::a button and the MCP tool call the same handler, so a press and an agent's call give one answer verify:testExists(scripts/ax-standalone.test.mjs::a button and the MCP tool call the same handler, so a press and an agent's call give one answer)
[^xray]: test:scripts/ax-standalone.test.mjs::ax-xray checks the app's MCP server from outside and finds it conformant, with no Ouro HX installed verify:testExists(scripts/ax-standalone.test.mjs::ax-xray checks the app's MCP server from outside and finds it conformant, with no Ouro HX installed)
