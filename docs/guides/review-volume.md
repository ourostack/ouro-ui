# Keep the person's review worth doing

An agent can propose changes faster than a person can read them, and a confirmation that asks too often turns into a click. This guide is for the app's author: how to keep the review that a person does worth their time, and what changes between the surfaces an action reaches.

## Show what will change, not what it is called

A confirmation that names an action ("Update 14 recipes?") asks the person to trust it. Put the change in front of them instead: the fields that move, as before and after. `ConfirmDialog` takes `description` as any React node, so the changed fields fit in it.[^description]

```tsx
<ConfirmDialog
  title="Apply the agent's edit?"
  description={<ChangeList before={recipe} after={proposed} />}
  confirmLabel="Apply"
  onConfirm={apply}
  trigger={<Button>Review</Button>}
/>
```

`ChangeList` is yours: a small table of field, before and after is enough. Where the change is large, link to the full diff from the dialog and keep the dialog for the decision.

## Batch what belongs together

A batch of proposals from one request is a single decision when the person asked for a single result. Group them under a single confirmation with the list inside, and let the person drop single items before they approve the rest. A long queue of separate dialogs teaches approval without reading.

## Spend the person's attention on consequence

Some actions can run without a pause. An Ouro action declares a consent class, `read`, `write` or `consequential`, and a consequential one asks the person to confirm before it runs, on a sheet that shows the values the agent prepared under the fields' own labels.[^consent] That holds where Ouro's actions run, such as `ActionButton`, and not for a plain `ConfirmDialog`, which asks whenever your code opens it. Declare reads and writes the person can undo as such, and keep `consequential` for what cannot be taken back. A budget helps: when a task would ask for many confirmations, group them, or ask the person to approve a plan once and then run it.

## One action reads differently by surface

A declared action reaches several surfaces, and the decision to run it can look different on them. Check these on the surfaces you ship, rather than assuming one pass covers them:

- **Confirmation.** The web draws the sheet in the page. Windows asks before a consequential action an agent prepared, and refuses by default when it cannot ask. Android shows a built-in confirmation that an app can replace with its own, and refuses the call when the person cannot be asked.[^surfaces]
- **Undo.** Offer an undo where the action allows one, and say so in the confirmation's text, because a platform's built-in prompt may not draw one.
- **Retries.** An agent may call again after a refusal or a failure. Make the action safe to repeat, or say in its description why it is not.
- **Explanation.** Name the action the way a person knows it, and write the confirmation's text for the person, not for the agent.

See [Platforms](../platforms/README.md) for what the kits do today, and [what is proven on a device](../platforms/proof.md) for where they have run.

[^description]: test:registry/ouro/components/ouro/dialog/confirm-dialog.test.tsx::ConfirmDialog > is an alert dialog named by its title and described by its description verify:testExists(registry/ouro/components/ouro/dialog/confirm-dialog.test.tsx::ConfirmDialog > is an alert dialog named by its title and described by its description)
[^consent]: docs/guides/composed-ui.md verify:fileLine(docs/guides/composed-ui.md, /\*\*consequential\*\* asks the person to confirm, on a sheet that shows each value the agent prepared under the field's own label/)
[^surfaces]: docs/platforms/windows.md; docs/guides/ax.md verify:fileLine(docs/platforms/windows.md, /asks the person before a consequential action an agent prepared \(the default is to refuse\)/) verify:fileLine(docs/guides/ax.md, /an app can replace it with its own `confirm`/)
