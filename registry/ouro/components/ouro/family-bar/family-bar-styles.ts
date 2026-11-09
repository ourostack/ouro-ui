export { familyBarClass, familyExtrasClass, familyFooterClass, familyFooterLinkClass, familyFooterListClass, familyLinkClass, familyScrollerClass, familyWarnings };

import type { DevWarning } from "@/registry/ouro/lib/ouro/use-dev-messages";

/**
 * A link in a FamilyBar or a FamilyFooter: regular weight in the muted foreground, so the family's chrome never
 * outweighs a site's own navigation. The current site's link is in the foreground, underlined in the primary colour:
 * the mark Navbar and NavigationMenu give the current page, which forced colours keep. The focus outline is inset,
 * inside the row that scrolls. On a coarse pointer a link is at least 44px each way, so a site with a two-letter name is
 * as easy to tap as the rest.
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
  "aria-[current=true]:text-foreground aria-[current=true]:underline aria-[current=true]:decoration-primary aria-[current=true]:decoration-2 " +
  "aria-[current=true]:underline-offset-5 aria-[current=true]:[text-decoration-skip-ink:none] " +
  "outline-ring -outline-offset-2 focus-visible:outline-2 focus-visible:outline-solid";

/**
 * The FamilyBar's strip: one row on the page's own colour with a hairline under it, set apart from the site's own header
 * below it without a surface of its own, and clear of a phone's rounded corners. Its padding is the FamilyFooter's, and
 * its first link's text, like the footer's, starts at the padding's edge, so a page's bar, logo and footer can share one
 * column edge.
 *
 * @claim "its first link's text, like the footer's, starts at the padding's edge" registry/ouro/components/ouro/family-bar/family-bar.test.tsx verify:testExists(registry/ouro/components/ouro/family-bar/family-bar.test.tsx::FamilyBar > starts its first link's text where the FamilyFooter's does, at the padding's edge, with the same padding, or after its brand)
 *
 * @internal
 */
const familyBarClass =
  "box-border flex w-full min-w-0 items-center gap-2 border-0 border-b border-solid border-border bg-background text-foreground " +
  "ps-[max(1rem,env(safe-area-inset-left,0px))] pe-[max(1rem,env(safe-area-inset-right,0px))]";

/**
 * The FamilyBar's row of links, which scrolls inside itself when it does not fit; a swipe comes to rest with a whole
 * link at its start, past the fade. Without a brand before it, the row starts a link's padding before the bar's padding,
 * so the first link's text starts at the padding's edge. A mouse and the keyboard scroll it exactly, without snapping. A finger swipes it, so on a coarse
 * pointer its scroll bar is hidden; a mouse wheel scrolls up and down, so on a fine pointer a thin, quiet scroll bar
 * stays to drag. Its scroll padding is as wide as the fade, and a link the keyboard focuses is brought clear of it,
 * outline and all.
 *
 * @claim "Its scroll padding is as wide as the fade, and a link the keyboard focuses is brought clear of it, outline and all." registry/ouro/components/ouro/family-bar/family-bar.test.tsx verify:testExists(registry/ouro/components/ouro/family-bar/family-bar.test.tsx::FamilyBar > brings each link the keyboard focuses clear of the row's fade, outline and all)
 *
 * @internal
 */
const familyScrollerClass =
  "@container min-w-0 flex-1 first:-ms-2.5 overflow-x-auto overflow-y-hidden overscroll-x-contain pointer-coarse:snap-x pointer-coarse:snap-proximity scroll-px-8 " +
  "[scrollbar-width:thin] [scrollbar-color:var(--border)_transparent] pointer-coarse:[scrollbar-width:none]";

/**
 * A link in a FamilyFooter's list: a FamilyBar link that looks like a link at rest, underlined in the border colour and
 * in its own colour on hover; the current site's link is underlined in the primary colour, as in the bar. Forced colours
 * paint every link in the link colour and drop its colour, so there only the current site's link keeps its underline,
 * as in the bar.
 *
 * @claim "there only the current site's link keeps its underline" registry/ouro/components/ouro/family-bar/family-footer.test.tsx verify:testExists(registry/ouro/components/ouro/family-bar/family-footer.test.tsx::FamilyFooter > keeps only the current site's underline under forced colours, which drop colour, as the bar does) In a narrow footer the links fill even
 * columns, a whole row each 44px tall, rather than wrapping into ragged lines; a long name wraps inside its column.
 *
 * @claim "In a narrow footer the links fill even columns, a whole row each 44px tall" registry/ouro/components/ouro/family-bar/family-footer.test.tsx verify:testExists(registry/ouro/components/ouro/family-bar/family-footer.test.tsx::FamilyFooter > lays its links in even columns of 44px rows on a narrow screen instead of ragged lines, and never scrolls sideways)
 *
 * @internal
 */
const familyFooterLinkClass =
  "underline decoration-border decoration-1 underline-offset-4 pointer-fine:not-aria-[current=true]:hover:decoration-current forced-colors:not-aria-[current=true]:no-underline " +
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
 * The FamilyFooter's area for the site's own extras: it takes the rest of the row after the family's links, or a whole
 * row of its own when it wraps, so the site lays out its extras across it, to the row's end edge. They sit at that end
 * on a wide screen, and at the start on a phone, under the links, until the site spreads them: `me-auto` on the first.
 *
 * @claim "it takes the rest of the row after the family's links, or a whole row of its own when it wraps" registry/ouro/components/ouro/family-bar/family-footer.test.tsx verify:testExists(registry/ouro/components/ouro/family-bar/family-footer.test.tsx::FamilyFooter > lets the site's extras fill the rest of the row, or a row of their own, to its end edge)
 *
 * @internal
 */
const familyExtrasClass =
  "flex min-w-0 flex-[1_1_auto] flex-wrap items-center justify-end gap-x-4 gap-y-1 text-base pointer-fine:text-sm max-sm:basis-full max-sm:justify-start";

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
