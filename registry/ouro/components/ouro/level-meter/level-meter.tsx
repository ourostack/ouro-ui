"use client";

import { memo, useEffect, useId, useRef, useState, type JSX, type Ref } from "react";
import {
  bandFor,
  bandValues,
  barClass,
  BARS_DEFAULT,
  BARS_MAX,
  BARS_MIN,
  barSizes,
  HOLD_MS,
  levelFromAmplitude,
  litTones,
  mutedLit,
  READ_EVERY_MS,
  rowSizes,
  stepToward,
  type LevelMeterBand,
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
   * The microphone's linear amplitude now, from 0 (silence) to 1 (full scale): the RMS of the
   * samples an `AnalyserNode` gives, fed up to about 15 times a second. The meter maps it to its
   * bars on a decibel scale from -60 dBFS (no bar) to 0 dBFS (every bar), so ordinary speech,
   * around -40 to -20 dBFS, lights 3 to 5 of 8 bars. An amplitude below 0 or not a number shows as
   * silence, and one above 1 as full scale. To get it: `analyser.getFloatTimeDomainData(samples)`,
   * then `Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length)`.
   * @claim "The microphone's linear amplitude now, from" registry/ouro/components/ouro/level-meter/level-meter.test.tsx verify:testExists(registry/ouro/components/ouro/level-meter/level-meter.test.tsx::LevelMeter > maps a linear amplitude to the bars on a decibel scale from -60 dBFS to 0, so speech lights 3 to 5 of 8 bars)
   * @claim "The meter maps it to its" registry/ouro/components/ouro/level-meter/level-meter.test.tsx verify:testExists(registry/ouro/components/ouro/level-meter/level-meter.test.tsx::LevelMeter > maps a linear amplitude to the bars on a decibel scale from -60 dBFS to 0, so speech lights 3 to 5 of 8 bars)
   * @claim "An amplitude below 0 or not a" registry/ouro/components/ouro/level-meter/level-meter.test.tsx verify:testExists(registry/ouro/components/ouro/level-meter/level-meter.test.tsx::LevelMeter > shows an amplitude outside 0 to 1, or not a number, as silence or full scale, and says so in development)
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
   * Color role from the theme for the lit bars, named after its token. Unlit bars are always a
   * quiet track in the input colour, so a silent meter is quiet whatever its tone. `secondary`
   * fills lit bars in the muted foreground, as `muted` does.
   * @default "success"
   * @claim "Unlit bars are always a quiet track" registry/ouro/components/ouro/level-meter/level-meter.test.tsx verify:testExists(registry/ouro/components/ouro/level-meter/level-meter.test.tsx::LevelMeter > lights its bars in the tone's colour, success by default, and draws unlit bars as a quiet filled track)
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
   * The microphone is muted: the lit bars dim to the muted foreground, whatever the tone, and still
   * follow `value`, so the person can tell the microphone hears them while nobody else does.
   * Screen readers hear "Muted" (`valueText.muted`) and a value of 0, whatever the level.
   * @claim "The microphone is muted: the lit bars" registry/ouro/components/ouro/level-meter/level-meter.test.tsx verify:testExists(registry/ouro/components/ouro/level-meter/level-meter.test.tsx::LevelMeter > dims its lit bars while muted, still showing the level, and reads Muted with a value of 0)
   * @claim "and a value of 0, whatever the level." registry/ouro/components/ouro/level-meter/level-meter.test.tsx verify:testExists(registry/ouro/components/ouro/level-meter/level-meter.test.tsx::LevelMeter > dims its lit bars while muted, still showing the level, and reads Muted with a value of 0)
   */
  muted?: boolean | undefined;
  /**
   * The words screen readers hear for the loudest level of the last 1.5 seconds: below -48
   * dBFS, up to -12 dBFS, and from there, and the word while `muted`. Translate them with the
   * rest of your interface.
   * @default { quiet: "Quiet", speaking: "Speaking", loud: "Loud", muted: "Muted" }
   * @claim "The words screen readers hear for" registry/ouro/components/ouro/level-meter/level-meter.test.tsx verify:testExists(registry/ouro/components/ouro/level-meter/level-meter.test.tsx::LevelMeter > reads Quiet below -48 dBFS, Speaking up to -12 dBFS and Loud from there, in words valueText translates)
   * @claim "The words screen readers hear for" registry/ouro/components/ouro/level-meter/level-meter.test.tsx verify:testExists(registry/ouro/components/ouro/level-meter/level-meter.test.tsx::LevelMeter > holds its reading at the loudest level of the last 1.5 seconds, so a pause after speech still reads Speaking)
   */
  valueText?: LevelMeterValueText | undefined;
  /** Layout only: margins, grid placement (`mt-2`, `ms-auto`). Appearance classes warn in development; use `tone` and `size`. */
  className?: string | undefined;
  /** The meter's id, for `aria-describedby` elsewhere on the page. */
  id?: string | undefined;
  ref?: Ref<HTMLDivElement> | undefined;

  /** Not a prop. The amplitude is `value`: `<LevelMeter value={rms}>`. */
  level?: { 'Use <LevelMeter value={rms}>': never };
  /**
   * Not a prop. `value` is an amplitude from 0 to 1: `<LevelMeter value={rms}>`.
   * @claim "`value` is an amplitude from 0 to" registry/ouro/components/ouro/level-meter/level-meter.test.tsx verify:testExists(registry/ouro/components/ouro/level-meter/level-meter.test.tsx::LevelMeter > shows an amplitude outside 0 to 1, or not a number, as silence or full scale, and says so in development)
   */
  max?: { 'value is an amplitude from 0 to 1: <LevelMeter value={rms}>': never };
  /** Not a prop. Ouro UI uses `bars`: `<LevelMeter bars={8}>`. */
  segments?: { 'Use <LevelMeter bars={8}>': never };
  /** Not a prop. Ouro UI uses `tone`: `<LevelMeter tone="success">`. */
  color?: { 'Use <LevelMeter tone="success">': never };
}

const defaultValueText: LevelMeterValueText = { quiet: "Quiet", speaking: "Speaking", loud: "Loud", muted: "Muted" };

/**
 * The level the bars show: `level` followed with an audio meter's ballistics, fast up and slow
 * down, on animation frames while it moves. It re-renders only when the number of lit bars changes.
 */
function useShownLevel(level: number, bars: number): number {
  const [shown, setShown] = useState(level);
  const current = useRef(level);
  const drawn = useRef(level);
  useEffect(() => {
    let frame = 0;
    let last = performance.now();
    const tick = () => {
      const now = performance.now();
      current.current = stepToward(current.current, level, now - last);
      last = now;
      if (Math.round(current.current * bars) !== Math.round(drawn.current * bars)) {
        drawn.current = current.current;
        setShown(current.current);
      }
      // On the way to the goal the lit bars stop changing once they match the goal's.
      if (Math.round(current.current * bars) !== Math.round(level * bars)) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [level, bars]);
  return shown;
}

/**
 * The band screen readers hear: that of the loudest level of the last `HOLD_MS`, checked every
 * `READ_EVERY_MS`, so a pause after speech still reads as speech, and the ARIA values change only
 * when the band does, at most twice a second.
 * @claim "The band screen readers hear: that of" registry/ouro/components/ouro/level-meter/level-meter.test.tsx verify:testExists(registry/ouro/components/ouro/level-meter/level-meter.test.tsx::LevelMeter > holds its reading at the loudest level of the last 1.5 seconds, so a pause after speech still reads Speaking)
 * @claim "The band screen readers hear: that of" registry/ouro/components/ouro/level-meter/level-meter.test.tsx verify:testExists(registry/ouro/components/ouro/level-meter/level-meter.test.tsx::LevelMeter > changes its ARIA values only when its word changes, and at most twice a second)
 */
function useReading(level: number): LevelMeterBand {
  const [band, setBand] = useState(() => bandFor(level));
  const latest = useRef(level);
  // Stryker disable next-line ArrayDeclaration: the first check drops every entry without a time before it reads one.
  const heard = useRef<Array<readonly [time: number, level: number]>>([]);
  useEffect(() => {
    latest.current = level;
    heard.current.push([performance.now(), level]);
  }, [level]);
  useEffect(() => {
    const timer = setInterval(() => {
      const now = performance.now();
      heard.current = heard.current.filter(([time]) => now - time <= HOLD_MS);
      const loudest = heard.current.reduce((most, [, past]) => Math.max(most, past), latest.current);
      // The same band bails out of the render, so nothing changes until the word does.
      setBand(bandFor(loudest));
    }, READ_EVERY_MS);
    return () => clearInterval(timer);
  },
  // Stryker disable next-line ArrayDeclaration: any constant dependency list starts the check once, as this one does.
  []);
  return band;
}

interface BarProps {
  lit: boolean;
  className: string;
}

// Memoised: a new count of lit bars re-renders only the bars that light or go out.
const Bar = memo(function Bar({ lit, className }: BarProps): JSX.Element {
  return <span data-ouro-part="segment" data-highlighted={lit ? "" : undefined} className={className} />;
});

/**
 * A small live input level: a row of bars that light from the start edge as a microphone picks up
 * sound, so the person can tell it hears them before anyone else does (before joining a call, in
 * a device menu, in a "test your microphone" row). The app feeds `value`, the microphone's linear
 * amplitude from 0 to 1, as often as about 15 times a second, and the meter maps it to its bars on
 * a decibel scale, so ordinary speech lights about half of them. To get the amplitude, read an
 * `AnalyserNode`'s samples with `getFloatTimeDomainData(samples)` and take their RMS:
 * `Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length)`.
 *
 * The bars move as an audio meter's do: they rise within about 50 ms and fall over about 350 ms,
 * so they hold between syllables. Every bar is the row's full height: lit bars are filled in the
 * tone and unlit ones are a quiet track with no outline. Nothing moves or scales; a bar's colours
 * cross-fade as it lights and goes out, the same with reduced motion. With more contrast unlit bars
 * are outlined, and under forced colours each bar keeps an edge and a lit one is Highlight.
 *
 * With `muted` the lit bars dim to the muted foreground and still follow the level, so a person
 * who speaks while muted sees that the microphone hears them and that nobody else does.
 *
 * It is a `meter` named by its label, from 0 to 100, with its level in words ("Quiet",
 * "Speaking", "Loud", or "Muted") and a value at the middle of the word's band (10, 50 or 90; 0
 * while muted). What it reports is the loudest level of the last 1.5 seconds, so a person who
 * speaks and then moves to the meter hears "Speaking", and its ARIA values change only when the
 * word does, at most twice a second, so a screen reader has nothing new to repeat while the person
 * speaks. It is no live region: screen readers read it when the person goes to it, and it never
 * announces the level as it changes.
 *
 * A new `value` re-renders the meter once. Between values it re-renders only when a bar lights
 * or goes out or the word changes, and the page changes only for those bars and, when the word
 * changes, the reading. The bars that keep their state are memoised.
 *
 * Its agent side, `levelMeterAx` in `level-meter-styles.ts`, declares no agent reads and no
 * actions: audio levels stay with the person.
 *
 * Use `Progress` instead to show how far along a task is, and `Spinner` for a wait you
 * can't measure.
 *
 * @claim "The app feeds `value`, the microphone's linear" registry/ouro/components/ouro/level-meter/level-meter.test.tsx verify:testExists(registry/ouro/components/ouro/level-meter/level-meter.test.tsx::LevelMeter > maps a linear amplitude to the bars on a decibel scale from -60 dBFS to 0, so speech lights 3 to 5 of 8 bars)
 * @claim "The bars move as an audio meter's" registry/ouro/components/ouro/level-meter/level-meter.test.tsx verify:testExists(registry/ouro/components/ouro/level-meter/level-meter.test.tsx::LevelMeter > rises within about 50 ms and falls over about 350 ms, the same with reduced motion)
 * @claim "Every bar is the row's full height:" registry/ouro/components/ouro/level-meter/level-meter.test.tsx verify:testExists(registry/ouro/components/ouro/level-meter/level-meter.test.tsx::LevelMeter > lights whole bars from the start edge in either direction, every bar the full height of the row)
 * @claim "Every bar is the row's full height:" registry/ouro/components/ouro/level-meter/level-meter.test.tsx verify:testExists(registry/ouro/components/ouro/level-meter/level-meter.test.tsx::LevelMeter > lights its bars in the tone's colour, success by default, and draws unlit bars as a quiet filled track)
 * @claim "With more contrast unlit bars are outlined," registry/ouro/components/ouro/level-meter/level-meter.test.tsx verify:testExists(registry/ouro/components/ouro/level-meter/level-meter.test.tsx::LevelMeter > outlines unlit bars in the muted foreground with more contrast)
 * @claim "Nothing moves or scales; a bar's colours" registry/ouro/components/ouro/level-meter/level-meter.test.tsx verify:testExists(registry/ouro/components/ouro/level-meter/level-meter.test.tsx::LevelMeter motion > cross-fades a bar as it lights in a third of --ouro-duration-fast, the same with reduced motion, and nothing moves or scales)
 * @claim "With `muted` the lit bars dim to" registry/ouro/components/ouro/level-meter/level-meter.test.tsx verify:testExists(registry/ouro/components/ouro/level-meter/level-meter.test.tsx::LevelMeter > dims its lit bars while muted, still showing the level, and reads Muted with a value of 0)
 * @claim "and under forced colours each bar keeps" registry/ouro/components/ouro/level-meter/level-meter.test.tsx verify:testExists(registry/ouro/components/ouro/level-meter/level-meter.test.tsx::LevelMeter > keeps an edge on every bar under forced colours, and fills a lit bar with Highlight)
 * @claim "It is a `meter` named by its" registry/ouro/components/ouro/level-meter/level-meter.test.tsx verify:testExists(registry/ouro/components/ouro/level-meter/level-meter.test.tsx::LevelMeter > is a meter named by its label, from 0 to 100, its value the middle of its word's band)
 * @claim "What it reports is the loudest level" registry/ouro/components/ouro/level-meter/level-meter.test.tsx verify:testExists(registry/ouro/components/ouro/level-meter/level-meter.test.tsx::LevelMeter > holds its reading at the loudest level of the last 1.5 seconds, so a pause after speech still reads Speaking)
 * @claim "What it reports is the loudest level" registry/ouro/components/ouro/level-meter/level-meter.test.tsx verify:testExists(registry/ouro/components/ouro/level-meter/level-meter.test.tsx::LevelMeter > changes its ARIA values only when its word changes, and at most twice a second)
 * @claim "It is no live region: screen readers" registry/ouro/components/ouro/level-meter/level-meter.test.tsx verify:testExists(registry/ouro/components/ouro/level-meter/level-meter.test.tsx::LevelMeter > is no live region, so nothing is announced as the level changes)
 * @claim "A new `value` re-renders the meter once." registry/ouro/components/ouro/level-meter/level-meter.test.tsx verify:testExists(registry/ouro/components/ouro/level-meter/level-meter.test.tsx::LevelMeter > re-renders between values only when a bar lights or goes out or the word changes, and changes the page only there)
 * @claim "Between values it re-renders only when a" registry/ouro/components/ouro/level-meter/level-meter.test.tsx verify:testExists(registry/ouro/components/ouro/level-meter/level-meter.test.tsx::LevelMeter > re-renders between values only when a bar lights or goes out or the word changes, and changes the page only there)
 * @claim "Its agent side, `levelMeterAx` in `level-meter-styles.ts`," registry/ouro/components/ouro/level-meter/level-meter.test.tsx verify:testExists(registry/ouro/components/ouro/level-meter/level-meter.test.tsx::LevelMeter > declares no agent reads and no actions)
 * @group Feedback
 * @see https://ui.ouroboros.bot/docs/level-meter
 *
 * @example
 * <LevelMeter label="Microphone level" value={rms} />
 * <LevelMeter label="Microphone level" hideLabel value={rms} size="sm" bars={5} />
 * <LevelMeter label="Microphone level" value={rms} muted={micMuted} />
 */
export function LevelMeter(props: LevelMeterProps): JSX.Element {
  const {
    value,
    label,
    hideLabel,
    bars: barsProp = BARS_DEFAULT,
    size: sizeProp = "md",
    tone: toneProp = "success",
    muted = false,
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
  const count = Math.min(Math.max(Math.round(barsProp), BARS_MIN), BARS_MAX) || BARS_DEFAULT;
  const size = Object.hasOwn(rowSizes, sizeProp) ? (sizeProp as keyof typeof rowSizes) : "md";
  const tone = Object.hasOwn(litTones, toneProp) ? (toneProp as keyof typeof litTones) : "success";
  const level = levelFromAmplitude(value);
  const lit = Math.round(useShownLevel(level, count) * count);
  const band = useReading(level);
  // An id of our own puts aria-labelledby in the server HTML too.
  const labelId = `${useId()}-label`;
  useAppearanceClassNameCheck(
    "LevelMeter",
    className,
    process.env.NODE_ENV !== "production"
      ? (token: string) => `tone="${toneFor(token)}"`
      : // Stryker disable next-line StringLiteral: production only; the check never runs there.
        /* istanbul ignore next @preserve -- production only */ "",
  );
  useDevWarnings(
    "LevelMeter",
    process.env.NODE_ENV !== "production"
      ? () => [
          !(value >= 0 && value <= 1) && ["value is a linear amplitude from 0 to 1, such as an analyser's RMS", "<LevelMeter value={rms}>"],
          count !== barsProp && [`bars={${String(barsProp)}} is not a whole number from ${BARS_MIN} to ${BARS_MAX}`, `<LevelMeter bars={${count}}>`],
          size !== sizeProp && [`size="${String(sizeProp)}" is not a size; use "sm", "md", "lg"`, '<LevelMeter size="md">'],
          tone !== toneProp && toneWarning("LevelMeter", String(toneProp), Object.keys(litTones)),
          levelProp !== undefined && ["level is not a prop", "<LevelMeter value={rms}>"],
          max !== undefined && ["max is not a prop; value is an amplitude from 0 to 1", "<LevelMeter value={rms}>"],
          segments !== undefined && ["segments is not a prop", `<LevelMeter bars={${String(segments)}}>`],
          color !== undefined && ["color is not a prop", `<LevelMeter tone="${toneFor(`bg-${String(color)}`)}">`],
        ]
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );
  const barClassName = cn(barClass, barSizes[size], muted ? mutedLit : litTones[tone]);
  return (
    <div
      ref={ref}
      id={id}
      role="meter"
      aria-labelledby={labelId}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={bandValues[muted ? "muted" : band]}
      aria-valuetext={valueText[muted ? "muted" : band]}
      data-ouro="level-meter"
      data-muted={muted ? "" : undefined}
      className={cn("grid w-fit gap-1.5", className)}
    >
      <span id={labelId} data-ouro-level-meter-label="" className={hideLabel ? "sr-only" : "text-sm font-medium text-foreground"}>
        {label}
      </span>
      <span className={cn("flex items-end", rowSizes[size])}>
        {Array.from({ length: count }, (_, index) => (
          <Bar key={index} lit={index < lit} className={barClassName} />
        ))}
      </span>
    </div>
  );
}
