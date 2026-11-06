import { lazy, Suspense, useCallback, useRef, useState, type JSX, type ReactNode } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
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
import { HxLogo } from "../components/brand";
import { GITHUB, href } from "../paths";
import type { Mode } from "../themes/prepaint";
import { ByPreset, choiceList, Swatch } from "./presets";
import { useLiveClock, useSiteTheme } from "./theme-store";
import { ThemeDots } from "./theme-dots";
import { sectionHref, SITE_SECTIONS, SiteMenu, SiteMenuFrame } from "./site-menu";
import { openXray, setXray, useXray } from "./xray-store";

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
  return (
    <PopoverRoot>
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
            <PopoverClose />
          </PopoverPopup>
        </PopoverPositioner>
      </PopoverPortal>
    </PopoverRoot>
  );
}

// The palette's code loads the first time it opens, so the page's first load does not carry it.
const Command = lazy(() => import("@/registry/ouro/components/ouro/command/command").then((module) => ({ default: module.Command })));

/** ⌘K: the pages, the presets, light and dark, and X-ray. */
function SiteCommand(): JSX.Element {
  const [open, setOpen] = useCommandShortcut("mod+k");
  const { setPreset, setMode } = useSiteTheme();
  const go = useCallback((url: string) => () => window.location.assign(url), []);
  const [wanted, setWanted] = useState(false);
  if (open && !wanted) setWanted(true);
  return (
    <>
      <Button
        variant="outline"
        tone="secondary"
        size="sm"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="max-sm:hidden"
        aria-keyshortcuts="Meta+K Control+K"
      >
        Search
        <Kbd keys={["mod", "k"]} className="ms-1" />
      </Button>
      <Suspense>
        {wanted && (
          <Command
            title="Command palette"
            open={open}
            onOpenChange={setOpen}
            placeholder="Dive, repaint, or find a page…"
            items={[
              {
                label: "Pages",
                items: [
                  { label: "Home", onSelect: go(href("/")), keywords: ["start", "porthole"] },
                  { label: "The Nautilus", onSelect: go(href("/nautilus/")), keywords: ["story", "chapters", "ship"] },
                  { label: "Ouro AX", onSelect: go(href("/ax/")), keywords: ["agents", "agent experience", "cli", "x-ray"] },
                  { label: "Ouro UI for Apple", onSelect: go(href("/apple/")), keywords: ["swift", "swiftui", "iphone", "mac", "siri", "app intents"] },
                  { label: "Docs", onSelect: go(href("/docs/installing/")), keywords: ["install", "guide"] },
                  { label: "Components", onSelect: go(href("/docs/")), keywords: ["catalog"] },
                  { label: "GitHub", onSelect: go(GITHUB), keywords: ["source", "repository"] },
                ],
              },
              {
                label: "Repaint",
                items: [
                  ...choiceList.map((item) => ({ label: `${item.label} theme`, onSelect: () => setPreset(item.name), keywords: [item.mood] })),
                  { label: "Surface (light)", onSelect: () => setMode("light"), keywords: ["light mode", "surfaced"] },
                  { label: "Submerge (dark)", onSelect: () => setMode("dark"), keywords: ["dark mode", "submerged"] },
                  { label: "Follow my device (auto)", onSelect: () => setMode("system"), keywords: ["auto", "system"] },
                ],
              },
              { label: "Tools", items: [{ label: "X-ray", onSelect: openXray, keywords: ["inspector", "outline", "components"] }] },
            ]}
          />
        )}
      </Suspense>
    </>
  );
}

/** X-ray's Switch: the only part of the header that reads it, so turning it on re-renders only this. */
function XraySwitch(): JSX.Element {
  return <Switch label="X-ray" checked={useXray()} onCheckedChange={setXray} />;
}

/**
 * X-ray in the menu, for a phone's bar, which has no room for its Switch: a row that turns it on or off and closes the
 * menu, so you see the page it outlines.
 */
function XrayRow(): JSX.Element {
  const on = useXray();
  return (
    <SheetClose
      render={
        <button
          type="button"
          aria-pressed={on}
          onClick={() => setXray(!on)}
          className="flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-md border-0 bg-transparent px-3 py-1.5 text-start outline-ring -outline-offset-2 touch-manipulation [-webkit-tap-highlight-color:transparent] focus-visible:outline-2 focus-visible:outline-solid pointer-fine:hover:bg-accent active:bg-accent"
        />
      }
    >
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className="font-[family-name:var(--font-heading)] text-[1.0625rem] leading-6 font-semibold text-foreground">X-ray</span>
        <span className="text-sm leading-5 text-muted-foreground">{on ? "Back to the paint" : "Peek at the parts under the paint"}</span>
      </span>
      <span aria-hidden="true" className="shrink-0 text-xs font-medium text-muted-foreground">{on ? "On" : "Off"}</span>
    </SheetClose>
  );
}

/** The bar's side gutters: the voyage's 1200px column, or the docs' (Container in components/layout.tsx). */
const GUTTERS = {
  voyage: "ps-[max(1rem,calc(50%-600px))] pe-[max(1rem,calc(50%-600px))] sm:ps-[max(2rem,calc(50%-600px))] sm:pe-[max(2rem,calc(50%-600px))]",
  docs: "ps-[max(1rem,calc(50%-560px))] pe-[max(1rem,calc(50%-560px))] sm:ps-[max(1.5rem,calc(50%-554px))] sm:pe-[max(1.5rem,calc(50%-554px))] lg:ps-[max(2rem,calc(50%-544px))] lg:pe-[max(2rem,calc(50%-544px))]",
} as const;

/**
 * The site's one header, on the voyage pages and the docs alike, built from Ouro HX: Navbar, Popover,
 * RadioGroup, SegmentedControl, Switch, Command and Kbd. `path` is the bar's current link; `page` is the
 * page itself, which the menu marks. Whenever the links do not fit, its one menu (site-menu.tsx) lists every
 * section with its pages; `menu` takes its place (the docs' own, with their pages and a search).
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
  return (
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
          Ouro HX
        </a>
      }
      // The brand is the way home, so the bar starts at the Nautilus.
      items={SITE_SECTIONS.slice(1).map((section) => ({ label: section.label, href: sectionHref(section.href) }))}
      currentPath={href(path)}
      menu={<SiteMenuFrame tools={<XrayRow />}>{menu ?? <SiteMenu page={page} />}</SiteMenuFrame>}
      actions={
        <>
          <ThemePicker />
          <div className="max-sm:hidden">
            <XraySwitch />
          </div>
          <SiteCommand />
        </>
      }
    />
  );
}
