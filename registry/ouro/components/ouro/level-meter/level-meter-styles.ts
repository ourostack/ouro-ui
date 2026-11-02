export {
  ATTACK_MS,
  barClass,
  BARS_DEFAULT,
  BARS_MAX,
  BARS_MIN,
  barSizes,
  DB_FLOOR,
  HOLD_MS,
  levelFromAmplitude,
  litTones,
  LOUD_FROM,
  QUIET_BELOW,
  READ_EVERY_MS,
  RELEASE_MS,
  rowSizes,
  stepToward,
  wordFor,
  type LevelMeterValueText,
};

// Values, the level's arithmetic, class strings and the agent side for LevelMeter, apart from the
// component so its file exports only components (React Fast Refresh). Class strings are literal so
// the app's Tailwind finds them when it compiles.

/** How many bars a meter draws without `bars`. @internal */
const BARS_DEFAULT = 8;
/**
 * The fewest bars a meter draws. @internal
 * @claim "The fewest bars a meter draws." registry/ouro/components/ouro/level-meter/level-meter.test.tsx verify:testExists(registry/ouro/components/ouro/level-meter/level-meter.test.tsx::LevelMeter > draws 8 bars by default, or the nearest whole number from 3 to 24)
 */
const BARS_MIN = 3;
/**
 * The most bars a meter draws. @internal
 * @claim "The most bars a meter draws." registry/ouro/components/ouro/level-meter/level-meter.test.tsx verify:testExists(registry/ouro/components/ouro/level-meter/level-meter.test.tsx::LevelMeter > draws 8 bars by default, or the nearest whole number from 3 to 24)
 */
const BARS_MAX = 24;

/**
 * The quietest level the meter shows, in dBFS: an amplitude at or below it lights no bar, and full
 * scale (0 dBFS) lights them all. @internal
 * @claim "The quietest level the meter shows, in" registry/ouro/components/ouro/level-meter/level-meter.test.tsx verify:testExists(registry/ouro/components/ouro/level-meter/level-meter.test.tsx::LevelMeter > maps a linear amplitude to the bars on a decibel scale from -60 dBFS to 0, so speech lights 3 to 5 of 8 bars)
 */
const DB_FLOOR = -60;

/**
 * The meter's level, from 0 to 1, for a linear amplitude from 0 to 1 (an RMS, as an analyser gives
 * it): its decibels from {@link DB_FLOOR} to 0, as a share of that range. Silence, a negative
 * amplitude and one that is not a number are 0; full scale and above is 1. @internal
 * @claim "Silence, a negative amplitude and one" registry/ouro/components/ouro/level-meter/level-meter.test.tsx verify:testExists(registry/ouro/components/ouro/level-meter/level-meter.test.tsx::LevelMeter > maps a linear amplitude to the bars on a decibel scale from -60 dBFS to 0, so speech lights 3 to 5 of 8 bars)
 * @claim "The meter's level, from 0 to 1," registry/ouro/components/ouro/level-meter/level-meter.test.tsx verify:testExists(registry/ouro/components/ouro/level-meter/level-meter.test.tsx::LevelMeter > maps a linear amplitude to the bars on a decibel scale from -60 dBFS to 0, so speech lights 3 to 5 of 8 bars)
 */
function levelFromAmplitude(amplitude: number): number {
  // Silence is -Infinity dB, which clamps to 0; a negative amplitude or NaN has no logarithm (NaN), which reads as 0.
  return Math.min(Math.max((20 * Math.log10(amplitude) - DB_FLOOR) / -DB_FLOOR, 0), 1) || 0;
}

/**
 * Below this level (-48 dBFS) the meter reads "Quiet". @internal
 * @claim "Below this level (-48 dBFS) the meter" registry/ouro/components/ouro/level-meter/level-meter.test.tsx verify:testExists(registry/ouro/components/ouro/level-meter/level-meter.test.tsx::LevelMeter > reads Quiet below -48 dBFS, Speaking up to -12 dBFS and Loud from there, in words valueText translates)
 */
const QUIET_BELOW = 0.2;
/**
 * From this level on (-12 dBFS) the meter reads "Loud". @internal
 * @claim "From this level on (-12 dBFS) the" registry/ouro/components/ouro/level-meter/level-meter.test.tsx verify:testExists(registry/ouro/components/ouro/level-meter/level-meter.test.tsx::LevelMeter > reads Quiet below -48 dBFS, Speaking up to -12 dBFS and Loud from there, in words valueText translates)
 */
const LOUD_FROM = 0.8;

/**
 * The words a meter's level is read as, one for each band of level.
 * @claim "The words a meter's level is read" registry/ouro/components/ouro/level-meter/level-meter.test.tsx verify:testExists(registry/ouro/components/ouro/level-meter/level-meter.test.tsx::LevelMeter > reads Quiet below -48 dBFS, Speaking up to -12 dBFS and Loud from there, in words valueText translates)
 */
interface LevelMeterValueText {
  /**
   * Below -48 dBFS, silence included: "Quiet".
   * @claim "Below -48 dBFS, silence included:" registry/ouro/components/ouro/level-meter/level-meter.test.tsx verify:testExists(registry/ouro/components/ouro/level-meter/level-meter.test.tsx::LevelMeter > reads Quiet below -48 dBFS, Speaking up to -12 dBFS and Loud from there, in words valueText translates)
   */
  quiet: string;
  /**
   * From -48 dBFS up to -12 dBFS, where speech sits: "Speaking".
   * @claim "From -48 dBFS up to -12 dBFS," registry/ouro/components/ouro/level-meter/level-meter.test.tsx verify:testExists(registry/ouro/components/ouro/level-meter/level-meter.test.tsx::LevelMeter > reads Quiet below -48 dBFS, Speaking up to -12 dBFS and Loud from there, in words valueText translates)
   */
  speaking: string;
  /**
   * From -12 dBFS up: "Loud".
   * @claim "From -12 dBFS up:" registry/ouro/components/ouro/level-meter/level-meter.test.tsx verify:testExists(registry/ouro/components/ouro/level-meter/level-meter.test.tsx::LevelMeter > reads Quiet below -48 dBFS, Speaking up to -12 dBFS and Loud from there, in words valueText translates)
   */
  loud: string;
}

/**
 * The word for a meter level from 0 to 1. @internal
 * @claim "The word for a meter level from" registry/ouro/components/ouro/level-meter/level-meter.test.tsx verify:testExists(registry/ouro/components/ouro/level-meter/level-meter.test.tsx::LevelMeter > reads Quiet below -48 dBFS, Speaking up to -12 dBFS and Loud from there, in words valueText translates)
 */
function wordFor(level: number, words: LevelMeterValueText): string {
  if (level < QUIET_BELOW) return words.quiet;
  return level < LOUD_FROM ? words.speaking : words.loud;
}

/**
 * How fast the bars rise toward a louder level: the time constant, in milliseconds. @internal
 * @claim "How fast the bars rise toward a" registry/ouro/components/ouro/level-meter/level-meter.test.tsx verify:testExists(registry/ouro/components/ouro/level-meter/level-meter.test.tsx::LevelMeter > rises within about 50 ms and falls over about 350 ms, the same with reduced motion)
 */
const ATTACK_MS = 50;
/**
 * How slowly the bars fall toward a quieter level, so they hold between syllables: the time
 * constant, in milliseconds. @internal
 * @claim "How slowly the bars fall toward a" registry/ouro/components/ouro/level-meter/level-meter.test.tsx verify:testExists(registry/ouro/components/ouro/level-meter/level-meter.test.tsx::LevelMeter > rises within about 50 ms and falls over about 350 ms, the same with reduced motion)
 */
const RELEASE_MS = 350;

/**
 * The shown level `elapsed` milliseconds on from `shown`, moving toward `goal`: fast when it rises
 * and slowly when it falls, as an audio meter's ballistics do. @internal
 * @claim "The shown level `elapsed` milliseconds on from" registry/ouro/components/ouro/level-meter/level-meter.test.tsx verify:testExists(registry/ouro/components/ouro/level-meter/level-meter.test.tsx::LevelMeter > rises within about 50 ms and falls over about 350 ms, the same with reduced motion)
 */
function stepToward(shown: number, goal: number, elapsed: number): number {
  // Stryker disable next-line EqualityOperator: when goal equals shown, either constant gives goal.
  const constant = goal > shown ? ATTACK_MS : RELEASE_MS;
  return goal + (shown - goal) * Math.exp(-elapsed / constant);
}

/**
 * How far back the reading screen readers hear looks for the loudest level, in milliseconds. @internal
 * @claim "How far back the reading screen readers" registry/ouro/components/ouro/level-meter/level-meter.test.tsx verify:testExists(registry/ouro/components/ouro/level-meter/level-meter.test.tsx::LevelMeter > holds its reading at the loudest level of the last 1.5 seconds, so a pause after speech still reads Speaking)
 */
const HOLD_MS = 1500;
/**
 * How often the reading screen readers hear may change, in milliseconds. @internal
 * @claim "How often the reading screen readers hear" registry/ouro/components/ouro/level-meter/level-meter.test.tsx verify:testExists(registry/ouro/components/ouro/level-meter/level-meter.test.tsx::LevelMeter > updates its ARIA values at most twice a second, however often the level changes)
 */
const READ_EVERY_MS = 500;

/**
 * The row of bars at each size: its height and the gap between bars. @internal
 * @claim "The row of bars at each size:" registry/ouro/components/ouro/level-meter/level-meter.test.tsx verify:testExists(registry/ouro/components/ouro/level-meter/level-meter.test.tsx::LevelMeter > draws bars 12, 16 and 24px high, md by default)
 */
const rowSizes = { sm: "h-3 gap-0.5", md: "h-4 gap-1", lg: "h-6 gap-1" } as const;

/**
 * One bar's width at each size. @internal
 * @claim "One bar's width at each size." registry/ouro/components/ouro/level-meter/level-meter.test.tsx verify:testExists(registry/ouro/components/ouro/level-meter/level-meter.test.tsx::LevelMeter > draws bars 12, 16 and 24px high, md by default)
 */
const barSizes = { sm: "w-1", md: "w-1.5", lg: "w-2" } as const;

/**
 * A bar: a pill the row's full height, an outline in the muted foreground while unlit and filled
 * in the tone while lit (`data-highlighted`), so lit and unlit differ in shape as well as colour.
 * Nothing moves or scales: a bar's colours cross-fade, in a third of `--ouro-duration-fast` as it
 * lights and over `--ouro-duration-fast` as it goes out, the same with reduced motion. Under forced
 * colours its edge is CanvasText and a lit bar is Highlight. @internal
 * @claim "Nothing moves or scales: a bar's colours" registry/ouro/components/ouro/level-meter/level-meter.test.tsx verify:testExists(registry/ouro/components/ouro/level-meter/level-meter.test.tsx::LevelMeter motion > cross-fades a bar as it lights in a third of --ouro-duration-fast, the same with reduced motion, and nothing moves or scales)
 * @claim "Under forced colours its edge is CanvasText" registry/ouro/components/ouro/level-meter/level-meter.test.tsx verify:testExists(registry/ouro/components/ouro/level-meter/level-meter.test.tsx::LevelMeter > keeps an edge on every bar under forced colours, and fills a lit bar with Highlight)
 */
const barClass =
  "relative block h-full shrink-0 rounded-full box-border border border-solid border-muted-foreground bg-transparent " +
  "transition-[background-color,border-color] duration-(--ouro-duration-fast) ease-[ease] " +
  "data-highlighted:duration-[calc(var(--ouro-duration-fast)/3)] " +
  "forced-colors:border-[CanvasText] forced-colors:data-highlighted:border-[Highlight] forced-colors:data-highlighted:bg-[Highlight]";

/**
 * A lit bar's colour for each tone. @internal
 * @claim "A lit bar's colour for each tone." registry/ouro/components/ouro/level-meter/level-meter.test.tsx verify:testExists(registry/ouro/components/ouro/level-meter/level-meter.test.tsx::LevelMeter > lights its bars in the tone's colour, success by default, and draws unlit bars as outlines in the muted foreground)
 */
const litTones = {
  primary: "data-highlighted:border-primary data-highlighted:bg-primary",
  secondary: "data-highlighted:border-muted-foreground data-highlighted:bg-muted-foreground",
  destructive: "data-highlighted:border-destructive data-highlighted:bg-destructive",
  success: "data-highlighted:border-success data-highlighted:bg-success",
  warning: "data-highlighted:border-warning data-highlighted:bg-warning",
} as const;

/**
 * LevelMeter's agent side, for Ouro AX's kit. It declares no reads and no actions: audio levels
 * stay with the person.
 *
 * @example
 * levelMeterAx.reads.length; // 0
 * @claim "It declares no reads and no" registry/ouro/components/ouro/level-meter/level-meter.test.tsx verify:testExists(registry/ouro/components/ouro/level-meter/level-meter.test.tsx::LevelMeter > declares no agent reads and no actions)
 */
// TODO(ourostack/ouro-ui ax/component): wrap with defineComponentAx once it lands
export const levelMeterAx = {
  component: "LevelMeter",
  reads: [],
  actions: [],
} as const;
