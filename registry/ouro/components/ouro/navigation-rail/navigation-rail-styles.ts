export { countClass, footerClass, headerClass, iconClass, indicatorClass, itemClass, labelClass, listClass, menuCountClass, railClass, separatorClass, shownCount };

// Class strings are literal so the app's Tailwind finds them when it compiles.

/**
 * The count as the badge shows it: up to 99, then "99+". Screen readers hear the whole number.
 *
 * @claim "The count as the" registry/ouro/components/ouro/navigation-rail/navigation-rail.test.tsx verify:testExists(registry/ouro/components/ouro/navigation-rail/navigation-rail.test.tsx::NavigationRail counts > shows a count on the icon, capped at 99+, and speaks the whole number after the label)
 * @claim "Screen readers hear the whole number" registry/ouro/components/ouro/navigation-rail/navigation-rail.test.tsx verify:testExists(registry/ouro/components/ouro/navigation-rail/navigation-rail.test.tsx::NavigationRail counts > shows a count on the icon, capped at 99+, and speaks the whole number after the label)
 */
function shownCount(count: number): string {
  return count > 99 ? "99+" : String(count);
}

/**
 * The column: 68px with labels, 56px without. It fills its container's height and draws no
 * surface of its own, so it sits on the app's frame.
 * @claim "The column: 68px with" registry/ouro/components/ouro/navigation-rail/navigation-rail.test.tsx verify:testExists(registry/ouro/components/ouro/navigation-rail/navigation-rail.test.tsx::NavigationRail > is 68px wide with labels and 56px with hideLabels, with items at least 44px tall)
 * @claim "It fills its container's" registry/ouro/components/ouro/navigation-rail/navigation-rail.test.tsx verify:testExists(registry/ouro/components/ouro/navigation-rail/navigation-rail.test.tsx::NavigationRail > fills its container's height and draws no surface of its own)
 */
const railClass = {
  labels: "box-border flex h-full w-17 shrink-0 flex-col py-2",
  icons: "box-border flex h-full w-14 shrink-0 flex-col py-2",
} as const;

const headerClass = "flex shrink-0 items-center justify-center px-1 pb-2";

const footerClass = "flex shrink-0 flex-col items-center gap-1 px-1 pt-2";

/** The items, in the room left between the header and the footer; what does not fit moves under More. */
const listClass = "m-0 box-border flex min-h-0 flex-1 list-none flex-col gap-1 overflow-hidden px-1 py-0";

/** A short rule between groups of items, in a list item of its own that screen readers skip. */
const separatorClass = "mx-auto block h-px w-8 bg-border forced-colors:bg-[CanvasText]";

/**
 * An item: the icon over its label, at least 44px tall. The current item's label is the
 * foreground colour and its icon the primary colour; the rest are muted text mixed toward the
 * foreground, which keeps them legible on a muted frame too. A press scales it (not with reduced
 * motion), and the colours ease.
 * @claim "the icon over its" registry/ouro/components/ouro/navigation-rail/navigation-rail.test.tsx verify:testExists(registry/ouro/components/ouro/navigation-rail/navigation-rail.test.tsx::NavigationRail > is 68px wide with labels and 56px with hideLabels, with items at least 44px tall)
 * @claim "The current item's label" registry/ouro/components/ouro/navigation-rail/navigation-rail.test.tsx verify:testExists(registry/ouro/components/ouro/navigation-rail/navigation-rail.test.tsx::NavigationRail > shows the current item's bar on the rail's start edge, its label in the foreground colour and its icon in the primary colour)
 */
const itemClass = {
  labels:
    "press group/navigation-rail relative m-0 box-border flex min-h-14 w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-md border-0 bg-transparent px-0.5 py-1.5 " +
    "font-[inherit] no-underline select-none touch-manipulation [-webkit-tap-highlight-color:transparent] " +
    "text-[color-mix(in_oklab,var(--muted-foreground)_80%,var(--foreground))] pointer-fine:hover:bg-accent pointer-fine:hover:text-accent-foreground data-selected:text-foreground " +
    "motion-safe:active:scale-(--ouro-press-scale) outline-ring -outline-offset-2 focus-visible:outline-2 focus-visible:outline-solid forced-colors:border forced-colors:border-solid",
  icons:
    "press group/navigation-rail relative m-0 box-border flex min-h-11 w-full cursor-pointer flex-col items-center justify-center rounded-md border-0 bg-transparent p-0 " +
    "font-[inherit] no-underline select-none touch-manipulation [-webkit-tap-highlight-color:transparent] " +
    "text-[color-mix(in_oklab,var(--muted-foreground)_80%,var(--foreground))] pointer-fine:hover:bg-accent pointer-fine:hover:text-accent-foreground data-selected:text-foreground " +
    "motion-safe:active:scale-(--ouro-press-scale) outline-ring -outline-offset-2 focus-visible:outline-2 focus-visible:outline-solid forced-colors:border forced-colors:border-solid",
} as const;

/**
 * The current item's bar on the rail's start edge. It grows from its middle when the item
 * becomes current and shrinks away from the one that was; with reduced motion it only fades.
 * Under forced colours it keeps the highlight colour.
 */
const indicatorClass =
  "pointer-events-none absolute -start-1 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-primary opacity-0 scale-y-0 " +
  "transition-[scale,opacity] duration-(--ouro-duration-base) ease-(--ouro-ease-out) " +
  "group-data-selected/navigation-rail:opacity-100 group-data-selected/navigation-rail:scale-y-100 " +
  "motion-reduce:scale-y-100 motion-reduce:transition-opacity motion-reduce:duration-(--ouro-duration-fast) " +
  "forced-colors:bg-[Highlight] forced-colors:forced-color-adjust-none";

const iconClass = "relative flex size-6 shrink-0 items-center justify-center group-data-selected/navigation-rail:text-primary [&>svg]:size-full";

/**
 * The label under the icon: two lines at most, broken between words (hyphenated where the
 * page's language allows). A label that still does not fit ends in an ellipsis and gets a Tooltip.
 * @claim "The label under the" registry/ouro/components/ouro/navigation-rail/navigation-rail.test.tsx verify:testExists(registry/ouro/components/ouro/navigation-rail/navigation-rail.test.tsx::NavigationRail labels > wraps a long label to two lines between words, and gives a label that still does not fit an ellipsis and a tooltip)
 */
const labelClass =
  "line-clamp-2 w-full text-center text-[0.6875rem] leading-[0.875rem] font-medium text-balance hyphens-auto [overflow-wrap:normal] group-data-selected/navigation-rail:font-semibold";

/** The count on the icon's top end corner. */
const countClass =
  "absolute -end-2.5 -top-1.5 box-border h-4 min-w-4 rounded-full bg-destructive px-1 text-center text-[0.625rem] leading-4 font-semibold text-destructive-foreground tabular-nums " +
  "forced-colors:border forced-colors:border-solid forced-colors:leading-[0.875rem]";

/** The count after a label in the More menu. */
const menuCountClass =
  "ms-auto box-border h-4 min-w-4 rounded-full bg-destructive px-1 text-center text-[0.625rem] leading-4 font-semibold text-destructive-foreground tabular-nums " +
  "forced-colors:border forced-colors:border-solid forced-colors:leading-[0.875rem]";
