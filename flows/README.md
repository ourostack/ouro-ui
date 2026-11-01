# Flows

What a person does on the site and in the stories, as data: each `*.flow.json` names the pages and stories to open, the widths, light and dark, and reduced motion. A runner measures every capture with deterministic checks: axe, keyboard and focus, contrast, target size, overflow, dead space, repetition, layout shift, jank, and the `data-ouro` marker on every control. The checks are run externally for now, report-only.

- **`site.flow.json`:** the home page, Dialog's page, then a full Tab traversal.
- **`stories.flow.json`:** five stories (Button, CheckboxGroup, Menu, Toast, Dialog) as Storybook's iframe renders them. Page-level best practices (one main landmark, one h1) don't apply to a story alone, so serious axe findings count and moderate ones don't.

Both read their target from the run: the published site, `https://ui.ouro.bot/` with Storybook at `/storybook/` (the default), or a release's build, served in the same layout as Pages publishes it.
