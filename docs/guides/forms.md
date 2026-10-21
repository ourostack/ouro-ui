# Forms

A form control is one component on the Field contract: pass `label`, `name` and `error`, and wrap the controls in a `Form` that takes `errors` straight from your server action.[^field-contract] This page says where the kinds of message go.

## Which component shows which message

| The message is about | Use | How |
| --- | --- | --- |
| One field | The field's `error`, or `Form`'s `errors` with the field's `name` as the key | `errors={{ email: "Enter an email address." }}` puts it under that field and marks the field invalid. |
| The whole form: the submit failed, the server is down | `Form`'s `errors` with the `form` key | `errors={{ form: "We could not save your changes." }}` shows it at the top of the form, in the form's alert region. |
| Something outside any form: a reorder or a deletion the server refused, a step that could not be parsed | [Alert](../Alert.md) | Render `<Alert tone="destructive" title="…" />` where the action was taken, with `action` for the way out. |
| A finished action the person need not answer | `toast()` and [Toaster](../Toaster.md) | `toast("Recipe saved")`. |
| A destructive action, before it runs | [ConfirmDialog](../ConfirmDialog.md) | It asks first, with Cancel focused. |

Use `Alert` for a message that belongs to neither a field nor a form. Don't add a `Form` only to show one, and don't put the message on a field it is not about.

```tsx
{reorderError ? <Alert tone="destructive" title="We could not save the new order" description={reorderError} /> : null}
<Reorderable items={steps} onReorder={saveOrder} />
```

## A form, end to end

```tsx
<Form method="post" errors={actionData?.errors} render={<RouterForm />}>
  <TextField label="Email" name="email" type="email" required />
  <TextField label="Password" name="password" type="password" required />
  <Button type="submit">Sign in</Button>
</Form>
```

The browser's own checks (`required`, `type="email"`) stop a submit and show under the field. Server errors only show: they never block the next submit.[^display-only] [Form](../Form.md) documents `errors`, and each control's page documents its props.[^control-pages]

## Reading values on the server

Each control submits under its `name` in a plain form post.[^posts]

- A `Select`, `NativeSelect`, `Combobox`, `RadioGroup`, `TextField` or `TextArea` posts one value: `formData.get("course")`.
- A `Select` with `multiple` and a `CheckboxGroup` post one entry per chosen value under the same name, and no entry when nothing is chosen: `formData.getAll("tags")`.[^multiple]
- A `Checkbox` or `Switch` posts its `value` (default `on`) when checked and nothing when not.

## Testing forms

[Testing](testing.md#finding-fields-in-tests) lists how to find a labelled field, a required field, a password field, an error and the form's message region in your own tests.

[^field-contract]: registry/ouro/lib/ouro/use-field.ts verify:testExists(registry/ouro/components/ouro/select/select.test.tsx::Select > is a labeled combobox built on the Field contract) verify:testExists(registry/ouro/components/ouro/form/form.test.tsx::Form > shows each error on the field with that name, linked and marked invalid)
[^display-only]: test:test/field-contract.test.tsx::%s with display-only errors > shows a Form error, marks and focuses the control, and resubmits unchanged; test:registry/ouro/components/ouro/checkbox/checkbox-group.test.tsx::CheckboxGroup > shows a Form error for its name on every box without blocking the form, and drops it once one is toggled verify:testExists(test/field-contract.test.tsx::%s with display-only errors > shows a Form error, marks and focuses the control, and resubmits unchanged) verify:testExists(registry/ouro/components/ouro/checkbox/checkbox-group.test.tsx::CheckboxGroup > shows a Form error for its name on every box without blocking the form, and drops it once one is toggled)
[^control-pages]: test:scripts/gen-docs.test.mjs::a component doc has purpose, import, example, props, and use-instead guidance verify:testExists(scripts/gen-docs.test.mjs::a component doc has purpose, import, example, props, and use-instead guidance)
[^posts]: test:test/field-contract.test.tsx::%s with display-only errors > shows a Form error, marks and focuses the control, and resubmits unchanged; test:registry/ouro/components/ouro/select/select.test.tsx::Select > chooses an option, shows its label and submits its value verify:testExists(test/field-contract.test.tsx::%s with display-only errors > shows a Form error, marks and focuses the control, and resubmits unchanged) verify:testExists(registry/ouro/components/ouro/select/select.test.tsx::Select > chooses an option, shows its label and submits its value)
[^multiple]: test:registry/ouro/components/ouro/select/select.test.tsx::Select > posts one entry per chosen value under its name with multiple, for formData.getAll; test:registry/ouro/components/ouro/checkbox/checkbox-group.test.tsx::CheckboxGroup > submits name=value for each checked box verify:testExists(registry/ouro/components/ouro/select/select.test.tsx::Select > posts one entry per chosen value under its name with multiple, for formData.getAll) verify:testExists(registry/ouro/components/ouro/checkbox/checkbox-group.test.tsx::CheckboxGroup > submits name=value for each checked box)
