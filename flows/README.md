# Flows

What a person does on the site and in a handful of stories, written as data a runner can measure: the pages and stories to open, the widths, light and dark, and reduced motion. [`.github/workflows/flow-review.yml`](../.github/workflows/flow-review.yml) runs them with [flow-review](https://github.com/ourostack/flow-review), report-only: findings go to the run's summary and artifact, and none fails it.

- **`site.flow.json`:** the home page and Dialog's page, then a Tab traversal.
- **`stories.flow.json`:** the Button, CheckboxGroup, Menu, Toast and Dialog stories, as Storybook's iframe renders them. A story sits alone in its frame, so the flow counts serious axe findings and leaves out page-level ones such as a main landmark.

They point at the published site, `https://ui.ouro.bot/` with Storybook at `/storybook/`: daily, and when the flows change. Dispatched with a release tag (`gh workflow run flow-review.yml -f ref=v1.3.1`), the workflow builds that tag's site and Storybook in the same layout and reviews those instead.
