export { seenBy };

// Shared helpers for ReadReceipt. They live apart from the component so its file exports only components, which React
// Fast Refresh needs. The export list comes first because the shadcn CLI drops comments before a file's first statement.

/**
 * Who has seen a message, in words: the first two by name, then the rest as a count ("Seen by Ana Lind, Ben Ito and 2
 * others").
 *
 * @internal
 * @claim "Who has seen a message, in words" registry/ouro/components/ouro/read-receipt/read-receipt.test.tsx verify:testExists(registry/ouro/components/ouro/read-receipt/read-receipt.test.tsx::ReadReceipt > says who has seen it, by name for up to three and with a count past that)
 */
function seenBy(names: readonly string[]): string {
  const [a, b, c] = names;
  if (names.length === 1) return `Seen by ${a}`;
  if (names.length === 2) return `Seen by ${a} and ${b}`;
  if (names.length === 3) return `Seen by ${a}, ${b} and ${c}`;
  return `Seen by ${a}, ${b} and ${names.length - 2} others`;
}
