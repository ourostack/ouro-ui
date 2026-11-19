export { othersOf };

// Shared helpers for ChatHeader. They live apart from the component so its file exports only components, which React
// Fast Refresh needs. The export list comes first because the shadcn CLI drops comments before a file's first statement.

/**
 * The line under a group chat's title: the first member by name, then the second, or the rest as a count
 * ("Captain Nemo and 3 others").
 *
 * @internal
 * @claim "the first member by name, then the second" registry/ouro/components/ouro/chat-header/chat-header.test.tsx verify:testExists(registry/ouro/components/ouro/chat-header/chat-header.test.tsx::ChatHeader > says who is in a group under its title, by name for two and with a count past that)
 */
function othersOf(names: readonly string[]): string {
  return names.length === 2 ? `${names[0]} and ${names[1]}` : `${names[0]} and ${names.length - 1} others`;
}
