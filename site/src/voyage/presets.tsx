import type { JSX, ReactNode } from "react";
import themes from "../themes/themes.json";
import type { PresetName } from "../themes/prepaint";

/** One preset as site/scripts/themes.mts built it: its picker text and its copied CSS. */
export interface PresetInfo {
  name: PresetName;
  label: string;
  mood: string;
  heading: string;
  radius: string;
  fonts: string[];
  css: { theme: string; tokens: string };
}

export const presetList = themes as PresetInfo[];

export function presetNamed(name: PresetName): PresetInfo {
  return presetList.find((preset) => preset.name === name) ?? presetList[0]!;
}

/**
 * Three dots in a preset's own colours: its page, its primary and its brass highlight. The span
 * carries `data-theme`, so the preset's variables (light or dark, with the page) apply inside it.
 */
export function Swatch({ preset, size = "sm" }: { preset: PresetName; size?: "sm" | "lg" }): JSX.Element {
  const dot = size === "lg" ? "size-4" : "size-3";
  return (
    <span data-theme={preset} aria-hidden="true" className="inline-flex shrink-0 items-center -space-x-1">
      <span className={`${dot} rounded-full bg-background ring-1 ring-foreground/25`} />
      <span className={`${dot} rounded-full bg-primary ring-1 ring-background`} />
      <span className={`${dot} rounded-full bg-chart-3 ring-1 ring-background`} />
    </span>
  );
}

/**
 * Words or marks that depend on the preset, rendered for every preset; voyage.css shows the one
 * html[data-theme] names. The head script sets that attribute before paint, so the server-rendered
 * page shows the reader's preset before it hydrates, and hydration changes nothing.
 */
export function ByPreset({ children }: { children: (preset: PresetInfo) => ReactNode }): JSX.Element {
  return (
    <>
      {presetList.map((item) => (
        <span key={item.name} data-site-when={item.name}>
          {children(item)}
        </span>
      ))}
    </>
  );
}
