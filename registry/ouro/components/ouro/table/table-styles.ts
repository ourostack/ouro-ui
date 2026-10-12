export { alignClasses, cellBase, cellPad, headCell, rowLinkClass, sectionCell, stickyHead, tableAligns, wrapClass };
export type { TableAlign };

/** How a column's content lines up: `end` for numbers, `center` for a status mark. */
type TableAlign = "start" | "center" | "end";

/** The alignments a column or cell takes, for the dev message on an unknown one. */
const tableAligns: readonly TableAlign[] = ["start", "center", "end"];

const alignClasses = { start: "text-start", center: "text-center", end: "text-end" } as const;

// Cells stay on one line, so a wide table scrolls sideways instead of squeezing its columns.
const cellBase = "m-0 align-middle whitespace-nowrap border-b border-border font-normal";
// `anywhere` (not `break-word`) also lowers the cell's minimum width, so a long URL wraps
// instead of widening the column.
const wrapClass = "whitespace-normal wrap-anywhere min-w-48";
const cellPad = { md: "px-4 py-3", dense: "px-3 py-1.5" } as const;

const headCell = "font-medium text-muted-foreground";
// Inside the ScrollArea's viewport, which scrolls both ways, the header sticks to its top and
// moves sideways with its column. z-20 keeps it over the rows' links (z-1) and raised controls (z-10).
const stickyHead = "sticky top-0 z-20 bg-background";

// The last body row has no line under it; a footer has a line above it and none under it.
const sectionCell = {
  head: "",
  body: "[tbody>tr:last-child>&]:border-b-0",
  foot: "border-t border-b-0 font-medium",
} as const;

// The row link's focus ring is drawn by the layer that covers the row, so it outlines the
// whole row in every browser (WebKit paints no outline on a <tr>).
const rowLinkClass = "after:outline-ring after:-outline-offset-2 focus-visible:after:outline-2 focus-visible:after:outline-solid";
