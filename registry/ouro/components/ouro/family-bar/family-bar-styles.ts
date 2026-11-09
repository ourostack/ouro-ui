export { familyBarClass, familyFooterClass, familyLinkClass, familyScrollerClass, familyWarnings };

import type { DevWarning } from "@/registry/ouro/lib/ouro/use-dev-messages";

/**
 * A link in a FamilyBar or a FamilyFooter, in the muted foreground mixed toward the foreground, since the bar is on the
 * muted surface. The current site's link is in the foreground, heavier, with a bar under its text in the primary
 * colour, drawn as a border so that forced colours keep it. The focus outline is inset, inside the row that scrolls.
 *
 * @internal
 */
const familyLinkClass =
  "relative m-0 box-border inline-flex min-h-11 pointer-fine:min-h-9 items-center rounded-md px-2.5 whitespace-nowrap no-underline select-none touch-manipulation " +
  "text-base pointer-fine:text-sm leading-5 font-medium text-[color-mix(in_oklab,var(--muted-foreground)_80%,var(--foreground))] [-webkit-tap-highlight-color:transparent] " +
  "transition-colors duration-(--ouro-duration-fast) ease-[ease] pointer-fine:hover:text-foreground active:text-foreground " +
  "aria-[current=true]:font-semibold aria-[current=true]:text-foreground " +
  "aria-[current=true]:after:pointer-events-none aria-[current=true]:after:absolute aria-[current=true]:after:inset-x-2.5 aria-[current=true]:after:bottom-1 " +
  "aria-[current=true]:after:border-0 aria-[current=true]:after:border-b-2 aria-[current=true]:after:border-solid aria-[current=true]:after:border-primary aria-[current=true]:after:content-[''] " +
  "outline-ring -outline-offset-2 focus-visible:outline-2 focus-visible:outline-solid";

/**
 * The FamilyBar's strip: one row on the muted surface with a hairline under it, set apart from the site's own header
 * below it, and clear of a phone's rounded corners.
 *
 * @internal
 */
const familyBarClass =
  "box-border flex w-full min-w-0 items-center gap-2 border-0 border-b border-solid border-border bg-muted text-foreground " +
  "ps-[max(0.5rem,env(safe-area-inset-left,0px))] pe-[max(0.5rem,env(safe-area-inset-right,0px))]";

/**
 * The FamilyBar's row of links, which scrolls inside itself when it does not fit, its scroll bar hidden.
 *
 * @internal
 */
const familyScrollerClass = "min-w-0 flex-1 overflow-x-auto overflow-y-hidden overscroll-x-contain [scrollbar-width:none]";

/**
 * The FamilyFooter: its links and the site's own extras on one row that wraps, over a hairline.
 *
 * @internal
 */
const familyFooterClass =
  "box-border flex w-full min-w-0 flex-wrap items-center justify-between gap-x-6 gap-y-2 border-0 border-t border-solid border-border bg-background py-4 text-muted-foreground " +
  "ps-[max(1rem,env(safe-area-inset-left,0px))] pe-[max(1rem,env(safe-area-inset-right,0px))]";

/**
 * The development messages FamilyBar and FamilyFooter share: a `current` that is not a link's id, and a repeated link id.
 *
 * @internal
 */
function familyWarnings(component: string, links: readonly { id: string }[], current: string | undefined): DevWarning[] {
  const ids = links.map((link) => link.id);
  const twice = ids.find((id, index) => ids.indexOf(id) !== index);
  return [
    current !== undefined && !ids.includes(current) && [`current "${current}" matches no link's id`, `<${component} current="${ids[0] ?? "home"}">`],
    twice !== undefined && [`two links have the id "${twice}"`, `links={[{ id: "${twice}", … }, { id: "${twice}-2", … }]}`],
  ];
}
