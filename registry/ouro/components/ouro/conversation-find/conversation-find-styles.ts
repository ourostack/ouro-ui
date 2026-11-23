export { stepFrom, stepTo, resultWords };

// Shared helpers for ConversationFind. They live apart from the component so its file exports only components, which React
// Fast Refresh needs. The export list comes first because the shadcn CLI drops comments before a file's first statement.

/**
 * The match a step lands on, once there is a match to land on: one on from the current match, or one back, wrapping round
 * past either end. Starting from null it lands on the first match going on and the last going back. `stepFrom` is the
 * version that still has to find that out.
 *
 * @internal
 */
function stepTo(current: number | null, count: number, direction: 1 | -1): number {
  if (current === null) return direction === 1 ? 0 : count - 1;
  return (current + direction + count) % count;
}

/**
 * The match a step lands on: one on from the current match, or one back, wrapping round past either end. Starting from null it lands on the first match going on and the last going back; with nothing found it stays on null.
 *
 * @internal
 * @claim "wrapping round past either end" registry/ouro/components/ouro/conversation-find/conversation-find.test.tsx verify:testExists(registry/ouro/components/ouro/conversation-find/conversation-find.test.tsx::ConversationFind > steps with Enter and Shift+Enter in the find box, wrapping round past either end)
 */
function stepFrom(current: number | null, count: number, direction: 1 | -1): number | null {
  return count === 0 ? null : stepTo(current, count, direction);
}

/**
 * What the bar says about the matches, for its text and for the polite announcement: "n of m", or `none` for a search without a match.
 *
 * @internal
 */
function resultWords(current: number | null, count: number, none: string, format: (current: number, count: number) => string = (n, m) => `${n} of ${m}`): string {
  return count === 0 || current === null ? none : format(current + 1, count);
}
