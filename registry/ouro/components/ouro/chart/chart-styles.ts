export { chartTones, defaultFormatValue, defaultSummary, isCssName, markerShapes, plotClass, toneVar };
export type { ChartMarkerShape, ChartSummaryInfo, ChartTone, ChartType };

// The export list comes first because the shadcn CLI drops comments before a file's
// first statement, which would take the JSDoc below with it.

/**
 * The colors a series can take: the theme's five chart tokens (`--chart-1` to
 * `--chart-5`, which shadcn themes define for light and dark), and the tones for series
 * that mean something, such as failures in `destructive`.
 */
type ChartTone = "chart-1" | "chart-2" | "chart-3" | "chart-4" | "chart-5" | "primary" | "destructive" | "success" | "warning";

/** What `Chart` draws when it has no children. */
type ChartType = "bar" | "line" | "area";

/** What a `Chart` summary is written from. */
interface ChartSummaryInfo {
  /** The chart's title. */
  title: string;
  /** What the props draw, or `undefined` for a chart passed as children. */
  type: ChartType | undefined;
  /** Each series' label, in config order. */
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
 */
function toneVar(tone: string | undefined, index: number): string {
  return tone !== undefined && Object.hasOwn(chartTones, tone) ? chartTones[tone as ChartTone] : `var(--chart-${(index % 5) + 1})`;
}

/** The marker each series gets in the legend, the tooltip and on line points, in order. */
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
 */
function defaultSummary({ type, series, category, count }: ChartSummaryInfo): string {
  const kind = type ? typeNames[type] : "Chart";
  return `${kind} of ${listOf(series)} by ${category}, ${count} ${count === 1 ? "point" : "points"}. The table that follows lists every value.`;
}

/**
 * The plot area: recharts' default grays replaced with theme tokens, a visible focus ring on
 * the plot (which takes the arrow keys), and no focus outline on the shapes inside it.
 *
 * @internal
 */
const plotClass =
  "relative aspect-video min-h-0 w-full flex-1 text-xs " +
  "[&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground " +
  "[&_.recharts-cartesian-grid_line[stroke='#ccc']]:stroke-border " +
  "[&_.recharts-curve.recharts-tooltip-cursor]:stroke-border " +
  "[&_.recharts-rectangle.recharts-tooltip-cursor]:fill-muted " +
  "[&_.recharts-reference-line_[stroke='#ccc']]:stroke-border " +
  "[&_.recharts-dot[stroke='#fff']]:stroke-transparent " +
  "[&_.recharts-layer]:outline-hidden [&_.recharts-sector]:outline-hidden " +
  "[&_.recharts-surface]:rounded-md [&_.recharts-surface]:outline-ring [&_.recharts-surface]:outline-offset-2 " +
  "[&_.recharts-surface:focus-visible]:outline-2 [&_.recharts-surface:focus-visible]:outline-solid";
