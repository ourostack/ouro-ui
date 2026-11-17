// Ouro check's findings in the stories that are known, each with the rule, the story and why it stays. test/stories.test.tsx
// runs Ouro check's in-page rules over every story (test/check-story.ts) and fails on any finding not listed here, and on
// an entry no finding matches any more, so a fixed finding leaves this list with its fix. Each entry is a story and a rule,
// whatever its size or scheme: the story shows the state, and the reason says what is on screen.

export interface KnownFinding {
  /** The story's id, as Storybook names it (`Button/Disabled`). */
  story: string;
  /** The rule Ouro check reports (registry/ouro/check). */
  rule: string;
  /** Why the finding stays, and what would have to change for it to go. */
  reason: string;
}

const disabledReason =
  "A disabled control shows alone: the reason it is off is the app's words, which a story does not supply. An app gives one with a title or aria-describedby.";
const repeatedControl = "The story lays the same control out in each variant or state, so its name repeats in view; the repetition is what the story shows.";
const layoutWeights =
  "The story's own page chrome uses four font weights (400 to 700); the rule keeps a page to three. The weights are the layout's, not a component's.";

export const knownFindings: KnownFinding[] = [
  { story: "Accordion/Multiple", rule: "disabled-no-reason", reason: disabledReason },
  { story: "AgentPresence/Unread", rule: "duplicate-control", reason: repeatedControl },
  { story: "Button/Disabled", rule: "disabled-no-reason", reason: disabledReason },
  { story: "Button/Loading", rule: "disabled-no-reason", reason: disabledReason },
  { story: "Button/Loading", rule: "duplicate-control", reason: repeatedControl },
  { story: "Button/Sizes", rule: "duplicate-control", reason: repeatedControl },
  { story: "Button/TonesAndVariants", rule: "duplicate-control", reason: repeatedControl },
  {
    story: "Calendar/Unavailable",
    rule: "disabled-no-reason",
    reason: "Each unavailable day is a disabled button with no reason beside it; the reason (a booked date, a closed day) is the app's copy.",
  },
  { story: "Checkbox/States", rule: "disabled-no-reason", reason: disabledReason },
  { story: "ColorField/States", rule: "duplicate-control", reason: repeatedControl },
  {
    story: "Composer/EmojiTokens",
    rule: "lone-word",
    reason: "The last line of the message holds one word at this width; the words are the story's copy, not a component's wrap.",
  },
  { story: "Composer/Sending", rule: "disabled-no-reason", reason: disabledReason },
  { story: "Composer/SendingOff", rule: "disabled-no-reason", reason: disabledReason },
  { story: "DatePicker/States", rule: "duplicate-control", reason: repeatedControl },
  {
    story: "Emoji/Placeholder",
    rule: "broken-image",
    reason: "The story shows the picture that fails to load on purpose, to show the placeholder that stands in for it.",
  },
  { story: "FamilyBar/InContext", rule: "type-scale", reason: layoutWeights },
  {
    story: "Heading/Display",
    rule: "narrow-heading",
    reason: "The story holds the display headline to 16ch on purpose, to show it wrap onto two balanced lines.",
  },
  {
    story: "Hero/FullWidth",
    rule: "lone-word",
    reason: "A paragraph of the story's copy ends on one word at this width; the copy is the story's, not a component's wrap.",
  },
  {
    story: "Item/BesideDetail",
    rule: "lone-word",
    reason: "The description's last line is the end of a hyphenated word at this width; the copy is the story's.",
  },
  {
    story: "Item/Steps",
    rule: "lone-word",
    reason: "A step's text ends on one word at this width; the copy is the story's, not a component's wrap.",
  },
  {
    story: "ItemGroup/InContext",
    rule: "lone-word",
    reason: "A row's detail text ends on its action at this width; the rows' copy is the story's.",
  },
  {
    story: "Lightbox/MosaicWithMore",
    rule: "overlap",
    reason: "The '+2' count sits over the last tile of the mosaic on purpose: it says how many pictures the tile hides.",
  },
  {
    story: "MediaTile/ShareContain",
    rule: "overlap",
    reason: "The name and status sit over the letterboxed picture's box, which the story draws contained; the label is the tile's own overlay.",
  },
  {
    story: "Message/Posts",
    rule: "lone-word",
    reason: "A message's text ends on one word at this width; the copy is the story's, not a component's wrap.",
  },
  {
    story: "Message/Quote",
    rule: "nested-frame",
    reason: "The quote's inner corners (14px, and 2px for its bar) sit inside the bubble's 32px corner, so they nest at 23px and 8px by the rule. This is the bubble's squircle radius; a design decision to revisit, not a story bug.",
  },
  {
    story: "Lightbox/Zoomed",
    rule: "nested-frame",
    reason: "In dark, the zoomed picture's square corners sit inside the viewer's 18px-cornered panel, which the rule reads as corners that do not nest. Found in dark only; whether the viewer clips the picture is for a look at the viewer.",
  },
  {
    story: "Message/ReplyInThread",
    rule: "nested-frame",
    reason: "In dark, the reply's 2px quote bar sits inside its 14px-cornered blockquote and nests at 8px by the rule, as the bar in Message/Quote does.",
  },
  {
    story: "Message/Thread",
    rule: "lone-word",
    reason: "A message's text ends on one word at this width; the copy is the story's, not a component's wrap.",
  },
  {
    story: "MessageList/LongConversation",
    rule: "nested-frame",
    reason: "A quoted reply's inner corners sit inside the bubble's 32px corner and nest at 24px by the rule, as Message/Quote does: the bubble's squircle radius.",
  },
  {
    story: "MessageList/OpenedAtMessage",
    rule: "overlap",
    reason: "The 'Jump to latest' button floats over the end of the conversation at this scroll position, as a floating control does by design.",
  },
  {
    story: "MessageList/ScrolledBack",
    rule: "overlap",
    reason: "The 'Jump to latest' button floats over the last message at this scroll position, as a floating control does by design.",
  },
  { story: "Navbar/InContext", rule: "type-scale", reason: layoutWeights },
  {
    story: "NavigationRail/LongLabels",
    rule: "lone-word",
    reason: "A long label breaks onto a last line of one piece of a hyphenated or long word at this width; the labels are the story's copy.",
  },
  { story: "RadioGroup/States", rule: "disabled-no-reason", reason: disabledReason },
  { story: "ReactionBar/Disabled", rule: "disabled-no-reason", reason: disabledReason },
  { story: "Reorderable/Disabled", rule: "disabled-no-reason", reason: disabledReason },
  { story: "SegmentedControl/States", rule: "disabled-no-reason", reason: disabledReason },
  {
    story: "Sheet/NonModal",
    rule: "lone-word",
    reason: "A paragraph of the sheet's copy ends on one word at this width; the copy is the story's, not a component's wrap.",
  },
  { story: "Sidebar/InContext", rule: "type-scale", reason: layoutWeights },
  { story: "SidebarLayout/InContext", rule: "type-scale", reason: layoutWeights },
  { story: "SidebarLayout/Playground", rule: "type-scale", reason: layoutWeights },
  { story: "StackedLayout/Document", rule: "type-scale", reason: layoutWeights },
  { story: "StackedLayout/InContext", rule: "type-scale", reason: layoutWeights },
  { story: "StackedLayout/Playground", rule: "type-scale", reason: layoutWeights },
  { story: "StackedLayout/Reader", rule: "type-scale", reason: layoutWeights },
  { story: "StackedLayout/WithToolbar", rule: "type-scale", reason: layoutWeights },
  { story: "Switch/States", rule: "disabled-no-reason", reason: disabledReason },
  { story: "SyncStatus/States", rule: "duplicate-control", reason: repeatedControl },
  { story: "Tabs/Vertical", rule: "disabled-no-reason", reason: disabledReason },
  {
    story: "ThreadRail/Playground",
    rule: "overlap",
    reason: "The playground's rail is w-96 (24rem), wider than the 390px phone's frame, so it runs over the story's own sample text at that width.",
  },
  {
    story: "TimeGrid/Locales",
    rule: "lone-word",
    reason: "A Japanese time range breaks onto its own last line at this width; the copy and its locale are the story's.",
  },
  {
    story: "Timer/Ring",
    rule: "overlap",
    reason: "The time and its button sit over the progress ring on purpose: the ring is the timer's face.",
  },
  {
    story: "Timer/RingPaused",
    rule: "overlap",
    reason: "The time and its status sit over the progress ring on purpose: the ring is the timer's face.",
  },
  { story: "Toggle/States", rule: "disabled-no-reason", reason: disabledReason },
  { story: "Toggle/States", rule: "duplicate-control", reason: repeatedControl },
  { story: "ToggleGroup/Modes", rule: "disabled-no-reason", reason: disabledReason },
  { story: "Toolbar/Disabled", rule: "disabled-no-reason", reason: disabledReason },
];
