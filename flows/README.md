# Flows

What a person does on the site and in a handful of stories, written as data a runner can measure: the pages and stories to open, the widths, light and dark, and reduced motion. The checks run outside this repository for now, report-only.

- **`site.flow.json`:** the home page and Dialog's page, then a Tab traversal.
- **`stories.flow.json`:** the Button, CheckboxGroup, Menu, Toast and Dialog stories, as Storybook's iframe renders them. A story sits alone in its frame, so the flow counts serious axe findings and leaves out page-level ones such as a main landmark.

They point at the published site, `https://ui.ouro.bot/` with Storybook at `/storybook/`, unless a run names a release's build served in the same layout.
