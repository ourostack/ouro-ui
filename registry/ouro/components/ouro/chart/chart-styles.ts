export { barSlots, chartTones, curvePath, defaultFormatValue, defaultSummary, isCssName, markerShapes, niceTicks, plotClass, toneVar };
export type { ChartMarkerShape, ChartSummaryInfo, ChartTone, ChartType };

// The export list comes first because the shadcn CLI drops comments before a file's
// first statement, which would take the JSDoc below with it.

/**
 * The colors a series can take: the theme's five chart tokens (`--chart-1` to
 * `--chart-5`, which shadcn themes define for light and dark), and the tones for series
 * that mean something, such as failures in `destructive`.
 * @claim "The colors a series can take" registry/ouro/components/ouro/chart/chart.test.tsx verify:testExists(registry/ouro/components/ouro/chart/chart.test.tsx::Chart > colors each series from the theme's chart tokens, in light and dark)
 * @claim "The colors a series can take" registry/ouro/components/ouro/chart/chart.test.tsx verify:testExists(registry/ouro/components/ouro/chart/chart.test.tsx::Chart > maps tones to theme tokens and gives series without one the chart tokens in order)
 */
type ChartTone = "chart-1" | "chart-2" | "chart-3" | "chart-4" | "chart-5" | "primary" | "destructive" | "success" | "warning";

/**
 * What `Chart` draws when it has no children.
 *
 * @claim "What `Chart` draws when it has" registry/ouro/components/ouro/chart/chart.test.tsx verify:testExists(registry/ouro/components/ouro/chart/chart.test.tsx::Chart > draws lines with a different point shape per series)
 * @claim "What `Chart` draws when it has" registry/ouro/components/ouro/chart/chart.test.tsx verify:testExists(registry/ouro/components/ouro/chart/chart.test.tsx::Chart > draws areas)
 */
type ChartType = "bar" | "line" | "area";

/** What a `Chart` summary is written from. */
interface ChartSummaryInfo {
  /** The chart's title. */
  title: string;
  /** What the props draw, or `undefined` for a chart passed as children. */
  type: ChartType | undefined;
  /**
   * Each series' label, in config order.
   *
   * @claim "Each series' label, in config order" registry/ouro/components/ouro/chart/chart.test.tsx verify:testExists(registry/ouro/components/ouro/chart/chart.test.tsx::Chart > labels each series in a legend with a marker shape, so color is not the only cue)
   */
  series: string[];
  /** The category's label: the `config` label for `categoryKey`, or the key itself. */
  category: string;
  /** How many rows `data` has. */
  count: number;
}

/**
 * The tones a series can take, mapped to the theme variable each reads.
 *
 * @internal
 * @claim "The tones a series can take" registry/ouro/components/ouro/chart/chart.test.tsx verify:testExists(registry/ouro/components/ouro/chart/chart.test.tsx::Chart > maps tones to theme tokens and gives series without one the chart tokens in order)
 */
const chartTones: Readonly<Record<ChartTone, string>> = {
  "chart-1": "var(--chart-1)",
  "chart-2": "var(--chart-2)",
  "chart-3": "var(--chart-3)",
  "chart-4": "var(--chart-4)",
  "chart-5": "var(--chart-5)",
  primary: "var(--primary)",
  destructive: "var(--destructive)",
  success: "var(--success)",
  warning: "var(--warning)",
};

/**
 * The theme variable for a tone, or for the series' place in order when it has none.
 *
 * @internal
 * @claim "The theme variable for a tone" registry/ouro/components/ouro/chart/chart.test.tsx verify:testExists(registry/ouro/components/ouro/chart/chart.test.tsx::Chart > maps tones to theme tokens and gives series without one the chart tokens in order)
 */
function toneVar(tone: string | undefined, index: number): string {
  return tone !== undefined && Object.hasOwn(chartTones, tone) ? chartTones[tone as ChartTone] : `var(--chart-${(index % 5) + 1})`;
}

/**
 * The marker each series gets in the legend, the tooltip and on line points, in order.
 *
 * @claim "The marker each series gets in" registry/ouro/components/ouro/chart/chart.test.tsx verify:testExists(registry/ouro/components/ouro/chart/chart.test.tsx::Chart > labels each series in a legend with a marker shape, so color is not the only cue)
 * @claim "The marker each series gets in" registry/ouro/components/ouro/chart/chart.test.tsx verify:testExists(registry/ouro/components/ouro/chart/chart.test.tsx::Chart > gives five series five marker shapes)
 */
type ChartMarkerShape = "circle" | "square" | "triangle" | "diamond" | "cross";

/**
 * Marker shapes in series order, so series differ by shape as well as color.
 *
 * @internal
 */
const markerShapes: readonly ChartMarkerShape[] = ["circle", "square", "triangle", "diamond", "cross"];

/**
 * Whether a config key can be part of a CSS custom property name (`--color-<key>`).
 *
 * @internal
 */
const isCssName = (key: string): boolean => /^[A-Za-z_][\w-]*$/.test(key);

const numbers = new Intl.NumberFormat("en");

/**
 * "1,250": the value in English digits, which apps replace with `formatValue`.
 *
 * @internal
 */
function defaultFormatValue(value: number): string {
  return numbers.format(value);
}

/** "A", "A and B", "A, B and C". */
function listOf(items: string[]): string {
  return items.length < 2 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

const typeNames: Readonly<Record<ChartType, string>> = { bar: "Bar chart", line: "Line chart", area: "Area chart" };

/**
 * "Bar chart of Cooked and Saved by Month, 3 points. The table that follows lists every value."
 *
 * @internal
 * @claim "The table that follows lists every" registry/ouro/components/ouro/chart/chart.test.tsx verify:testExists(registry/ouro/components/ouro/chart/chart.test.tsx::Chart > lists every value in a table for screen readers, visible with showTable)
 * @claim "Bar chart of Cooked and Saved by Month," registry/ouro/components/ouro/chart/chart.test.tsx verify:testExists(registry/ouro/components/ouro/chart/chart.test.tsx::Chart > describes itself with a summary that points to the data table, which the app can translate)
 */
function defaultSummary({ type, series, category, count }: ChartSummaryInfo): string {
  const kind = type ? typeNames[type] : "Chart";
  return `${kind} of ${listOf(series)} by ${category}, ${count} ${count === 1 ? "point" : "points"}. The table that follows lists every value.`;
}

/**
 * The plot box, which Chart's own SVG fills. For a recharts chart passed as children, it
 * replaces recharts' default grays with theme tokens, rings the plot (which takes the arrow
 * keys) when it has keyboard focus, and hides the focus outline of the shapes inside it.
 *
 * @internal
 * @claim "For a recharts chart passed as" registry/ouro/components/ouro/chart/chart.test.tsx verify:testExists(registry/ouro/components/ouro/chart/chart.test.tsx::Chart > shows the tooltip from the keyboard: Tab to the plot, then the arrow keys)
 * @claim "For a recharts chart passed as" registry/ouro/components/ouro/chart/chart.test.tsx verify:testExists(registry/ouro/components/ouro/chart/chart.test.tsx::Chart > takes a recharts chart as children, giving it the data, the name and the theme)
 * @claim "For a recharts chart passed as" registry/ouro/components/ouro/chart/chart.test.tsx verify:testExists(registry/ouro/components/ouro/chart/chart.test.tsx::Chart > writes the axis labels in the theme's muted text color, not recharts' gray, in light and dark)
 */
const plotClass =
  "relative aspect-video min-h-0 w-full flex-1 text-xs " +
  "[&_.recharts-cartesian-axis-tick-value]:fill-muted-foreground " +
  "[&_.recharts-cartesian-grid_line[stroke='#ccc']]:stroke-border " +
  "[&_.recharts-curve.recharts-tooltip-cursor]:stroke-border " +
  "[&_.recharts-rectangle.recharts-tooltip-cursor]:fill-muted " +
  "[&_.recharts-reference-line_[stroke='#ccc']]:stroke-border " +
  "[&_.recharts-dot[stroke='#fff']]:stroke-transparent " +
  "[&_.recharts-layer]:outline-hidden [&_.recharts-sector]:outline-hidden " +
  // Some fonts draw a glyph's ink past its box (a 1's flag), so the plot lets the axis labels show whole.
  "[&_.recharts-surface]:overflow-visible " +
  "[&_.recharts-surface]:rounded-ouro-md [&_.recharts-surface]:outline-ring [&_.recharts-surface]:outline-offset-2 " +
  "[&_.recharts-surface:focus-visible]:outline-2 [&_.recharts-surface:focus-visible]:outline-solid";

/** A number rounded to hundredths, short enough for an SVG attribute. */
const short = (value: number): number => Math.round(value * 100) / 100;

/**
 * The y axis' ticks for values from `min` to `max` (a range that holds 0): `count` ticks, from 0 or a round number below
 * it to a round number above the largest value, each step rounded up to a twentieth of its power of ten (a tenth for
 * steps under 10), as Recharts' axis picks them, so a chart reads the same as it did when Recharts drew it.
 *
 * @internal
 * @claim "The y axis' ticks for values" registry/ouro/components/ouro/chart/chart.test.tsx verify:testExists(registry/ouro/components/ouro/chart/chart.test.tsx::Chart geometry > picks five round ticks from 0 past the largest value, below 0 for negative values)
 */
function niceTicks(min: number, max: number, count = 5): number[] {
  const low = Math.min(min, 0);
  // A chart of zeros still has an axis to read them on.
  const high = Math.max(max, 0) === low ? low + 1 : Math.max(max, 0);
  for (let correction = 0; ; correction++) {
    const rough = (high - low) / (count - 1);
    const digits = Math.floor(Math.log10(rough)) + 1;
    const unit = 10 ** digits;
    const scale = digits === 1 ? 0.1 : 0.05;
    // The small allowance keeps a ratio that floating point puts a hair over a step (0.1 / 0.05) on that step.
    const step = (Math.ceil(rough / unit / scale - 1e-9) + correction) * scale * unit;
    let below = Math.ceil(-low / step - 1e-9);
    let above = Math.ceil(high / step - 1e-9);
    const total = below + above + 1;
    if (total > count) continue;
    if (high > 0) above += count - total;
    else below += count - total;
    return Array.from({ length: below + above + 1 }, (_, index) => Number(((index - below) * step).toPrecision(12)) || 0);
  }
}

/**
 * A smooth line through points in order of x, which never overshoots a point (monotone in x, after Steffen 1990, as
 * d3's curveMonotoneX draws it): a cubic Bézier per segment, with each point's slope taken from its neighbours.
 *
 * @internal
 * @claim "A smooth line through points in" registry/ouro/components/ouro/chart/chart.test.tsx verify:testExists(registry/ouro/components/ouro/chart/chart.test.tsx::Chart geometry > draws a monotone curve through every point that never overshoots one)
 */
function curvePath(points: ReadonlyArray<readonly [number, number]>): string {
  const xs = points.map((point) => point[0]);
  const ys = points.map((point) => point[1]);
  const last = points.length - 1;
  if (last < 0) return "";
  const start = `M${short(xs[0]!)},${short(ys[0]!)}`;
  if (last === 0) return start;
  if (last === 1) return `${start}L${short(xs[1]!)},${short(ys[1]!)}`;
  const widths = xs.slice(1).map((x, index) => x - xs[index]!);
  const slopes = widths.map((width, index) => (ys[index + 1]! - ys[index]!) / width);
  const sign = (value: number) => (value < 0 ? -1 : 1);
  const tangents = xs.map((_, index) => {
    if (index === 0 || index === last) return 0;
    const [h0, h1, s0, s1] = [widths[index - 1]!, widths[index]!, slopes[index - 1]!, slopes[index]!];
    const through = (s0 * h1 + s1 * h0) / (h0 + h1);
    return (sign(s0) + sign(s1)) * Math.min(Math.abs(s0), Math.abs(s1), 0.5 * Math.abs(through));
  });
  tangents[0] = (3 * slopes[0]! - tangents[1]!) / 2;
  tangents[last] = (3 * slopes[last - 1]! - tangents[last - 1]!) / 2;
  let path = start;
  for (let index = 0; index < last; index++) {
    const third = widths[index]! / 3;
    path +=
      `C${short(xs[index]! + third)},${short(ys[index]! + third * tangents[index]!)} ` +
      `${short(xs[index + 1]! - third)},${short(ys[index + 1]! - third * tangents[index + 1]!)} ` +
      `${short(xs[index + 1]!)},${short(ys[index + 1]!)}`;
  }
  return path;
}

/**
 * Where each of `count` bars sits in a category `width` wide, from the category's start: a tenth of the category free at
 * each side and 4px between bars, as Recharts lays a bar group out.
 *
 * @internal
 * @claim "Where each of `count` bars sits" registry/ouro/components/ouro/chart/chart.test.tsx verify:testExists(registry/ouro/components/ouro/chart/chart.test.tsx::Chart geometry > lays bars out in their category with a tenth free at each side and 4px between)
 */
function barSlots(width: number, count: number): Array<{ x: number; width: number }> {
  const side = width * 0.1;
  const room = width - side * 2;
  // Bars too thin for the gap between them touch instead.
  const gap = count > 1 && room - (count - 1) * 4 >= count ? 4 : 0;
  const bar = Math.max((room - (count - 1) * gap) / count, 0);
  return Array.from({ length: count }, (_, index) => ({ x: side + index * (bar + gap), width: bar }));
}
