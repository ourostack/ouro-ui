# Scroll hold at the press (untracked notes)

Branch fix/scroll-hold-at-press, stacked on #301's head (release-prep/v1.2.15-wave-1c, 3d5bc375): page-scroll-hold.ts is not on main.

## Bug
WebKit, Chapter III Orders: the menu opens on pointerdown during openChapter's smooth scroll; the release lands on moved content and closes it (probe runs 41177701651, 41182704292).

## Fix
holdPageAtPress (page-scroll-hold.ts, re-exported by portal-container.ts) on the triggers of Menu (dropdown), Popover (PopoverTrigger), Select and Combobox (input, Autocomplete input): at a primary-button pointerdown or Enter/Space/ArrowUp/ArrowDown, instant scrollTo the current place, pin scroll-behavior auto, hold until the popup's own hold takes over or 1 s passes. A press on an expanded trigger (closing it) does nothing.

## Local
- Installed with cached pnpm 10.28.1 offline (npm registry unreachable from this Mac); delete node_modules when done.
- combobox.test.tsx WebKit motion tests ("closes with only a fade...", "scales about the point...") fail locally on the base too: local WebKit, not this change.

## Progress
- 01:40 PT: PR https://github.com/ourostack/ouro-ui/pull/302 (base release-prep/v1.2.15-wave-1c). Milestone comment on tandem#394.
- Probe 41185442740 on 4597fb78 + probe commit: 40 passed, 0 failed.
- First CI: storybook build and mutation shards 2-3 failed (Babel rejected the re-export from portal-container); two survived mutants (scrollTo ObjectLiteral -> Stryker disable with reason; button===0 hidden by Tab freeing the page in the test). Fixed in 0f7c254b; probe re-dispatched as 41186113764.
- 02:20 PT: CI 41186103347 green (60 pass, 2 skipped by design); probe 41186113764 on 0f7c254b: 40 passed. Final milestone on tandem#394. node_modules removed.
- 03:30 PT: review fixes (per-trigger keys) in bb7db10d, rebased on wave-1c 28ec7a6d. CI 41188604032 green. Probe on rebased base: Orders race gone in base and fix; new alarm-dialog race 13/40 base, 11/40 and 13/40 with fix (41189576969, 41188615303).
- 03:40 PT: #307 (fix/scroll-hold-dialogs, base fix/scroll-hold-at-press). Probe 41191847076 on 0aaed0a7: 40/40 passed (base without either PR had 13/40 alarm failures in 41189576969). Rerun on head ea3b1fa7: 41192638931. CI on ea3b1fa7: 41192485908.
- 04:45 PT: CI 41194251871 had latency (Chapter II all +25ms, runner) and WebKit flakes (dialog tall-trigger press scale; #302 Select test release over chosen option). Fixed tests in 97986024.
- 05:10 PT: CI 41197329882 green on 97986024. Milestone on tandem#394. node_modules removed.
- 05:45 PT: #307 rebased onto #302's new head 9951ab31 → 254da7ac; still based on fix/scroll-hold-at-press.
- 11:10 PT: #302 squash-merged; #307 retargeted to main, rebased (lightbox conflict with #303's mosaic resolved), nativeButton test added → 2a07498c.
- 11:37 PT: CI 41227480379 green on 2a07498c (attempt 2; attempt 1 e2e (1/4) failed on a Chapter I sign test unrelated to dialogs).
