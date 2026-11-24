"use client";

import { useLayoutEffect, useRef, useState, type FocusEvent, type JSX, type ReactNode, type Ref } from "react";
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/ouro/class-name-check";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { RouterLink } from "@/registry/ouro/lib/ouro/router-link";
import { useDevWarnings } from "@/registry/ouro/lib/ouro/use-dev-messages";
import { TouchTarget } from "@/registry/ouro/lib/ouro/touch-target";
import { familyBarClass, familyBarLinkClass, familyHeadingClass, familyScrollerClass, familyWarnings } from "@/registry/ouro/components/ouro/family-bar/family-bar-styles";

// Scrolls `row` the least that brings `link` clear of the row's scroll padding; a link
// already clear stays put. Physical offsets, which hold in a right-to-left row too.
function reveal(row: HTMLElement, link: Element) {
  const pad = parseFloat(getComputedStyle(row).scrollPaddingLeft);
  const box = row.getBoundingClientRect();
  const at = link.getBoundingClientRect();
  row.scrollLeft += Math.min(at.left - box.left - pad, 0) || Math.max(at.right - box.right + pad, 0);
}

/** One site of a family, in a FamilyBar and a FamilyFooter. */
export interface FamilyLink {
  /** Names the site for `current`: "docs". It is not shown. */
  id: string;
  /** The site's name, the link's text: "Docs". */
  label: string;
  /** Where the link goes: the site's home page, "https://docs.example.com/". */
  href: string;
}

/** Props for {@link FamilyBar}. */
export interface FamilyBarProps {
  /** The family's sites, in order. Give every site the same list in the same order, so the bar reads the same on each. */
  links: readonly FamilyLink[];
  /** The `id` of the site being shown. Its link gets `aria-current="true"` and is semibold in the text colour, so the mark is not colour alone. */
  current?: string | undefined;
  /**
   * The small heading before the links, which says what the strip is. Screen readers hear it as the navigation's name, `label`,
   * and not again as text. `null` leaves it out. @default "Ouro family"
   */
  heading?: string | null | undefined;
  /** Names the navigation for screen readers. It is not shown. @default heading, or "Sites" when heading is null */
  label?: string | undefined;
  /** The family's mark or name, before the links. It stays in place while the links scroll. */
  brand?: ReactNode;
  /** Layout only: position (`sticky top-0`), grid placement. Appearance classes warn in development. */
  className?: string | undefined;
  ref?: Ref<HTMLElement> | undefined;

  /** Not a prop. FamilyBar takes `links`: `<FamilyBar links={[{ id: "docs", label: "Docs", href: "/" }]} />`. */
  items?: { 'Use <FamilyBar links={[{ id: "docs", label: "Docs", href: "/" }]} />': never };
  /** Not a prop. FamilyBar marks a site by its id, not by a path: `<FamilyBar current="docs">`. */
  currentPath?: { 'Use <FamilyBar current="docs">, the id of the site shown': never };
  /** Not rendered. The bar is `links`, `heading` and `brand`. */
  children?: { "Use links={[{ id, label, href }]} and brand={...}": never };
  /** Not a prop. The visible heading is `heading`: `<FamilyBar heading="Lantern family">`. */
  title?: { 'Use <FamilyBar heading="Lantern family">': never };
}

const example = '<FamilyBar links={[{ id: "docs", label: "Docs", href: "/" }]} />';

/**
 * The slim strip above a site's own header that links every site of a family, the same links in the same order on each,
 * after a small heading that says what it is ("Ouro family"). The site being shown is marked `aria-current="true"`,
 * semibold in the text colour. The strip has no surface and no line of its own: put it on the surface of the site's bar
 * below it, and let that bar draw the one line under both. A labelled `<nav>` of plain links: the server HTML is the whole
 * strip, so a page that never hydrates shows it as is. On a phone it is the same strip, one row that scrolls sideways
 * inside itself, never the page, and fades at its end edge while more is cut off there; every link is a 44px target on a
 * coarse pointer without growing the strip. In browsers that support it the current site's link in view needs no script.
 * Once hydrated, the row brings the current site's link into view in any browser when it is out of view. Links render
 * through `OuroProvider`'s `linkComponent`, so a link to the site's own path stays in its router.
 *
 * Use `Navbar` instead for a site's own pages, under the FamilyBar, and `FamilyFooter` for the same links at the foot of
 * the page.
 *
 * @group Navigation
 * @see https://ui.ouroboros.bot/docs/family-bar
 * @claim "links every site of a family" registry/ouro/components/ouro/family-bar/family-bar.test.tsx verify:testExists(registry/ouro/components/ouro/family-bar/family-bar.test.tsx::FamilyBar > renders a labelled nav of the family's links in order, small and muted, the current site marked with aria-current, semibold and in the text colour)
 * @claim "The strip has no surface and no line of its own" registry/ouro/components/ouro/family-bar/family-bar.test.tsx verify:testExists(registry/ouro/components/ouro/family-bar/family-bar.test.tsx::FamilyBar > is a slim strip with no surface or line of its own, 32px on a phone and 28px from 640px)
 * @claim "the server HTML is the whole strip" registry/ouro/components/ouro/family-bar/family-bar.test.tsx verify:testExists(registry/ouro/components/ouro/family-bar/family-bar.test.tsx::FamilyBar > renders the whole bar in the server HTML)
 * @claim "fades at its end edge while more is cut off there" registry/ouro/components/ouro/family-bar/family-bar.test.tsx verify:testExists(registry/ouro/components/ouro/family-bar/family-bar.test.tsx::FamilyBar > fades the row's end edge only while more of it is cut off there, in either direction)
 * @claim "every link is a 44px target on a coarse pointer without growing the strip" registry/ouro/components/ouro/family-bar/family-bar.touch.test.tsx verify:testExists(registry/ouro/components/ouro/family-bar/family-bar.touch.test.tsx::FamilyBar and FamilyFooter on a phone > give every link a 44px target, a two-letter name too, also in landscape, and the page never scrolls sideways)
 * @claim "In browsers that support it the current site's link in view needs no script" registry/ouro/components/ouro/family-bar/family-bar.test.tsx verify:testExists(registry/ouro/components/ouro/family-bar/family-bar.test.tsx::FamilyBar > starts the row with the current site's link in view from the server HTML alone, where the browser supports scroll-initial-target) verify:testExists(registry/ouro/components/ouro/family-bar/family-bar.test.tsx::FamilyBar > leaves the row where it starts when the current site's link is already in view, with or without script)
 *
 * @example
 * <FamilyBar
 *   heading="Lantern family"
 *   links={[
 *     { id: "home", label: "Lantern", href: "https://example.com/" },
 *     { id: "docs", label: "Docs", href: "https://docs.example.com/" },
 *     { id: "blog", label: "Blog", href: "https://blog.example.com/" },
 *   ]}
 *   current="docs"
 * />
 */
export function FamilyBar(props: FamilyBarProps): JSX.Element {
  const {
    links,
    current,
    heading = "Ouro family",
    label = heading ?? "Sites",
    brand,
    className,
    ref,
    // Guard props (hint types), dropped here so they never reach the DOM.
    items,
    currentPath,
    children,
    title,
  } = props;
  useAppearanceClassNameCheck(
    "FamilyBar",
    className,
    process.env.NODE_ENV !== "production"
      ? (token: string) => `remove "${token}"; FamilyBar sets its own look`
      : // Stryker disable next-line StringLiteral: production only; the check never runs there.
        /* istanbul ignore next @preserve -- production only */ "",
  );
  useDevWarnings(
    "FamilyBar",
    process.env.NODE_ENV !== "production"
      ? () => [
          ...familyWarnings("FamilyBar", links, current),
          items !== undefined && ["items is not a prop", example],
          currentPath !== undefined && ["currentPath is not a prop; current takes the id of the site being shown", '<FamilyBar current="docs">'],
          children !== undefined && ["children are not rendered", example],
          title !== undefined && ["title is not a prop; the visible heading is heading", '<FamilyBar heading="Lantern family">'],
        ]
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );

  const scroller = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);
  // Whether more of the row is cut off at its end, which fades there: measured when the row or its list first lays out
  // and on each change of size, and as it scrolls. scrollLeft runs negative in a right-to-left row.
  useLayoutEffect(() => {
    const row = scroller.current!;
    const measure = () => setMore(row.scrollWidth - row.clientWidth - Math.abs(row.scrollLeft) > 1);
    row.addEventListener("scroll", measure);
    const observer = new ResizeObserver(measure);
    observer.observe(row);
    observer.observe(row.lastElementChild!);
    // Stryker disable next-line BlockStatement: a listener or an observer left behind measures a row React has removed, and sets nothing.
    return () => {
      // Stryker disable next-line StringLiteral,CallExpression: a listener left behind on a removed row never hears a scroll.
      row.removeEventListener("scroll", measure);
      // Stryker disable next-line CallExpression: a detached row and list never resize; disconnecting frees the observer.
      observer.disconnect();
    };
  },
  // Stryker disable next-line ArrayDeclaration: equivalent; any constant dependency list runs this effect once, on mount.
  []);
  // Before paint, so the row never shows the current site's link out of view first; a link already in view, and a row
  // that fits, stay where they are.
  useLayoutEffect(() => {
    const row = scroller.current!;
    const link = row.querySelector('[aria-current="true"]');
    if (link) reveal(row, link);
  }, [current]);

  // The browser scrolls a focused link only until it is in view, which can leave it, outline and all, at the
  // row's edge. Keyboard focus brings it clear; a pointer's does not, so the link a click lands on never moves
  // under it.
  function clearOfEdge(event: FocusEvent<HTMLUListElement>) {
    if (event.target.matches(":focus-visible")) reveal(scroller.current!, event.target);
  }

  return (
    <nav ref={ref} data-ouro="family-bar" aria-label={label} className={cn(familyBarClass, className)}>
      {brand !== undefined && (
        <div data-ouro-family-brand="" className="flex shrink-0 items-center">
          {brand}
        </div>
      )}
      <div ref={scroller} data-ouro-family-row="" data-more={more || undefined} className={familyScrollerClass}>
        {heading !== null && (
          // The nav's name says it already; read twice, it would be noise.
          <span aria-hidden="true" data-ouro-family-heading="" data-slot="family-bar-heading" className={familyHeadingClass}>
            {heading}
          </span>
        )}
        {/* Room after the last link: the row's scroll width rounds the list's down, which would clip the last link and
            its outline by a fraction of a pixel when the row is scrolled to its end. */}
        <ul onFocus={clearOfEdge} className="m-0 flex w-max shrink-0 list-none items-stretch gap-2 p-0 pe-1">
          {links.map((link, index) => (
            <li key={index} className="relative flex snap-start">
              <RouterLink
                href={link.href}
                aria-current={link.id === current ? "true" : undefined}
                data-ouro-control="family-bar"
                data-ouro-part="link"
                className={familyBarLinkClass}
              >
                <TouchTarget />
                {link.label}
              </RouterLink>
              {link.id === current && (
                // Where the row starts with no script: the browser scrolls a scroll-initial-target to the row's start,
                // so this mark sits a row's width less twice the scroll padding before the link's end. The row starts
                // scrolled just far enough to bring the link clear of the edge, and not at all when it already is.
                <span aria-hidden="true" data-ouro-family-start="" className="pointer-events-none absolute top-0 end-[calc(100cqw-4rem)] size-px [scroll-initial-target:nearest]" />
              )}
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
