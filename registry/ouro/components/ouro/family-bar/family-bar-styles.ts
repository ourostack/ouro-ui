export { familyBarClass, familyBarLinkClass, familyExtrasClass, familyFooterClass, familyFooterLinkClass, familyFooterListClass, familyHeadingClass, familyLinkClass, familyScrollerClass, familyWarnings };

import type { DevWarning } from "@/registry/ouro/lib/ouro/use-dev-messages";

/**
 * A link in a FamilyFooter: regular weight in the muted foreground, so the family's chrome never outweighs a site's own
 * navigation. The current site's link is in the foreground, underlined in the primary colour: the mark Navbar and
 * NavigationMenu give the current page, which forced colours keep. On a coarse pointer a link is at least 44px each way,
 * so a site with a two-letter name is as easy to tap as the rest.
 *
 * @claim "so the family's chrome never outweighs a site's own navigation" registry/ouro/components/ouro/family-bar/family-footer.test.tsx verify:testExists(registry/ouro/components/ouro/family-bar/family-footer.test.tsx::FamilyFooter > renders the family's links in order in a labelled nav, the current site marked with aria-current and a primary underline, and the site's extras after them)
 * @claim "On a coarse pointer a link is at least 44px each way, so a site with a two-letter name is as easy to tap as the rest." registry/ouro/components/ouro/family-bar/family-bar.touch.test.tsx verify:testExists(registry/ouro/components/ouro/family-bar/family-bar.touch.test.tsx::FamilyBar and FamilyFooter on a phone > give every link a 44px target, a two-letter name too, also in landscape, and the page never scrolls sideways)
 *
 * @internal
 */
const familyLinkClass =
  "relative m-0 box-border inline-flex min-h-ouro-11 min-w-ouro-11 pointer-fine:min-h-8 pointer-fine:min-w-0 items-center justify-center rounded-ouro-md px-2.5 whitespace-nowrap no-underline select-none touch-manipulation " +
  "text-base pointer-fine:text-sm leading-5 font-normal text-muted-foreground [-webkit-tap-highlight-color:transparent] " +
  "transition-colors duration-(--ouro-duration-fast) ease-[ease] pointer-fine:hover:text-foreground active:text-foreground " +
  "aria-[current=true]:text-foreground aria-[current=true]:underline aria-[current=true]:decoration-primary aria-[current=true]:decoration-2 " +
  "aria-[current=true]:underline-offset-5 aria-[current=true]:[text-decoration-skip-ink:none] " +
  "outline-ring -outline-offset-2 focus-visible:outline-2 focus-visible:outline-solid";

/**
 * A link in a FamilyBar: small, regular weight, in the muted foreground, so the family's strip never outweighs the site's
 * own bar under it. The current site's link is semibold in the foreground, a mark forced colours keep, since they keep
 * weight. It is as tall as the strip; on a coarse pointer its TouchTarget makes it a 44px target each way without growing
 * the strip. The focus outline is inset, inside the row that scrolls.
 *
 * @claim "so the family's strip never outweighs the site's own bar under it" registry/ouro/components/ouro/family-bar/family-bar.test.tsx verify:testExists(registry/ouro/components/ouro/family-bar/family-bar.test.tsx::FamilyBar > renders a labelled nav of the family's links in order, small and muted, the current site marked with aria-current, semibold and in the text colour)
 * @claim "on a coarse pointer its TouchTarget makes it a 44px target each way without growing the strip" registry/ouro/components/ouro/family-bar/family-bar.touch.test.tsx verify:testExists(registry/ouro/components/ouro/family-bar/family-bar.touch.test.tsx::FamilyBar and FamilyFooter on a phone > give every link a 44px target, a two-letter name too, also in landscape, and the page never scrolls sideways)
 *
 * @internal
 */
const familyBarLinkClass =
  "relative m-0 box-border inline-flex h-full items-center rounded-ouro-sm px-1 whitespace-nowrap no-underline select-none touch-manipulation " +
  "text-xs leading-4 font-normal text-muted-foreground [-webkit-tap-highlight-color:transparent] " +
  "transition-colors duration-(--ouro-duration-fast) ease-[ease] pointer-fine:hover:text-foreground active:text-foreground " +
  "aria-[current=true]:font-semibold aria-[current=true]:text-foreground " +
  "outline-ring -outline-offset-2 focus-visible:outline-2 focus-visible:outline-solid";

/**
 * The FamilyBar's visible heading, before the links: small capitals in the muted foreground that say what the strip is.
 *
 * @internal
 */
const familyHeadingClass =
  "m-0 flex shrink-0 items-center ps-1 text-[0.6875rem] leading-4 font-semibold tracking-[0.08em] whitespace-nowrap text-muted-foreground uppercase";

/**
 * The FamilyBar's strip: one slim row, 32px on a phone and 28px from 640px, with no surface and no line of its own. It
 * shares the surface of the site's bar under it, which draws the one line under both. It stays clear of a phone's rounded
 * corners. Its padding is the FamilyFooter's, and its heading's text, or without one its first link's, starts at the
 * padding's edge, as the footer's first link's does, so a page's strip, logo and footer can share one column edge.
 *
 * @claim "with no surface and no line of its own" registry/ouro/components/ouro/family-bar/family-bar.test.tsx verify:testExists(registry/ouro/components/ouro/family-bar/family-bar.test.tsx::FamilyBar > is a slim strip with no surface or line of its own, 32px on a phone and 28px from 640px)
 * @claim "its heading's text, or without one its first link's, starts at the padding's edge" registry/ouro/components/ouro/family-bar/family-bar.test.tsx verify:testExists(registry/ouro/components/ouro/family-bar/family-bar.test.tsx::FamilyBar > starts its heading's text, or its first link's, where the FamilyFooter's first link's does, at the padding's edge, or after its brand)
 *
 * @internal
 */
const familyBarClass =
  "box-border flex h-(--ouro-family-h) w-full min-w-0 items-center gap-3 border-0 bg-transparent text-foreground [--ouro-family-h:2rem] sm:[--ouro-family-h:1.75rem] " +
  "ps-[max(1rem,env(safe-area-inset-left,0px))] pe-[max(1rem,env(safe-area-inset-right,0px))]";

/**
 * The FamilyBar's row, its heading and links, which scrolls sideways inside itself when it does not fit, with no scroll
 * bar; a swipe comes to rest with a whole link at its start. While more of the row is cut off at its end, the row fades
 * out over its last 3rem there: the right in a left-to-right page, the left in a right-to-left one. On a coarse pointer
 * the row reaches 44px tall, past the strip on both sides, so the links' touch targets are not clipped. Without a brand
 * before it, the row starts a link's padding before the strip's padding, so the first text starts at the padding's edge.
 * A link the keyboard focuses is brought clear of the row's edge, outline and all.
 *
 * @claim "which scrolls sideways inside itself when it does not fit, with no scroll bar" registry/ouro/components/ouro/family-bar/family-bar.test.tsx verify:testExists(registry/ouro/components/ouro/family-bar/family-bar.test.tsx::FamilyBar > draws no scroll bar on the row for a mouse either, and does not snap it) verify:testExists(registry/ouro/components/ouro/family-bar/family-bar.touch.test.tsx::FamilyBar and FamilyFooter on a phone > keeps the FamilyBar on a phone as one row that scrolls with no scroll bar, and rests a swipe on a whole link)
 * @claim "On a coarse pointer the row reaches 44px tall, past the strip on both sides, so the links' touch targets are not clipped." registry/ouro/components/ouro/family-bar/family-bar.touch.test.tsx verify:testExists(registry/ouro/components/ouro/family-bar/family-bar.touch.test.tsx::FamilyBar and FamilyFooter on a phone > give every link a 44px target, a two-letter name too, also in landscape, and the page never scrolls sideways)
 * @claim "While more of the row is cut off at its end, the row fades out over its last 3rem there" registry/ouro/components/ouro/family-bar/family-bar.test.tsx verify:testExists(registry/ouro/components/ouro/family-bar/family-bar.test.tsx::FamilyBar > fades the row's end edge only while more of it is cut off there, in either direction)
 * @claim "A link the keyboard focuses is brought clear of the row's edge, outline and all." registry/ouro/components/ouro/family-bar/family-bar.test.tsx verify:testExists(registry/ouro/components/ouro/family-bar/family-bar.test.tsx::FamilyBar > brings each link the keyboard focuses clear of the row's edge, outline and all)
 *
 * @internal
 */
const familyScrollerClass =
  "@container box-content flex h-full min-w-0 flex-1 items-stretch gap-3 first:-ms-1 overflow-x-auto overflow-y-hidden overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden " +
  "pointer-coarse:snap-x pointer-coarse:snap-proximity scroll-px-8 " +
  "pointer-coarse:-my-[calc((44px-var(--ouro-family-h))/2)] pointer-coarse:py-[calc((44px-var(--ouro-family-h))/2)] " +
  // gradient-ok: the row has no scroll bar, so this fade is what says more sites are cut off at its end (approved for the family strip, 2026-11-24).
  "data-[more]:[mask-image:linear-gradient(to_right,#000_calc(100%-3rem),transparent)] rtl:data-[more]:[mask-image:linear-gradient(to_left,#000_calc(100%-3rem),transparent)]";

/**
 * A link in a FamilyFooter's list: a FamilyBar link that looks like a link at rest, underlined in the border colour and
 * in its own colour on hover; the current site's link is underlined in the primary colour. Forced colours paint the
 * links in the link colour, so there the current site's link alone keeps its underline. In a
 * narrow footer the links fill even columns, a whole row each 44px tall, rather than wrapping into ragged lines; a long
 * name wraps inside its column.
 *
 * @claim "Forced colours paint the links in the link colour, so there the current site's link alone keeps its underline" registry/ouro/components/ouro/family-bar/family-footer.test.tsx verify:testExists(registry/ouro/components/ouro/family-bar/family-footer.test.tsx::FamilyFooter > keeps only the current site's underline under forced colours, which drop colour)
 * @claim "In a narrow footer the links fill even columns, a whole row each 44px tall" registry/ouro/components/ouro/family-bar/family-footer.test.tsx verify:testExists(registry/ouro/components/ouro/family-bar/family-footer.test.tsx::FamilyFooter > lays its links in even columns of 44px rows on a narrow screen instead of ragged lines, and never scrolls sideways)
 *
 * @internal
 */
const familyFooterLinkClass =
  "underline decoration-border decoration-1 underline-offset-4 pointer-fine:not-aria-[current=true]:hover:decoration-current forced-colors:not-aria-[current=true]:no-underline " +
  "max-sm:min-h-ouro-11 max-sm:pointer-fine:min-h-ouro-11 max-sm:max-w-full max-sm:justify-start max-sm:whitespace-normal max-sm:text-start";

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
