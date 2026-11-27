import { useId, type JSX, type ReactNode } from "react";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { PlatformMark } from "../components/platform-marks";
import { Eyebrow, Head, Links, NAV_DOCS, NAV_PARTS, NAV_PLATFORMS, NAV_PROOF, NavLink, type NavPlatform } from "./site-nav";

/*
 * The bar's three heaviest panels (site-nav.tsx keeps the data and the small helpers every page needs; these bodies, the
 * real platform marks among them, load only once a pointer, a finger or focus first reaches the header, the same trigger
 * that already brings in the Docs panel's lists (header.tsx's wantPanels), so the panel has them before it can open.
 */

/** A platform's name: its mark, its name and its kit. */
function PlatformName({ platform, kit = true }: { platform: NavPlatform; kit?: boolean }): JSX.Element {
  return (
    <span className="inline-flex items-baseline gap-2">
      <PlatformMark id={platform.id} className="text-foreground" />
      <span className="font-[family-name:var(--font-heading,inherit)] font-semibold text-foreground">{platform.name}</span>
      {kit && <span className="text-xs text-muted-foreground">{platform.kit}</span>}
    </span>
  );
}

/** The four platforms side by side, each with the same four pages: two columns on a phone, four from 640px. */
export function PlatformsPanel({ current, compact = false }: { current: string; compact?: boolean }): JSX.Element {
  const id = useId();
  return (
    <section aria-labelledby={id} className="grid gap-1">
      {compact ? <Eyebrow id={id}>Pick a platform</Eyebrow> : <div id={id} className="contents"><Head title="Platforms" hint="Web, Apple, Windows and Android" current={current} /></div>}
      <ul className={cn("m-0 grid list-none gap-x-2 gap-y-3 p-0", compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-[repeat(4,minmax(0,1fr))] sm:gap-x-6")}>
        {NAV_PLATFORMS.map((platform) => (
          <li key={platform.id} className="grid content-start gap-0.5">
            <span className="px-3 pb-0.5">
              <PlatformName platform={platform} kit={!compact} />
            </span>
            <ul aria-label={platform.name} className="m-0 grid list-none gap-0.5 p-0">
              {platform.pages.map((page) => (
                <li key={page.label}>
                  <NavLink page={page} current={current} size="sm" label={page.label} mark={page.path !== NAV_DOCS.path} />
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Every part on a line: the part and its line, then its pages across. Stacked on a phone. */
export function PartsPanel({ current, compact = false, more }: { current: string; compact?: boolean; more?: Readonly<Record<string, ReactNode>> | undefined }): JSX.Element {
  const id = useId();
  return (
    <section aria-labelledby={id}>
      {compact ? <Eyebrow id={id}>Ouro UI, part by part</Eyebrow> : <div id={id} className="contents"><Head title="Parts" hint="Ouro UI, part by part" current={current} /></div>}
      <div className={cn("grid gap-y-1", !compact && "sm:grid-cols-[max-content_minmax(0,22rem)] sm:items-start sm:gap-x-6")}>
        {NAV_PARTS.map((part) => (
          <div key={part.path} className="contents">
            <NavLink page={part} current={current} />
            <div className={cn("grid", compact && "ps-4 pb-2")}>
              <ul aria-label={`In ${part.label}`} className="m-0 flex list-none flex-wrap items-center gap-0.5 p-0 sm:pt-px">
                {part.pages.map((page) => (
                  <li key={page.path}>
                    <NavLink page={page} current={current} size="sm" hint={false} />
                  </li>
                ))}
              </ul>
              {more?.[part.label]}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Proof: tested, in use, thanks, under the section's own hairline. */
export function ProofPanel({ current, compact = false }: { current: string; compact?: boolean }): JSX.Element {
  return (
    <div>
      {!compact && <Head page={NAV_PROOF} hint={NAV_PROOF.hint} current={current} />}
      <div className={cn("grid gap-x-8 gap-y-3", !compact && "sm:grid-flow-col sm:auto-cols-max")}>
        {NAV_PROOF.groups.map((group) => (
          <Links key={group.label} label={group.label} pages={group.pages} current={current} />
        ))}
      </div>
    </div>
  );
}
