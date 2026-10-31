import type { JSX, ReactNode } from "react";
import presets from "../themes/presets.json";
import type { PresetName, ThemeChoice } from "../themes/prepaint";

/** One choice as site/scripts/themes.mts built it, without its CSS (copy.ts loads that when copied). */
export interface PresetInfo {
  name: ThemeChoice;
  label: string;
  mood: string;
  heading: string;
  radius: string;
  fonts: string[];
}

/** The six presets, Pearl first. */
export const presetList = presets as (PresetInfo & { name: PresetName })[];

/** Live: Pearl under the reader's own sky (themes/live.ts), so Pearl's type, corners and CSS. */
export const LIVE: PresetInfo = { ...presetList[0]!, name: "live", label: "Live", mood: "Follows your sky, from first light to moonrise" };

/** Everything a reader can pick, Live first. */
export const choiceList: readonly PresetInfo[] = [LIVE, ...presetList];

export function presetNamed(name: ThemeChoice): PresetInfo {
  return choiceList.find((preset) => preset.name === name) ?? presetList[0]!;
}

/**
 * A choice's colours as a dot: the preset's page and its primary, split on the diagonal, read from
 * its own variables (the span carries `data-theme`, so they apply inside it, light or dark with the
 * page). Live's dot is its four skies going round.
 */
const SIZES = { sm: "size-3.5", md: "size-5", lg: "size-6 sm:size-8" } as const;

export function Swatch({ preset, size = "sm" }: { preset: ThemeChoice; size?: "sm" | "md" | "lg" }): JSX.Element {
  return <span data-theme={preset === "live" ? undefined : preset} aria-hidden="true" className={`site-swatch inline-block shrink-0 rounded-full ${SIZES[size]}${preset === "live" ? " site-swatch-live" : ""}`} />;
}

/**
 * Words or marks that depend on the choice, rendered for every one; by-preset.css shows the one
 * html[data-theme] (and html[data-live]) names. The head script sets those before paint, so the
 * server-rendered page shows the reader's choice before it hydrates, and hydration changes nothing.
 */
export function ByPreset({ children }: { children: (preset: PresetInfo) => ReactNode }): JSX.Element {
  return (
    <>
      {choiceList.map((item) => (
        <span key={item.name} data-site-when={item.name}>
          {children(item)}
        </span>
      ))}
    </>
  );
}
