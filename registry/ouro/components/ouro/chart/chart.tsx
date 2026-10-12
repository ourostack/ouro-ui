"use client";

import { Children, cloneElement, createContext, isValidElement, useContext, useId, useRef } from "react";
import type { CSSProperties, HTMLAttributes, JSX, ReactElement, ReactNode, Ref } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/ouro/class-name-check";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { devThrow } from "@/registry/ouro/lib/ouro/dev";
import { useDevWarnings, type DevWarning } from "@/registry/ouro/lib/ouro/use-dev-warnings";
import {
  chartTones,
  defaultFormatValue,
  defaultSummary,
  isCssName,
  markerShapes,
  plotClass,
  toneVar,
  type ChartMarkerShape,
  type ChartSummaryInfo,
  type ChartTone,
  type ChartType,
} from "@/registry/ouro/components/ouro/chart/chart-styles";

export type { ChartMarkerShape, ChartSummaryInfo, ChartTone, ChartType } from "@/registry/ouro/components/ouro/chart/chart-styles";

/** One series in a chart's `config`: its label and the theme tone it is drawn in. */
export interface ChartSeries {
  /** What the series is called in the legend, the tooltip and the data table: "Recipes cooked". */
  label: string;
  /**
   * The theme color: `chart-1` to `chart-5`, or a tone that means something (`destructive`
   * for failures). Without it, series take `chart-1`, `chart-2` and so on, in order.
   */
  tone?: ChartTone | (string & { 'Use "chart-1" to "chart-5", "primary", "destructive", "success" or "warning"': never }) | undefined;

  /** Not a prop. Colors come from the theme: `{ label: "Cooked", tone: "chart-1" }`. */
  color?: { 'Colors come from the theme. Use { label: "Cooked", tone: "chart-1" }': never };
  /** Not a prop. Light and dark colors come from the theme's chart tokens: `{ label: "Cooked", tone: "chart-1" }`. */
  theme?: { 'Colors come from the theme. Use { label: "Cooked", tone: "chart-1" }': never };
}

/**
 * The series a chart draws, by their key in each row, as in shadcn's `ChartConfig`. Each key
 * also names a CSS variable, `--color-<key>`, for recharts children
 * (`fill="var(--color-cooked)"`). A label for `categoryKey` names the category column.
 */
export type ChartConfig<Row extends object = Record<string, unknown>> = { [Key in keyof Row & string]?: ChartSeries };

/** The props Chart adds to the `<figure>` attributes it passes through. */
export interface ChartOwnProps<Row extends object = Record<string, unknown>> {
  /** What the chart shows: "Recipes cooked per month". Its name for screen readers, shown above it. Required. */
  title: string;
  /** Hides the title visually; screen readers still hear it. */
  hideTitle?: boolean | undefined;
  /** A line under the title, such as the period: "January to June". */
  description?: ReactNode;
  /** The rows to draw, one per category (a month, a recipe). */
  data: readonly Row[];
  /** The key in each row that names its category: the x axis and the table's first column. */
  categoryKey: keyof Row & string;
  /** The series to draw, by their key in each row, with their labels and tones. */
  config: ChartConfig<Row>;
  /** What to draw when there are no children: bars, lines or areas, one per series. @default "bar" */
  type?: ChartType | (string & { 'Use "bar", "line" or "area"; for another chart pass recharts children': never }) | undefined;
  /**
   * A recharts chart (`<LineChart>`) for anything `type` cannot draw. It gets `data`, the
   * title as its name and the theme colors as `var(--color-<key>)`; add `<ChartTooltip />`
   * and `<ChartLegend />` inside it.
   */
  children?: ReactNode;
  /** Writes a value for the axis, the tooltip and the table, for other languages or units. @default "1,250" */
  formatValue?: ((value: number, series: string) => string) | undefined;
  /**
   * What screen readers hear about the chart after its title, for other languages.
   * @default (info) => "Bar chart of Cooked and Saved by Month, 3 points. The table that follows lists every value."
   */
  summary?: ((info: ChartSummaryInfo) => string) | undefined;
  /** Shows the data table under the chart. It is always there for screen readers. */
  showTable?: boolean | undefined;
  /**
   * Layout only: the chart's height (`h-64`, `aspect-square`), margins. The plot is 16:9
   * until you set a height. Appearance classes warn in development.
   */
  className?: string | undefined;
  ref?: Ref<HTMLElement> | undefined;
}

/** Props for {@link Chart}: its own props and the `<figure>` attributes it passes through. */
export type ChartProps<Row extends object = Record<string, unknown>> = Omit<HTMLAttributes<HTMLElement>, keyof ChartOwnProps<Row> | "role"> &
  ChartOwnProps<Row>;

/** Props for {@link ChartTooltip}. */
export interface ChartTooltipProps {
  /** Not a prop. ChartTooltip draws its own content from the chart's config: `<ChartTooltip />`. */
  content?: { 'ChartTooltip draws its content from config. Use <ChartTooltip />': never };
}

/** Props for {@link ChartLegend}. */
export interface ChartLegendProps {
  /** Not a prop. ChartLegend draws its own content from the chart's config: `<ChartLegend />`. */
  content?: { 'ChartLegend draws its content from config. Use <ChartLegend />': never };
}

interface Series {
  key: string;
  label: string;
  color: string;
  shape: ChartMarkerShape;
}

interface ChartState {
  byKey: Map<string, Series>;
  formatValue: (value: number, series: string) => string;
}

const ChartContext = createContext<ChartState | null>(null);

const types = ["bar", "line", "area"] as const;
const toneNames = Object.keys(chartTones);

/** The JSX a part belongs in, for the dev message when it is not inside a Chart. */
const partShape = (part: string) => `<Chart title="Cooking" data={rows} categoryKey="month" config={config}><BarChart><${part} /></BarChart></Chart>`;

function useChartPart(part: string): ChartState {
  const state = useContext(ChartContext);
  if (!state) {
    devThrow(part, "must be rendered inside <Chart>", process.env.NODE_ENV !== "production" ? partShape(part) : /* istanbul ignore next @preserve -- production only */ "");
  }
  return state;
}

/** The series in config order: every key but the category, each with its color and marker. */
function seriesOf(config: Record<string, ChartSeries | undefined>, categoryKey: string): Series[] {
  return Object.entries(config)
    .filter((entry): entry is [string, ChartSeries] => entry[0] !== categoryKey && entry[1] !== undefined)
    .map(([key, entry], index) => ({ key, label: entry.label, color: toneVar(entry.tone, index), shape: markerShapes[index % markerShapes.length]! }));
}

function chartWarnings(props: ChartProps<Record<string, unknown>>, series: Series[]): DevWarning[] {
  const { title, data, categoryKey, config, type, children } = props;
  const rows = data as ReadonlyArray<Record<string, unknown>>;
  const entries = Object.entries(config as Record<string, ChartSeries>);
  return [
    title === undefined && ["title is missing, so the chart has no name", '<Chart title="Recipes cooked per month">'],
    type !== undefined && !(types as readonly string[]).includes(type) && [`type="${type}" is not a chart type; use "bar", "line" or "area"`, '<Chart type="bar">'],
    series.length === 0 && ["config has no series to draw", '<Chart config={{ cooked: { label: "Cooked" } }}>'],
    rows.length > 0 && !rows.some((row) => Object.hasOwn(row, categoryKey)) && [`categoryKey="${categoryKey}" is not a key of the rows`, `<Chart categoryKey="${Object.keys(rows[0]!)[0]}">`],
    ...entries.flatMap(([key, entry]): DevWarning[] => {
      const raw = entry as unknown as Record<string, unknown>;
      return [
        raw["tone"] !== undefined &&
          !toneNames.includes(String(raw["tone"])) && [
            `tone "${String(raw["tone"])}" for ${key} is not a tone; use "chart-1" to "chart-5", "primary", "destructive", "success" or "warning"`,
            `{ ${key}: { label: "${String(raw["label"])}", tone: "chart-1" } }`,
          ],
        ...(["color", "theme"] as const).map(
          (name): DevWarning => raw[name] !== undefined && [`config.${key}.${name} is not a prop; series colors come from the theme`, `{ ${key}: { label: "${String(raw["label"])}", tone: "chart-1" } }`],
        ),
        !isCssName(key) && [`config key "${key}" is not a CSS name, so var(--color-${key}) cannot work`, `{ ${key.replace(/\W/g, "_")}: { label: "${String(raw["label"])}" } }`],
        key !== categoryKey &&
          children === undefined &&
          rows.length > 0 &&
          !rows.some((row) => Object.hasOwn(row, key)) && [`config.${key} has no values in data`, '<Chart config={{ cooked: { label: "Cooked" } }}> with keys that are in each row'],
      ];
    }),
  ];
}

/**
 * A chart drawn in the theme's colors, which people can use without seeing it: a figure
 * named by its `title`, a summary for screen readers, and a table of every value (visible
 * with `showTable`). The plot is a tab stop, and the arrow keys move its tooltip from point
 * to point. Each series is labeled in a legend with its own marker shape, so color is
 * never the only cue.
 *
 * Pass `type` for bars, lines or areas, one per series in `config`. For anything else, pass
 * a recharts chart as children with `<ChartTooltip />` and `<ChartLegend />` inside it, as in
 * shadcn's charts; it draws with `var(--color-<key>)`. Built on recharts.
 *
 * Use `Progress` instead for one value out of a total, and a table alone when readers
 * need exact figures more than the shape of the data.
 *
 * @group Data
 * @see https://ourostack.github.io/ouro-ui/docs/chart
 *
 * @example
 * <Chart
 *   title="Recipes cooked per month"
 *   data={months}
 *   categoryKey="month"
 *   config={{ cooked: { label: "Cooked" }, saved: { label: "Saved", tone: "chart-2" } }}
 * />
 */
export function Chart<Row extends object = Record<string, unknown>>(props: ChartProps<Row>): JSX.Element {
  const {
    title,
    hideTitle = false,
    description,
    data,
    categoryKey,
    config,
    type: typeProp,
    children,
    formatValue = defaultFormatValue,
    summary = defaultSummary,
    showTable = false,
    className,
    style,
    ...rest
  } = props;
  const type: ChartType = (types as readonly string[]).includes(typeProp ?? "bar") ? (typeProp as ChartType | undefined) ?? "bar" : "bar";
  const entries = config as Record<string, ChartSeries | undefined>;
  const series = seriesOf(entries, categoryKey);
  const category = entries[categoryKey]?.label ?? categoryKey;
  const rows = data as ReadonlyArray<Record<string, unknown>>;
  useAppearanceClassNameCheck(
    "Chart",
    className,
    process.env.NODE_ENV !== "production" ? (token: string) => `<div className="${token}"><Chart /></div>` : /* istanbul ignore next @preserve -- production only */ "",
  );
  useDevWarnings(
    "Chart",
    process.env.NODE_ENV !== "production"
      ? () => chartWarnings(props as unknown as ChartProps<Record<string, unknown>>, series)
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );
  const id = useId();
  const summaryId = `${id}-summary`;
  const state: ChartState = { byKey: new Map(series.map((item) => [item.key, item])), formatValue };
  const colors = Object.fromEntries(series.map((item) => [`--color-${item.key}`, item.color])) as CSSProperties;
  const plotProps = { "aria-label": title, "aria-describedby": summaryId };
  // recharts animates with JavaScript, which document.getAnimations() cannot see, so the plot
  // says when its marks are moving (screenshot tests wait for it). Set on the element, not in
  // state, so the chart does not re-render mid-animation.
  // Tracked per series, so a restarted animation counts once.
  const plotRef = useRef<HTMLDivElement>(null);
  const moving = useRef(new Set<string>());
  const onAnimation = (key: string, running: boolean) => {
    if (running) moving.current.add(key);
    else moving.current.delete(key);
    plotRef.current?.toggleAttribute("data-ouro-chart-animating", moving.current.size > 0);
  };
  const child = Children.toArray(children).find(isValidElement) as ReactElement<{ data?: unknown }> | undefined;
  const plot = child ? (
    cloneElement(child, { data: child.props.data ?? data, ...plotProps })
  ) : (
    <SeriesChart type={type} data={rows} categoryKey={categoryKey} series={series} formatValue={formatValue} plotProps={plotProps} onAnimation={onAnimation} />
  );
  return (
    <figure
      {...rest}
      data-ouro="chart"
      aria-describedby={summaryId}
      style={{ ...colors, ...style }}
      className={cn("m-0 box-border flex w-full min-w-0 flex-col gap-3 text-foreground", className)}
    >
      <figcaption className={hideTitle ? "sr-only" : "text-base font-semibold pointer-fine:text-sm"}>{title}</figcaption>
      {description !== undefined && <p className="-mt-2 mb-0 text-sm text-muted-foreground">{description}</p>}
      <div ref={plotRef} data-ouro-chart-plot="" className={plotClass}>
        <ChartContext value={state}>
          <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 1, height: 1 }}>
            {plot}
          </ResponsiveContainer>
        </ChartContext>
      </div>
      <p id={summaryId} data-ouro-chart-summary="" className="sr-only">
        {summary({ title, type: child ? undefined : type, series: series.map((item) => item.label), category, count: rows.length })}
      </p>
      {/* A table can't shrink below its content, so the wrapper is what hides it. */}
      <div data-ouro-chart-table="" className={showTable ? "max-w-full overflow-x-auto" : "sr-only"}>
        <table className="w-full border-collapse text-sm tabular-nums">
          <caption className="sr-only">{title}</caption>
          <thead>
            <tr className="border-b border-solid border-border">
              <th scope="col" className="px-2 py-1.5 text-start font-medium">
                {category}
              </th>
              {series.map((item) => (
                <th key={item.key} scope="col" className="px-2 py-1.5 text-end font-medium">
                  {item.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index} className="border-b border-solid border-border last:border-0">
                <th scope="row" className="px-2 py-1.5 text-start font-normal">
                  {String(row[categoryKey] ?? "")}
                </th>
                {series.map((item) => (
                  <td key={item.key} className="px-2 py-1.5 text-end">
                    {typeof row[item.key] === "number" ? formatValue(row[item.key] as number, item.key) : String(row[item.key] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}

/**
 * shadcn's name for {@link Chart}: the same component with the same props, so code ported
 * from shadcn's chart docs finds it. Unlike shadcn's, it needs a `title`, `data` and
 * `categoryKey`, which give the chart its name and its data table.
 *
 * Use `Chart` instead in new code; it is the same component.
 *
 * @group Data
 * @see https://ourostack.github.io/ouro-ui/docs/chart
 *
 * @example
 * <ChartContainer title="Recipes cooked" data={months} categoryKey="month" config={config}>
 *   <BarChart>
 *     <Bar dataKey="cooked" fill="var(--color-cooked)" />
 *     <ChartTooltip />
 *   </BarChart>
 * </ChartContainer>
 */
export function ChartContainer<Row extends object = Record<string, unknown>>(props: ChartProps<Row>): JSX.Element {
  return <Chart {...props} />;
}

interface SeriesChartProps {
  type: ChartType;
  data: ReadonlyArray<Record<string, unknown>>;
  categoryKey: string;
  series: Series[];
  formatValue: (value: number, series: string) => string;
  plotProps: Record<string, string>;
  onAnimation: (key: string, running: boolean) => void;
}

/** The chart `type` draws: a grid, both axes, the tooltip, the legend for two or more series, and one mark per series. */
function SeriesChart({ type, data, categoryKey, series, formatValue, plotProps, onAnimation }: SeriesChartProps): JSX.Element {
  const Plot = type === "line" ? LineChart : type === "area" ? AreaChart : BarChart;
  const marks = series.map((item) => {
    const shared = {
      dataKey: item.key,
      name: item.label,
      className: `ouro-chart-series-${item.key}`,
      onAnimationStart: () => onAnimation(item.key, true),
      onAnimationEnd: () => onAnimation(item.key, false),
    };
    if (type === "bar") return <Bar key={item.key} {...shared} fill={`var(--color-${item.key})`} radius={4} />;
    const dot = (dotProps: DotProps) => <ShapeDot {...dotProps} series={item.key} shape={item.shape} />;
    if (type === "line") return <Line key={item.key} {...shared} type="monotone" stroke={`var(--color-${item.key})`} strokeWidth={2} dot={dot} activeDot={dot} />;
    return (
      <Area key={item.key} {...shared} type="monotone" stroke={`var(--color-${item.key})`} fill={`var(--color-${item.key})`} fillOpacity={0.2} strokeWidth={2} dot={dot} activeDot={dot} />
    );
  });
  return (
    <Plot data={data as Record<string, unknown>[]} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} {...plotProps}>
      <CartesianGrid vertical={false} />
      <XAxis dataKey={categoryKey} tickLine={false} axisLine={false} tickMargin={8} minTickGap={16} />
      <YAxis tickLine={false} axisLine={false} tickMargin={8} width="auto" tickFormatter={(value: number) => formatValue(value, "")} />
      <ChartTooltip />
      {series.length > 1 && <ChartLegend />}
      {marks}
    </Plot>
  );
}

interface DotProps {
  cx?: number | undefined;
  cy?: number | undefined;
  stroke?: string | undefined;
  index?: number | undefined;
}

/** A point on a line or area, in the series' marker shape. */
function ShapeDot({ cx, cy, stroke, index, series, shape }: DotProps & { series: string; shape: ChartMarkerShape }): JSX.Element {
  return (
    <g key={index} data-ouro-chart-dot={shape} data-ouro-chart-series={series} transform={`translate(${cx} ${cy})`} color={stroke}>
      <MarkerPath shape={shape} size={9} />
    </g>
  );
}

/** A marker centered on 0,0, filled with the current color, outlined in the page's background. */
function MarkerPath({ shape, size }: { shape: ChartMarkerShape; size: number }): JSX.Element {
  const r = size / 2;
  const common = { fill: "currentColor", stroke: "var(--background)", strokeWidth: 1 };
  if (shape === "circle") return <circle r={r} {...common} />;
  if (shape === "square") return <rect x={-r * 0.9} y={-r * 0.9} width={r * 1.8} height={r * 1.8} rx={1} {...common} />;
  if (shape === "triangle") return <path d={`M0 ${-r * 1.1}L${r * 1.05} ${r * 0.8}H${-r * 1.05}Z`} {...common} />;
  if (shape === "diamond") return <path d={`M0 ${-r * 1.15}L${r * 1.15} 0L0 ${r * 1.15}L${-r * 1.15} 0Z`} {...common} />;
  const t = r * 0.4;
  return <path d={`M${-t} ${-r}H${t}V${-t}H${r}V${t}H${t}V${r}H${-t}V${t}H${-r}V${-t}H${-t}Z`} {...common} />;
}

/** A legend or tooltip marker: the series' shape in its color. */
function Marker({ item }: { item: Series }): JSX.Element {
  return (
    <svg aria-hidden="true" data-ouro-chart-marker={item.shape} viewBox="-6 -6 12 12" className="size-3 shrink-0" style={{ color: item.color }}>
      <MarkerPath shape={item.shape} size={10} />
    </svg>
  );
}

interface TooltipEntry {
  dataKey?: unknown;
  value?: unknown;
}

/** The tooltip card: the category, then each series' marker, label and value. Series not in config are left out. */
function TooltipContent({ active, payload, label }: { active: boolean; payload: readonly TooltipEntry[]; label: unknown }): JSX.Element | null {
  const { byKey, formatValue } = useChartPart("ChartTooltip");
  const entries = payload.flatMap((entry) => {
    const item = byKey.get(String(entry.dataKey));
    return item ? [{ item, value: entry.value }] : [];
  });
  if (!active || entries.length === 0) return null;
  return (
    <div
      data-ouro-chart-tooltip=""
      className="grid min-w-32 gap-1.5 rounded-lg border border-solid border-border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-lg"
    >
      <div className="font-medium">{String(label ?? "")}</div>
      {entries.map(({ item, value }) => (
        <div key={item.key} className="flex items-center gap-2">
          <Marker item={item} />
          <span className="text-muted-foreground">{item.label}</span>
          <span className="ms-auto ps-3 font-medium tabular-nums">{formatValue(Number(value), item.key)}</span>
        </div>
      ))}
    </div>
  );
}

/** The legend: each drawn series' marker and label from config, in a row under the plot. */
function LegendContent({ payload }: { payload: readonly { dataKey?: unknown }[] }): JSX.Element {
  const { byKey } = useChartPart("ChartLegend");
  const shown = payload.flatMap((entry) => byKey.get(String(entry.dataKey)) ?? []);
  return (
    <ul data-ouro-chart-legend="" className="m-0 flex list-none flex-wrap items-center justify-center gap-x-4 gap-y-1 p-0 pt-3 text-xs text-foreground">
      {shown.map((item) => (
        <li key={item.key} className="flex items-center gap-1.5">
          <Marker item={item} />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

/**
 * The tooltip for a recharts chart inside `Chart`: the category, then each series' marker,
 * label and value from the chart's `config`, in the theme's popover colors. It follows the
 * pointer, and the arrow keys when the plot has focus. `Chart` adds it for you with `type`.
 *
 * Use `Chart` with `type` instead when bars, lines or areas are enough: it adds the tooltip
 * itself. Use it only inside a recharts chart passed to `Chart` as children.
 *
 * @group Data
 * @see https://ourostack.github.io/ouro-ui/docs/chart
 *
 * @example
 * <Chart title="Recipes cooked" data={months} categoryKey="month" config={config}>
 *   <LineChart>
 *     <Line dataKey="cooked" stroke="var(--color-cooked)" />
 *     <ChartTooltip />
 *   </LineChart>
 * </Chart>
 */
export function ChartTooltip(props: ChartTooltipProps): JSX.Element {
  const { content } = props;
  useChartPart("ChartTooltip");
  useDevWarnings(
    "ChartTooltip",
    process.env.NODE_ENV !== "production"
      ? () => [content !== undefined && ["content is not a prop; ChartTooltip draws its content from config", "<ChartTooltip />"]]
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );
  return <Tooltip cursor content={(tooltip) => <TooltipContent active={tooltip.active} payload={tooltip.payload as readonly TooltipEntry[]} label={tooltip.label} />} />;
}

/**
 * The legend for a recharts chart inside `Chart`: each series' marker shape and label from
 * the chart's `config`, under the plot. `Chart` adds it for you with `type` when it draws two
 * or more series.
 *
 * Use `Chart` with `type` instead when bars, lines or areas are enough: it adds the legend
 * itself. Use it only inside a recharts chart passed to `Chart` as children.
 *
 * @group Data
 * @see https://ourostack.github.io/ouro-ui/docs/chart
 *
 * @example
 * <Chart title="Recipes" data={months} categoryKey="month" config={config}>
 *   <BarChart>
 *     <Bar dataKey="cooked" fill="var(--color-cooked)" />
 *     <Bar dataKey="saved" fill="var(--color-saved)" />
 *     <ChartLegend />
 *   </BarChart>
 * </Chart>
 */
export function ChartLegend(props: ChartLegendProps): JSX.Element {
  const { content } = props;
  useChartPart("ChartLegend");
  useDevWarnings(
    "ChartLegend",
    process.env.NODE_ENV !== "production"
      ? () => [content !== undefined && ["content is not a prop; ChartLegend draws its content from config", "<ChartLegend />"]]
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );
  return <Legend verticalAlign="bottom" content={(legend) => <LegendContent payload={legend.payload as readonly { dataKey?: unknown }[]} />} />;
}
