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



export const knownFindings: KnownFinding[] = [
  {
    story: "FamilyBar/FarAlong",
    rule: "doubled-line",
    issue: 3257,
    reason: "The bar's divider runs against the story frame's edge, so the line is drawn twice; the bar should drop its own line where it meets an edge.",
  },
  {
    story: "TimeGrid/Day",
    rule: "doubled-line",
    issue: 3257,
    reason: "An event's edge sits on the day column's line, drawing it twice; events want a small inset from the column's lines, as a calendar's do. Under nova's dark scheme the column's line is too faint against the page to count as drawn, so the finding shows in light only.",
    theme: "nova",
    sometimes: true,
  },
  {
    story: "TimeGrid/Links",
    rule: "doubled-line",
    issue: 3257,
    reason: "An event's edge sits on the day column's line, drawing it twice; events want a small inset from the column's lines, as a calendar's do. Under nova's dark scheme the column's line is too faint against the page to count as drawn, so the finding shows in light only.",
    theme: "nova",
    sometimes: true,
  },
  {
    story: "TimeGrid/Locales",
    rule: "doubled-line",
    issue: 3257,
    reason: "An event's edge sits on the day column's line, drawing it twice; events want a small inset from the column's lines, as a calendar's do. Under nova's dark scheme the column's line is too faint against the page to count as drawn, so the finding shows in light only.",
    theme: "nova",
    sometimes: true,
  },
  {
    story: "TimeGrid/NowAdornment",
    rule: "doubled-line",
    issue: 3257,
    reason: "An event's edge sits on the day column's line, drawing it twice; events want a small inset from the column's lines, as a calendar's do. Under nova's dark scheme the column's line is too faint against the page to count as drawn, so the finding shows in light only.",
    theme: "nova",
    sometimes: true,
  },
  {
    story: "ThreadLayout/Default",
    rule: "doubled-line",
    issue: 3257,
    reason: "The rail's border-s runs against the story frame's own edge, so the line between thread and frame is drawn twice; ThreadRail should drop its border where it meets an edge.",
  },
  {
    story: "ThreadLayout/Narrow",
    rule: "doubled-line",
    issue: 3257,
    reason: "The rail's border-s runs against the story frame's own edge, so the line between thread and frame is drawn twice; ThreadRail should drop its border where it meets an edge.",
  },
  {
    story: "ThreadRail/Playground",
    rule: "doubled-line",
    issue: 3257,
    reason: "The Composer's frame sits flush against the rail's border-s, so the rail's divider is drawn twice down the composer's side; the composer wants room inside the rail.",
  },
  {
    story: "TimeGrid/BackgroundEvents",
    rule: "doubled-line",
    issue: 3257,
    reason: "An event's edge sits on the day column's line, drawing it twice; events want a small inset from the column's lines, as a calendar's do.",
  },
  {
    story: "TimeGrid/BackgroundEventsDay",
    rule: "doubled-line",
    issue: 3257,
    reason: "An event's edge sits on the day column's line, drawing it twice; events want a small inset from the column's lines, as a calendar's do.",
  },
  {
    story: "TimeGrid/Playground",
    rule: "doubled-line",
    issue: 3257,
    reason: "An event's edge sits on the day column's line, drawing it twice; events want a small inset from the column's lines, as a calendar's do.",
  },
  {
    story: "TimeGrid/Statuses",
    rule: "doubled-line",
    issue: 3257,
    reason: "Two events side by side touch, so the line between them is drawn twice; events want a small gap between them, as a calendar's do.",
  },
  {
    story: "TimeGrid/WorkWeek",
    rule: "doubled-line",
    issue: 3257,
    reason: "An event's edge sits on the day column's line, drawing it twice; events want a small inset from the column's lines, as a calendar's do.",
  },
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
    story: "ItemGroup/InContext",
    rule: "lone-word",
    issue: 1955,
    reason: "The Revoke button sits beside a row's text, centred on it, so the check reads it as a line of its own; the text above it wraps pretty.",
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
    story: "NavigationRail/LongLabels",
    rule: "lone-word",
    issue: 1955,
    reason: "The label that is longer than two lines is cut with an ellipsis on purpose, so its hidden lines end on a piece of a word; the story shows exactly that.",
  },
  {
    story: "TimeGrid/Locales",
    rule: "lone-word",
    issue: 1955,
    theme: "nova",
    reason:
      "At 2560px, past the root type step, an event's Japanese time range (11時00分～12時00分) has no break point, so it sits on its own line below the event's title; the copy and its locale are the story's.",
  },
];
