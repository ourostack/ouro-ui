import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type Dispatch, type JSX, type ReactNode, type SetStateAction } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { FamilyBar } from "@/registry/ouro/components/ouro/family-bar/family-bar";
import { claim } from "@/registry/ouro/lib/ouro/claims";
import { Kbd } from "@/registry/ouro/components/ouro/kbd/kbd";
import { Navbar } from "@/registry/ouro/components/ouro/navbar/navbar";
import {
  PopoverClose,
  PopoverDescription,
  PopoverPopup,
  PopoverPortal,
  PopoverPositioner,
  PopoverRoot,
  PopoverTitle,
  PopoverTrigger,
} from "@/registry/ouro/components/ouro/popover/popover-parts";
import { SegmentedControl } from "@/registry/ouro/components/ouro/segmented-control/segmented-control";
import { SheetClose } from "@/registry/ouro/components/ouro/sheet/sheet-parts";
import { Switch } from "@/registry/ouro/components/ouro/switch/switch";
import { useCommandShortcut } from "@/registry/ouro/lib/ouro/use-command-shortcut";
import { HxLogo, OuroMark } from "../components/brand";
import { FAMILY, FAMILY_CURRENT } from "../family";
import { GUTTERS } from "../gutters";
import { href } from "../paths";
import type { Mode } from "../themes/prepaint";
import { ByPreset, Swatch } from "./presets";
import { useLiveClock, useSiteTheme } from "./theme-store";
import { ThemeDots } from "./theme-dots";
import { sectionHref, SITE_SECTIONS, SiteMenu, SiteMenuFrame } from "./site-menu";
import { setXray, useXray } from "./xray-store";

/** Follow the device, or pin Surfaced (light) or Submerged (dark): the SegmentedControl's three segments. */
export const MODE_ITEMS = [
  { value: "system", label: "Auto" },
  { value: "light", label: "Surfaced" },
  { value: "dark", label: "Submerged" },
] as const;

function ChevronIcon(): JSX.Element {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="size-3.5 opacity-60">
      <path d="m4.5 6.5 3.5 3.5 3.5-3.5" />
    </svg>
  );
}

/** A phone, or any touch screen: where a tap that closes a popover should press nothing else. */
const TOUCH = "(pointer: coarse), (width < 40rem)";
const touchScreen = (changed: () => void) => {
  const media = matchMedia(TOUCH);
  media.addEventListener("change", changed);
  return () => media.removeEventListener("change", changed);
};

/**
 * Live and the six presets, and Auto, Light or Dark, in a Popover from the header. Built from the
 * Popover parts to focus the panel itself when it opens: the panel is not yet positioned on the
 * frame Base UI moves focus in, so focusing its first button scrolled the page to the popup's
 * unplaced position. Tab reaches the choices from there.
 */
export function ThemePicker(): JSX.Element {
  const { preset, scheme, setMode } = useSiteTheme();
  useLiveClock(preset === "live");
  const popup = useRef<HTMLDivElement>(null);
  const touch = useSyncExternalStore(touchScreen, () => matchMedia(TOUCH).matches, () => false);
  return (
    // Modal on a touch screen: a tap outside closes it without also pressing whatever lies under the tap, which with the
    // popover across a phone is most of the page. A mouse keeps the page: it scrolls, and a click on a link follows it.
    <PopoverRoot modal={touch}>
      <PopoverTrigger
        render={
          <Button variant="soft" tone="secondary" size="sm" data-site-theme-trigger="" className="site-theme-trigger">
            <ByPreset>
              {(item) => (
                <span className="inline-flex items-center gap-2">
                  <Swatch preset={item.name} size="md" />
                  <span className="max-sm:sr-only">
                    <span className="sr-only">Theme: </span>
                    {item.label}
                  </span>
                </span>
              )}
            </ByPreset>
            <ChevronIcon />
          </Button>
        }
      />
      <PopoverPortal>
        <PopoverPositioner side="bottom" align="end">
          <PopoverPopup ref={popup} initialFocus={popup} className="w-[24rem] max-w-[calc(100vw-1rem)]">
            <div className="grid gap-1">
              <PopoverTitle>Theme</PopoverTitle>
              <PopoverDescription>
                {claim("Pick one and the whole ship repaints, down to the last rivet.", {
                  source: { file: "site/scripts/themes.mts" },
                  verify: { testExists: "site/scripts/themes.test.mjs::theme files parse into their top-level blocks and refuse anything else" },
                })}
              </PopoverDescription>
            </div>
            <div className="mt-3 grid gap-4">
              <ThemeDots label="Themes" size="md" />
              <SegmentedControl label="Light or dark" fullWidth items={MODE_ITEMS} value={scheme} onValueChange={(value) => setMode(value as Mode | "system")} />
            </div>
            <PopoverClose>Close</PopoverClose>
          </PopoverPopup>
        </PopoverPositioner>
      </PopoverPortal>
    </PopoverRoot>
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
  // Search pressed while its code failed to load does not stay open with nothing to show.
  const want = useCallback(() => void loadPalette().then((palette) => setSitePalette(() => palette), () => setOpen(false)), [setOpen]);
  // ⌘K opens it with no press on the button.
  useEffect(() => {
    if (open) want();
  }, [open, want]);
  return (
    <>
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
        aria-keyshortcuts="Meta+K Control+K"
      >
        Search
        <Kbd keys={["mod", "k"]} className="ms-auto" />
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
}: {
  path: string;
  page?: string;
  menu?: ReactNode;
  gutters?: keyof typeof GUTTERS;
}): JSX.Element {
  const [searching, setSearching] = useCommandShortcut("mod+k");
  return (
    <>
      <FamilyBar
        links={FAMILY}
        current={FAMILY_CURRENT}
        // Named apart from the site's own bar ("Site") and from a docs page's demo of the component ("Sites").
        label="Ouro sites"
        className={GUTTERS[gutters]}
        brand={
          // The family's home, by its mark: the bar's first link says "Ouro" and goes there too, so the mark is for a
          // pointer only, out of the tab order and unheard.
          <a
            href={FAMILY[0]!.href}
            tabIndex={-1}
            aria-hidden="true"
            data-site-family-mark=""
            className="-ms-1 inline-flex size-9 items-center justify-center rounded-md pointer-coarse:size-11"
          >
            <OuroMark size={20} />
          </a>
        }
      />
      <Navbar
        label="Site"
        // Sticky, but on the docs only on a phone: from 640px the docs sidebar sticks to the top itself, and would sit under it.
        className={`${gutters === "voyage" ? "sticky top-0 z-40" : "relative z-40 max-sm:sticky max-sm:top-0"} ${GUTTERS[gutters]}`}
        brand={
          <a
            href={href("/")}
            className="-ms-1 inline-flex min-h-11 items-center gap-2 rounded-[calc(var(--radius)*0.8)] px-1 font-[family-name:var(--font-heading)] text-[1.0625rem] font-semibold tracking-[-0.015em] text-foreground no-underline outline-ring focus-visible:outline-2 focus-visible:outline-offset-2"
            data-site-brand=""
          >
            <HxLogo size={32} className="size-8" />
            Ouro UI
          </a>
        }
        // The brand is the way home, so the bar starts at the Nautilus.
        items={SITE_SECTIONS.slice(1).map((section) => ({ label: section.label, href: sectionHref(section.href) }))}
        currentPath={href(path)}
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
    </>
  );
}
