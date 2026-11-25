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
export const textWrapRules: readonly string[] = ["lone-word", "overlap", "narrow-heading", "clipped-text", "wrapped-short-line"];

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
    story: "Message/Thread",
    rule: "overlap",
    issue: 3337,
    reason:
      "The same hover-bar overlap as Message/Chat, sighted on this standalone Message (added after #2177, neither hovered nor focused). It renders its own inline bar, never MessageList's layered one row-hover.ts tracks, so #2177's pointer-position fix could not reach it: a third sighting of the still-open second path, not a stale pointer (#3337, #1957).",
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
  {
    story: "Autocomplete/Open",
    rule: "near-miss",
    issue: 3286,
    reason:
      "Two surfaces in the story sit closer than the minimum gap without touching (a demo's own spacing); the story shows exactly that until the demo's spacing is fixed.",
  },
  {
    story: "Combobox/Modes",
    rule: "near-miss",
    issue: 3286,
    reason:
      "Two surfaces in the story sit closer than the minimum gap without touching (a demo's own spacing); the story shows exactly that until the demo's spacing is fixed.",
  },
  {
    story: "Combobox/People",
    rule: "near-miss",
    issue: 3286,
    reason:
      "Two surfaces in the story sit closer than the minimum gap without touching (a demo's own spacing); the story shows exactly that until the demo's spacing is fixed.",
  },
  {
    story: "Combobox/PhoneTags",
    rule: "near-miss",
    issue: 3286,
    reason:
      "Two surfaces in the story sit closer than the minimum gap without touching (a demo's own spacing); the story shows exactly that until the demo's spacing is fixed.",
  },
  {
    story: "Combobox/PhoneCapsules",
    rule: "near-miss",
    issue: 3286,
    reason:
      "Two surfaces in the story sit closer than the minimum gap without touching (a demo's own spacing); the story shows exactly that until the demo's spacing is fixed.",
  },
  {
    story: "Composer/EmojiTokens",
    rule: "near-miss",
    issue: 3286,
    reason:
      "Two surfaces in the story sit closer than the minimum gap without touching (a demo's own spacing); the story shows exactly that until the demo's spacing is fixed.",
  },
  {
    story: "Composer/Expanded",
    rule: "near-miss",
    issue: 3286,
    reason:
      "Two surfaces in the story sit closer than the minimum gap without touching (a demo's own spacing); the story shows exactly that until the demo's spacing is fixed.",
  },
  {
    story: "ConversationFind/WithMessageList",
    rule: "near-miss",
    issue: 3286,
    reason:
      "Two surfaces in the story sit closer than the minimum gap without touching (a demo's own spacing); the story shows exactly that until the demo's spacing is fixed.",
  },
  {
    story: "Emoji/InMessages",
    rule: "near-miss",
    issue: 3286,
    reason:
      "Two surfaces in the story sit closer than the minimum gap without touching (a demo's own spacing); the story shows exactly that until the demo's spacing is fixed.",
  },
  {
    story: "Message/Chat",
    rule: "near-miss",
    issue: 3286,
    reason:
      "Two surfaces in the story sit closer than the minimum gap without touching (a demo's own spacing); the story shows exactly that until the demo's spacing is fixed.",
  },
  {
    story: "Message/ChatRaised",
    rule: "near-miss",
    issue: 3286,
    reason:
      "Two surfaces in the story sit closer than the minimum gap without touching (a demo's own spacing); the story shows exactly that until the demo's spacing is fixed.",
  },
  {
    story: "Message/FlatChannel",
    rule: "near-miss",
    issue: 3286,
    reason:
      "Two surfaces in the story sit closer than the minimum gap without touching (a demo's own spacing); the story shows exactly that until the demo's spacing is fixed.",
  },
  {
    story: "Message/NotSent",
    rule: "near-miss",
    issue: 3286,
    reason:
      "Two surfaces in the story sit closer than the minimum gap without touching (a demo's own spacing); the story shows exactly that until the demo's spacing is fixed.",
  },
  {
    story: "Message/WithAttachments",
    rule: "near-miss",
    issue: 3286,
    reason:
      "Two surfaces in the story sit closer than the minimum gap without touching (a demo's own spacing); the story shows exactly that until the demo's spacing is fixed.",
  },
  {
    story: "MessageList/Actions",
    rule: "near-miss",
    issue: 3286,
    reason:
      "Two surfaces in the story sit closer than the minimum gap without touching (a demo's own spacing); which pair of surfaces trips the 1px-to-6px near-miss gap, or whether any does, shifts run to run, so the story shows it only sometimes.",
    sometimes: true,
  },
  {
    story: "MessageList/Conversation",
    rule: "near-miss",
    issue: 3286,
    reason:
      "Two surfaces in the story sit closer than the minimum gap without touching (a demo's own spacing); which pair of surfaces trips the 1px-to-6px near-miss gap, or whether any does, shifts run to run, so the story shows it only sometimes.",
    sometimes: true,
  },
  {
    story: "MessageList/Keyboard",
    rule: "near-miss",
    issue: 3286,
    reason:
      "Two surfaces in the story sit closer than the minimum gap without touching (a demo's own spacing); which pair of surfaces trips the 1px-to-6px near-miss gap, or whether any does, shifts run to run, so the story shows it only sometimes.",
    sometimes: true,
  },
  {
    story: "MessageList/Live",
    rule: "near-miss",
    issue: 3286,
    reason:
      "Two surfaces in the story sit closer than the minimum gap without touching (a demo's own spacing); which pair of surfaces trips the 1px-to-6px near-miss gap, or whether any does, shifts run to run, so the story shows it only sometimes.",
    sometimes: true,
  },
  {
    story: "MessageList/LoadingOlder",
    rule: "near-miss",
    issue: 3286,
    reason:
      "Two surfaces in the story sit closer than the minimum gap without touching (a demo's own spacing); the story shows exactly that until the demo's spacing is fixed.",
  },
  {
    story: "MessageList/LongConversation",
    rule: "near-miss",
    issue: 3286,
    reason:
      "Two surfaces in the story sit closer than the minimum gap without touching (a demo's own spacing); which pair of surfaces trips the 1px-to-6px near-miss gap, or whether any does, shifts run to run, so the story shows it only sometimes.",
    sometimes: true,
  },
  {
    story: "MessageList/OpenedAtMessage",
    rule: "near-miss",
    issue: 3286,
    reason:
      "Two surfaces in the story sit closer than the minimum gap without touching (a demo's own spacing); which pair of surfaces trips the 1px-to-6px near-miss gap, or whether any does, shifts run to run, so the story shows it only sometimes.",
    sometimes: true,
  },
  {
    story: "MessageList/Springs",
    rule: "near-miss",
    issue: 3286,
    reason:
      "Two surfaces in the story sit closer than the minimum gap without touching (a demo's own spacing); which pair of surfaces trips the 1px-to-6px near-miss gap, or whether any does, shifts run to run, so the story shows it only sometimes.",
    sometimes: true,
  },
  {
    story: "MessageList/Switching",
    rule: "near-miss",
    issue: 3286,
    reason:
      "Two surfaces in the story sit closer than the minimum gap without touching (a demo's own spacing); the story shows exactly that until the demo's spacing is fixed.",
  },
  {
    story: "ReactionBar/ImageCatalogue",
    rule: "near-miss",
    issue: 3286,
    reason:
      "Two surfaces in the story sit closer than the minimum gap without touching (a demo's own spacing); the story shows exactly that until the demo's spacing is fixed.",
  },
  {
    story: "ReactionBar/InMessage",
    rule: "near-miss",
    issue: 3286,
    reason:
      "Two surfaces in the story sit closer than the minimum gap without touching (a demo's own spacing); the story shows exactly that until the demo's spacing is fixed.",
  },
  {
    story: "ReactionBar/WithPicker",
    rule: "near-miss",
    issue: 3286,
    reason:
      "Two surfaces in the story sit closer than the minimum gap without touching (a demo's own spacing); the story shows exactly that until the demo's spacing is fixed.",
  },
  {
    story: "TabBar/InContext",
    rule: "near-miss",
    issue: 3286,
    reason:
      "Two surfaces in the story sit closer than the minimum gap without touching (a demo's own spacing); the story shows exactly that until the demo's spacing is fixed.",
  },
  {
    story: "ThreadLayout/Default",
    rule: "near-miss",
    issue: 3286,
    reason:
      "Two surfaces in the story sit closer than the minimum gap without touching (a demo's own spacing); which pair of surfaces trips the 1px-to-6px near-miss gap, or whether any does, shifts run to run, so the story shows it only sometimes.",
    sometimes: true,
  },
  {
    story: "ThreadLayout/Narrow",
    rule: "near-miss",
    issue: 3286,
    reason:
      "Two surfaces in the story sit closer than the minimum gap without touching (a demo's own spacing); which pair of surfaces trips the 1px-to-6px near-miss gap, or whether any does, shifts run to run, so the story shows it only sometimes.",
    sometimes: true,
  },
  {
    story: "Attachment/OpensInApp",
    rule: "near-miss",
    issue: 3286,
    theme: "nova",
    reason:
      "Two surfaces in the story sit closer than the minimum gap without touching (a demo's own spacing); the story shows exactly that until the demo's spacing is fixed.",
  },
  {
    story: "Badge/StatusDots",
    rule: "near-miss",
    issue: 3286,
    theme: "nova",
    reason:
      "Two surfaces in the story sit closer than the minimum gap without touching (a demo's own spacing); the story shows exactly that until the demo's spacing is fixed.",
  },
  {
    story: "Badge/Tones",
    rule: "near-miss",
    issue: 3286,
    theme: "nova",
    reason:
      "Two surfaces in the story sit closer than the minimum gap without touching (a demo's own spacing); the story shows exactly that until the demo's spacing is fixed.",
  },
  {
    story: "Button/InContext",
    rule: "near-miss",
    issue: 3286,
    theme: "nova",
    reason:
      "Two surfaces in the story sit closer than the minimum gap without touching (a demo's own spacing); the story shows exactly that until the demo's spacing is fixed.",
  },
  {
    story: "ConversationFind/NoMatches",
    rule: "near-miss",
    issue: 3286,
    theme: "nova",
    reason:
      "Two surfaces in the story sit closer than the minimum gap without touching (a demo's own spacing); the story shows exactly that until the demo's spacing is fixed.",
  },
  {
    story: "NavigationRail/IconsOnly",
    rule: "near-miss",
    issue: 3286,
    theme: "nova",
    reason:
      "Two surfaces in the story sit closer than the minimum gap without touching (a demo's own spacing); the story shows exactly that until the demo's spacing is fixed.",
  },
  {
    story: "SnapPip/ControlledCorner",
    rule: "near-miss",
    issue: 3286,
    theme: "nova",
    reason:
      "Two surfaces in the story sit closer than the minimum gap without touching (a demo's own spacing); the story shows exactly that until the demo's spacing is fixed.",
  },
  {
    story: "Attachment/Files",
    rule: "near-miss",
    issue: 3286,
    theme: "nova",
    reason:
      "Two surfaces in the story sit closer than the minimum gap without touching (a demo's own spacing); the story shows exactly that until the demo's spacing is fixed.",
  },
  {
    story: "Attachment/Kinds",
    rule: "near-miss",
    issue: 3286,
    theme: "nova",
    reason:
      "Two surfaces in the story sit closer than the minimum gap without touching (a demo's own spacing); the story shows exactly that until the demo's spacing is fixed.",
  },
  {
    story: "Attachment/Removable",
    rule: "near-miss",
    issue: 3286,
    theme: "nova",
    reason:
      "Two surfaces in the story sit closer than the minimum gap without touching (a demo's own spacing); the story shows exactly that until the demo's spacing is fixed.",
  },
  {
    story: "Badge/InContext",
    rule: "near-miss",
    issue: 3286,
    theme: "nova",
    reason:
      "Two surfaces in the story sit closer than the minimum gap without touching (a demo's own spacing); the story shows exactly that until the demo's spacing is fixed.",
  },
  {
    story: "ConversationFind/LongConversation",
    rule: "near-miss",
    issue: 3286,
    theme: "nova",
    reason:
      "Two surfaces in the story sit closer than the minimum gap without touching (a demo's own spacing); the story shows exactly that until the demo's spacing is fixed.",
  },
  {
    story: "Heading/RecipeCard",
    rule: "near-miss",
    issue: 3286,
    theme: "nova",
    reason:
      "Two surfaces in the story sit closer than the minimum gap without touching (a demo's own spacing); the story shows exactly that until the demo's spacing is fixed.",
  },
  {
    story: "MediaTile/GridOfFour",
    rule: "near-miss",
    issue: 3286,
    theme: "nova",
    reason:
      "Two surfaces in the story sit closer than the minimum gap without touching (a demo's own spacing); the story shows exactly that until the demo's spacing is fixed.",
  },
  {
    story: "MessageList/Actions",
    rule: "near-miss",
    issue: 3286,
    theme: "nova",
    reason:
      "Under nova's spacing scale the message bubble sits closer than the minimum gap to its actions toolbar without touching (a demo's own spacing, unrelated to scroll position); which pair of surfaces trips the 1px-to-6px near-miss gap, or whether any does, shifts run to run, so the story shows it only sometimes.",
    sometimes: true,
  },
  {
    story: "MessageList/LongConversation",
    rule: "near-miss",
    issue: 3286,
    theme: "nova",
    reason:
      "Under nova's spacing scale the message bubble sits closer than the minimum gap to its actions toolbar without touching (a demo's own spacing, unrelated to scroll position); which pair of surfaces trips the 1px-to-6px near-miss gap, or whether any does, shifts run to run, so the story shows it only sometimes.",
    sometimes: true,
  },
  {
    story: "NavigationRail/LongLabels",
    rule: "near-miss",
    issue: 3286,
    theme: "nova",
    reason:
      "Two surfaces in the story sit closer than the minimum gap without touching (a demo's own spacing); the story shows exactly that until the demo's spacing is fixed.",
  },
  {
    story: "NavigationRail/Overflow",
    rule: "near-miss",
    issue: 3286,
    theme: "nova",
    reason:
      "Two surfaces in the story sit closer than the minimum gap without touching (a demo's own spacing); the story shows exactly that until the demo's spacing is fixed.",
  },
  {
    story: "NavigationRail/Playground",
    rule: "near-miss",
    issue: 3286,
    theme: "nova",
    reason:
      "Two surfaces in the story sit closer than the minimum gap without touching (a demo's own spacing); the story shows exactly that until the demo's spacing is fixed.",
  },
  {
    story: "NavigationRail/Views",
    rule: "near-miss",
    issue: 3286,
    theme: "nova",
    reason:
      "Two surfaces in the story sit closer than the minimum gap without touching (a demo's own spacing); the story shows exactly that until the demo's spacing is fixed.",
  },
  {
    story: "ScrollArea/InContext",
    rule: "near-miss",
    issue: 3286,
    theme: "nova",
    reason:
      "Two surfaces in the story sit closer than the minimum gap without touching (a demo's own spacing); the story shows exactly that until the demo's spacing is fixed.",
  },
  {
    story: "TextArea/Composer",
    rule: "near-miss",
    issue: 3286,
    theme: "nova",
    reason:
      "Two surfaces in the story sit closer than the minimum gap without touching (a demo's own spacing); the story shows exactly that until the demo's spacing is fixed.",
  },
  {
    story: "ThemePicker/InPopover",
    rule: "off-centre-text",
    issue: 3257,
    theme: "nova",
    reason:
      "The trigger button shows the chosen look's wordmark, whose own font-size-adjust and leading-none tuning sit a couple of pixels off the Button's usual middle once ouro-base's 2560px root step (125%) scales every length; the trigger should centre the wordmark on its own cap height instead of the Button's default centring.",
  },
  {
    story: "TimeGrid/BackgroundEvents",
    rule: "off-centre-text",
    issue: 3364,
    theme: "nova",
    reason:
      "Under nova's metrics an event's own bespoke button, not yet migrated to cap-label, isn't centred on its cap height, by about a pixel; a real residual centring gap #3364 tracks across controls, not #3565's rule bug (fixed).",
  },
  {
    story: "TimeGrid/BackgroundEventsDay",
    rule: "off-centre-text",
    issue: 3364,
    theme: "nova",
    reason:
      "Under nova's metrics an event's own bespoke button, not yet migrated to cap-label, isn't centred on its cap height, by about a pixel; a real residual centring gap #3364 tracks across controls, not #3565's rule bug (fixed).",
  },
  {
    story: "TimeGrid/Day",
    rule: "off-centre-text",
    issue: 3364,
    theme: "nova",
    reason:
      "Under nova's metrics an event's own bespoke button, not yet migrated to cap-label, isn't centred on its cap height, by about a pixel; a real residual centring gap #3364 tracks across controls, not #3565's rule bug (fixed).",
  },
  {
    story: "TimeGrid/NowAdornment",
    rule: "off-centre-text",
    issue: 3364,
    theme: "nova",
    reason:
      "Under nova's metrics an event's own bespoke button, not yet migrated to cap-label, isn't centred on its cap height, by about a pixel; a real residual centring gap #3364 tracks across controls, not #3565's rule bug (fixed).",
  },
  {
    story: "TimeGrid/Playground",
    rule: "off-centre-text",
    issue: 3364,
    theme: "nova",
    reason:
      "Under nova's metrics an event's own bespoke button, not yet migrated to cap-label, isn't centred on its cap height, by about a pixel; a real residual centring gap #3364 tracks across controls, not #3565's rule bug (fixed).",
  },
  {
    story: "TimeGrid/WorkWeek",
    rule: "off-centre-text",
    issue: 3364,
    theme: "nova",
    reason:
      "Under nova's metrics an event's own bespoke button, not yet migrated to cap-label, isn't centred on its cap height, by about a pixel; a real residual centring gap #3364 tracks across controls, not #3565's rule bug (fixed).",
  },
];
