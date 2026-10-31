export { fitCount, splitEntries, toolbarSizes };
export type { ToolbarSize };

// Value lists and the overflow arithmetic Toolbar uses, apart from the component so its file
// exports only components and types (React Fast Refresh).

/**
 * The control sizes, as Button's and Toggle's.
 *
 * @internal
 */
const toolbarSizes = { sm: "sm", md: "md", lg: "lg" } as const;

/**
 * A toolbar size.
 *
 * @internal
 */
type ToolbarSize = keyof typeof toolbarSizes;

/**
 * How many entries fit in `width`: all of them when their widths and the gaps between them
 * do, or else as many as fit beside the More button (`more` wide, one gap before it).
 *
 * @internal
 * @claim "How many entries fit in `width`" registry/ouro/components/ouro/toolbar/toolbar.test.tsx verify:testExists(registry/ouro/components/ouro/toolbar/toolbar.test.tsx::Toolbar overflow arithmetic > fits every entry when they and their gaps fit, with half a pixel of slack)
 * @claim "How many entries fit in `width`" registry/ouro/components/ouro/toolbar/toolbar.test.tsx verify:testExists(registry/ouro/components/ouro/toolbar/toolbar.test.tsx::Toolbar overflow arithmetic > fits as many as leave room for More and its gap)
 */
function fitCount(widths: readonly number[], more: number, gap: number, width: number): number {
  const total = widths.reduce((sum, entry, index) => sum + entry + (index > 0 ? gap : 0), 0);
  // Half a pixel of slack: rounded widths can add up a fraction over the space they came from.
  if (total <= width + 0.5) return widths.length;
  const budget = width - more - gap + 0.5;
  let used = 0;
  let count = 0;
  for (const entry of widths) {
    const next = used + (count > 0 ? gap : 0) + entry;
    if (next > budget) break;
    used = next;
    count += 1;
  }
  return count;
}

/**
 * The first `count` entries to show and the rest for the More menu, with no separator at the
 * end of the row or the start of the menu.
 *
 * @internal
 * @claim "The first `count` entries to show" registry/ouro/components/ouro/toolbar/toolbar.test.tsx verify:testExists(registry/ouro/components/ouro/toolbar/toolbar.test.tsx::Toolbar overflow arithmetic > drops a separator at the end of the row and at the start of the menu)
 */
function splitEntries<T extends { type?: string | undefined }>(entries: readonly T[], count: number): { visible: T[]; overflow: T[] } {
  const visible = entries.slice(0, count);
  const overflow = entries.slice(count);
  while (visible.length > 0 && visible.at(-1)!.type === "separator") visible.pop();
  while (overflow.length > 0 && overflow[0]!.type === "separator") overflow.shift();
  return { visible, overflow };
}
