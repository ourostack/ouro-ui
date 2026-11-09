"use client";

import { useLayoutEffect, useRef, type FocusEvent, type JSX, type ReactNode, type Ref } from "react";
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/ouro/class-name-check";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { RouterLink } from "@/registry/ouro/lib/ouro/router-link";
import { scrollFadeClass, scrollFadeStaticClass, useScrollFade } from "@/registry/ouro/lib/ouro/scroll-fade";
import { useDevWarnings } from "@/registry/ouro/lib/ouro/use-dev-messages";
import { familyBarClass, familyLinkClass, familyScrollerClass, familyWarnings } from "@/registry/ouro/components/ouro/family-bar/family-bar-styles";

// Scrolls `row` the least that brings `link` clear of the row's scroll padding, which is as wide as its fade; a link
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
  /**
   * The `id` of the site being shown. Its link gets `aria-current="true"`, the text colour and a bar under it, so the mark
   * is not colour alone.
   */
  current?: string | undefined;
  /** Names the navigation for screen readers. It is not shown. @default "Sites" */
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
  /** Not rendered. The bar is `links` and `brand`. */
  children?: { "Use links={[{ id, label, href }]} and brand={...}": never };
}

const example = '<FamilyBar links={[{ id: "docs", label: "Docs", href: "/" }]} />';

/**
 * The slim strip above a site's own header that links every site of a family, the same links in the same order on each,
 * with the site being shown marked `aria-current="true"`, in the text colour with a bar under it. A labelled `<nav>` of
 * plain links: the server HTML is the whole bar, so a page that never hydrates shows it as is. On a narrow screen the
 * row scrolls inside itself, never the page, and fades at the side that hides more links, so a name cut at the edge
 * reads as more to come. In browsers that support it the fade and the current site's link in view need no script.
 * Once hydrated, the row fades in any browser and brings the current site's link into view when it is out of view. Links render through `OuroProvider`'s `linkComponent`, so a link to the site's own path stays in its
 * router.
 *
 * Use `Navbar` instead for a site's own pages, under the FamilyBar, and `FamilyFooter` for the same links at the foot of
 * the page.
 *
 * @group Navigation
 * @see https://ui.ouroboros.bot/docs/family-bar
 * @claim "links every site of a family" registry/ouro/components/ouro/family-bar/family-bar.test.tsx verify:testExists(registry/ouro/components/ouro/family-bar/family-bar.test.tsx::FamilyBar > renders a labelled nav of the family's links in order, at regular weight, the current site marked with aria-current, the text colour and a bar under it)
 * @claim "the server HTML is the whole bar" registry/ouro/components/ouro/family-bar/family-bar.test.tsx verify:testExists(registry/ouro/components/ouro/family-bar/family-bar.test.tsx::FamilyBar > renders the whole bar in the server HTML)
 * @claim "fades at the side that hides more links" registry/ouro/components/ouro/family-bar/family-bar.test.tsx verify:testExists(registry/ouro/components/ouro/family-bar/family-bar.test.tsx::FamilyBar > fades the side of the row that hides more in the server HTML alone, with no script, and nothing in a row that fits)
 * @claim "In browsers that support it the fade and the current site's link in view need no script" registry/ouro/components/ouro/family-bar/family-bar.test.tsx verify:testExists(registry/ouro/components/ouro/family-bar/family-bar.test.tsx::FamilyBar > starts the row with the current site's link in view from the server HTML alone, where the browser supports scroll-initial-target) verify:testExists(registry/ouro/components/ouro/family-bar/family-bar.test.tsx::FamilyBar > fades the side of the row that hides more in the server HTML alone, with no script, and nothing in a row that fits) verify:testExists(registry/ouro/components/ouro/family-bar/family-bar.test.tsx::FamilyBar > leaves the row where it starts when the current site's link is already in view, with or without script)
 *
 * @example
 * <FamilyBar
 *   label="Sites"
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
    label = "Sites",
    brand,
    className,
    ref,
    // Guard props (hint types), dropped here so they never reach the DOM.
    items,
    currentPath,
    children,
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
        ]
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );

  const scroller = useRef<HTMLDivElement>(null);
  useScrollFade(scroller);
  // Before paint, so the row never shows the current site's link out of view first; a link already in view, and a row
  // that fits, stay where they are.
  useLayoutEffect(() => {
    const row = scroller.current!;
    const link = row.querySelector('[aria-current="true"]');
    if (link) reveal(row, link);
  }, [current]);

  // The browser scrolls a focused link only until it is in view, which can leave it, outline and all, in the fade at
  // the row's edge. Keyboard focus brings it clear; a pointer's does not, so the link a click lands on never moves
  // under it.
  function clearOfFade(event: FocusEvent<HTMLUListElement>) {
    if (event.target.matches(":focus-visible")) reveal(scroller.current!, event.target);
  }

  return (
    <nav ref={ref} data-ouro="family-bar" aria-label={label} className={cn(familyBarClass, className)}>
      {brand !== undefined && (
        <div data-ouro-family-brand="" className="flex shrink-0 items-center">
          {brand}
        </div>
      )}
      <div ref={scroller} data-ouro-family-row="" className={cn(familyScrollerClass, scrollFadeClass, scrollFadeStaticClass)}>
        {/* Room after the last link: the row's scroll width rounds the list's down, which would clip the last link and
            its outline by a fraction of a pixel when the row is scrolled to its end. */}
        {/* Where scroll-driven animations draw the fade with no script, the list is a pixel wider than a row it fits, so
            the row's scroll timeline never goes idle and holds a stale fade after the row widens to fit. */}
        <ul
          onFocus={clearOfFade}
          className="m-0 flex w-max list-none items-center gap-0.5 p-0 pe-1 supports-[animation-timeline:scroll()]:min-w-[calc(100%+1px)]"
        >
          {links.map((link, index) => (
            <li key={index} className="relative flex snap-start">
              <RouterLink
                href={link.href}
                aria-current={link.id === current ? "true" : undefined}
                data-ouro-control="family-bar"
                data-ouro-part="link"
                className={familyLinkClass}
              >
                {link.label}
              </RouterLink>
              {link.id === current && (
                // Where the row starts with no script: the browser scrolls a scroll-initial-target to the row's start,
                // so this mark sits a row's width less twice the fade before the link's end. The row starts scrolled
                // just far enough to bring the link clear of the fade, and not at all when it already is.
                <span aria-hidden="true" data-ouro-family-start="" className="pointer-events-none absolute top-0 end-[calc(100cqw-4rem)] size-px [scroll-initial-target:nearest]" />
              )}
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
