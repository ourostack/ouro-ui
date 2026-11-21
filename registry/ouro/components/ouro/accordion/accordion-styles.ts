export { headerClass, headingLevels, iconClass, itemClass, ownLook, panelContentClass, rootClass, triggerClass };
export type { AccordionHeadingLevel };

// Class strings and value lists for Accordion, apart from the component so its file exports
// only components (React Fast Refresh). Class strings are literal so the app's Tailwind finds
// them when it compiles.

/**
 * The heading levels an item's title can take.
 *
 * @internal
 */
const headingLevels = [2, 3, 4, 5, 6] as const;

/**
 * The outline level of each item's title: `<h2>` to `<h6>`.
 *
 * @claim "The outline level of each item's" registry/ouro/components/ouro/accordion/accordion.test.tsx verify:testExists(registry/ouro/components/ouro/accordion/accordion.test.tsx::Accordion > sets the heading level with headingLevel)
 * @claim "The outline level of each item's" registry/ouro/components/ouro/accordion/accordion.test-d.ts verify:fileLine(registry/ouro/components/ouro/accordion/accordion.test-d.ts, /\{\sitems:\sItems;\sheadingLevel:\s1\s\}>\(\)\.not\.toExtend<AccordionProps>/)
 */
type AccordionHeadingLevel = (typeof headingLevels)[number];

/**
 * The `Fix:` for an appearance class: the accordion draws its own look.
 *
 * @internal
 */
function ownLook(component: string): (token: string) => string {
  return (token) => `remove "${token}"; ${component} sets its own look`;
}

/** @internal */
const rootClass = "box-border w-full min-w-0 text-foreground";

/**
 * An item: a hairline under each one.
 *
 * @internal
 * @claim "An item: a hairline under each" registry/ouro/components/ouro/accordion/accordion-styles.ts verify:fileLine(registry/ouro/components/ouro/accordion/accordion-styles.ts, /const\sitemClass\s=\s"border-0\sborder-b\sborder-solid\sborder-border"/)
 */
const itemClass = "border-0 border-b border-solid border-border";

/** @internal */
const headerClass = "m-0 p-0 text-base font-medium";

/**
 * The title button: the whole row, at least 44px tall on a coarse pointer and 40px with a
 * fine one. A full-width row does not scale when pressed; it dims instead.
 *
 * @internal
 * @claim "The title button: the whole row" registry/ouro/components/ouro/accordion/accordion.test.tsx verify:testExists(registry/ouro/components/ouro/accordion/accordion.test.tsx::Accordion > gives every trigger at least a 44px row on a coarse pointer, or 40px otherwise)
 */
const triggerClass =
  "group/trigger press relative m-0 box-border flex w-full cursor-pointer items-center justify-between gap-4 " +
  "min-h-ouro-11 sm:pointer-fine:min-h-10 px-0 py-3 rounded-ouro-md border-0 bg-transparent text-start " +
  "font-[inherit] text-base font-medium text-foreground sm:pointer-fine:text-sm " +
  "select-none touch-manipulation [-webkit-tap-highlight-color:transparent] " +
  "underline-offset-4 not-data-disabled:pointer-fine:hover:underline not-data-disabled:active:opacity-70 " +
  "outline-ring outline-offset-2 focus-visible:outline-2 focus-visible:outline-solid " +
  "data-disabled:cursor-not-allowed data-disabled:opacity-50";

/**
 * The chevron: it turns over while the item is open.
 *
 * @internal
 */
const iconClass =
  "size-ouro-4 shrink-0 text-muted-foreground transition-[rotate] duration-(--ouro-duration-base) ease-(--ouro-ease-out) " +
  "group-data-panel-open/trigger:rotate-180 motion-reduce:transition-none";

/** @internal */
const panelContentClass = "pb-4 text-base sm:pointer-fine:text-sm";
