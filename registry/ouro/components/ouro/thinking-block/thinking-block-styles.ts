export { reasoningClass, rootClass, thoughtFor, titleClass };

// Class strings and the title's wording for ThinkingBlock, apart from the component so its file
// exports only components (React Fast Refresh). Class strings are literal so the app's Tailwind
// finds them when it compiles.

/** @internal */
const rootClass = "box-border grid min-w-0";

/**
 * The title's words, quieter than the reply that follows them.
 *
 * @internal
 */
const titleClass = "inline-flex min-w-0 items-center gap-2 font-normal text-muted-foreground";

/**
 * The reasoning: muted, a step smaller than the reply, behind a line at its start edge.
 *
 * @internal
 */
const reasoningClass =
  "m-0 box-border min-w-0 border-0 border-s-2 border-solid border-border ps-3 " +
  "text-(length:--text-sm) leading-relaxed text-muted-foreground wrap-break-word";

/**
 * The finished title: "Thought for 12 seconds", or "Thought" with no duration.
 *
 * @internal
 * @claim "The finished title" registry/ouro/components/ouro/thinking-block/thinking-block.test.tsx verify:testExists(registry/ouro/components/ouro/thinking-block/thinking-block.test.tsx::ThinkingBlock > titles a finished block with its summary, its duration, or Thought)
 */
function thoughtFor(seconds: number | undefined): string {
  // Stryker disable next-line ConditionalExpression: Number.isFinite also turns undefined away, so the first test only narrows the type.
  if (seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return "Thought";
  if (seconds < 59.5) {
    const whole = Math.max(1, Math.round(seconds));
    return `Thought for ${whole} ${whole === 1 ? "second" : "seconds"}`;
  }
  const minutes = Math.round(seconds / 60);
  return `Thought for ${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
}
