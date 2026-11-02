export { barClass, BARS_DEFAULT, BARS_MAX, BARS_MIN, barSizes, fillClass, fillTones, LOUD_FROM, QUIET_BELOW, rowSizes, wordFor, type LevelMeterValueText };

// Class strings, values and the agent side for LevelMeter, apart from the component so its file
// exports only components (React Fast Refresh). Class strings are literal so the app's Tailwind
// finds them when it compiles.

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

/** Below this level the meter reads "Quiet". @internal */
const QUIET_BELOW = 0.1;
/** From this level on the meter reads "Loud". @internal */
const LOUD_FROM = 0.75;

/**
 * The words a meter's value is read as, one for each band of level.
 * @claim "The words a meter's value is read" registry/ouro/components/ouro/level-meter/level-meter.test.tsx verify:testExists(registry/ouro/components/ouro/level-meter/level-meter.test.tsx::LevelMeter > reads Quiet below a tenth, Speaking up to three quarters and Loud from there, in words valueText translates)
 */
interface LevelMeterValueText {
  /** Below a tenth of the range, silence included: "Quiet". */
  quiet: string;
  /**
   * From a tenth up to three quarters: "Speaking".
   * @claim "From a tenth up to three quarters:" registry/ouro/components/ouro/level-meter/level-meter.test.tsx verify:testExists(registry/ouro/components/ouro/level-meter/level-meter.test.tsx::LevelMeter > reads Quiet below a tenth, Speaking up to three quarters and Loud from there, in words valueText translates)
   */
  speaking: string;
  /**
   * From three quarters up: "Loud".
   * @claim "From three quarters up:" registry/ouro/components/ouro/level-meter/level-meter.test.tsx verify:testExists(registry/ouro/components/ouro/level-meter/level-meter.test.tsx::LevelMeter > reads Quiet below a tenth, Speaking up to three quarters and Loud from there, in words valueText translates)
   */
  loud: string;
}

/**
 * The word for a level from 0 to 1. @internal
 * @claim "The word for a level from 0" registry/ouro/components/ouro/level-meter/level-meter.test.tsx verify:testExists(registry/ouro/components/ouro/level-meter/level-meter.test.tsx::LevelMeter > reads Quiet below a tenth, Speaking up to three quarters and Loud from there, in words valueText translates)
 */
function wordFor(level: number, words: LevelMeterValueText): string {
  if (level < QUIET_BELOW) return words.quiet;
  return level < LOUD_FROM ? words.speaking : words.loud;
}

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
 * A bar: an unlit slot in the muted foreground at a quarter strength, with an edge of its own
 * under forced colours. @internal
 */
const barClass =
  "relative block h-full shrink-0 overflow-hidden rounded-full box-border bg-muted-foreground/25 " +
  "forced-colors:border forced-colors:border-solid forced-colors:border-[CanvasText]";

/**
 * The lit part of a bar, which carries `data-highlighted` while its bar is lit. With motion it grows from the bar's foot to the share of the bar the
 * level reaches (`scale`, from the root's `--ouro-level` and the bar's `--ouro-level-bar`), over
 * `--ouro-duration-fast`. With reduced motion it never scales: a bar is wholly lit or unlit, and
 * only its opacity fades. Under forced colours it is Highlight. @internal
 * @claim "With reduced motion it never scales:" registry/ouro/components/ouro/level-meter/level-meter.test.tsx verify:testExists(registry/ouro/components/ouro/level-meter/level-meter.test.tsx::LevelMeter motion > grows lit bars from their foot with a short scale transition, and with reduced motion shows them whole and only fades them)
 */
const fillClass =
  "absolute inset-0 block origin-bottom rounded-[inherit] opacity-100 " +
  "scale-y-[clamp(0,calc(var(--ouro-level)_-_var(--ouro-level-bar)),1)] " +
  "transition-[scale] duration-(--ouro-duration-fast) ease-(--ouro-ease-out) " +
  "motion-reduce:scale-y-100 motion-reduce:opacity-0 motion-reduce:data-highlighted:opacity-100 " +
  "motion-reduce:transition-[opacity] motion-reduce:ease-[ease] " +
  "forced-colors:bg-[Highlight]";

/**
 * The lit part's colour for each tone. @internal
 * @claim "The lit part's colour for each tone." registry/ouro/components/ouro/level-meter/level-meter.test.tsx verify:testExists(registry/ouro/components/ouro/level-meter/level-meter.test.tsx::LevelMeter > lights its bars in the tone's colour, success by default, and leaves the rest muted)
 */
const fillTones = {
  primary: "bg-primary",
  secondary: "bg-muted-foreground",
  destructive: "bg-destructive",
  success: "bg-success",
  warning: "bg-warning",
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
