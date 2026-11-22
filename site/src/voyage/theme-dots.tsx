import type { JSX } from "react";
import { ThemePicker, type ThemePreset } from "@/registry/ouro/components/ouro/theme-picker/theme-picker";
import { ByPreset, choiceList } from "./presets";
import { originOf, useSiteTheme } from "./theme-store";
import { SKY_WORDS } from "./sky-words";
import type { ThemeChoice } from "../themes/prepaint";

/** Every choice as Ouro HX's ThemePicker takes it: Live (Sky) paints with Pearl's CSS, at dusk (voyage.css). */
export const PICKER_PRESETS: readonly ThemePreset[] = choiceList.map((item) => ({ name: item.name, label: item.label, ...(item.name === "live" ? { theme: "pearl" } : {}) }));

/**
 * The looks as Ouro HX's ThemePicker draws them, Live first: each name in its own heading face, ink and paper, ending
 * in a square of its primary, with the chosen one's name and mood beside them. A press repaints the whole page,
 * spreading out from the look pressed. The head script marks the stored one pressed before the page hydrates
 * (prepaint.ts, `data-preset`).
 */
export function ThemeDots({ label = "Theme", size = "lg", describe = true, nameClassName = "", className = "" }: { label?: string; size?: "md" | "lg"; describe?: boolean; nameClassName?: string; className?: string }): JSX.Element {
  const { preset, sky, setPreset } = useSiteTheme();
  return (
    <div>
      <ThemePicker
        presets={PICKER_PRESETS}
        label={label}
        size={size}
        value={preset}
        onValueChange={(name, event) => setPreset(name as ThemeChoice, originOf(event))}
        className={className}
      />
      {describe ? (
        <p className={`mt-2.5 mb-0 text-sm ${nameClassName} text-muted-foreground [&_strong]:me-1 [&_strong]:font-semibold [&_strong]:text-foreground`}>
          <ByPreset>
            {(item) =>
              item.name === "live" ? (
                <>
                  <strong>{item.label}</strong> {sky ? SKY_WORDS.now(sky.phase, sky.season) : item.mood}
                </>
              ) : (
                <>
                  <strong>{item.label}</strong> {item.mood}
                </>
              )
            }
          </ByPreset>
        </p>
      ) : null}
    </div>
  );
}
