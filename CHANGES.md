# Changes in this release

- Publish the actual 45-build comparison and per-run CI evidence, with explicit exploratory-cohort, shared-host, model-usage and tool-version limitations, alongside the guide to Ouro HX's embedded component contracts.
- Badge's installed tests check theme-token roles rather than assuming every color role is distinct, and ItemGroup's empty-state tests use exact text matches on Vitest 4 and 5.
- SegmentedControl and Tabs' installed motion tests record the actual translate transition before the click, so a completed animation is not mistaken for a missing one on a busy runner.
- SwipeActions tests explicitly scope their LTR fixture while retaining RTL coverage, and Sheet tests await Base UI's frame-queued keyboard focus before checking containment and the exact tab order.
- Left and right sheets stay on their named physical edges in RTL layouts without changing content direction, corner shapes or swipe direction.
