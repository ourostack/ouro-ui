# Changes in this release

- New: `Field`, `Fieldset` and `Link`. `Field` is the contract every form control takes (`label`, `hideLabel`, `description`, `error`, `required`, `disabled`, `name`), and its parts (`FieldRoot`, `FieldLabel`, `FieldDescription`, `FieldError`, `FieldControl`) are in `field-parts`. `Link` renders internal `href`s through `OuroProvider`'s `linkComponent`, the same path `Button` with `href` takes, which now lives in `lib/ouro/router-link.ts`.
