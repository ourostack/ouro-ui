import { useEffectEvent, useId, useLayoutEffect, useRef, type JSX, type ReactNode, type RefObject } from "react";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { GITHUB, href, normalizePath } from "../paths";
import { NAV_PLATFORMS, PhoneNav } from "./site-nav";

/*
 * The site's sections as data (the search palette and the docs menu's search read them), and the header's sheet whenever
 * the bar's panels do not fit: the phone's menu (site-nav.tsx), by platform or by part, then Proof and Docs, with the page
 * you are on marked (site/e2e/site-menu.spec.ts). The Ouro family's sites are in the strip over the bar at every width.
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

/**
 * The sections, in the bar's order: Ouro UI by part (AGENTS.md, Names), then Proof, the docs and the source. Each part's
 * platforms are pages under it, so the header is organised one way. The Apple pages come from their own list, so a new
 * one shows here too.
 */
export const SITE_SECTIONS: readonly MenuSection[] = [
  { label: "Home", href: "/", hint: "Peek through the porthole", pages: [{ label: "The Nautilus", href: "/nautilus/" }] },
  {
    label: "Ouro HX",
    href: "/hx/",
    hint: "Components for people's screens: web, Apple, Windows, Android",
    pages: NAV_PLATFORMS.flatMap((platform) => [
      { label: `Ouro UI for ${platform.name}`, href: platform.pages[0].path },
      { label: `Ouro HX for ${platform.name}`, href: platform.pages[1].path },
    ]),
  },
  { label: "Ouro AX", href: "/ax/", hint: "Doors for agents: CLI, MCP, App Intents and more", pages: NAV_PLATFORMS.map((platform) => ({ label: `Ouro AX for ${platform.name}`, href: platform.pages[2].path })) },
  { label: "Actions", href: "/actions/", hint: "One declaration, a button and a tool, with consent" },
  { label: "Composed UI", href: "/composed-ui/", hint: "Cards your agent sends, drawn natively" },
  {
    label: "X-ray",
    href: "/xray/",
    hint: "See inside screens and doors",
    pages: [
      { label: "Ouro Feel", href: "/apple/feel/" },
      { label: "Ouro Reins", href: "/apple/reins/" },
      { label: "Hackamore", href: "/hackamore/" },
    ],
  },
  {
    label: "Proof",
    href: "/proof/",
    hint: "The benchmark, model reviews, adoption, Ouro UI at a company",
    pages: [
      { label: "Adoption", href: "/adoption/" },
      { label: "Ouro Current", href: "/current/" },
    ],
  },
  {
    label: "Docs",
    href: "/docs/",
    hint: "Ouro HX for web's components, and the guides",
    pages: [
      { label: "Installing", href: "/docs/installing/" },
      { label: "Switching from shadcn", href: "/docs/switching-from-shadcn/" },
      { label: "Updating components", href: "/docs/updating/" },
    ],
  },
  { label: "GitHub", href: GITHUB, hint: "The blueprints, out in the open" },
];

/** A guide's name wherever the site lists it: a guide that shares a section's name ("Ouro AX") says it is the guide, so no two links are named alike. */
export const guideLabel = (label: string): string => (SITE_SECTIONS.some((section) => section.label === label) ? `${label} guide` : label);

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
      {/* Below sm, "you're here" crowds a short title into wrapping in the flex row (#3556); the dot alone still says it, since this whole mark is decorative (aria-current carries the meaning for assistive tech). */}
      <span className="hidden sm:inline">you’re here</span>
      <span className="relative inline-flex size-2.5">
        <span className="absolute inset-0 animate-ping rounded-full bg-primary/50 [animation-iteration-count:2] motion-reduce:hidden" />
        <span className="relative size-2.5 rounded-full border-2 border-solid border-primary bg-primary/30" />
      </span>
    </span>
  );
}

/**
 * Choosing the page you are on: the menu closes (the sheet sees the click) and the page stays where it is. With a modifier
 * key held it opens in a new tab or window, as any link does, and the menu stays.
 */
const stay = (event: { preventDefault(): void; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }) => {
  if (!(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)) event.preventDefault();
};

export function PageLink({ label, to, current }: { label: string; to: string; current: string }): JSX.Element {
  const here = to === current;
  return (
    <li>
      <a
        href={sectionHref(to)}
        aria-current={here ? "page" : undefined}
        onClick={here ? stay : undefined}
        className={cn(row, "py-2 text-base leading-5 text-muted-foreground aria-[current=page]:font-semibold aria-[current=page]:text-foreground")}
      >
        <span>
          {label}
          {!to.startsWith("/") && (
            <span aria-hidden="true" className="ms-1 text-muted-foreground">
              ↗
            </span>
          )}
        </span>
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
 * Calls `shown(true)` each time the sheet around `ref` shows and `shown(false)` as it hides. The Navbar builds its sheet
 * while the page is idle, and again once each close has finished, and keeps it hidden until a press: the menu inside
 * mounts ahead of each open, not as it opens, so this is when it opens. A sheet already showing as the menu mounts (one
 * pressed open before it was built) counts as shown.
 */
export function useSheetShown(ref: RefObject<HTMLElement | null>, shown: (on: boolean) => void): void {
  const latest = useEffectEvent(shown);
  useLayoutEffect(() => {
    const popup = ref.current?.closest<HTMLElement>('[data-ouro="sheet"]');
    if (!popup) return;
    let on = !popup.hidden;
    if (on) latest(true);
    // Before the frame that draws the change: the observer's callback runs as the press's own work ends.
    const observer = new MutationObserver(() => {
      if (on === !popup.hidden) return;
      on = !popup.hidden;
      latest(on);
    });
    observer.observe(popup, { attributes: true, attributeFilter: ["hidden"] });
    return () => {
      observer.disconnect();
      if (on) latest(false);
    };
  }, [ref]);
}

/**
 * The menu: the phone's navigation (site-nav.tsx). `more` adds to a part or to Docs by its label (the docs pages add their
 * guides under Docs and Ouro AX's parts under Ouro AX). It opens scrolled to the page you are on.
 */
export function SiteMenu({ page, more }: { page: string; more?: Readonly<Record<string, ReactNode>> | undefined }): JSX.Element {
  const current = normalizePath(page);
  const list = useRef<HTMLDivElement>(null);
  // Below the sheet's fold, the page you are on scrolls up into view each time the sheet opens, without moving the page
  // behind. Navbar builds its kept sheet afresh after each close, so each open starts from the sheet's top.
  const frame = useRef(0);
  useSheetShown(list, (on) => {
    cancelAnimationFrame(frame.current);
    if (!on) return;
    const reveal = (): boolean => {
      if (!list.current) return true;
      const link = list.current.querySelector<HTMLElement>('[aria-current="page"]:not([inert] *)');
      let scroller = list.current.parentElement;
      while (scroller && (scroller.scrollHeight <= scroller.clientHeight || !/auto|scroll/.test(getComputedStyle(scroller).overflowY))) scroller = scroller.parentElement;
      if (!link) return true;
      if (!scroller || scroller === document.scrollingElement || scroller === document.body) {
        const spot = link.getBoundingClientRect();
        return spot.height > 0 && spot.top >= 0 && spot.bottom <= innerHeight;
      }
      // Crossfade sizes its box from a ResizeObserver callback a render after it mounts (#3628), so a fresh sheet's
      // first frame can still have it at its starting (zero, unset) height: no transition has started yet, so
      // getAnimations() alone sees nothing and would let this commit against that still-zero layout. Wait for the
      // observer's first height (the style attribute lands), and for the box's only transition (height) to clear:
      // getAnimations() also lists one for a moment after it ends in WebKit, which keeps this waiting through that.
      const crossfade = list.current.querySelector<HTMLElement>("[data-site-crossfade]");
      if (crossfade && (crossfade.style.height === "" || crossfade.getAnimations().length > 0)) return false;
      scroller.scrollTop = 0;
      const box = scroller.getBoundingClientRect();
      const spot = link.getBoundingClientRect();
      const top = box.top + (scroller.querySelector<HTMLElement>("[data-site-menu-pinned]")?.offsetHeight ?? 0);
      if (spot.bottom > box.bottom - 16) {
        const third = spot.top - top - (box.bottom - top) / 3;
        const heading = (link.closest("[data-site-menu-group]")?.getBoundingClientRect().top ?? -Infinity) - top - 8;
        scroller.scrollTop += heading >= spot.top - top - (box.bottom - top) * 0.6 ? heading : third;
      }
      return true;
    };
    let tries = 0;
    frame.current = requestAnimationFrame(function again() {
      if (!reveal() && ++tries < 30) frame.current = requestAnimationFrame(again);
    });
  });
  return (
    <div ref={list} className="pt-2">
      <PhoneNav current={current} more={more} />
    </div>
  );
}

/**
 * Around the menu, in the sheet: a close button a thumb can see, beside the sheet's title (the sheet's own Close,
 * which a keyboard and a screen reader reach, shows only on focus, so this one is for pointers and stays out of the
 * tab order), a strip under the title that rows scroll away beneath, and on a phone, beside the
 * close button, the header's `tools` its bar has no room for.
 */
export function SiteMenuFrame({ children, tools }: { children: ReactNode; tools?: ReactNode }): JSX.Element {
  // While the menu is up, the root says so, and the Nautilus's fish wait under it (stage.css). From the frame after the
  // sheet draws, so the press's own frame does not also restyle the fish.
  const edge = useRef<HTMLDivElement>(null);
  const frame = useRef(0);
  useSheetShown(edge, (on) => {
    const root = document.documentElement;
    cancelAnimationFrame(frame.current);
    if (!on) {
      root.removeAttribute("data-site-menu-open");
      return;
    }
    frame.current = requestAnimationFrame(() => {
      frame.current = requestAnimationFrame(() => root.setAttribute("data-site-menu-open", ""));
    });
  });
  return (
    <>
      <div ref={edge} aria-hidden="true" className="pointer-events-none sticky -top-2 z-1 -mx-5 -mt-2 h-2 bg-popover" />
      {/* Placed from the box around the sheet's body (SheetContent), which starts under the sheet's 48px title row: 42px up
          puts the 44px pills 6px from the sheet's top, centred on its close button (12px down, 32px tall). */}
      {tools && <div className="absolute end-15 -top-10.5 z-3 flex gap-1 sm:hidden">{tools}</div>}
      {children}
    </>
  );
}
