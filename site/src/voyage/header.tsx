import { useCallback, useEffect, useLayoutEffect, useRef, useState, type Dispatch, type JSX, type ReactNode, type SetStateAction } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { FamilyBar } from "@/registry/ouro/components/ouro/family-bar/family-bar";
import { SkipLink } from "@/registry/ouro/components/ouro/skip-link/skip-link";
import { Kbd } from "@/registry/ouro/components/ouro/kbd/kbd";
import { Navbar } from "@/registry/ouro/components/ouro/navbar/navbar";
import { SegmentedControl } from "@/registry/ouro/components/ouro/segmented-control/segmented-control";
import { SheetClose } from "@/registry/ouro/components/ouro/sheet/sheet-parts";
import { Switch } from "@/registry/ouro/components/ouro/switch/switch";
import { ariaKeyShortcuts } from "@/registry/ouro/lib/ouro/key-shortcuts";
import { usePlatform } from "@/registry/ouro/lib/ouro/use-platform";
import { useCommandShortcut } from "@/registry/ouro/lib/ouro/use-command-shortcut";
import { HxLogo } from "../components/brand";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { FAMILY, FAMILY_CURRENT } from "../family";
import { GUTTERS } from "../gutters";
import { href } from "../paths";
import type { Mode, ThemeChoice } from "../themes/prepaint";
import { originOf, previewTheme, useLiveClock, useSiteTheme } from "./theme-store";
import { ThemeDots } from "./theme-dots";
import { PICKER_PRESETS } from "./theme-dots";
import { ThemePicker as OuroThemePicker } from "@/registry/ouro/components/ouro/theme-picker/theme-picker";
import { SiteMenu, SiteMenuFrame } from "./site-menu";
import { DocsPanel, PartsPanel, PlatformsPanel, ProofPanel, sectionOf } from "./site-nav";
import { normalizePath } from "../paths";
import { setXray, useXray } from "./xray-store";

/** Follow the device, or pin Surfaced (light) or Submerged (dark): the SegmentedControl's three segments. */
export const MODE_ITEMS = [
  { value: "system", label: "Auto" },
  { value: "light", label: "Surfaced" },
  { value: "dark", label: "Submerged" },
] as const;

/**
 * Live and the six presets, and Auto, Light or Dark: Ouro HX's ThemePicker in its popover, whose button shows the chosen
 * look's wordmark. The head script shows the stored one's wordmark and presses its look before hydration (prepaint.ts).
 */
export function ThemePicker(): JSX.Element {
  const { preset, scheme, setPreset, setMode } = useSiteTheme();
  useLiveClock(preset === "live");
  return (
    <OuroThemePicker
      presets={PICKER_PRESETS}
      presentation="popover"
      value={preset}
      onValueChange={(name, event) => setPreset(name as ThemeChoice, originOf(event))}
      onPreviewChange={(name) => previewTheme(name as ThemeChoice | null)}
      className="site-theme-picker max-sm:hidden"
    >
      <SegmentedControl label="Light or dark" fullWidth items={MODE_ITEMS} value={scheme} onValueChange={(value) => setMode(value as Mode | "system")} />
    </OuroThemePicker>
  );
}

/**
 * The looks in the phone's menu, where the row fits and nothing needs opening, with Auto, Light or Dark under them. From
 * 640px the header's button holds them instead.
 */
function MenuLooks(): JSX.Element {
  const { scheme, setMode } = useSiteTheme();
  return (
    <section aria-label="Theme" className="mt-8 grid gap-4 border-0 border-t border-solid border-border pt-6 sm:hidden">
      <ThemeDots label="Theme" size="lg" />
      <SegmentedControl label="Light or dark" fullWidth items={MODE_ITEMS} value={scheme} onValueChange={(value) => setMode(value as Mode | "system")} />
    </section>
  );
}

// The palette's code loads the first time it is wanted, so the page's first load does not carry it: as the reader
// points at Search, focuses it or presses it. It is put in place once its code has arrived, not suspended while it
// loads: React reveals a suspended part about 300 ms late, which held back a press with no hover first (a finger, a
// quick click).
type Palette = typeof import("./site-palette").default;
let loading: Promise<Palette> | undefined;
// A load that failed (the network dropped) is let go, so the next reach asks again; a browser that remembers the failed
// module (Chromium does) fails it again, quietly.
const loadPalette = (): Promise<Palette> =>
  (loading ??= import("./site-palette").then(
    (module) => module.default,
    (error: unknown) => {
      loading = undefined;
      throw error;
    },
  ));

/** ⌘K: every page, the presets, light and dark, and X-ray (site-palette.tsx). */
function SiteCommand({ open, setOpen }: { open: boolean; setOpen: Dispatch<SetStateAction<boolean>> }): JSX.Element {
  const [SitePalette, setSitePalette] = useState<Palette | null>(null);
  const platform = usePlatform();
  // Search pressed while its code failed to load does not stay open with nothing to show.
  const want = useCallback(() => void loadPalette().then((palette) => setSitePalette(() => palette), () => setOpen(false)), [setOpen]);
  // ⌘K opens it with no press on the button.
  useEffect(() => {
    if (open) want();
  }, [open, want]);
  return (
    <>
      {/* On a phone the bar keeps search as an icon a thumb can reach. */}
      <Button variant="plain" tone="secondary" aria-label="Search" aria-haspopup="dialog" onClick={() => setOpen(true)} onPointerDown={want} className="w-11 px-0 sm:hidden">
        <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" className="size-5">
          <circle cx="7" cy="7" r="4.25" />
          <path d="m10.25 10.25 3 3" />
        </svg>
      </Button>
      <Button
        variant="outline"
        tone="secondary"
        size="sm"
        onClick={() => setOpen(true)}
        onPointerEnter={want}
        onPointerDown={want}
        onFocus={want}
        aria-haspopup="dialog"
        // As wide as Ctrl+K needs, with the hint at its end, as a search field: the server can't know the platform, so
        // a Mac's ⌘K, narrower, arrives as the page hydrates, and would otherwise pull the controls beside it along.
        className="max-sm:hidden min-w-[8.25rem] [&>[data-ouro-label]]:flex-1"
        aria-keyshortcuts={ariaKeyShortcuts(["mod", "k"], platform)}
      >
        Search
        <span aria-hidden="true" className="ms-auto">
          <Kbd keys={["mod", "k"]} />
        </span>
      </Button>
      {SitePalette && <SitePalette open={open} onOpenChange={setOpen} />}
    </>
  );
}

/** X-ray's Switch: the only part of the header that reads it, so turning it on re-renders only this. */
function XraySwitch(): JSX.Element {
  return <Switch label="X-ray" checked={useXray()} onCheckedChange={setXray} />;
}

/** Puts focus in the search palette's field, over the next frames while its code loads. */
function focusPaletteField(): void {
  let frames = 0;
  requestAnimationFrame(function again() {
    const field = document.querySelector<HTMLInputElement>('[data-ouro="command"] input[data-ouro-part="input"]');
    if (field) field.focus();
    else if (++frames < 120) requestAnimationFrame(again);
  });
}

/** A pill in the menu, beside its close button, for what a phone's bar has no room for. Choosing it closes the menu. */
function MenuPill({ children, label, lit = false, onClick }: { children: ReactNode; label: string; lit?: boolean; onClick: () => void }): JSX.Element {
  return (
    <SheetClose
      render={
        <button
          type="button"
          aria-label={label}
          onClick={onClick}
          className="inline-flex h-11 cursor-pointer items-center rounded-full border-0 bg-transparent p-0 outline-ring touch-manipulation [-webkit-tap-highlight-color:transparent] focus-visible:outline-2 focus-visible:outline-solid"
        />
      }
    >
      {/* Its look is inline: only the menu draws this, and the voyage pages have a CSS budget. */}
      <span
        className="inline-flex h-8 items-center gap-1.5 rounded-full border border-solid px-3 text-sm font-medium"
        style={{ borderColor: lit ? "var(--primary)" : "var(--border)", color: lit ? "var(--primary)" : "var(--foreground)" }}
      >
        {children}
      </span>
    </SheetClose>
  );
}

/** X-ray in the menu: turns it on or off and closes the menu, so you see the page it outlines. Its name says what a press does. */
function XrayPill(): JSX.Element {
  const on = useXray();
  return (
    <MenuPill label={on ? "Hide X-ray" : "Show X-ray"} lit={on} onClick={() => setXray(!on)}>
      <span aria-hidden="true" className="size-2 rounded-full" style={{ border: "1.5px solid currentColor", background: on ? "currentColor" : undefined }} />
      X-ray
    </MenuPill>
  );
}

/** Whether the page is being scrolled down (true) or up (false), past its first 40px. */
function useScrollingDown(): boolean {
  const [down, setDown] = useState(false);
  useEffect(() => {
    let last = scrollY;
    const on = () => {
      const now = scrollY;
      if (Math.abs(now - last) < 6) return;
      // While a panel is open the strip stays, so the bar the panel hangs from holds still.
      if (document.querySelector('[data-ouro="navigation-menu-popup"]')) setDown(false);
      else setDown(now > last && now > 40);
      last = now;
    };
    addEventListener("scroll", on, { passive: true });
    return () => removeEventListener("scroll", on);
  }, []);
  return down;
}

/**
 * The site's one header, on the voyage pages and the docs alike, built from Ouro HX: FamilyBar over Navbar, Popover,
 * RadioGroup, SegmentedControl, Switch, Command and Kbd. The family bar links the Ouro family's sites (family.ts), this
 * one marked, and scrolls away with the page; the site's own bar under it sticks. `path` is the bar's current link;
 * `page` is the page itself, which the menu marks. Whenever the links do not fit, its one menu (site-menu.tsx) lists
 * every section with its pages, then the family's sites; `menu` takes its place (the docs' own, with their pages and a
 * search).
 */
export function VoyageHeader({
  path,
  page = path,
  menu,
  gutters = "voyage",
  skipTo = "main",
  pageNav = false,
}: {
  path: string;
  page?: string;
  /** Whether the page has its own navigation that marks it as the current page: the docs sidebar, the Apple pages' row. */
  pageNav?: boolean;
  menu?: ReactNode;
  gutters?: keyof typeof GUTTERS;
  /** The id the skip link jumps to: the page's <main>, or a docs page's title, which comes before it. */
  skipTo?: string | undefined;
}): JSX.Element {
  const [searching, setSearching] = useCommandShortcut("mod+k");
  // The family strip and the bar are one surface with one line under both. Where it sticks, scrolling down slides the
  // strip away and leaves the bar; scrolling up brings it back.
  const down = useScrollingDown();
  const strip = useRef<HTMLDivElement>(null);
  const [stripHeight, setStripHeight] = useState(0);
  useLayoutEffect(() => {
    const element = strip.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setStripHeight(element.offsetHeight));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const current = normalizePath(page);
  const section = sectionOf(current);
  return (
    <>
      <SkipLink target={skipTo} />
      <div
        data-site-masthead=""
        data-down={down ? "" : undefined}
        style={{ ["--site-strip" as string]: `${stripHeight}px` }}
        className={cn(
          // It slides by its sticky top, not a transform: a transform would make it the box the popups' fixed focus guards are
          // placed in, and Tab into a panel would scroll the page to reach one.
          "z-40 bg-background transition-[top] duration-(--ouro-duration-base) ease-(--ouro-ease-out) motion-reduce:transition-none",
          gutters === "voyage" ? "sticky top-0 data-[down]:-top-(--site-strip)" : "relative max-sm:sticky max-sm:top-0 max-sm:data-[down]:-top-(--site-strip)",
        )}
      >
      <div ref={strip}>
        <FamilyBar links={FAMILY} current={FAMILY_CURRENT} label="Ouro family" className={GUTTERS[gutters]} />
      </div>
      <Navbar
        label="Primary"
        // The links, and the Search and X-ray beside them, need more than a tablet's width: collapsing in the server HTML means the links never draw, then give way to the menu button, when the page measures them.
        collapseBelow="lg"
        // Sticky, but on the docs only on a phone: from 640px the docs sidebar sticks to the top itself, and would sit under it.
        className={GUTTERS[gutters]}
        brand={
          <a
            href={href("/")}
            className="-ms-1 inline-flex min-h-11 items-center gap-2 rounded-[calc(var(--radius)*0.8)] px-1 font-[family-name:var(--font-heading)] text-lg font-semibold tracking-[-0.015em] text-foreground no-underline outline-ring focus-visible:outline-2 focus-visible:outline-offset-2"
            data-site-brand=""
            data-test-harness=""
          >
            <HxLogo size={32} className="size-8" />
            Ouro UI
          </a>
        }
        // Two ways in, by platform and by part, then Proof and Docs: one panel each, which reshapes as you move between them.
        items={[
          { label: "Platforms", fit: true, current: section === "platforms", content: <PlatformsPanel current={current} /> },
          { label: "Parts", fit: true, current: section === "parts", content: <PartsPanel current={current} /> },
          { label: "Proof", fit: true, current: section === "proof", content: <ProofPanel current={current} /> },
          { label: "Docs", fit: true, current: section === "docs", content: <DocsPanel current={current} /> },
        ]}
        currentPath={href(pageNav ? `${path}~` : path)}
        menu={
          <SiteMenuFrame
            tools={
              <>
                {/* The docs' menu has its own search; elsewhere this opens the palette the bar's Search opens. */}
                {menu === undefined && (
                  <MenuPill
                    label="Search"
                    // The palette rises as the menu slides away, and once the menu has handed focus back to its button,
                    // the palette's field takes it: Search was pressed, so the next thing is typing.
                    onClick={() => {
                      setSearching(true);
                      document.querySelector("[data-ouro-navbar-menu]")?.addEventListener("focus", focusPaletteField, { once: true });
                    }}
                  >
                    <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" className="size-3.5">
                      <circle cx="7" cy="7" r="4.25" />
                      <path d="m10.25 10.25 3 3" />
                    </svg>
                    Search
                  </MenuPill>
                )}
                <XrayPill />
              </>
            }
          >
            {menu ?? <SiteMenu page={page} />}
            <MenuLooks />
          </SiteMenuFrame>
        }
        actions={
          <>
            <ThemePicker />
            <div className="max-sm:hidden">
              <XraySwitch />
            </div>
            <SiteCommand open={searching} setOpen={setSearching} />
          </>
        }
      />
      </div>
    </>
  );
}
