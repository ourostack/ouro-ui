export { writingOf };

// Shared helpers for TypingIndicator. They live apart from the component so its file exports only components, which
// React Fast Refresh needs. The export list comes first because the shadcn CLI drops comments before a file's first
// statement.

/**
 * Who is writing, in words: one name "is writing…", two "are writing…", and past that "Several people are writing…".
 *
 * @internal
 * @claim "Who is writing, in words" registry/ouro/components/ouro/typing-indicator/typing-indicator.test.tsx verify:testExists(registry/ouro/components/ouro/typing-indicator/typing-indicator.test.tsx::TypingIndicator > names one or two writers, and says several past that)
 */
function writingOf(names: readonly string[]): string {
  if (names.length === 1) return `${names[0]} is writing…`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are writing…`;
  return "Several people are writing…";
}
