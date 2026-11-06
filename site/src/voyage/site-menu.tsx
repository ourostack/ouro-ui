import { useId, useLayoutEffect, useRef, type JSX, type ReactNode } from "react";
import { SheetClose } from "@/registry/ouro/components/ouro/sheet/sheet-parts";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { APPLE_PAGES, GITHUB, href, normalizePath } from "../paths";

/*
 * The site's one menu, in the header's sheet whenever the bar's links do not fit: every section, a line on what is
 * there, and the section's own pages under it, with the page you are on marked. The Apple pages' row and the docs
 * sidebar hide on a phone, so this is the only menu there (site/e2e/site-menu.spec.ts).
 */

/** A page under a section, or a heading over some of them (`links`). */
export type MenuPage = { label: string; href: string } | { label: string; links: ReadonlyArray<{ label: string; href: string }> };

/** One of the site's sections: the bar's link, and in the menu a row with its line and its pages. */
export interface MenuSection {
  label: string;
  /** The site path, or a whole address for a page off the site. */
  href: string;
  /** The line under it in the menu. */
  hint: string;
  pages?: readonly MenuPage[];
}

/** The sections, in the bar's order. The Apple pages come from their own list, so a new one shows here too. */
export const SITE_SECTIONS: readonly MenuSection[] = [
  { label: "Home", href: "/", hint: "Peek through the porthole" },
  { label: "The Nautilus", href: "/nautilus/", hint: "Build a submarine, then sail her" },
  { label: "Ouro AX", href: "/ax/", hint: "A morning with an agent" },
  {
    label: "For Apple",
    href: "/apple/",
    hint: "Springs, haptics and Siri, in Swift",
    pages: APPLE_PAGES.slice(1).map((page) => ({ label: page.label, href: page.path })),
  },
  {
    label: "Docs",
    href: "/docs/installing/",
    hint: "Install it, switch to it, keep it fresh",
    pages: [
      { label: "Switching from shadcn", href: "/docs/switching-from-shadcn/" },
      { label: "Updating installed components", href: "/docs/updating/" },
    ],
  },
  { label: "Components", href: "/docs/", hint: "Levers, dials and portholes" },
  { label: "GitHub", href: GITHUB, hint: "The blueprints, out in the open" },
];

/** A section's link as the bar and the menu write it: under the site's base, or as it is when it leaves the site. */
export const sectionHref = (path: string): string => (path.startsWith("/") ? href(path) : path);

const row =
  "relative flex min-h-11 items-center gap-3 rounded-md px-3 no-underline outline-ring -outline-offset-2 [-webkit-tap-highlight-color:transparent] touch-manipulation " +
  "transition-colors duration-(--ouro-duration-fast) ease-[ease] focus-visible:outline-2 focus-visible:outline-solid " +
  "pointer-fine:hover:bg-accent active:bg-accent";

/** The mark beside the page you are on: a lit porthole, which pings twice like sonar as the menu opens. */
function Here(): JSX.Element {
  return (
    <span className="ms-auto inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-muted-foreground" aria-hidden="true">
      you’re here
      <span className="relative inline-flex size-2.5">
        <span className="absolute inset-0 animate-ping rounded-full bg-primary/50 [animation-iteration-count:2] motion-reduce:hidden" />
        <span className="relative size-2.5 rounded-full border-2 border-solid border-primary bg-primary/30" />
      </span>
    </span>
  );
}

function PageLink({ label, to, current }: { label: string; to: string; current: string }): JSX.Element {
  const here = to === current;
  return (
    <li>
      <a
        href={href(to)}
        aria-current={here ? "page" : undefined}
        className={cn(row, "py-2 text-[0.9375rem] leading-5 text-muted-foreground aria-[current=page]:font-semibold aria-[current=page]:text-foreground")}
      >
        {label}
        {here && <Here />}
      </a>
    </li>
  );
}

/** A section's pages: a line down their start edge, like the hull's ribs. */
export function MenuPages({ pages, current }: { pages: readonly MenuPage[]; current: string }): JSX.Element {
  const id = useId();
  return (
    <ul className="m-0 ms-4 grid list-none gap-0.5 border-0 border-s border-solid border-border p-0 ps-2">
      {pages.map((page, index) =>
        "links" in page ? (
          <li key={page.label} className="grid gap-0.5 pt-2">
            <p id={`${id}${index}`} className="m-0 px-3 py-1 text-xs leading-4 font-medium tracking-[0.08em] text-muted-foreground uppercase">{page.label}</p>
            <ul aria-labelledby={`${id}${index}`} className="m-0 grid list-none gap-0.5 p-0">
              {page.links.map((link) => (
                <PageLink key={link.href} label={link.label} to={link.href} current={current} />
              ))}
            </ul>
          </li>
        ) : (
          <PageLink key={page.href} label={page.label} to={page.href} current={current} />
        ),
      )}
    </ul>
  );
}

/**
 * The menu: each section with its line, then its pages. `more` adds to a section by its label (the docs pages add
 * their guides under Docs and every component under Components). It opens scrolled to the page you are on.
 */
export function SiteMenu({ page, more }: { page: string; more?: Readonly<Record<string, ReactNode>> | undefined }): JSX.Element {
  const current = normalizePath(page);
  const list = useRef<HTMLOListElement>(null);
  const id = useId();
  // Below the sheet's fold, the page you are on scrolls up into view as the sheet opens, without moving the page behind.
  useLayoutEffect(() => {
    const link = list.current!.querySelector<HTMLElement>('[aria-current="page"]');
    let scroller = list.current!.parentElement;
    while (scroller && scroller.scrollHeight <= scroller.clientHeight) scroller = scroller.parentElement;
    if (!link || !scroller || scroller === document.scrollingElement) return;
    const box = scroller.getBoundingClientRect();
    const spot = link.getBoundingClientRect();
    if (spot.bottom > box.bottom - 16) scroller.scrollTop += spot.top - box.top - box.height / 3;
  }, []);
  return (
    <ol ref={list} className="m-0 grid list-none gap-2 p-0">
      {SITE_SECTIONS.map((section, index) => {
        const here = section.href === current;
        const away = !section.href.startsWith("/");
        return (
          <li key={section.label} className="grid gap-0.5">
            <a
              href={sectionHref(section.href)}
              aria-current={here ? "page" : undefined}
              aria-describedby={`${id}${index}`}
              className={cn(row, "py-1.5")}
            >
              <span className="grid min-w-0 flex-1 gap-0.5">
                <span className="flex items-center gap-2 font-[family-name:var(--font-heading)] text-[1.0625rem] leading-6 font-semibold tracking-[-0.01em] text-foreground">
                  <span>
                    {section.label}
                    {away && (
                      <span aria-hidden="true" className="ms-1 text-muted-foreground">
                        ↗
                      </span>
                    )}
                  </span>
                  {here && <Here />}
                </span>
                {/* Heard as the link's description, not its name. */}
                <span id={`${id}${index}`} aria-hidden="true" className="text-sm leading-5 text-muted-foreground">
                  {section.hint}
                </span>
              </span>
            </a>
            {section.pages && <MenuPages pages={section.pages} current={current} />}
            {more?.[section.label]}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Around the menu, in the sheet: a close button a thumb can see, beside the sheet's title (the sheet's own Close,
 * which a keyboard and a screen reader reach, shows only on focus, so this one is for pointers and stays out of the
 * tab order), and a fade under the title, so rows scroll away beneath it instead of being cut.
 */
export function SiteMenuFrame({ children }: { children: ReactNode }): JSX.Element {
  return (
    <>
      <SheetClose
        render={
          <button
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            data-site-menu-close=""
            className="absolute end-3 top-2 z-2 inline-flex size-11 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent p-0 text-muted-foreground transition-colors duration-(--ouro-duration-fast) ease-[ease] [-webkit-tap-highlight-color:transparent] touch-manipulation pointer-fine:hover:bg-accent pointer-fine:hover:text-foreground active:bg-accent"
          />
        }
      >
        <svg viewBox="0 0 16 16" fill="none" className="size-4">
          <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </SheetClose>
      <div aria-hidden="true" className="pointer-events-none sticky top-0 z-1 -mx-5 -mt-2 h-4 bg-linear-to-b from-popover to-transparent" />
      {children}
    </>
  );
}
