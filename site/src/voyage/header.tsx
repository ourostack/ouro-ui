import { lazy, Suspense, useCallback, useRef, useState, type JSX } from "react";
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
import { RadioGroup } from "@/registry/ouro/components/ouro/radio-group/radio-group";
import { SegmentedControl } from "@/registry/ouro/components/ouro/segmented-control/segmented-control";
import { Switch } from "@/registry/ouro/components/ouro/switch/switch";
import { useCommandShortcut } from "@/registry/ouro/lib/ouro/use-command-shortcut";
import { HxLogo } from "../components/brand";
import { GITHUB, href } from "../paths";
import type { Mode, PresetName } from "../themes/prepaint";
import { ByPreset, presetList, Swatch } from "./presets";
import { useSiteTheme } from "./theme-store";
import { openXray, setXray, useXray } from "./xray-store";

/** Surfaced is light, Submerged is dark: the SegmentedControl's two segments. */
export const MODE_ITEMS = [
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
 * The six presets and Surfaced or Submerged, in a Popover from the header. Built from the
 * Popover parts to focus the panel itself when it opens: the panel is not yet positioned on
 * the frame Base UI moves focus in, so focusing its first radio scrolled the page to the
 * popup's unplaced position. Tab reaches the presets from there.
 */
export function ThemePicker(): JSX.Element {
  const { preset, mode, setPreset, setMode } = useSiteTheme();
  const popup = useRef<HTMLDivElement>(null);
  return (
    <PopoverRoot>
      <PopoverTrigger
        render={
          <Button variant="plain" tone="secondary" size="sm" data-site-theme-trigger="">
            <ByPreset>
              {(item) => (
                <span className="inline-flex items-center gap-2">
                  <Swatch preset={item.name} />
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
          <PopoverPopup ref={popup} initialFocus={popup} className="w-80">
            <div className="grid gap-1">
              <PopoverTitle>Theme</PopoverTitle>
              <PopoverDescription>
                {claim("Every preset is a plain shadcn/ui theme.", {
                  source: { file: "site/scripts/themes.mts" },
                  verify: { testExists: "site/scripts/themes.test.mjs::theme files parse into their top-level blocks and refuse anything else" },
                })}
              </PopoverDescription>
            </div>
            <div className="mt-2 grid gap-5">
              <RadioGroup
                legend="Preset"
                hideLegend
                value={preset}
                onValueChange={(value) => setPreset(value as PresetName)}
                options={presetList.map((item) => ({
                  value: item.name,
                  label: item.label,
                  description: (
                    <span className="inline-flex items-center gap-2">
                      <Swatch preset={item.name} />
                      {item.mood}
                    </span>
                  ),
                }))}
              />
              <SegmentedControl label="Light or dark" fullWidth items={MODE_ITEMS} value={mode} onValueChange={(value) => setMode(value as Mode)} />
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
                  { label: "Docs", onSelect: go(href("/docs/installing/")), keywords: ["install", "guide"] },
                  { label: "Components", onSelect: go(href("/docs/")), keywords: ["catalog"] },
                  { label: "GitHub", onSelect: go(GITHUB), keywords: ["source", "repository"] },
                ],
              },
              {
                label: "Repaint",
                items: [
                  ...presetList.map((item) => ({ label: `${item.label} theme`, onSelect: () => setPreset(item.name), keywords: [item.mood] })),
                  { label: "Surface (light)", onSelect: () => setMode("light"), keywords: ["light mode", "surfaced"] },
                  { label: "Submerge (dark)", onSelect: () => setMode("dark"), keywords: ["dark mode", "submerged"] },
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

/** The bar's side gutters: the voyage's 1200px column, or the docs' (Container in components/layout.tsx). */
const GUTTERS = {
  voyage: "ps-[max(1rem,calc(50%-600px))] pe-[max(1rem,calc(50%-600px))] sm:ps-[max(2rem,calc(50%-600px))] sm:pe-[max(2rem,calc(50%-600px))]",
  docs: "ps-[max(1rem,calc(50%-560px))] pe-[max(1rem,calc(50%-560px))] sm:ps-[max(1.5rem,calc(50%-554px))] sm:pe-[max(1.5rem,calc(50%-554px))] lg:ps-[max(2rem,calc(50%-544px))] lg:pe-[max(2rem,calc(50%-544px))]",
} as const;

/**
 * The site's one header, on the voyage pages and the docs alike, built from Ouro HX: Navbar, Popover,
 * RadioGroup, SegmentedControl, Switch, Command and Kbd. `path` is the page's, for the current link.
 */
export function VoyageHeader({ path, gutters = "voyage" }: { path: string; gutters?: keyof typeof GUTTERS }): JSX.Element {
  return (
    <Navbar
      label="Site"
      // Sticky on the voyage pages only: the docs sidebar sticks to the top itself, and would sit under it.
      className={`${gutters === "voyage" ? "sticky top-0 z-40" : "relative z-40"} ${GUTTERS[gutters]}`}
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
      items={[
        { label: "The Nautilus", href: href("/nautilus/") },
        { label: "Ouro AX", href: href("/ax/") },
        { label: "Docs", href: href("/docs/installing/") },
        { label: "Components", href: href("/docs/") },
        { label: "GitHub", href: GITHUB },
      ]}
      currentPath={href(path)}
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
