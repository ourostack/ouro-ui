# Accessibility evidence

Ouro HX's accessibility claims are checked by the project's own CI. This page lets anyone run the same checks, or open the CI run behind each one, without taking the project's word. It is generated from the repository's files, so a component with no screen-reader spec shows that here rather than being left out.

**What this is not.** The checks are run by the project that writes the components, and no outside auditor has reviewed them. An independent audit is separate evidence and is not claimed here; the [model interviews](model-interviews.md) record that compliance-minded models asked for exactly that.

## The four checks

| Check | What it proves | Where it lives | CI runs | Run it yourself |
| --- | --- | --- | --- | --- |
| axe on every story | No axe violation in any story, closed and with each overlay open. It runs in Chromium, leaves out Base UI's focus-trap guards (`test/story-axe.ts`), and axe finds only part of what WCAG asks | [test/stories.test.tsx](https://github.com/ourostack/ouro-ui/blob/main/test/stories.test.tsx) | [main's CI runs](https://github.com/ourostack/ouro-ui/actions/workflows/ci.yml?query=branch%3Amain); open a run and read its browser shards | `pnpm exec vitest run --project ouro-chromium test/stories.test.tsx` |
| Conformance matrix | Focus handoff, announcements, right-to-left, forced colours and hydration hold for every story; an exemption is declared in the story and named in the pull request | [test/conformance/](https://github.com/ourostack/ouro-ui/tree/main/test/conformance), [guide](https://github.com/ourostack/ouro-ui/blob/main/docs/guides/conformance.md) | [main's CI runs](https://github.com/ourostack/ouro-ui/actions/workflows/ci.yml?query=branch%3Amain); open a run and read its conformance shards | `pnpm conformance` |
| VoiceOver on macOS | What the screen reader says for a control's name, role and state, driven by Guidepup. Some steps pass through documented fallbacks, and the macOS 15 and strict nightly jobs are advisory | [screen-reader specs](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/e2e/screen-reader), [guide](https://github.com/ourostack/ouro-ui/blob/main/docs/guides/screen-reader-lane.md) | [push, nightly and release runs](https://github.com/ourostack/ouro-ui/actions/workflows/screen-reader.yml) | `pnpm test:sr --project voiceover` (macOS only) |
| NVDA on Windows | The same specs, read by NVDA in Chromium | the same specs | [push, nightly and release runs](https://github.com/ourostack/ouro-ui/actions/workflows/screen-reader.yml) | `pnpm test:sr --project nvda` (Windows only) |

Some specs pass a step through a fallback or only log it, and the lane's advisory jobs do not fail the lane; the screen-reader lane's own page lists those and the other known findings recorded against VoiceOver and NVDA, with an issue for each: [known findings](https://github.com/ourostack/ouro-ui/blob/main/docs/guides/screen-reader-lane.md#known-findings).

## Per component

Stories are counted as the `export const` entries of each component's `*.stories.tsx` files. Every one goes through the axe and conformance checks above. A screen-reader spec exists for 20 of 117 component folders; the rest are covered by axe and the conformance matrix only, and say so below.

| Component | Stories | Conformance declarations | Screen-reader spec (VoiceOver and NVDA) |
| --- | --- | --- | --- |
| [a2ui-surface](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/a2ui-surface) | 2 | 0 | none yet |
| [accordion](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/accordion) | 3 | 0 | none yet |
| [agent-handoff](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/agent-handoff) | 3 | 0 | none yet |
| [agent-presence](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/agent-presence) | 5 | 0 | none yet |
| [alert](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/alert) | 3 | 0 | none yet |
| [app-window](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/app-window) | 2 | 0 | none yet |
| [aspect-ratio](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/aspect-ratio) | 2 | 0 | none yet |
| [attention-card](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/attention-card) | 4 | 0 | none yet |
| [auth-layout](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/auth-layout) | 2 | 0 | none yet |
| [autocomplete](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/autocomplete) | 3 | 0 | none yet |
| [avatar](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/avatar) | 8 | 0 | none yet |
| [badge](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/badge) | 6 | 0 | none yet |
| [breadcrumb](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/breadcrumb) | 3 | 0 | none yet |
| [build-chip](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/build-chip) | 4 | 0 | none yet |
| [button](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/button) | 9 | 0 | [button.sr.spec.ts](https://github.com/ourostack/ouro-ui/blob/main/registry/ouro/e2e/screen-reader/button.sr.spec.ts): 1 test on `actions-button--loading` |
| [button-group](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/button-group) | 3 | 0 | none yet |
| [calendar](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/calendar) | 8 | 0 | none yet |
| [card](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/card) | 8 | 0 | none yet |
| [carousel](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/carousel) | 4 | 0 | none yet |
| [celebrate](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/celebrate) | 2 | 0 | [celebrate.sr.spec.ts](https://github.com/ourostack/ouro-ui/blob/main/registry/ouro/e2e/screen-reader/celebrate.sr.spec.ts): 1 test on `feedback-celebrate--in-context` |
| [chart](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/chart) | 5 | 0 | none yet |
| [chat-header](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/chat-header) | 3 | 0 | none yet |
| [checkbox](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/checkbox) | 8 | 0 | [checkbox.sr.spec.ts](https://github.com/ourostack/ouro-ui/blob/main/registry/ouro/e2e/screen-reader/checkbox.sr.spec.ts): 1 test on `forms-checkbox--playground` |
| [checklist](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/checklist) | 8 | 0 | [checklist.sr.spec.ts](https://github.com/ourostack/ouro-ui/blob/main/registry/ouro/e2e/screen-reader/checklist.sr.spec.ts): 1 test on `lists-checklist--in-context` |
| [choice-card](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/choice-card) | 3 | 0 | none yet |
| [code-block](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/code-block) | 5 | 0 | none yet |
| [collapsible](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/collapsible) | 6 | 0 | none yet |
| [color-field](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/color-field) | 3 | 0 | none yet |
| [color-scheme-toggle](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/color-scheme-toggle) | 3 | 0 | [color-scheme-toggle.sr.spec.ts](https://github.com/ourostack/ouro-ui/blob/main/registry/ouro/e2e/screen-reader/color-scheme-toggle.sr.spec.ts): 1 test on `actions-colorschemetoggle--segmented` |
| [combobox](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/combobox) | 7 | 0 | none yet |
| [command](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/command) | 8 | 0 | [command.sr.spec.ts](https://github.com/ourostack/ouro-ui/blob/main/registry/ouro/e2e/screen-reader/command.sr.spec.ts): 1 test on `menus-command--playground` |
| [composed-surface](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/composed-surface) | 2 | 0 | none yet |
| [composer](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/composer) | 13 | 0 | [composer.sr.spec.ts](https://github.com/ourostack/ouro-ui/blob/main/registry/ouro/e2e/screen-reader/composer.sr.spec.ts): 1 test on `chat-composer--basic` |
| [conversation-find](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/conversation-find) | 3 | 0 | none yet |
| [conversation-list](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/conversation-list) | 10 | 0 | none yet |
| [copy-button](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/copy-button) | 2 | 0 | none yet |
| [cover](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/cover) | 3 | 0 | none yet |
| [description-list](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/description-list) | 3 | 0 | none yet |
| [dialog](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/dialog) | 15 | 0 | [dialog.sr.spec.ts](https://github.com/ourostack/ouro-ui/blob/main/registry/ouro/e2e/screen-reader/dialog.sr.spec.ts): 1 test on `overlays-dialog--playground` |
| [emoji](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/emoji) | 5 | 0 | none yet |
| [emoji-picker](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/emoji-picker) | 7 | 0 | none yet |
| [empty](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/empty) | 2 | 0 | none yet |
| [family-bar](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/family-bar) | 5 | 0 | none yet |
| [field](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/field) | 7 | 0 | none yet |
| [file-field](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/file-field) | 5 | 0 | none yet |
| [form](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/form) | 6 | 0 | none yet |
| [freshness](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/freshness) | 3 | 0 | none yet |
| [hero](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/hero) | 11 | 0 | none yet |
| [hover-card](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/hover-card) | 2 | 0 | none yet |
| [image-cropper](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/image-cropper) | 3 | 0 | none yet |
| [image-field](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/image-field) | 3 | 0 | none yet |
| [inspector](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/inspector) | 2 | 0 | none yet |
| [install-prompt](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/install-prompt) | 2 | 0 | none yet |
| [item](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/item) | 9 | 0 | [item.sr.spec.ts](https://github.com/ourostack/ouro-ui/blob/main/registry/ouro/e2e/screen-reader/item.sr.spec.ts): 1 test on `lists-item--in-context` |
| [kbd](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/kbd) | 2 | 0 | none yet |
| [level-meter](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/level-meter) | 3 | 0 | none yet |
| [lightbox](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/lightbox) | 8 | 1 | none yet |
| [link](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/link) | 6 | 0 | none yet |
| [live-captions](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/live-captions) | 9 | 0 | none yet |
| [local-date](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/local-date) | 4 | 0 | none yet |
| [mcp-app](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/mcp-app) | 2 | 0 | none yet |
| [media-tile](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/media-tile) | 9 | 0 | none yet |
| [menu](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/menu) | 6 | 0 | [menu.sr.spec.ts](https://github.com/ourostack/ouro-ui/blob/main/registry/ouro/e2e/screen-reader/menu.sr.spec.ts): 2 tests on `menus-menu--playground` |
| [message](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/message) | 40 | 0 | none yet |
| [moment](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/moment) | 8 | 0 | none yet |
| [navbar](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/navbar) | 3 | 0 | none yet |
| [navigation-menu](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/navigation-menu) | 3 | 0 | none yet |
| [navigation-rail](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/navigation-rail) | 5 | 0 | none yet |
| [number-field](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/number-field) | 3 | 0 | none yet |
| [otp-field](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/otp-field) | 2 | 0 | none yet |
| [page-header](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/page-header) | 3 | 0 | none yet |
| [page-shell](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/page-shell) | 1 | 0 | none yet |
| [pagination](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/pagination) | 4 | 0 | none yet |
| [popover](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/popover) | 5 | 0 | none yet |
| [porthole](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/porthole) | 13 | 0 | none yet |
| [preview-bar](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/preview-bar) | 3 | 0 | none yet |
| [progress](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/progress) | 4 | 0 | none yet |
| [radio-group](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/radio-group) | 4 | 0 | none yet |
| [reaction-bar](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/reaction-bar) | 7 | 0 | none yet |
| [read-receipt](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/read-receipt) | 1 | 0 | none yet |
| [relative-time](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/relative-time) | 3 | 0 | none yet |
| [reorderable](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/reorderable) | 4 | 0 | [reorderable.sr.spec.ts](https://github.com/ourostack/ouro-ui/blob/main/registry/ouro/e2e/screen-reader/reorderable.sr.spec.ts): 1 test on `lists-reorderable--disabled` |
| [resizable](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/resizable) | 6 | 0 | none yet |
| [route-progress](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/route-progress) | 2 | 0 | [route-progress.sr.spec.ts](https://github.com/ourostack/ouro-ui/blob/main/registry/ouro/e2e/screen-reader/route-progress.sr.spec.ts): 1 test on `feedback-routeprogress--in-context` |
| [scroll-area](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/scroll-area) | 2 | 0 | none yet |
| [section-header](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/section-header) | 2 | 0 | none yet |
| [segmented-control](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/segmented-control) | 5 | 0 | none yet |
| [select](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/select) | 7 | 0 | [select.sr.spec.ts](https://github.com/ourostack/ouro-ui/blob/main/registry/ouro/e2e/screen-reader/select.sr.spec.ts): 1 test on `forms-select--playground` |
| [separator](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/separator) | 4 | 0 | none yet |
| [share-button](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/share-button) | 2 | 0 | none yet |
| [sheet](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/sheet) | 10 | 0 | none yet |
| [sidebar](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/sidebar) | 12 | 0 | none yet |
| [skeleton](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/skeleton) | 9 | 0 | none yet |
| [skip-link](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/skip-link) | 2 | 0 | none yet |
| [slider](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/slider) | 3 | 0 | none yet |
| [snap-pip](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/snap-pip) | 7 | 0 | none yet |
| [spinner](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/spinner) | 2 | 0 | none yet |
| [stack](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/stack) | 4 | 0 | none yet |
| [swipe-actions](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/swipe-actions) | 2 | 0 | none yet |
| [switch](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/switch) | 3 | 0 | [switch.sr.spec.ts](https://github.com/ourostack/ouro-ui/blob/main/registry/ouro/e2e/screen-reader/switch.sr.spec.ts): 1 test on `forms-switch--playground` |
| [sync-status](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/sync-status) | 4 | 0 | [sync-status.sr.spec.ts](https://github.com/ourostack/ouro-ui/blob/main/registry/ouro/e2e/screen-reader/sync-status.sr.spec.ts): 1 test on `feedback-syncstatus--in-context` |
| [tab-bar](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/tab-bar) | 2 | 0 | none yet |
| [table](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/table) | 7 | 0 | none yet |
| [tabs](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/tabs) | 6 | 0 | [tabs.sr.spec.ts](https://github.com/ourostack/ouro-ui/blob/main/registry/ouro/e2e/screen-reader/tabs.sr.spec.ts): 1 test on `navigation-tabs--links` |
| [text](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/text) | 9 | 0 | none yet |
| [text-field](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/text-field) | 10 | 0 | [text-field.sr.spec.ts](https://github.com/ourostack/ouro-ui/blob/main/registry/ouro/e2e/screen-reader/text-field.sr.spec.ts): 2 tests on `forms-textfield--states`, `forms-form--server-errors` |
| [theme-picker](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/theme-picker) | 4 | 0 | [theme-picker.sr.spec.ts](https://github.com/ourostack/ouro-ui/blob/main/registry/ouro/e2e/screen-reader/theme-picker.sr.spec.ts): 1 test on `actions-themepicker--playground` |
| [thread-layout](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/thread-layout) | 3 | 0 | none yet |
| [thread-rail](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/thread-rail) | 2 | 0 | none yet |
| [time-grid](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/time-grid) | 10 | 0 | none yet |
| [timer](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/timer) | 10 | 0 | [timer.sr.spec.ts](https://github.com/ourostack/ouro-ui/blob/main/registry/ouro/e2e/screen-reader/timer.sr.spec.ts): 1 test on `feedback-timer--short` |
| [toast](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/toast) | 6 | 2 | [toast.sr.spec.ts](https://github.com/ourostack/ouro-ui/blob/main/registry/ouro/e2e/screen-reader/toast.sr.spec.ts): 1 test on `feedback-toast--playground` |
| [toggle](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/toggle) | 8 | 0 | none yet |
| [toolbar](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/toolbar) | 7 | 0 | none yet |
| [tooltip](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/tooltip) | 2 | 0 | none yet |
| [typing-indicator](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/typing-indicator) | 1 | 0 | none yet |
| [unread-dot](https://github.com/ourostack/ouro-ui/tree/main/registry/ouro/components/ouro/unread-dot) | 2 | 0 | none yet |

Screen-reader specs that cover a pattern rather than one component:

- [menu-bar.sr.spec.ts](https://github.com/ourostack/ouro-ui/blob/main/registry/ouro/e2e/screen-reader/menu-bar.sr.spec.ts): MenuBar opens File from the keyboard on its first item, reads the next item, and returns to File on Escape
- [patterns.sr.spec.ts](https://github.com/ourostack/ouro-ui/blob/main/registry/ouro/e2e/screen-reader/patterns.sr.spec.ts): a row is heard by its title, its entry's heading as the detail takes the list's place, and the row again after Back; a search that finds nothing says so; its chart and its table's scrolling region are heard by their names

## What each screen-reader test says it proves

The test titles, in the words of the specs, so a reader sees the claim before opening the file.

- **button**
  - Button is announced with its name and role, and its busy state from the live region when loading turns on
- **celebrate**
  - Celebrate says its message once when the last task is ticked
- **checkbox**
  - Checkbox is announced with its name, role and state, and its change when checked
- **checklist**
  - Checklist announces an item's name, role and state, and its change when ticked
- **color-scheme-toggle**
  - ColorSchemeToggle is announced as a radio group of schemes, and the scheme chosen with the arrow keys as checked
- **command**
  - Command reads each command the arrow keys reach from the search, which keeps focus
- **composer**
  - Composer's box and send button are announced with their names and roles, and Tab reaches Send
- **dialog**
  - Dialog is announced with its title and role when it opens, and its trigger again when it closes
- **item**
  - An Item with href is heard as a link by its title, then its description
- **menu**
  - Menu is announced from its trigger, reads each item the arrow keys reach, and returns to the trigger on Escape
  - Menu's submenu opens from the keyboard on its first item, and the left arrow returns to its trigger
- **reorderable**
  - A disabled Reorderable's handles are heard as unavailable buttons, described by its reason, without the pick-up instructions
- **route-progress**
  - RouteProgress is announced once from its status region when a navigation starts
- **select**
  - Select is announced with its label, role and state, and its new value when one is chosen
- **switch**
  - Switch is announced with its name, role and state, and its change when turned on
- **sync-status**
  - SyncStatus is heard when the connection goes, and when changes are saved again
- **tabs**
  - Tabs that are links are announced as links, the current one as the current page
- **text-field**
  - TextField is announced with its label, role and required state, and its description
  - TextField's error from a submit is announced as focus moves to the field
- **theme-picker**
  - ThemePicker is announced as a list of looks: each one's name, its place in the list, and the one chosen with Enter as selected
- **timer**
  - Timer's Start is heard in its named group, and the time being up is announced once
- **toast**
  - Toast is announced from its live region when it appears

## Rerun it

1. Clone the repository and run `pnpm i`.
2. Run `pnpm exec vitest run --project ouro-chromium test/stories.test.tsx` for axe, and `pnpm conformance` for the matrix.
3. On macOS or Windows, run `pnpm test:sr --project voiceover` or `--project nvda` for the screen-reader lane; the guide lists what the runner needs.
4. To read a CI result without running anything, open a run from the links above and read the job's result and log.

This page is rendered by `scripts/a11y-evidence/page.mjs`; `pnpm claims:check` renders it again and compares, so it cannot drift from the files it counts.
