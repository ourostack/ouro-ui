import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type JSX, type ReactNode, type RefObject } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Command } from "@/registry/ouro/components/ouro/command/command";
import { FamilyBar } from "@/registry/ouro/components/ouro/family-bar/family-bar";
import { FamilyFooter } from "@/registry/ouro/components/ouro/family-bar/family-footer";
import { Popover } from "@/registry/ouro/components/ouro/popover/popover";
import { Kbd } from "@/registry/ouro/components/ouro/kbd/kbd";
import { Sheet } from "@/registry/ouro/components/ouro/sheet/sheet";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { useCommandShortcut } from "@/registry/ouro/lib/ouro/use-command-shortcut";
import { HxLogo } from "../src/components/brand";
import { FAMILY, FAMILY_CURRENT } from "../src/family";
import { COMPONENT_GROUPS, FAMILY_LINES, GUIDES, HOME, PARTS, PLATFORMS, PROOF, SLOT_NAMES, SOURCE, type Page, type Slot } from "./ia";

/* ---------------------------------------------------------------- where you are */

const readHash = (): string => {
  const raw = decodeURIComponent(location.hash.slice(1));
  return raw.startsWith("/") ? raw : "/";
};
const subscribe = (on: () => void) => {
  addEventListener("hashchange", on);
  return () => removeEventListener("hashchange", on);
};
/** The page you are on in the mockup: the hash, `#/apple/`. */
export function usePath(): string {
  return useSyncExternalStore(subscribe, readHash, () => "/");
}

export const isAway = (path: string) => !path.startsWith("/");
export const hrefOf = (path: string) => (isAway(path) ? path : `#${path}`);

/* ---------------------------------------------------------------- links */

export const row =
  "relative flex min-h-11 pointer-fine:min-h-8 items-center gap-3 rounded-ouro-lg px-3 no-underline outline-ring -outline-offset-2 touch-manipulation [-webkit-tap-highlight-color:transparent] " +
  "transition-colors duration-(--ouro-duration-fast) ease-[ease] focus-visible:outline-2 focus-visible:outline-solid pointer-fine:hover:bg-accent active:bg-accent";

/** A page link: its name, its line under it when there is room, and the mark when you are on it. */
export function PageLink({ page, here, hint = true, className, size = "md", hidden, shown }: { page: Page; here: string; hint?: boolean; className?: string; size?: "md" | "lg" | "sm"; hidden?: string; shown?: ReactNode }): JSX.Element {
  const current = page.path === here;
  return (
    <a
      href={hrefOf(page.path)}
      aria-label={shown ? page.label : undefined}
      aria-current={current ? "page" : undefined}
      className={cn(row, "py-1.5 pointer-fine:py-1 aria-[current=page]:bg-[color-mix(in_oklab,var(--primary)_10%,transparent)]", className)}
      {...(isAway(page.path) ? { target: "_blank", rel: "noreferrer" } : {})}
    >
      <span className="grid min-w-0 flex-1 gap-0.5 whitespace-nowrap max-sm:whitespace-normal max-sm:text-balance">
        <span
          className={cn(
            "font-medium text-foreground",
            size === "lg" && "font-[family-name:var(--font-heading,inherit)] text-lg leading-6 font-semibold tracking-[-0.01em]",
            size === "md" && "text-[0.9375rem] leading-5",
            size === "sm" && "text-sm leading-5 text-muted-foreground",
          )}
        >
          {shown ?? page.label}
          {hidden && <span className="sr-only"> {hidden}</span>}
          {isAway(page.path) && (
            <span aria-hidden="true" className="ms-1 text-muted-foreground">
              ↗
            </span>
          )}
        </span>
        {hint && page.hint && <span className="text-[0.8125rem] leading-[1.125rem] text-muted-foreground">{page.hint}</span>}
      </span>
      {current && <Here />}
    </a>
  );
}

/** The lit porthole beside the page you are on. */
export function Here(): JSX.Element {
  return (
    <span aria-hidden="true" className="ms-auto relative inline-flex size-2.5 shrink-0">
      <span className="absolute inset-0 animate-ping rounded-full bg-primary/50 [animation-iteration-count:2] [corner-shape:round] motion-reduce:hidden" />
      <span className="relative size-2.5 rounded-full border-2 border-solid border-primary bg-primary/30 [corner-shape:round]" />
    </span>
  );
}

/** A small heading over a list of links. */
export function Eyebrow({ children, id }: { children: ReactNode; id?: string }): JSX.Element {
  return (
    <p id={id} className="m-0 px-3 pt-1 pb-1 text-xs leading-4 font-semibold tracking-[0.08em] text-muted-foreground uppercase">
      {children}
    </p>
  );
}

export function LinkList({ pages, here, hint = true, label, columns = 1 }: { pages: readonly Page[]; here: string; hint?: boolean; label?: string; columns?: 1 | 2 | 3 }): JSX.Element {
  const id = useId();
  return (
    <div className="grid content-start">
      {label && <Eyebrow id={id}>{label}</Eyebrow>}
      <ul aria-labelledby={label ? id : undefined} className={cn("m-0 grid list-none gap-0.5 p-0", columns === 2 && "sm:grid-cols-2", columns === 3 && "sm:grid-cols-3")}>
        {pages.map((page) => (
          <li key={page.label + page.path}>
            <PageLink page={page} here={here} hint={hint} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------------------------------------------------------------- the platforms, always alike */

const PLATFORM_GLYPH: Record<string, string> = { web: "◐", apple: "◓", windows: "◑", android: "◒" };

/** A platform's name as every mockup writes it: a porthole glyph that turns a quarter per platform, the name, the kit. */
export function PlatformName({ id, name, kit, className }: { id: string; name: string; kit: string; className?: string }): JSX.Element {
  return (
    <span className={cn("inline-flex items-baseline gap-2", className)}>
      <span aria-hidden="true" className="text-primary">
        {PLATFORM_GLYPH[id]}
      </span>
      <span className="font-[family-name:var(--font-heading,inherit)] font-semibold text-foreground">{name}</span>
      <span className="text-xs text-muted-foreground">{kit}</span>
    </span>
  );
}

/**
 * The four platforms side by side, each with the same slots in the same order: the one shape every mockup uses, so
 * siblings look like siblings. Two columns on a phone, four from 640px.
 */
export function PlatformGrid({ slots, here, label = "Platforms", compact = false }: { slots: readonly Slot[]; here: string; label?: string; compact?: boolean }): JSX.Element {
  const id = useId();
  return (
    <section aria-labelledby={id} className="grid gap-1">
      <Eyebrow id={id}>{label}</Eyebrow>
      <ul className={cn("m-0 grid list-none gap-x-2 gap-y-3 p-0", compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-[repeat(4,max-content)] sm:gap-x-6")}>
        {PLATFORMS.map((p) => (
          <li key={p.id} className="grid content-start gap-0.5">
            <span className="px-3 pb-0.5">
              <PlatformName id={p.id} name={p.name} kit={p.kit} />
            </span>
            <ul aria-label={p.name} className="m-0 grid list-none gap-0.5 p-0">
              {slots.map((slot) => (
                <li key={slot}>
                  <PageLink page={{ label: SLOT_NAMES[slot], path: p[slot].path }} hidden={slot === "start" ? `on ${p.name}` : `for ${p.name}`} here={here} hint={false} size="sm" />
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** One part on the four platforms, one link each, side by side: "Ouro HX for Apple", shown as "Apple · SwiftUI". */
export function PlatformRow({ slot, here, label }: { slot: "hx" | "ax"; here: string; label: string }): JSX.Element {
  const id = useId();
  return (
    <section aria-labelledby={id} className="grid content-start">
      <Eyebrow id={id}>{label}</Eyebrow>
      <ul className="m-0 grid list-none grid-cols-2 gap-0.5 p-0 sm:grid-flow-col sm:grid-cols-none sm:auto-cols-max">
        {PLATFORMS.map((p) => (
          <li key={p.id}>
            <PageLink page={p[slot]} here={here} hint={false} shown={<PlatformName id={p.id} name={p.name} kit={p.kit} />} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Keeps a panel inside the screen: its most height is what is left under its top, less a margin, so it never runs off
 * the bottom. Content is laid out to fit; a scroll inside the panel is the last resort.
 */
export function useFitToScreen(ref: RefObject<HTMLElement | null>, active: unknown): void {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !active) return;
    const fit = () => {
      el.style.maxHeight = `${Math.max(160, innerHeight - el.getBoundingClientRect().top - 12)}px`;
    };
    fit();
    addEventListener("resize", fit);
    addEventListener("scroll", fit, { passive: true });
    return () => {
      removeEventListener("resize", fit);
      removeEventListener("scroll", fit);
    };
  }, [ref, active]);
}

/* ---------------------------------------------------------------- the disclosure bar (APG disclosure navigation) */

/** NN/g's mega menu timings: rest 0.5 s before a hover opens, close 0.5 s after the pointer leaves both. */
export const HOVER_OPEN_MS = 500;
export const HOVER_CLOSE_MS = 500;

export interface BarItem {
  id: string;
  label: string;
  /** A plain link, or a button that discloses `panel`. */
  href?: string;
  panel?: ReactNode;
  /** The panel takes the bar's whole width, for a panel whose content wraps to fit (Docs). */
  wide?: boolean;
}

/**
 * A row of links and disclosure buttons, each button with its panel under the bar (WAI-ARIA APG's disclosure
 * navigation, not a menubar). A click opens or closes at once; a mouse resting on a button opens it after
 * HOVER_OPEN_MS, and once one is open the others open on hover at once. Escape closes and puts focus back on the
 * button; focus or a press leaving the nav closes it; following a link closes it.
 */
export function DisclosureBar({ items, label = "Main", section }: { items: readonly BarItem[]; label?: string; section: string | undefined }): JSX.Element {
  const [open, setOpen] = useState<string | null>(null);
  const shown = useRef<HTMLDivElement>(null);
  useFitToScreen(shown, open);
  const openRef = useRef<string | null>(null);
  openRef.current = open;
  const nav = useRef<HTMLElement>(null);
  const triggers = useRef(new Map<string, HTMLButtonElement>());
  const timer = useRef<number | undefined>(undefined);
  const hoveredOpenAt = useRef(0);
  const base = useId();
  const stop = () => window.clearTimeout(timer.current);
  const show = (id: string | null, byHover = false) => {
    stop();
    if (byHover && id) hoveredOpenAt.current = performance.now();
    setOpen(id);
  };
  const closeLater = () => {
    stop();
    timer.current = window.setTimeout(() => setOpen(null), HOVER_CLOSE_MS);
  };
  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      if (!nav.current?.contains(event.target as Node)) setOpen(null);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);
  useEffect(() => stop, []);
  return (
    <nav
      ref={nav}
      aria-label={label}
      className="contents"
      onKeyDown={(event) => {
        if (event.key === "Escape" && openRef.current) {
          const id = openRef.current;
          setOpen(null);
          triggers.current.get(id)?.focus();
        }
      }}
      onBlur={(event) => {
        if (!nav.current?.contains(event.relatedTarget as Node | null)) setOpen(null);
      }}
      onClick={(event) => {
        if ((event.target as HTMLElement).closest("a")) setOpen(null);
      }}
    >
      <ul className="m-0 flex list-none items-center gap-0.5 p-0">
        {items.map((item, index) => {
          const here = item.id === section;
          if (!item.panel)
            return (
              <li key={item.id}>
                <a href={item.href} aria-current={here ? "true" : undefined} className={barItem}>
                  {item.label}
                </a>
              </li>
            );
          const expanded = open === item.id;
          return (
            <li key={item.id}>
              <button
                type="button"
                ref={(el) => {
                  if (el) triggers.current.set(item.id, el);
                }}
                aria-expanded={expanded}
                aria-controls={`${base}${item.id}`}
                data-lab-open={index === items.findIndex((i) => i.panel) ? "" : undefined}
                aria-current={here ? "true" : undefined}
                className={cn(barItem, "cursor-pointer border-0 bg-transparent")}
                onClick={() => {
                  // A click right after a hover opened it keeps it open, rather than closing what the person just saw.
                  if (expanded && performance.now() - hoveredOpenAt.current < 700) return show(item.id);
                  show(expanded ? null : item.id);
                }}
                onPointerEnter={(event) => {
                  if (event.pointerType !== "mouse") return;
                  stop();
                  if (openRef.current) show(item.id, true);
                  else timer.current = window.setTimeout(() => show(item.id, true), HOVER_OPEN_MS);
                }}
                onPointerLeave={(event) => {
                  if (event.pointerType !== "mouse") return;
                  if (openRef.current) closeLater();
                  else stop();
                }}
              >
                {item.label}
                <Chevron open={expanded} />
              </button>
            </li>
          );
        })}
      </ul>
      {items
        .filter((item) => item.panel)
        .map((item) => (
          <div
            key={item.id}
            id={`${base}${item.id}`}
            hidden={open !== item.id}
            onPointerEnter={(event) => event.pointerType === "mouse" && stop()}
            onPointerLeave={(event) => event.pointerType === "mouse" && closeLater()}
            className="lab-panel absolute inset-x-0 top-full z-50 pt-2"
          >
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
              <div
                ref={open === item.id ? shown : undefined}
                data-lab-panel=""
                className={cn("overflow-y-auto overscroll-contain rounded-ouro-3xl bg-popover p-4 text-popover-foreground shadow-(--shadow-lg) ring-1 ring-border/60 sm:p-5", item.wide ? "w-full" : "w-max max-w-full")}
              >
                {item.panel}
              </div>
            </div>
          </div>
        ))}
    </nav>
  );
}

export const barItem =
  "relative inline-flex min-h-11 items-center gap-1 rounded-ouro-lg px-3 text-[0.9375rem] font-medium text-muted-foreground no-underline outline-ring touch-manipulation " +
  "transition-colors duration-(--ouro-duration-fast) ease-[ease] focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-2 " +
  "pointer-fine:hover:bg-accent pointer-fine:hover:text-foreground aria-expanded:bg-accent aria-expanded:text-foreground aria-[current=true]:text-foreground " +
  "after:absolute after:inset-x-3 after:bottom-1.5 after:h-0.5 after:rounded-full after:bg-primary after:opacity-0 aria-[current=true]:after:opacity-100";

export function Chevron({ open, className }: { open: boolean; className?: string }): JSX.Element {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("size-3.5 transition-transform duration-(--ouro-duration-fast) ease-(--ouro-ease-out) motion-reduce:transition-none", open && "rotate-180", className)}
    >
      <path d="m4 6 4 4 4-4" />
    </svg>
  );
}

/* ---------------------------------------------------------------- search, always in view */

const go = (path: string) => {
  if (isAway(path)) window.open(path, "_blank", "noreferrer");
  else location.hash = path;
};

const item = (page: Page, prefix = "") => ({
  label: prefix ? `${prefix}: ${page.label}` : page.label,
  value: `${prefix}${page.label}${page.path}`,
  description: page.hint,
  navigates: true,
  onSelect: () => go(page.path),
});

/** Every page, grouped as the site is: the search every mockup keeps in view. */
export function paletteGroups() {
  return [
    { label: "Ouro UI", items: [HOME, ...HOME.pages].map((p) => item(p)) },
    { label: "Parts", items: PARTS.flatMap((part) => [item(part), ...part.pages.map((p) => item(p, part.label))]) },
    ...PLATFORMS.map((p) => ({ label: `For ${p.name}`, items: [p.overview, p.hx, p.ax, { ...p.start, label: `Get started on ${p.name}` }].map((page) => item(page)) })),
    { label: "Proof", items: [PROOF, ...PROOF.pages].map((p) => item(p)) },
    { label: "Components", items: COMPONENT_GROUPS.map((p) => item({ ...p, hint: "Ouro HX for web" }, "Components")) },
    ...GUIDES.map((group) => ({ label: `Guides: ${group.label}`, items: group.pages.map((p) => item(p)) })),
    { label: "Elsewhere", items: [item(SOURCE)] },
  ];
}

/** ⌘K anywhere, and the Search button that shows it. */
export function useSearch(): [boolean, (open: boolean) => void] {
  const [open, setOpen] = useCommandShortcut("mod+k");
  return [open, (next: boolean) => setOpen(next)];
}

export function SearchPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }): JSX.Element {
  return <Command title="Search Ouro UI" open={open} onOpenChange={onOpenChange} items={paletteGroups()} placeholder="Search every page…" searchLabel="Search every page" highlightMatches />;
}

/** The desktop search: as wide as a field, with its shortcut. */
export function SearchButton({ onOpen, wide = false }: { onOpen: () => void; wide?: boolean }): JSX.Element {
  return (
    <Button variant="outline" tone="secondary" size="sm" onClick={onOpen} aria-haspopup="dialog" className={cn("[&>[data-ouro-label]]:flex-1", wide ? "w-full max-w-md" : "min-w-[9rem]")}>
      <SearchGlyph />
      <span className="text-start">{wide ? "Search or jump to a page" : "Search"}</span>
      <span aria-hidden="true" className="ms-auto">
        <Kbd keys={["mod", "k"]} />
      </span>
    </Button>
  );
}

/** The phone's search: an icon a thumb can hit, always on the bar. */
export function SearchIconButton({ onOpen }: { onOpen: () => void }): JSX.Element {
  return (
    <button type="button" aria-label="Search" aria-haspopup="dialog" onClick={onOpen} className={iconButton}>
      <SearchGlyph className="size-5" />
    </button>
  );
}

export const iconButton =
  "inline-flex size-11 cursor-pointer items-center justify-center rounded-ouro-lg border-0 bg-transparent p-0 text-foreground outline-ring touch-manipulation [-webkit-tap-highlight-color:transparent] " +
  "transition-colors duration-(--ouro-duration-fast) ease-[ease] focus-visible:outline-2 focus-visible:outline-solid pointer-fine:hover:bg-accent active:bg-accent";

export function SearchGlyph({ className = "size-4" }: { className?: string }): JSX.Element {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" className={className}>
      <circle cx="7" cy="7" r="4.25" />
      <path d="m10.25 10.25 3 3" />
    </svg>
  );
}

/* ---------------------------------------------------------------- the frame every mockup shares */

export function Brand(): JSX.Element {
  return (
    <a
      href="#/"
      className="-ms-1 inline-flex min-h-11 shrink-0 items-center gap-2 rounded-ouro-lg px-1 font-[family-name:var(--font-heading,inherit)] text-lg font-semibold tracking-[-0.015em] text-foreground no-underline outline-ring focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2"
    >
      <HxLogo size={32} className="size-8" />
      Ouro UI
    </a>
  );
}

/** The brand, and in switcher mode the family switcher beside it. */
export function BrandArea(): JSX.Element {
  return (
    <div className="flex shrink-0 items-center">
      <Brand />
      {FAMILY_MODE === "switcher" && <FamilySwitcher />}
    </div>
  );
}

/* ---------------------------------------------------------------- the Ouro family: four ways to show it */

/** How the family's sites show: today's strip, a switcher by the logo, a slim strip that hides on the way down, or the footer only. */
export type FamilyMode = "strip" | "switcher" | "slim" | "footer";
export const FAMILY_MODES: ReadonlyArray<{ id: FamilyMode; label: string }> = [
  { id: "strip", label: "Strip" },
  { id: "switcher", label: "Switcher" },
  { id: "slim", label: "Slim" },
  { id: "footer", label: "Footer" },
];
const wanted = typeof location === "undefined" ? null : new URLSearchParams(location.search).get("f");
export const FAMILY_MODE: FamilyMode = FAMILY_MODES.some((mode) => mode.id === wanted) ? (wanted as FamilyMode) : "strip";

/** Today's strip over the header, from 1024px. */
export function FamilyStrip(): JSX.Element {
  return <FamilyBar links={FAMILY} current={FAMILY_CURRENT} className="px-4 max-lg:hidden sm:px-6 lg:px-8" />;
}

/** The family as one line each, for the switcher and the slim strip's names. */
const familyLabel = (id: string, label: string) => (id === "github" ? "GitHub (ourostack)" : label);

/** A 24px strip, small type, that slides away as you scroll down and back as you scroll up. From 640px. */
function SlimStrip(): JSX.Element {
  return (
    <nav aria-label="Ouro family" className="h-6 border-0 border-b border-solid border-border bg-background max-sm:hidden">
      <ul className="m-0 mx-auto flex h-full max-w-7xl list-none items-stretch gap-4 px-4 sm:px-6 lg:px-8">
        <li aria-hidden="true" className="flex items-center text-[0.6875rem] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
          Ouro family
        </li>
        {FAMILY.map((site) => (
          <li key={site.id} className="flex">
            <a
              href={site.href}
              aria-current={site.id === FAMILY_CURRENT ? "true" : undefined}
              className="relative inline-flex items-center text-xs text-muted-foreground no-underline outline-ring focus-visible:outline-2 focus-visible:outline-solid pointer-fine:hover:text-foreground aria-[current=true]:font-semibold aria-[current=true]:text-foreground pointer-coarse:min-h-11"
            >
              {familyLabel(site.id, site.label)}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Whether the page is being scrolled down (true) or up (false), past the first 40px. */
function useScrollingDown(): boolean {
  const [down, setDown] = useState(false);
  useEffect(() => {
    let last = scrollY;
    const on = () => {
      const now = scrollY;
      if (Math.abs(now - last) < 6) return;
      setDown(now > last && now > 40);
      last = now;
    };
    addEventListener("scroll", on, { passive: true });
    return () => removeEventListener("scroll", on);
  }, []);
  return down;
}

/** The family's sites and the bar under them, as the chosen mode shows them. */
export function Masthead({ children }: { children: ReactNode }): JSX.Element {
  const down = useScrollingDown();
  if (FAMILY_MODE === "slim")
    return (
      <div
        data-lab-masthead=""
        className="sticky top-0 z-40 sm:transition-transform sm:duration-(--ouro-duration-base) sm:ease-(--ouro-ease-out) motion-reduce:transition-none sm:data-[down]:-translate-y-6 [&>*]:static"
        data-down={down ? "" : undefined}
      >
        <SlimStrip />
        {children}
      </div>
    );
  return (
    <>
      {FAMILY_MODE === "strip" && <FamilyStrip />}
      {children}
    </>
  );
}

/** The switcher: a button by the logo that drops the family's sites down, each with its line. A sheet on a phone. */
function FamilySwitcher(): JSX.Element {
  return (
    <Popover
      title="The Ouro family"
      description="Ari's sites, in one order everywhere."
      align="start"
      trigger={
        <button type="button" aria-label="Ouro family" className={cn(iconButton, "-ms-1 w-9 pointer-coarse:w-11")}>
          <Chevron open={false} className="size-4" />
        </button>
      }
    >
      <ul className="m-0 grid list-none gap-0.5 p-0">
        {FAMILY.map((site) => {
          const here = site.id === FAMILY_CURRENT;
          return (
            <li key={site.id}>
              <a href={site.href} aria-current={here ? "true" : undefined} className={cn(row, "py-1.5 aria-[current=true]:bg-[color-mix(in_oklab,var(--primary)_10%,transparent)]")}>
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <span className="text-[0.9375rem] leading-5 font-medium text-foreground">
                    {familyLabel(site.id, site.label)}
                    {!here && (
                      <span aria-hidden="true" className="ms-1 text-muted-foreground">
                        ↗
                      </span>
                    )}
                  </span>
                  <span className="text-[0.8125rem] leading-[1.125rem] text-muted-foreground">{FAMILY_LINES[site.id]}</span>
                </span>
                {here && <Here />}
              </a>
            </li>
          );
        })}
      </ul>
    </Popover>
  );
}

/** The family's sites at the foot of a phone's menu: after the site's own sections, small and quiet. */
export function FamilyFoot(): JSX.Element | null {
  const id = useId();
  if (FAMILY_MODE === "switcher") return null;
  return (
    <section aria-labelledby={id} className="mt-6 grid gap-1 border-0 border-t border-solid border-border pt-4">
      <Eyebrow id={id}>The Ouro family</Eyebrow>
      <ul className="m-0 flex list-none flex-wrap gap-x-1 p-0">
        {FAMILY.map((site) => (
          <li key={site.id}>
            <a
              href={site.href}
              aria-current={site.id === FAMILY_CURRENT ? "true" : undefined}
              className={cn(row, "gap-1 text-sm text-muted-foreground aria-[current=true]:font-semibold aria-[current=true]:text-foreground")}
            >
              {familyLabel(site.id, site.label)}
              {site.id !== FAMILY_CURRENT && <span aria-hidden="true">↗</span>}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The page's footer: the family, as every Ouro site ends. */
export function SiteFooter(): JSX.Element {
  return <FamilyFooter links={FAMILY} current={FAMILY_CURRENT} className="mt-16" />;
}

/** The sticky bar under the family strip. */
export function Bar({ children, className }: { children: ReactNode; className?: string }): JSX.Element {
  return (
    <div className={cn("sticky top-0 z-40 border-0 border-b border-solid border-border bg-background", className)}>
      <div className="relative mx-auto flex min-h-16 max-w-7xl items-center gap-2 px-4 sm:px-6 lg:px-8">{children}</div>
    </div>
  );
}

/** A phone's menu: a sheet from the end edge that closes when a link in it is followed. */
export function PhoneMenu({ open, onOpenChange, children, title = "Menu", side = "right" }: { open: boolean; onOpenChange: (open: boolean) => void; children: ReactNode; title?: string; side?: "right" | "bottom" }): JSX.Element {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={title} side={side} className={side === "right" ? "w-[min(26rem,92vw)]" : undefined} {...(side === "bottom" ? { snapPoints: [0.92] } : {})}>
      <nav
        aria-label="Site"
        data-lab-panel=""
        onClick={(event) => {
          const link = (event.target as HTMLElement).closest("a");
          if (link && !link.target) onOpenChange(false);
        }}
      >
        {children}
      </nav>
    </Sheet>
  );
}

/** The Menu button: a word, not only an icon (NN/g). */
export function MenuButton({ onOpen, label = "Menu" }: { onOpen: () => void; label?: string }): JSX.Element {
  return (
    <button type="button" onClick={onOpen} aria-haspopup="dialog" data-lab-open="" className={cn(iconButton, "w-auto gap-1.5 px-3 text-[0.9375rem] font-medium")}>
      <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" className="size-4">
        <path d="M2.5 5h11M2.5 11h11" />
      </svg>
      {label}
    </button>
  );
}
