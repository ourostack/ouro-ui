"use client";

import { useRef, type JSX, type MouseEvent, type ReactNode, type Ref } from "react";
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/ouro/class-name-check";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { useDevWarnings } from "@/registry/ouro/lib/ouro/use-dev-messages";
import { useThemePreset, type ThemePresetOptions } from "@/registry/ouro/lib/ouro/theme-preset";
import { rovingRow } from "@/registry/ouro/lib/ouro/roving-row";
import { TouchTarget } from "@/registry/ouro/lib/ouro/touch-target";
import { useMediaQuery } from "@/registry/ouro/lib/ouro/use-media-query";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import {
  PopoverPopupUnchecked,
  PopoverPortal,
  PopoverPositioner,
  PopoverRoot,
  PopoverTitle,
  PopoverTrigger,
} from "@/registry/ouro/components/ouro/popover/popover-parts";

/** One look an app ships, for {@link ThemePicker}. */
export interface ThemePreset {
  /** The name the picker keeps and reports, and the value of `data-theme` the preset's CSS keys on: `[data-theme="abyss"]`. */
  name: string;
  /** What a person reads and a screen reader announces: "Abyss". The picker sets it in the look's own heading face. */
  label: string;
  /** One line on the look, shown under the wordmarks while it is chosen when `describe` is on. */
  mood?: string | undefined;
  /** The `data-theme` to paint the option with, when it differs from `name` (a look built on another's CSS). @default name */
  theme?: string | undefined;
}

/** How big the wordmarks are: `md` (40px) for a popover or a toolbar, `lg` (44px) for a menu or a settings page. */
export type ThemePickerSize = "md" | "lg";

/** Where the looks show: in a row that wraps (`inline`), or behind a trigger that shows the chosen one (`popover`). */
export type ThemePickerPresentation = "inline" | "popover";

/** Props for {@link ThemePicker}. */
export interface ThemePickerProps extends ThemePresetOptions {
  /** The looks to choose from, in order; the first is the default unless `defaultPreset` says otherwise. */
  presets: readonly ThemePreset[];
  /** Names the group for screen readers, and the popover. @default "Theme" */
  label?: string | undefined;
  /** Shows the chosen look's name and mood under the wordmarks. @default false */
  describe?: boolean | undefined;
  /** How big the wordmarks are. @default "md" in a popover, "lg" inline */
  size?: ThemePickerSize | (string & { 'Use "md" or "lg"': never }) | undefined;
  /**
   * `inline` lays the looks out in a row that wraps, for a phone's menu or a settings page; `popover` puts them
   * behind a button that shows the chosen look's wordmark, for a header. @default "inline"
   */
  presentation?: ThemePickerPresentation | (string & { 'Use "inline" or "popover"': never }) | undefined;
  /**
   * The chosen look, when the app keeps it itself; leave it out and the picker keeps it in `localStorage` and sets
   * `data-theme` on `<html>`.
   */
  value?: string | undefined;
  /** Called with the look a person chooses, and the press that chose it. */
  onValueChange?: ((name: string, event: MouseEvent<HTMLButtonElement>) => void) | undefined;
  /** More controls under the looks in the popover, such as a light and dark switch. Only with `presentation="popover"`. */
  children?: ReactNode;
  /** Layout only: margins, grid placement (`ms-auto`). Appearance classes warn in development. */
  className?: string | undefined;
  /** Reaches the root. */
  ref?: Ref<HTMLDivElement> | undefined;
}

// The page's own colours and corner, captured before an option's data-theme repaints its insides, so the chosen ring,
// the focus ring and the hairlines follow the page, not the option. Custom properties resolve where they are set, so
// these hold the page's values all the way down.
const pageTokens =
  "[--ouro-tp-paper:var(--background)] [--ouro-tp-ink:var(--foreground)] [--ouro-tp-muted:var(--muted-foreground)] " +
  "[--ouro-tp-ring:var(--ring)] [--ouro-tp-edge:var(--border)] [--ouro-tp-r:var(--radius-ouro-md)] " +
  "[--ouro-tp-sq:calc(var(--radius)*var(--ouro-radius-scale,1)*0.8)]";

// A wordmark's tile: its paper, a page hairline and a squircle corner. Where corner-shape is missing, the surface slot
// paints the paper and the hairline through a squircle clip path (ouro-base.css).
const tileClass =
  "relative isolate box-border inline-flex items-center rounded-(--ouro-tp-r) border border-solid whitespace-nowrap " +
  "bg-(--ouro-bg) border-(--ouro-bd) [--ouro-bg:var(--background)] [--ouro-bd:var(--ouro-tp-edge)] [--ouro-sq-w:1px] [--ouro-sq-r:var(--ouro-tp-sq)] " +
  "text-(--foreground)";

const tileSizes = {
  sm: "h-ouro-7 px-ouro-2 text-sm",
  md: "h-ouro-10 px-ouro-3 text-lg",
  lg: "h-ouro-11 px-ouro-3_5 text-xl",
} as const;

// The name in the look's own heading face. A face with a small x-height (Cormorant) is scaled to the others' with
// font-size-adjust, so no look reads lighter than the rest.
const nameClass =
  "relative font-[family-name:var(--font-heading,inherit)] leading-none font-semibold tracking-[-0.01em] [font-size-adjust:ex-height_0.53]";

// One flat square of the look's primary, a squircle too, sitting on the baseline after the name.
const squareClass =
  "relative ms-[0.16em] inline-block size-[0.3em] shrink-0 translate-y-[0.2em] rounded-[0.08em] " +
  "bg-(--ouro-bg) [--ouro-bg:var(--primary)] [--ouro-sq-r:0.08em]";

/** A look's wordmark: its name in its heading face and ink, on its paper, ending in a square of its primary. */
function Wordmark({ preset, size }: { preset: ThemePreset; size: keyof typeof tileSizes }): JSX.Element {
  return (
    <span aria-hidden="true" data-theme={preset.theme ?? preset.name} data-preset={preset.name} data-ouro-squircle="" className={cn(tileClass, tileSizes[size])}>
      <span data-ouro-surface="" style={{ zIndex: -1 }} />
      <span className={nameClass}>{preset.label}</span>
      <span data-ouro-squircle="" className={squareClass}>
        <span data-ouro-surface="" style={{ zIndex: -1 }} />
      </span>
    </span>
  );
}

// The option is the tile's frame: no paint of its own, the page's ink as a flat ring with a gap of page paper while
// chosen, and keyboard focus as an outline in the page's ring colour outside that. Forced colours draw the choice as
// a Highlight outline, since they drop box shadows.
const optionClass =
  "press relative m-0 inline-flex shrink-0 cursor-pointer rounded-(--ouro-tp-r) border-0 bg-transparent p-0 text-start select-none " +
  "touch-manipulation [-webkit-tap-highlight-color:transparent] " +
  "outline-(--ouro-tp-ring) outline-offset-3 focus-visible:outline-2 focus-visible:outline-solid aria-pressed:outline-offset-6 " +
  "aria-pressed:shadow-[0_0_0_2px_var(--ouro-tp-paper),0_0_0_4px_var(--ouro-tp-ink)] " +
  "pointer-fine:hover:[--ouro-tp-edge:var(--ouro-tp-muted)] motion-safe:active:scale-(--ouro-press-scale) " +
  "forced-colors:aria-pressed:outline-2 forced-colors:aria-pressed:outline-solid forced-colors:aria-pressed:outline-offset-2 forced-colors:aria-pressed:outline-[Highlight] " +
  "forced-colors:focus-visible:outline-[CanvasText]";

function Looks({
  presets,
  value,
  choose,
  label,
  size,
  describe,
}: {
  presets: readonly ThemePreset[];
  value: string;
  choose: (name: string, event: MouseEvent<HTMLButtonElement>) => void;
  label: string;
  size: ThemePickerSize;
  describe: boolean;
}): JSX.Element {
  const roving = rovingRow(
    presets.map((item) => item.name),
    value,
  );
  const chosen = presets.find((item) => item.name === value);
  return (
    <div className={cn("grid gap-2", pageTokens)}>
      <div role="group" aria-label={label} onKeyDown={roving.onKeyDown} className="flex flex-wrap gap-x-2 gap-y-2.5 p-1">
        {presets.map((item) => (
          <button
            key={item.name}
            type="button"
            data-ouro-control="theme-picker"
            data-ouro-part="preset"
            data-preset={item.name}
            aria-label={item.label}
            aria-pressed={item.name === value}
            tabIndex={roving.tabIndex(item.name)}
            onClick={(event) => choose(item.name, event)}
            className={optionClass}
          >
            <TouchTarget />
            <Wordmark preset={item} size={size} />
          </button>
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

function Chevron(): JSX.Element {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="size-ouro-3_5 opacity-60">
      <path d="m4.5 6.5 3.5 3.5 3.5-3.5" />
    </svg>
  );
}

/** A phone, or any touch screen. */
const TOUCH = "(pointer: coarse), (width < 40rem)";

const sizesKnown: readonly string[] = ["md", "lg"];
const presentationsKnown: readonly string[] = ["inline", "popover"];

function ThemePickerView(props: ThemePickerProps & { chosen: string; choose: (name: string, event: MouseEvent<HTMLButtonElement>) => void }): JSX.Element {
  const { presets, label = "Theme", describe = false, size: sizeProp, presentation: presentationProp, children, className, ref, chosen, choose } = props;
  const presentation: ThemePickerPresentation = presentationProp !== undefined && presentationsKnown.includes(presentationProp) ? (presentationProp as ThemePickerPresentation) : "inline";
  const size: ThemePickerSize = sizeProp !== undefined && sizesKnown.includes(sizeProp) ? (sizeProp as ThemePickerSize) : presentation === "popover" ? "md" : "lg";
  useAppearanceClassNameCheck(
    "ThemePicker",
    className,
    process.env.NODE_ENV !== "production"
      ? (token: string) => `remove "${token}"; ThemePicker paints each wordmark from its preset`
      : // Stryker disable next-line StringLiteral: the production build never reads this hint
        /* istanbul ignore next @preserve -- production only */ "",
  );
  useDevWarnings(
    "ThemePicker",
    process.env.NODE_ENV !== "production"
      ? () => [
          presets.length === 0 && ["presets is empty, so there is nothing to choose", '<ThemePicker presets={[{ name: "pearl", label: "Pearl" }]} />'],
          sizeProp !== undefined && !sizesKnown.includes(sizeProp) && [`size="${sizeProp}" is not a size; use "md" or "lg"`, '<ThemePicker size="md" />'],
          presentationProp !== undefined &&
            !presentationsKnown.includes(presentationProp) && [`presentation="${presentationProp}" is not a presentation; use "inline" or "popover"`, '<ThemePicker presentation="popover" />'],
          children !== undefined && presentation !== "popover" && ["children show only in the popover", '<ThemePicker presentation="popover">…</ThemePicker>'],
        ]
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );
  const touch = useMediaQuery(TOUCH, false);
  const popup = useRef<HTMLDivElement>(null);
  const looks = <Looks presets={presets} value={chosen} choose={choose} label={label} size={size} describe={describe} />;
  if (presentation === "inline") {
    return (
      <div ref={ref} data-ouro="theme-picker" data-presentation="inline" className={cn("grid", className)}>
        {looks}
      </div>
    );
  }
  const current = presets.find((item) => item.name === chosen);
  return (
    <div ref={ref} data-ouro="theme-picker" data-presentation="popover" className={cn("inline-flex", pageTokens, className)}>
      {/* Modal on a touch screen, where a tap outside closes it without also pressing whatever lies under the tap. */}
      <PopoverRoot modal={touch}>
        <PopoverTrigger
          render={
            <Button variant="soft" tone="secondary" size="sm" data-ouro-control="theme-picker" data-ouro-part="trigger" className="gap-ouro-2 ps-ouro-1 pe-ouro-2">
              {/* Every look's wordmark and name, the chosen one shown, so a page's own head script can show the kept one before hydration (data-shows). */}
              {presets.map((item) => (
                <span key={item.name} data-shows={item.name} hidden={item !== current}>
                  <Wordmark preset={item} size="sm" />
                  <span className="sr-only">
                    {label}: {item.label}
                  </span>
                </span>
              ))}
              <Chevron />
            </Button>
          }
        />
        <PopoverPortal>
          <PopoverPositioner side="bottom" align="end">
            {/* Flat: a page hairline and no shadow, so nothing in the picker is blurred. */}
            {/* It focuses the panel itself as it opens, and Tab reaches the chosen look: the panel is not yet placed on the frame focus moves in, so focusing a look there scrolled the page to the unplaced panel. */}
            <PopoverPopupUnchecked ref={popup} initialFocus={popup} className={cn("w-auto max-w-[min(22rem,var(--available-width))] gap-3 p-3 shadow-none", pageTokens)}>
              <PopoverTitle visuallyHidden>{label}</PopoverTitle>
              {looks}
              {children}
            </PopoverPopupUnchecked>
          </PopoverPositioner>
        </PopoverPortal>
      </PopoverRoot>
    </div>
  );
}

function StoredThemePicker(props: ThemePickerProps): JSX.Element {
  const { preset, setPreset } = useThemePreset(
    props.presets.map((item) => item.name),
    { storageKey: props.storageKey, defaultPreset: props.defaultPreset },
  );
  return (
    <ThemePickerView
      {...props}
      chosen={preset}
      choose={(name, event) => {
        setPreset(name);
        props.onValueChange?.(name, event);
      }}
    />
  );
}

/**
 * The look chooser: each look's name in its own heading face and ink, on its own paper, ending in one flat square of
 * its primary, so the name is the specimen. The chosen look has a solid ring in the page's ink. The row is one Tab
 * stop, on the chosen look: the arrow keys, Home and End move focus along it, and a press chooses. With
 * `presentation="popover"` the looks sit behind a button that shows the chosen wordmark; Escape closes it and puts
 * focus back on the button, and on a touch screen a tap outside closes it without pressing what lies under the tap. A press switches the whole app at once, as `data-theme` on `<html>`, and keeps the choice
 * in `localStorage`; `themePresetScript()` inline in `<head>` applies it before first paint. Pass `value` and
 * `onValueChange` to keep the choice yourself. A preset is CSS that keys on `[data-theme="<name>"]`, setting at least
 * `--background`, `--foreground`, `--primary` and `--font-heading`.
 *
 * Use `ColorSchemeToggle` instead for light and dark, which are not looks, and `useThemePreset`
 * for a chooser of your own.
 *
 * @group Actions
 * @see https://ui.ouroboros.bot/docs/theme-picker
 * @example
 * <ThemePicker presets={[{ name: "pearl", label: "Pearl" }, { name: "abyss", label: "Abyss" }]} presentation="popover" />
 * @claim "A press switches the whole app at" registry/ouro/components/ouro/theme-picker/theme-picker.test.tsx verify:testExists(registry/ouro/components/ouro/theme-picker/theme-picker.test.tsx::ThemePicker > switches the page, keeps the choice and presses the chosen look)
 * @claim "Escape closes it and puts focus" registry/ouro/components/ouro/theme-picker/theme-picker.test.tsx verify:testExists(registry/ouro/components/ouro/theme-picker/theme-picker.test.tsx::ThemePicker popover > shows the chosen wordmark, opens the looks, and closes on Escape with focus back on the button)
 */
export function ThemePicker(props: ThemePickerProps): JSX.Element {
  if (props.value === undefined) return <StoredThemePicker {...props} />;
  const { onValueChange } = props;
  return <ThemePickerView {...props} chosen={props.value} choose={(name, event) => onValueChange?.(name, event)} />;
}
