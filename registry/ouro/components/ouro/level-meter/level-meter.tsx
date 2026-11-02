"use client";

import { memo, useId, type CSSProperties, type JSX, type Ref } from "react";
import {
  barClass,
  BARS_DEFAULT,
  BARS_MAX,
  BARS_MIN,
  barSizes,
  fillClass,
  fillTones,
  rowSizes,
  wordFor,
  type LevelMeterValueText,
} from "@/registry/ouro/components/ouro/level-meter/level-meter-styles";
import { toneFor } from "@/registry/ouro/lib/ouro/appearance-hints";
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/ouro/class-name-check";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { toneWarning } from "@/registry/ouro/lib/ouro/tones";
import { useDevWarnings } from "@/registry/ouro/lib/ouro/use-dev-messages";

export type { LevelMeterValueText };

/** Props for {@link LevelMeter}. */
export interface LevelMeterProps {
  /**
   * The level now, from 0 (silence) to 1 (full scale): feed it from your audio, for example an
   * `AnalyserNode`'s loudness, up to about 15 times a second. A level outside 0 to 1 shows
   * clamped, and one that is not a number shows as 0.
   * @claim "The level now, from 0 (silence)" registry/ouro/components/ouro/level-meter/level-meter.test.tsx verify:testExists(registry/ouro/components/ouro/level-meter/level-meter.test.tsx::LevelMeter > clamps a level outside 0 to 1, and shows a level that is not a number as 0)
   * @claim "The level now, from 0 (silence)" registry/ouro/components/ouro/level-meter/level-meter.test.tsx verify:testExists(registry/ouro/components/ouro/level-meter/level-meter.test.tsx::LevelMeter > changes only the root's level and the bars that light or go out when the level changes)
   * @claim "A level outside 0 to 1 shows" registry/ouro/components/ouro/level-meter/level-meter.test.tsx verify:testExists(registry/ouro/components/ouro/level-meter/level-meter.test.tsx::LevelMeter > clamps a level outside 0 to 1, and shows a level that is not a number as 0)
   */
  value: number;
  /** What the meter measures: "Microphone level". It names the meter for screen readers. */
  label: string;
  /**
   * Hides the label visually; screen readers still use it.
   * @claim "Hides the label visually; screen readers" registry/ouro/components/ouro/level-meter/level-meter.test.tsx verify:testExists(registry/ouro/components/ouro/level-meter/level-meter.test.tsx::LevelMeter > hides the label visually with hideLabel, and keeps the name)
   */
  hideLabel?: boolean | undefined;
  /**
   * How many bars to draw, a whole number from 3 to 24. A number outside that, or with a
   * fraction, draws the nearest one.
   * @default 8
   * @claim "How many bars to draw, a" registry/ouro/components/ouro/level-meter/level-meter.test.tsx verify:testExists(registry/ouro/components/ouro/level-meter/level-meter.test.tsx::LevelMeter > draws 8 bars by default, or the nearest whole number from 3 to 24)
   * @claim "A number outside that, or with" registry/ouro/components/ouro/level-meter/level-meter.test.tsx verify:testExists(registry/ouro/components/ouro/level-meter/level-meter.test.tsx::LevelMeter > draws 8 bars by default, or the nearest whole number from 3 to 24)
   */
  bars?: number | undefined;
  /**
   * The meter's size: bars 12px, 16px or 24px high. `sm` fits a menu row.
   * @default "md"
   * @claim "The meter's size: bars 12px, 16px" registry/ouro/components/ouro/level-meter/level-meter.test.tsx verify:testExists(registry/ouro/components/ouro/level-meter/level-meter.test.tsx::LevelMeter > draws bars 12, 16 and 24px high, md by default)
   */
  size?: "sm" | "md" | "lg" | (string & { 'Use "sm", "md" or "lg"': never }) | undefined;
  /**
   * Color role from the theme for the lit bars, named after its token. Unlit bars are always
   * the muted foreground, so a silent meter is muted whatever its tone. `secondary` is the
   * muted foreground.
   * @default "success"
   * @claim "Unlit bars are always the muted foreground," registry/ouro/components/ouro/level-meter/level-meter.test.tsx verify:testExists(registry/ouro/components/ouro/level-meter/level-meter.test.tsx::LevelMeter > lights its bars in the tone's colour, success by default, and leaves the rest muted)
   */
  tone?:
    | "primary"
    | "secondary"
    | "destructive"
    | "success"
    | "warning"
    | (string & { 'danger is "destructive"; accent is "primary"; neutral is "secondary"': never })
    | undefined;
  /**
   * The words screen readers hear for the level: below a tenth, up to three quarters, and
   * from there. Translate them with the rest of your interface.
   * @default { quiet: "Quiet", speaking: "Speaking", loud: "Loud" }
   * @claim "The words screen readers hear for" registry/ouro/components/ouro/level-meter/level-meter.test.tsx verify:testExists(registry/ouro/components/ouro/level-meter/level-meter.test.tsx::LevelMeter > reads Quiet below a tenth, Speaking up to three quarters and Loud from there, in words valueText translates)
   */
  valueText?: LevelMeterValueText | undefined;
  /** Layout only: margins, grid placement (`mt-2`, `ms-auto`). Appearance classes warn in development; use `tone` and `size`. */
  className?: string | undefined;
  /** The meter's id, for `aria-describedby` elsewhere on the page. */
  id?: string | undefined;
  ref?: Ref<HTMLDivElement> | undefined;

  /**
   * Not a prop. The level is `value`, from 0 to 1: `<LevelMeter value={0.4}>`.
   * @claim "The level is `value`, from 0" registry/ouro/components/ouro/level-meter/level-meter.test.tsx verify:testExists(registry/ouro/components/ouro/level-meter/level-meter.test.tsx::LevelMeter > clamps a level outside 0 to 1, and shows a level that is not a number as 0)
   */
  level?: { 'Use <LevelMeter value={0.4}>': never };
  /**
   * Not a prop. `value` runs from 0 to 1: `<LevelMeter value={level / max}>`.
   * @claim "`value` runs from 0 to 1:" registry/ouro/components/ouro/level-meter/level-meter.test.tsx verify:testExists(registry/ouro/components/ouro/level-meter/level-meter.test.tsx::LevelMeter > clamps a level outside 0 to 1, and shows a level that is not a number as 0)
   */
  max?: { 'value runs from 0 to 1: <LevelMeter value={level / max}>': never };
  /** Not a prop. Ouro UI uses `bars`: `<LevelMeter bars={8}>`. */
  segments?: { 'Use <LevelMeter bars={8}>': never };
  /** Not a prop. Ouro UI uses `tone`: `<LevelMeter tone="success">`. */
  color?: { 'Use <LevelMeter tone="success">': never };
}

const defaultValueText: LevelMeterValueText = { quiet: "Quiet", speaking: "Speaking", loud: "Loud" };

interface BarProps {
  index: number;
  lit: boolean;
  className: string;
  fillClassName: string;
}

// Memoised: a new level re-renders only the bars that light or go out. How far each lit bar
// grows comes from the root's `--ouro-level`, not from a prop.
const Bar = memo(function Bar({ index, lit, className, fillClassName }: BarProps): JSX.Element {
  return (
    <span data-ouro-level-meter-bar="" className={className} style={{ "--ouro-level-bar": index } as CSSProperties}>
      <span data-ouro-part="fill" data-highlighted={lit ? "" : undefined} className={fillClassName} />
    </span>
  );
});

/**
 * A small live input level: a row of bars that light and grow with a microphone's level, so the
 * person can tell it hears them before anyone else does (before joining a call, in a device
 * menu, in a "test your microphone" row). The app feeds `value`, from 0 to 1, as often as about
 * 15 times a second.
 *
 * It is a `meter` named by its label, from 0 to 100, with the level rounded and in words
 * ("Quiet", "Speaking", "Loud"). It is no live region: screen readers read it when the person
 * goes to it, and it never announces the level as it changes.
 *
 * Every update is cheap. The level sets one CSS variable on the root, each lit bar grows from
 * it with `scale` over `--ouro-duration-fast`, and React re-renders only the bars that light or
 * go out, so a level 15 times a second changes no layout. With reduced motion nothing scales:
 * the bars lit up to the level show whole, and only their opacity fades. Under forced colours
 * each bar keeps an edge and a lit one is Highlight.
 *
 * Its agent side, `levelMeterAx` in `level-meter-styles.ts`, declares no agent reads and no
 * actions: audio levels stay with the person.
 *
 * Use `Progress` instead to show how far along a task is, and `Spinner` for a wait you
 * can't measure.
 *
 * @claim "The app feeds `value`, from 0" registry/ouro/components/ouro/level-meter/level-meter.test.tsx verify:testExists(registry/ouro/components/ouro/level-meter/level-meter.test.tsx::LevelMeter > clamps a level outside 0 to 1, and shows a level that is not a number as 0)
 * @claim "The app feeds `value`, from 0" registry/ouro/components/ouro/level-meter/level-meter.test.tsx verify:testExists(registry/ouro/components/ouro/level-meter/level-meter.test.tsx::LevelMeter > changes only the root's level and the bars that light or go out when the level changes)
 * @claim "Every update is cheap." registry/ouro/components/ouro/level-meter/level-meter.test.tsx verify:testExists(registry/ouro/components/ouro/level-meter/level-meter.test.tsx::LevelMeter > changes only the root's level and the bars that light or go out when the level changes)
 * @claim "It is a `meter` named by its" registry/ouro/components/ouro/level-meter/level-meter.test.tsx verify:testExists(registry/ouro/components/ouro/level-meter/level-meter.test.tsx::LevelMeter > is a meter named by its label, from 0 to 100, with the level rounded and in words)
 * @claim "It is no live region: screen readers" registry/ouro/components/ouro/level-meter/level-meter.test.tsx verify:testExists(registry/ouro/components/ouro/level-meter/level-meter.test.tsx::LevelMeter > is no live region, so nothing is announced as the level changes)
 * @claim "The level sets one CSS variable" registry/ouro/components/ouro/level-meter/level-meter.test.tsx verify:testExists(registry/ouro/components/ouro/level-meter/level-meter.test.tsx::LevelMeter > changes only the root's level and the bars that light or go out when the level changes)
 * @claim "The level sets one CSS variable" registry/ouro/components/ouro/level-meter/level-meter.test.tsx verify:testExists(registry/ouro/components/ouro/level-meter/level-meter.test.tsx::LevelMeter motion > grows lit bars from their foot with a short scale transition, and with reduced motion shows them whole and only fades them)
 * @claim "With reduced motion nothing scales: the" registry/ouro/components/ouro/level-meter/level-meter.test.tsx verify:testExists(registry/ouro/components/ouro/level-meter/level-meter.test.tsx::LevelMeter motion > grows lit bars from their foot with a short scale transition, and with reduced motion shows them whole and only fades them)
 * @claim "Under forced colours each bar keeps" registry/ouro/components/ouro/level-meter/level-meter.test.tsx verify:testExists(registry/ouro/components/ouro/level-meter/level-meter.test.tsx::LevelMeter > keeps an edge on every bar under forced colours, and fills a lit bar with Highlight)
 * @claim "Its agent side, `levelMeterAx` in `level-meter-styles.ts`," registry/ouro/components/ouro/level-meter/level-meter.test.tsx verify:testExists(registry/ouro/components/ouro/level-meter/level-meter.test.tsx::LevelMeter > declares no agent reads and no actions)
 * @group Feedback
 * @see https://ui.ouro.bot/docs/level-meter
 *
 * @example
 * <LevelMeter label="Microphone level" value={level} />
 * <LevelMeter label="Microphone level" hideLabel value={level} size="sm" bars={5} />
 */
export function LevelMeter(props: LevelMeterProps): JSX.Element {
  const {
    value,
    label,
    hideLabel,
    bars: barsProp = BARS_DEFAULT,
    size: sizeProp = "md",
    tone: toneProp = "success",
    valueText = defaultValueText,
    className,
    id,
    ref,
    // Guard props (hint types), dropped here so they never reach the DOM.
    level: levelProp,
    max,
    segments,
    color,
  } = props;
  // A level that is not a number (NaN) is silence.
  const level = Math.min(Math.max(value, 0), 1) || 0;
  const count = Math.min(Math.max(Math.round(barsProp), BARS_MIN), BARS_MAX) || BARS_DEFAULT;
  const size = Object.hasOwn(rowSizes, sizeProp) ? (sizeProp as keyof typeof rowSizes) : "md";
  const tone = Object.hasOwn(fillTones, toneProp) ? (toneProp as keyof typeof fillTones) : "success";
  const reached = level * count;
  const lit = Math.round(reached);
  // An id of our own puts aria-labelledby in the server HTML too.
  const labelId = `${useId()}-label`;
  useAppearanceClassNameCheck(
    "LevelMeter",
    className,
    process.env.NODE_ENV !== "production" ? (token: string) => `tone="${toneFor(token)}"` : /* istanbul ignore next @preserve -- production only */ "",
  );
  useDevWarnings(
    "LevelMeter",
    process.env.NODE_ENV !== "production"
      ? () => [
          level !== value && ["value is outside 0 to 1; pass a fraction of full scale", "<LevelMeter value={percent / 100}>"],
          count !== barsProp && [`bars={${String(barsProp)}} is not a whole number from ${BARS_MIN} to ${BARS_MAX}`, `<LevelMeter bars={${count}}>`],
          size !== sizeProp && [`size="${String(sizeProp)}" is not a size; use "sm", "md", "lg"`, '<LevelMeter size="md">'],
          tone !== toneProp && toneWarning("LevelMeter", String(toneProp), Object.keys(fillTones)),
          levelProp !== undefined && ["level is not a prop", "<LevelMeter value={level}>"],
          max !== undefined && ["max is not a prop; value runs from 0 to 1", "<LevelMeter value={level / max}>"],
          segments !== undefined && ["segments is not a prop", `<LevelMeter bars={${String(segments)}}>`],
          color !== undefined && ["color is not a prop", `<LevelMeter tone="${toneFor(`bg-${String(color)}`)}">`],
        ]
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );
  const barClassName = cn(barClass, barSizes[size]);
  const fillClassName = cn(fillClass, fillTones[tone]);
  return (
    <div
      ref={ref}
      id={id}
      role="meter"
      aria-labelledby={labelId}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(level * 100)}
      aria-valuetext={wordFor(level, valueText)}
      data-ouro="level-meter"
      className={cn("grid w-fit gap-1.5", className)}
      style={{ "--ouro-level": reached } as CSSProperties}
    >
      <span id={labelId} data-ouro-level-meter-label="" className={hideLabel ? "sr-only" : "text-sm font-medium text-foreground"}>
        {label}
      </span>
      <span data-ouro-level-meter-bars="" className={cn("flex items-end", rowSizes[size])}>
        {Array.from({ length: count }, (_, index) => (
          <Bar key={index} index={index} lit={index < lit} className={barClassName} fillClassName={fillClassName} />
        ))}
      </span>
    </div>
  );
}
