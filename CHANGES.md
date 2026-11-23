# Changes in this release

- New: [ToggleGroup's `overflow="scroll"` keeps a row of toggles to one line, scrolling sideways with a soft fade at the cut edge](registry/ouro/components/ouro/toggle/toggle-group.overflow.test.tsx "verify:testExists(registry/ouro/components/ouro/toggle/toggle-group.overflow.test.tsx::ToggleGroup overflow scroll > stays one line tall, narrower than the toggles, instead of wrapping)"), with the roving tab stop bringing the focused or pressed toggle fully into view.
- Fix: X-ray's `cli.optional-args` rule no longer flags an optional word shown bare in usage when a `| --flag` alternative, a separate usage line, or the schema's declared replacing flag already covers its absence.
