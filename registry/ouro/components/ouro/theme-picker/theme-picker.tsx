"use client";

import { type JSX, type Ref } from "react";
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/ouro/class-name-check";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { useDevWarnings } from "@/registry/ouro/lib/ouro/use-dev-messages";
import { useThemePreset, type ThemePresetOptions } from "@/registry/ouro/lib/ouro/theme-preset";
import { rovingRow } from "@/registry/ouro/lib/ouro/roving-row";
import { Button } from "@/registry/ouro/components/ouro/button/button";

/** One look an app ships, for {@link ThemePicker}. */
export interface ThemePreset {
  /** The value of `data-theme` the preset's CSS keys on: `[data-theme="abyss"]`. */
  name: string;
  /** What a person reads and a screen reader announces: "Abyss". */
  label: string;
  /** One line on the look, shown beside the dots while it is chosen. */
  mood?: string | undefined;
}

/** Props for {@link ThemePicker}. */
export interface ThemePickerProps extends ThemePresetOptions {
  /** The looks to choose from, in order; the first is the default unless `defaultPreset` says otherwise. */
  presets: readonly ThemePreset[];
  /** Names the group for screen readers. @default "Theme" */
  label?: string | undefined;
  /** Shows the chosen look's name and mood under the dots. @default true */
  describe?: boolean | undefined;
  /** Layout only: margins, grid placement (`ms-auto`). Appearance classes warn in development. */
  className?: string | undefined;
  /** Reaches the root. */
  ref?: Ref<HTMLDivElement> | undefined;
}

const DOT_PAINT = {
  background: "linear-gradient(135deg, var(--background) calc(50% - 0.5px), var(--primary) calc(50% + 0.5px))",
} as const;

/**
 * The look chooser: a row of dots, one per preset, painted with the preset's page and primary
 * colour, with the chosen look's name and mood under them. The row is one Tab stop, on the chosen dot: the arrow keys, Home and End move focus along it, and a press chooses. A press switches the whole app at
 * once, as `data-theme` on `<html>`, and keeps the choice in `localStorage`; `themePresetScript()`
 * inline in `<head>` applies it before first paint. A preset is CSS that keys on
 * `[data-theme="<name>"]`.
 *
 * Use `ColorSchemeToggle` instead for light and dark, which are not looks, and `useThemePreset`
 * for a chooser of your own.
 *
 * @group Actions
 * @see https://ui.ouroboros.bot/docs/theme-picker
 * @example
 * <ThemePicker presets={[{ name: "pearl", label: "Pearl", mood: "Clean white and one clear blue" }, { name: "abyss", label: "Abyss" }]} />
 * @claim "A press switches the whole app at" registry/ouro/components/ouro/theme-picker/theme-picker.test.tsx verify:testExists(registry/ouro/components/ouro/theme-picker/theme-picker.test.tsx::ThemePicker > switches the page, keeps the choice and presses the chosen dot)
 */
export function ThemePicker(props: ThemePickerProps): JSX.Element {
  const { presets, label = "Theme", describe = true, storageKey, defaultPreset, className, ref } = props;
  const { preset, setPreset } = useThemePreset(
    presets.map((item) => item.name),
    { storageKey, defaultPreset },
  );
  useAppearanceClassNameCheck(
    "ThemePicker",
    className,
    process.env.NODE_ENV !== "production"
      ? (token: string) => `remove "${token}"; ThemePicker draws its dots from the presets`
      : // Stryker disable next-line StringLiteral: the production build never reads this hint
        /* istanbul ignore next @preserve -- production only */ "",
  );
  useDevWarnings(
    "ThemePicker",
    process.env.NODE_ENV !== "production"
      ? () => [
          presets.length === 0 && [
            "presets is empty, so there is nothing to choose",
            '<ThemePicker presets={[{ name: "pearl", label: "Pearl" }]} />',
          ],
        ]
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );
  const roving = rovingRow(presets.map((item) => item.name), preset);
  const chosen = presets.find((item) => item.name === preset);

  return (
    <div ref={ref} data-ouro="theme-picker" className={cn("grid gap-2", className)}>
      <div
        role="group"
        aria-label={label}
        onKeyDown={roving.onKeyDown}
        className="flex flex-wrap gap-1.5 [&_button:focus-visible]:outline-none [&_button:focus-visible>span]:outline-2 [&_button:focus-visible>span]:outline-offset-2 [&_button:focus-visible>span]:outline-ring [&_button:focus-visible>span]:outline-solid"
      >
        {presets.map((item) => (
          <Button
            key={item.name}
            data-ouro-control="theme-picker"
            data-ouro-part="preset"
            variant="plain"
            tone="secondary"
            aria-label={item.label}
            aria-pressed={item.name === preset}
            tabIndex={roving.tabIndex(item.name)}
            onClick={() => setPreset(item.name)}
            className="h-auto p-1 forced-colors:aria-pressed:forced-color-adjust-none forced-colors:aria-pressed:[background-color:Highlight]"
          >
            <span
              data-theme={item.name}
              aria-hidden="true"
              style={DOT_PAINT}
              className={cn(
                "inline-block size-ouro-6 shrink-0 rounded-full border-2 sm:size-ouro-8",
                item.name === preset ? "border-foreground" : "border-foreground/20",
              )}
            />
          </Button>
        ))}
      </div>
      {describe && chosen ? (
        <p className="m-0 text-sm text-muted-foreground">
          <strong className="me-1 font-semibold text-foreground">{chosen.label}</strong>
          {chosen.mood}
        </p>
      ) : null}
    </div>
  );
}
