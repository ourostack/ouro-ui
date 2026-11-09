"use client";

import type { JSX, ReactNode, Ref } from "react";
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/ouro/class-name-check";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { RouterLink } from "@/registry/ouro/lib/ouro/router-link";
import { useDevWarnings } from "@/registry/ouro/lib/ouro/use-dev-messages";
import type { FamilyLink } from "@/registry/ouro/components/ouro/family-bar/family-bar";
import { familyFooterClass, familyLinkClass, familyWarnings } from "@/registry/ouro/components/ouro/family-bar/family-bar-styles";

/** Props for {@link FamilyFooter}. */
export interface FamilyFooterProps {
  /** The family's sites, in order: the list the site's `FamilyBar` takes. */
  links: readonly FamilyLink[];
  /** The `id` of the site being shown, marked as in the `FamilyBar`: `aria-current="true"`, heavier text and a bar under it. */
  current?: string | undefined;
  /** Names the footer's navigation for screen readers, apart from the bar's. It is not shown. @default "All sites" */
  label?: string | undefined;
  /** The site's own extras, after the family's links: its Privacy and Terms links, a line about who makes it. */
  children?: ReactNode;
  /** Layout only: margins, grid placement (`mt-auto`). Appearance classes warn in development. */
  className?: string | undefined;
  ref?: Ref<HTMLDivElement> | undefined;

  /** Not a prop. FamilyFooter takes `links`: `<FamilyFooter links={[{ id: "docs", label: "Docs", href: "/" }]} />`. */
  items?: { 'Use <FamilyFooter links={[{ id: "docs", label: "Docs", href: "/" }]} />': never };
  /** Not a prop. FamilyFooter marks a site by its id, not by a path: `<FamilyFooter current="docs">`. */
  currentPath?: { 'Use <FamilyFooter current="docs">, the id of the site shown': never };
}

/**
 * The foot of a family's site: the `FamilyBar`'s links, in the same order, in a quiet row that wraps, with the site
 * being shown marked the same way, and the site's own extras (`children`) after them. The family's links are a
 * labelled `<nav>` of plain links, whole in the server HTML.
 *
 * Use `FamilyBar` instead for the strip above the site's header, and `Navbar` for a site's own pages.
 *
 * @group Navigation
 * @see https://ui.ouroboros.bot/docs/family-footer
 *
 * @example
 * <FamilyFooter links={sites} current="docs">
 *   <Link href="/privacy" tone="secondary">Privacy</Link>
 *   <Link href="/terms" tone="secondary">Terms</Link>
 * </FamilyFooter>
 */
export function FamilyFooter(props: FamilyFooterProps): JSX.Element {
  const {
    links,
    current,
    label = "All sites",
    children,
    className,
    ref,
    // Guard props (hint types), dropped here so they never reach the DOM.
    items,
    currentPath,
  } = props;
  useAppearanceClassNameCheck(
    "FamilyFooter",
    className,
    process.env.NODE_ENV !== "production"
      ? (token: string) => `remove "${token}"; FamilyFooter sets its own look`
      : // Stryker disable next-line StringLiteral: production only; the check never runs there.
        /* istanbul ignore next @preserve -- production only */ "",
  );
  useDevWarnings(
    "FamilyFooter",
    process.env.NODE_ENV !== "production"
      ? () => [
          ...familyWarnings("FamilyFooter", links, current),
          items !== undefined && ["items is not a prop", '<FamilyFooter links={[{ id: "docs", label: "Docs", href: "/" }]} />'],
          currentPath !== undefined && ["currentPath is not a prop; current takes the id of the site being shown", '<FamilyFooter current="docs">'],
        ]
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );

  return (
    <div ref={ref} data-ouro="family-footer" className={cn(familyFooterClass, className)}>
      <nav aria-label={label} className="min-w-0">
        <ul className="m-0 -ms-2.5 flex list-none flex-wrap items-center gap-x-0.5 p-0">
          {links.map((link, index) => (
            <li key={index} className="flex">
              <RouterLink
                href={link.href}
                aria-current={link.id === current ? "true" : undefined}
                data-ouro-control="family-footer"
                data-ouro-part="link"
                className={familyLinkClass}
              >
                {link.label}
              </RouterLink>
            </li>
          ))}
        </ul>
      </nav>
      {children !== undefined && (
        <div data-ouro-family-extras="" className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 text-base pointer-fine:text-sm">
          {children}
        </div>
      )}
    </div>
  );
}
