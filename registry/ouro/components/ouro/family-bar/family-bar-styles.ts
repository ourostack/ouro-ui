export { familyBarClass, familyFooterClass, familyFooterLinkClass, familyFooterListClass, familyLinkClass, familyScrollerClass, familyWarnings };

import type { DevWarning } from "@/registry/ouro/lib/ouro/use-dev-messages";

/**
 * A link in a FamilyBar or a FamilyFooter: regular weight in the muted foreground, so the family's chrome never
 * outweighs a site's own navigation. The current site's link is in the foreground with a bar under its text in the
 * primary colour, drawn as a border so that forced colours keep it. The focus outline is inset, inside the row that
 * scrolls. On a coarse pointer a link is at least 44px each way, so a site with a two-letter name is as easy to tap as
 * the rest.
 *
 * @claim "so the family's chrome never outweighs a site's own navigation" registry/ouro/components/ouro/family-bar/family-bar.test.tsx verify:testExists(registry/ouro/components/ouro/family-bar/family-bar.test.tsx::FamilyBar > renders a labelled nav of the family's links in order, at regular weight, the current site marked with aria-current, the text colour and a bar under it)
 * @claim "On a coarse pointer a link is at least 44px each way, so a site with a two-letter name is as easy to tap as the rest." registry/ouro/components/ouro/family-bar/family-bar.touch.test.tsx verify:testExists(registry/ouro/components/ouro/family-bar/family-bar.touch.test.tsx::FamilyBar and FamilyFooter on a phone > keep 44px targets with 16px text, a two-letter name too, also in landscape, and the page never scrolls sideways)
 *
 * @internal
 */
const familyLinkClass =
  "relative m-0 box-border inline-flex min-h-11 min-w-11 pointer-fine:min-h-8 pointer-fine:min-w-0 items-center justify-center rounded-md px-2.5 whitespace-nowrap no-underline select-none touch-manipulation " +
  "text-base pointer-fine:text-sm leading-5 font-normal text-muted-foreground [-webkit-tap-highlight-color:transparent] " +
  "transition-colors duration-(--ouro-duration-fast) ease-[ease] pointer-fine:hover:text-foreground active:text-foreground " +
  "aria-[current=true]:text-foreground " +
  "aria-[current=true]:after:pointer-events-none aria-[current=true]:after:absolute aria-[current=true]:after:inset-x-2.5 aria-[current=true]:after:bottom-1 " +
  "aria-[current=true]:after:border-0 aria-[current=true]:after:border-b-2 aria-[current=true]:after:border-solid aria-[current=true]:after:border-primary aria-[current=true]:after:content-[''] " +
  "outline-ring -outline-offset-2 focus-visible:outline-2 focus-visible:outline-solid";

/**
 * The FamilyBar's strip: one row on the page's own colour with a hairline under it, set apart from the site's own header
 * below it without a surface of its own, and clear of a phone's rounded corners.
 *
 * @internal
 */
const familyBarClass =
  "box-border flex w-full min-w-0 items-center gap-2 border-0 border-b border-solid border-border bg-background text-foreground " +
  "ps-[max(0.5rem,env(safe-area-inset-left,0px))] pe-[max(0.5rem,env(safe-area-inset-right,0px))]";

/**
 * The FamilyBar's row of links, which scrolls inside itself when it does not fit; a swipe comes to rest with a whole
 * link at its start, past the fade. A mouse and the keyboard scroll it exactly, without snapping. A finger swipes it, so on a coarse
 * pointer its scroll bar is hidden; a mouse wheel scrolls up and down, so on a fine pointer a thin, quiet scroll bar
 * stays to drag. Its scroll padding is as wide as the fade, and a link the keyboard focuses is brought clear of it,
 * outline and all.
 *
 * @claim "Its scroll padding is as wide as the fade, and a link the keyboard focuses is brought clear of it, outline and all." registry/ouro/components/ouro/family-bar/family-bar.test.tsx verify:testExists(registry/ouro/components/ouro/family-bar/family-bar.test.tsx::FamilyBar > brings each link the keyboard focuses clear of the row's fade, outline and all)
 *
 * @internal
 */
const familyScrollerClass =
  "@container min-w-0 flex-1 overflow-x-auto overflow-y-hidden overscroll-x-contain pointer-coarse:snap-x pointer-coarse:snap-proximity scroll-px-8 " +
  "[scrollbar-width:thin] [scrollbar-color:var(--border)_transparent] pointer-coarse:[scrollbar-width:none]";

/**
 * A link in a FamilyFooter's list: a FamilyBar link that looks like a link at rest, underlined in the border colour and
 * in its own colour on hover; the current site's link keeps its bar instead. In a narrow footer the links fill even
 * columns, a whole row each 44px tall, rather than wrapping into ragged lines; a long name wraps inside its column.
 *
 * @claim "In a narrow footer the links fill even columns, a whole row each 44px tall" registry/ouro/components/ouro/family-bar/family-footer.test.tsx verify:testExists(registry/ouro/components/ouro/family-bar/family-footer.test.tsx::FamilyFooter > lays its links in even columns of 44px rows on a narrow screen instead of ragged lines, and never scrolls sideways)
 *
 * @internal
 */
const familyFooterLinkClass =
  "underline decoration-border decoration-1 underline-offset-4 pointer-fine:hover:decoration-current aria-[current=true]:no-underline " +
  "max-sm:min-h-11 max-sm:pointer-fine:min-h-11 max-sm:max-w-full max-sm:justify-start max-sm:whitespace-normal max-sm:text-start";

/**
 * The FamilyFooter's list of links: even columns in a narrow footer, one row that wraps in a wide one.
 *
 * @internal
 */
const familyFooterListClass =
  "m-0 -ms-2.5 grid list-none grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] items-center gap-x-0.5 p-0 sm:flex sm:flex-wrap";

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
