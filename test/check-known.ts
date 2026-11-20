// Ouro check's findings in the stories that are known, each with the rule, the story, why it stays and the open issue that
// tracks it. test/stories.test.tsx runs Ouro check's in-page rules over every story (test/check-story.ts) and fails on any
// finding not listed here, and on an entry no finding matches any more, so a fixed finding leaves this list with its fix.
// Each entry is a story and a rule, whatever its size or scheme: the story shows the state, and the reason says what is on
// screen. test/check-known.test.ts fails an entry with no positive issue number or no reason.
// test/themes/nova-check.test.tsx runs the same rules under shadcn's nova theme (test/check-sweep.ts); its entries carry
// `theme: "nova"`. An entry with no theme is the Ouro-theme run's: the nova run waives it too, since the story shows the
// same state whatever the theme, but doesn't require it, since the nova run checks other sizes (sweepVerdict).

export interface KnownFinding {
  /** The story's id, as Storybook names it (`Button/Disabled`). */
  story: string;
  /** The rule Ouro check reports (registry/ouro/check). */
  rule: string;
  /** The open issue that tracks this finding (`ourostack/ouro-ui`). */
  issue: number;
  /** Why the finding stays, and what would have to change for it to go. */
  reason: string;
  /** The third-party theme fixture (test/theme-fixtures/<name>.css) whose run shows the finding; absent for the Ouro theme. */
  theme?: string;
  /**
   * The finding shows on some runs and not others with nothing changed (a few pixels that depend on timing), so a run
   * without it is no sign it was fixed. Its reason says why; a new finding of another rule in the story still fails.
   */
  sometimes?: true;
}

/** The rules whose findings depend on how the text wraps. A host's fonts break lines differently, so these are judged only on Linux, where CI's baseline comes from. */
export const textWrapRules: readonly string[] = ["lone-word", "overlap", "narrow-heading", "clipped-text"];

/** Whether a rule is judged on this host: every rule is, except the text-wrap rules off Linux, which neither count as a finding nor as a stale entry there. */
export function judgedOn(rule: string, platform: string): boolean {
  return platform === "linux" || !textWrapRules.includes(rule);
}

/** The entries for a story in one run: the Ouro-theme run takes those with no theme, a fixture's run takes its own. */
export function knownFor(entries: readonly KnownFinding[], story: string, theme?: string): KnownFinding[] {
  return entries.filter((entry) => entry.story === story && entry.theme === theme);
}

/**
 * A sweep's verdict: the findings no entry waives, and the run's own entries no finding matches any more. `inherited` are
 * another run's entries for the story (the Ouro-theme run's, for a fixture's run): they waive a finding of their rule, but
 * one that doesn't show here is no sign it was fixed, since that run checks other sizes.
 */
export function sweepVerdict<F extends { rule: string }>(
  found: readonly F[],
  own: readonly KnownFinding[],
  inherited: readonly KnownFinding[] = [],
): { unknown: F[]; stale: KnownFinding[] } {
  const waived = [...own, ...inherited];
  return { unknown: found.filter((finding) => !waived.some((entry) => entry.rule === finding.rule)), stale: staleEntries(own, found) };
}

/** The entries a run's findings no longer match, which a fix should remove: every entry with no finding of its rule, except one that shows only sometimes. */
export function staleEntries(known: readonly KnownFinding[], found: readonly { rule: string }[]): KnownFinding[] {
  return known.filter((entry) => !entry.sometimes && !found.some((finding) => finding.rule === entry.rule));
}

/** The problems with each entry: a missing or non-positive issue number, or an empty reason. Empty when every entry is complete. */
export function knownProblems(entries: readonly KnownFinding[]): string[] {
  return entries.flatMap(({ story, rule, issue, reason }) => {
    const name = `${story} (${rule})`;
    return [
      ...(Number.isInteger(issue) && issue > 0 ? [] : [`${name}: issue must be a positive issue number, got ${String(issue)}`]),
      ...(reason?.trim() ? [] : [`${name}: no reason`]),
    ];
  });
}

const disabledReason =
  "A disabled control shows alone: the reason it is off is the app's words, which a story does not supply. An app gives one with a title or aria-describedby.";
const repeatedControl = "The story lays the same control out in each variant or state, so its name repeats in view; the repetition is what the story shows.";



export const knownFindings: KnownFinding[] = [
  { story: "Accordion/Multiple", rule: "disabled-no-reason", issue: 1953, reason: disabledReason },
  { story: "Button/Disabled", rule: "disabled-no-reason", issue: 1953, reason: disabledReason },
  { story: "Button/Loading", rule: "disabled-no-reason", issue: 1953, reason: disabledReason },
  {
    story: "Calendar/Unavailable",
    rule: "disabled-no-reason",
    issue: 1953,
    reason: "Each unavailable day is a disabled button with no reason beside it; the reason (a booked date, a closed day) is the app's copy.",
  },
  { story: "Checkbox/States", rule: "disabled-no-reason", issue: 1953, reason: disabledReason },
  {
    story: "Composer/EmojiTokens",
    rule: "lone-word",
    issue: 1955,
    reason: "The last line of the message holds one word at this width; the words are the story's copy, not a component's wrap.",
  },
  { story: "Composer/Sending", rule: "disabled-no-reason", issue: 1953, reason: disabledReason },
  { story: "Composer/SendingOff", rule: "disabled-no-reason", issue: 1953, reason: disabledReason },
  {
    story: "Emoji/Placeholder",
    rule: "broken-image",
    issue: 1959,
    reason: "The story shows the picture that fails to load on purpose, to show the placeholder that stands in for it.",
  },
  {
    story: "Heading/Display",
    rule: "narrow-heading",
    issue: 1959,
    reason: "The story holds the display headline to 16ch on purpose, to show it wrap onto two balanced lines.",
  },
  {
    story: "Hero/FullWidth",
    rule: "lone-word",
    issue: 1955,
    reason: "A paragraph of the story's copy ends on one word at this width; the copy is the story's, not a component's wrap.",
  },
  {
    story: "Item/BesideDetail",
    rule: "lone-word",
    issue: 1955,
    reason: "The description's last line is the end of a hyphenated word at this width; the copy is the story's.",
  },
  {
    story: "ItemGroup/InContext",
    rule: "lone-word",
    issue: 1955,
    reason: "A row's detail text ends on its action at this width; the rows' copy is the story's.",
  },
  {
    story: "Lightbox/MosaicWithMore",
    rule: "overlap",
    issue: 1957,
    reason: "The '+2' count sits over the last tile of the mosaic on purpose: it says how many pictures the tile hides.",
  },
  {
    story: "MediaTile/ShareContain",
    rule: "overlap",
    issue: 1957,
    reason: "The name and status sit over the letterboxed picture's box, which the story draws contained; the label is the tile's own overlay.",
  },
  {
    story: "Message/Chat",
    rule: "overlap",
    issue: 1957,
    reason:
      "The list's hover bar, whose Like button is a thumbs-up, shows over the first message's text on some CI runs at this width, as though a pointer rested on that row. A stale pointer position was one cause, fixed; the failure record names what was hovered and focused, for the other (#1957).",
    sometimes: true,
  },
  {
    story: "Message/ChatRaised",
    rule: "overlap",
    issue: 1957,
    reason:
      "The same conversation as Message/Chat with raised bubbles, so the same hover bar shows over the first message on some CI runs (#1957).",
    sometimes: true,
  },
  {
    story: "MessageList/OpenedAtMessage",
    rule: "overlap",
    issue: 1957,
    reason: "The 'Jump to latest' button floats over the end of the conversation at this scroll position, as a floating control does by design.",
  },
  {
    story: "MessageList/ScrolledBack",
    rule: "overlap",
    issue: 1957,
    reason: "The 'Jump to latest' button floats over the last message at this scroll position, as a floating control does by design.",
  },
  {
    story: "NavigationRail/LongLabels",
    rule: "lone-word",
    issue: 1955,
    reason: "A long label breaks onto a last line of one piece of a hyphenated or long word at this width; the labels are the story's copy.",
  },
  { story: "RadioGroup/States", rule: "disabled-no-reason", issue: 1953, reason: disabledReason },
  { story: "ReactionBar/Disabled", rule: "disabled-no-reason", issue: 1953, reason: disabledReason },
  { story: "Reorderable/Disabled", rule: "disabled-no-reason", issue: 1953, reason: disabledReason },
  { story: "SegmentedControl/States", rule: "disabled-no-reason", issue: 1953, reason: disabledReason },
  { story: "Switch/States", rule: "disabled-no-reason", issue: 1953, reason: disabledReason },
  { story: "Tabs/Vertical", rule: "disabled-no-reason", issue: 1953, reason: disabledReason },
  {
    story: "ThreadRail/Playground",
    rule: "overlap",
    issue: 1957,
    reason: "The playground's rail is w-96 (24rem), wider than the 390px phone's frame, so it runs over the story's own sample text at that width.",
  },
  {
    story: "TimeGrid/Locales",
    rule: "lone-word",
    issue: 1955,
    reason: "A Japanese time range breaks onto its own last line at this width; the copy and its locale are the story's.",
  },
  {
    story: "Timer/Ring",
    rule: "overlap",
    issue: 1957,
    reason: "The time and its button sit over the progress ring on purpose: the ring is the timer's face.",
  },
  {
    story: "Timer/RingPaused",
    rule: "overlap",
    issue: 1957,
    reason: "The time and its status sit over the progress ring on purpose: the ring is the timer's face.",
  },
  { story: "Toggle/States", rule: "disabled-no-reason", issue: 1953, reason: disabledReason },
  { story: "ToggleGroup/Modes", rule: "disabled-no-reason", issue: 1953, reason: disabledReason },
  { story: "Toolbar/Disabled", rule: "disabled-no-reason", issue: 1953, reason: disabledReason },
  {
    story: "LiveCaptions/ReadAloud",
    rule: "lone-word",
    issue: 1955,
    reason: "The caption's last line is one word, 'week?', at this width; the caption text is the story's copy.",
  },
  {
    story: "LiveCaptions/ReducedMotion",
    rule: "lone-word",
    issue: 1955,
    reason: "The caption's last line is one word, 'week?', at this width; the caption text is the story's copy.",
  },
  {
    story: "DescriptionList/InANarrowPane",
    rule: "lone-word",
    issue: 1955,
    reason: "The description's last line is one word, 'follow.', at this width in a narrow pane; the copy is the story's.",
  },
];
