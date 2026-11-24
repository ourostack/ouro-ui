"use client";

import { Children, cloneElement, createContext, isValidElement, memo, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, HTMLAttributes, JSX, PointerEvent, ReactElement, ReactNode, Ref, RefObject } from "react";
import type * as Recharts from "recharts";
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/ouro/class-name-check";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { devThrow, devWarn } from "@/registry/ouro/lib/ouro/dev";
import { useDevWarnings, type DevWarning } from "@/registry/ouro/lib/ouro/use-dev-messages";
import {
  barSlots,
  chartTones,
  curvePath,
  defaultFormatValue,
  defaultSummary,
  isCssName,
  markerShapes,
  niceTicks,
  plotClass,
  toneVar,
  type ChartMarkerShape,
  type ChartSummaryInfo,
  type ChartTone,
  type ChartType,
} from "@/registry/ouro/components/ouro/chart/chart-styles";

export type { ChartMarkerShape, ChartSummaryInfo, ChartTone, ChartType } from "@/registry/ouro/components/ouro/chart/chart-styles";

/** The parts of Recharts that `ChartTooltip` and `ChartLegend` draw with, inside a Recharts chart passed as children. */
type RechartsParts = Pick<typeof Recharts, "Legend" | "Tooltip">;

let rechartsLoading: Promise<RechartsParts> | undefined;
let recharts: RechartsParts | undefined;

/**
 * Loads Recharts' Tooltip and Legend once, by a dynamic import, for the parts that need them. Only `ChartTooltip` and
 * `ChartLegend` name this function, so an app that draws its charts with `type` alone leaves it and Recharts out of
 * its build.
 *
 * @claim "so an app that draws its charts" scripts/chart-weight.test.mjs verify:testExists(scripts/chart-weight.test.mjs::a chart drawn with type adds about 15 KB gzip to an app's build, with no recharts in any chunk)
 */
function loadRecharts(): Promise<RechartsParts> {
  return (rechartsLoading ??= import("recharts").then(({ Legend, Tooltip }) => (recharts = { Legend, Tooltip })));
}

/**
 * Recharts' parts for a part that renders inside a Recharts chart: at once when Chart loaded them before it drew the
 * plot, or after a render when the part sits where Chart could not see it (inside a component of the app's own). A
 * load that fails throws here, to the app's error boundary.
 */
function useRecharts(): RechartsParts | undefined {
  const [, setLoaded] = useState(recharts);
  // Once Recharts is loaded, this sets the state to what it already holds, which renders nothing again.
  useEffect(
    () => {
      loadRecharts().then(setLoaded, (error: unknown) =>
        setLoaded(() => {
          throw error;
        }),
      );
    },
    // Stryker disable next-line ArrayDeclaration: a dependency list that never changes runs the effect once, as an empty one does
    [],
  );
  return recharts;
}

/** What marks `ChartTooltip` and `ChartLegend` for Chart, which finds them among a Recharts chart's parts by it. */
interface PartTag {
  name: "ChartTooltip" | "ChartLegend";
  load: () => Promise<unknown>;
}

/**
 * The tag of a part, read off its element's `memo` type or the tagged function it wraps (which a part's own body names),
 * so Chart finds the parts without naming them (and Recharts) itself. A part is a `memo` export, which an app's linter
 * takes for a component as it does not a bare `Object.assign` call.
 */
const partTag = (type: unknown): PartTag | undefined => {
  const tagged = type as { ouroChartPart?: PartTag; type?: { ouroChartPart?: PartTag } };
  return tagged.type?.ouroChartPart ?? tagged.ouroChartPart;
};

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
 * @claim "The series a chart draws, by" registry/ouro/components/ouro/chart/chart.test.tsx verify:testExists(registry/ouro/components/ouro/chart/chart.test.tsx::Chart > draws lines with a different point shape per series)
 * @claim "The series a chart draws, by" registry/ouro/components/ouro/chart/chart.test.tsx verify:testExists(registry/ouro/components/ouro/chart/chart.test.tsx::Chart > colors each series from the theme's chart tokens, in light and dark)
 * @claim "Each key also names a CSS" registry/ouro/components/ouro/chart/chart.test.tsx verify:testExists(registry/ouro/components/ouro/chart/chart.test.tsx::Chart > takes a recharts chart as children, giving it the data, the name and the theme)
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
  /**
   * The key in each row that names its category: the x axis and the table's first column.
   *
   * @claim "The key in each row that" registry/ouro/components/ouro/chart/chart.test.tsx verify:testExists(registry/ouro/components/ouro/chart/chart.test.tsx::Chart > formats values with formatValue in the table, the axis and the tooltip)
   */
  categoryKey: keyof Row & string;
  /**
   * The series to draw, by their key in each row, with their labels and tones.
   *
   * @claim "The series to draw, by their" registry/ouro/components/ouro/chart/chart.test.tsx verify:testExists(registry/ouro/components/ouro/chart/chart.test.tsx::Chart > maps tones to theme tokens and gives series without one the chart tokens in order)
   * @claim "The series to draw, by their" registry/ouro/components/ouro/chart/chart.test.tsx verify:testExists(registry/ouro/components/ouro/chart/chart.test.tsx::Chart > labels each series in a legend with a marker shape, so color is not the only cue)
   */
  config: ChartConfig<Row>;
  /**
   * What to draw when there are no children: bars, lines or areas, one per series. @default "bar"
   *
   * @claim "What to draw when there are" registry/ouro/components/ouro/chart/chart.test.tsx verify:testExists(registry/ouro/components/ouro/chart/chart.test.tsx::Chart > draws lines with a different point shape per series)
   * @claim "What to draw when there are" registry/ouro/components/ouro/chart/chart.test.tsx verify:testExists(registry/ouro/components/ouro/chart/chart.test.tsx::Chart > draws areas)
   */
  type?: ChartType | (string & { 'Use "bar", "line" or "area"; for another chart pass recharts children': never }) | undefined;
  /**
   * A recharts chart (`<LineChart>`) for anything `type` cannot draw. It gets `data`, the
   * title as its name and the theme colors as `var(--color-<key>)`; add `<ChartTooltip />`
   * and `<ChartLegend />` inside it.
   */
  children?: ReactNode;
  /**
   * Writes a value for the axis, the tooltip and the table, for other languages or units.
   * `series` is the value's key in `config`, and `""` for the y axis, which all series share.
   * @default "1,250"
   * @claim "`series` is the value's key in" registry/ouro/components/ouro/chart/chart.test.tsx verify:testExists(registry/ouro/components/ouro/chart/chart.test.tsx::Chart > formats values with formatValue in the table, the axis and the tooltip)
   */
  formatValue?: ((value: number, series: string) => string) | undefined;
  /**
   * What screen readers hear about the chart after its title, for other languages.
   * @default (info) => "Bar chart of Cooked and Saved by Month, 3 points. The table that follows lists every value."
   */
  summary?: ((info: ChartSummaryInfo) => string) | undefined;
  /**
   * Shows the data table under the chart. It is always there for screen readers.
   *
   * @claim "It is always there for screen" registry/ouro/components/ouro/chart/chart.test.tsx verify:testExists(registry/ouro/components/ouro/chart/chart.test.tsx::Chart > lists every value in a table for screen readers, visible with showTable)
   */
  showTable?: boolean | undefined;
  /**
   * Layout only: the chart's height (`h-64`, `aspect-square`), margins. The plot is 16:9
   * until you set a height. Appearance classes warn in development.
   * @claim "The plot is 16:9 until you" registry/ouro/components/ouro/chart/chart-styles.ts verify:fileLine(registry/ouro/components/ouro/chart/chart-styles.ts, /aspect-video/)
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
  /** The element a `ChartLegend` portals its list into, below the plot; `null` until it mounts. */
  legendTarget: HTMLElement | null;
  /**
   * The key Chart and its parts give their development messages, one per Chart.
   *
   * @claim "Chart and its parts give their development messages" registry/ouro/components/ouro/chart/chart.test.tsx verify:testExists(registry/ouro/components/ouro/chart/chart.test.tsx::Chart development messages > warns when %s gets shadcn's content prop, with the page and before the plot draws, once)
   */
  warnKey: object;
}

const ChartContext = createContext<ChartState | null>(null);

const types = ["bar", "line", "area"] as const;
const toneNames = Object.keys(chartTones);

/** The JSX a part belongs in, for the dev message when it is not inside a Chart. */
const partShape = (part: string) => `<Chart title="Cooking" data={rows} categoryKey="month" config={config}><BarChart><${part} /></BarChart></Chart>`;

/**
 * In development, says once per Chart that a ChartTooltip or ChartLegend was given `content`, which it draws from config
 * instead. Chart's early check and the part's own share the Chart's key, so they say it once between them.
 */
function checkPartContent(type: unknown, props: { content?: unknown }, key: object): void {
  const part = partTag(type)?.name;
  if (part && props.content !== undefined) devWarn(part, `content is not a prop; ${part} draws its content from config`, `<${part} />`, key);
}

function useChartPart(part: string): ChartState {
  const state = useContext(ChartContext);
  if (!state) {
    devThrow(part, "must be rendered inside <Chart>", process.env.NODE_ENV !== "production" ? partShape(part) : /* istanbul ignore next @preserve -- production only */ "");
  }
  return state;
}

/**
 * The series in config order: every key but the category, each with its color and marker.
 *
 * @claim "The series in config order: every" registry/ouro/components/ouro/chart/chart.test.tsx verify:testExists(registry/ouro/components/ouro/chart/chart.test.tsx::Chart > labels each series in a legend with a marker shape, so color is not the only cue)
 * @claim "The series in config order: every" registry/ouro/components/ouro/chart/chart.test.tsx verify:testExists(registry/ouro/components/ouro/chart/chart.test.tsx::Chart > leaves series that are not in config out of the tooltip and the legend)
 */
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
 * shadcn's charts; it draws with `var(--color-<key>)`. The marks Chart draws itself appear at
 * once; your own `<Line>` or `<Bar>` keeps recharts' draw-in unless you pass
 * `isAnimationActive={false}`.
 *
 * With `type`, Chart draws the plot as its own SVG and never loads recharts: it adds about
 * 15 KB gzip to an app's production build (Vite, React aside), all of it with the page. The
 * plot draws before the first paint of a client render, in the room its box keeps. In server
 * HTML the box is there but empty, and the plot draws as the page hydrates.
 *
 * Only `ChartTooltip` and `ChartLegend` load recharts' parts, in a chunk of their own after the
 * page has painted; a recharts chart passed as children draws in the task after the first
 * paint, so the rest of a page shows without waiting for recharts to lay it out. Recharts
 * itself comes with the app's own import of it; Bundlephobia measures the whole package at
 * about 150 KB gzip (566 KB minified).
 *
 * Colors come from the theme's `--chart-1` to `--chart-5`, which must reach 3:1 against the
 * background for the marks to be seen (WCAG's non-text contrast).
 *
 * Use `Progress` instead for one value out of a total, and a table alone when readers
 * need exact figures more than the shape of the data.
 *
 * @group Data
 * @see https://ui.ouroboros.bot/docs/chart
 *
 * @example
 * <Chart
 *   title="Recipes cooked per month"
 *   data={months}
 *   categoryKey="month"
 *   config={{ cooked: { label: "Cooked" }, saved: { label: "Saved", tone: "chart-2" } }}
 * />
 * @claim "A chart drawn in the theme's" registry/ouro/components/ouro/chart/chart.test.tsx verify:testExists(registry/ouro/components/ouro/chart/chart.test.tsx::Chart > lists every value in a table for screen readers, visible with showTable)
 * @claim "A chart drawn in the theme's" registry/ouro/components/ouro/chart/chart.test.tsx verify:testExists(registry/ouro/components/ouro/chart/chart.test.tsx::Chart > renders its title, summary and table in server HTML and hydrates without a warning)
 * @claim "A chart drawn in the theme's" registry/ouro/components/ouro/chart/chart.test.tsx verify:testExists(registry/ouro/components/ouro/chart/chart.test.tsx::Chart > colors each series from the theme's chart tokens, in light and dark)
 * @claim "Colors come from the theme's `--chart-1`" registry/ouro/components/ouro/chart/chart.test.tsx verify:testExists(registry/ouro/components/ouro/chart/chart.test.tsx::Chart > colors each series from the theme's chart tokens, in light and dark)
 * @claim "Colors come from the theme's `--chart-1`" https://bundlephobia.com/package/recharts@3.10.1 verify:urlOk(https://bundlephobia.com/package/recharts@3.10.1)
 * @claim "Colors come from the theme's `--chart-1`" https://www.w3.org/TR/WCAG22/#non-text-contrast verify:urlOk(https://www.w3.org/TR/WCAG22/#non-text-contrast)
 * @claim "Each series is labeled in a" registry/ouro/components/ouro/chart/chart.test.tsx verify:testExists(registry/ouro/components/ouro/chart/chart.test.tsx::Chart > labels each series in a legend with a marker shape, so color is not the only cue)
 * @claim "Each series is labeled in a" registry/ouro/components/ouro/chart/chart.test.tsx verify:testExists(registry/ouro/components/ouro/chart/chart.test.tsx::Chart > gives five series five marker shapes)
 * @claim "With `type`, Chart draws the plot" scripts/chart-weight.test.mjs verify:testExists(scripts/chart-weight.test.mjs::a chart drawn with type adds about 15 KB gzip to an app's build, with no recharts in any chunk)
 * @claim "With `type`, Chart draws the plot" registry/ouro/components/ouro/chart/chart.load.test.tsx verify:testExists(registry/ouro/components/ouro/chart/chart.load.test.tsx::draws a chart with type without ever importing recharts)
 * @claim "With `type`, Chart draws the plot" site/e2e/patterns.latency.spec.ts verify:testExists(site/e2e/patterns.latency.spec.ts::dashboard-page paints its frame, the chart's title and its plot together, and never loads Recharts)
 * @claim "In server HTML the box is" registry/ouro/components/ouro/chart/chart.test.tsx verify:testExists(registry/ouro/components/ouro/chart/chart.test.tsx::Chart > renders its title, summary and table in server HTML and hydrates without a warning)
 * @claim "The plot draws before the first" registry/ouro/components/ouro/chart/chart.test.tsx verify:testExists(registry/ouro/components/ouro/chart/chart.test.tsx::Chart > draws its plot with the page, in the frame the figure first shows, and nothing under it moves)
 * @claim "Only `ChartTooltip` and `ChartLegend` load" scripts/chart-weight.test.mjs verify:testExists(scripts/chart-weight.test.mjs::ChartTooltip and ChartLegend load recharts in a chunk of its own, after the page (control))
 * @claim "Only `ChartTooltip` and `ChartLegend` load" registry/ouro/components/ouro/chart/chart.test.tsx verify:testExists(registry/ouro/components/ouro/chart/chart.test.tsx::Chart > draws a recharts chart passed as children after the first paint, in the room the plot box keeps)
 * @claim "Bundlephobia measures the whole package" https://bundlephobia.com/package/recharts@3.10.1 verify:urlOk(https://bundlephobia.com/package/recharts@3.10.1)
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
  // The series once per config and category, so the memos built on them hold.
  const series = useMemo(() => seriesOf(entries, categoryKey), [entries, categoryKey]);
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
  // The plot draws after the first paint, and its parts with it, so Chart checks the parts it can see now: their messages
  // come with the page, not a frame later. Chart and its parts share one key, so a part says nothing more once it renders.
  const child = Children.toArray(children).find(isValidElement) as ReactElement<{ data?: unknown }> | undefined;
  const [warnKey] = useState(() => ({}));
  useEffect(() => {
    /* istanbul ignore else @preserve -- the else path exists only in production bundles; scripts/dev-strip.test.mjs covers it */
    if (process.env.NODE_ENV !== "production" && child) for (const part of partsOf(child)) checkPartContent(part.type, part.props as { content?: unknown }, warnKey);
  });
  const id = useId();
  const summaryId = `${id}-summary`;
  const [legendTarget, setLegendTarget] = useState<HTMLElement | null>(null);
  const plotRef = useRef<HTMLDivElement>(null);
  // Chart measures its plot box before the first paint and draws its own marks in it at once.
  const size = usePlotSize(plotRef, !child);
  // A Recharts chart passed as children lays itself out in script, a long task on its first use, so it draws in the task
  // after the page's first paint, in the room the plot box keeps for it: the rest of the page shows without waiting for
  // it. When it holds a ChartTooltip or ChartLegend, their Recharts parts load first, by a dynamic import that only
  // those parts name, so they draw with the chart. A load that fails throws in the chart's render, where the app's error
  // boundary and its framework's handling of a chunk that failed to load can see it.
  const [composed, setComposed] = useState(false);
  const composedChild = Boolean(child);
  useEffect(() => {
    if (!composedChild) return;
    const loads = [...new Set(partsOf(child!).flatMap((part) => partTag(part.type)?.load ?? []))];
    let timer: ReturnType<typeof setTimeout> | undefined;
    const frame = requestAnimationFrame(() => {
      timer = setTimeout(() =>
        Promise.all(loads.map((load) => load())).then(
          () => setComposed(true),
          (error: unknown) =>
            setComposed(() => {
              throw error;
            }),
        ),
      );
    });
    // Stryker disable next-line BlockStatement: an unmounted chart ignores the late update, so the cleanup changes nothing anyone sees
    return () => {
      // Stryker disable next-line CallExpression: an unmounted chart ignores the late update
      cancelAnimationFrame(frame);
      // Stryker disable next-line CallExpression: an unmounted chart ignores the late update
      clearTimeout(timer);
    };
    // The parts are read once the chart is composed; a new element for the same chart loads nothing new.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [composedChild]);
  // Indexed once per series and formatter, not on every render (a tooltip's move renders the chart).
  const state = useMemo<ChartState>(
    () => ({ byKey: new Map(series.map((item) => [item.key, item])), formatValue, legendTarget, warnKey }),
    [series, formatValue, legendTarget, warnKey],
  );
  const colors = useMemo(() => Object.fromEntries(series.map((item) => [`--color-${item.key}`, item.color])) as CSSProperties, [series]);
  // The plot is a tab stop (role "application"), so it carries the control marker.
  const plotProps = { "aria-label": title, "aria-describedby": summaryId, "data-ouro-control": "chart", "data-ouro-part": "plot" };
  return (
    <figure
      {...rest}
      data-ouro="chart"
      aria-describedby={[summaryId, rest["aria-describedby"]].filter(Boolean).join(" ")}
      style={{ ...colors, ...style }}
      className={cn("[@layer_ouro-reset]:m-0 box-border flex w-full min-w-0 flex-col gap-3 text-foreground", className)}
    >
      <figcaption className={hideTitle ? "sr-only" : "text-base font-semibold pointer-fine:text-sm"}>{title}</figcaption>
      {description !== undefined && <p className="-mt-2 mb-0 text-sm text-muted-foreground">{description}</p>}
      <div ref={plotRef} data-ouro-chart-plot="" className={plotClass}>
        <ChartContext value={state}>
          {child
            ? composed &&
              // Recharts sizes the chart to this box itself (`responsive`), so Chart needs none of Recharts' parts for it.
              cloneElement(child, { data: child.props.data ?? data, ...plotProps, responsive: true, width: "100%", height: "100%" } as Record<string, unknown>)
            : size && <SeriesPlot type={type} data={rows} categoryKey={categoryKey} series={series} formatValue={formatValue} plotProps={plotProps} size={size} />}
        </ChartContext>
      </div>
      {/* Chart's own legend is here from the server HTML on. A Recharts chart's ChartLegend portals its list here once it
          draws; until then the legend of the series it draws holds its place, so nothing under the chart moves. */}
      <div ref={setLegendTarget} data-ouro-chart-legend-slot="" className="empty:hidden">
        {(child ? !composed && hasLegend(child) : series.length > 1) && (
          <ChartContext value={state}>
            <LegendContent payload={child ? drawnKeys(child) : series.map((item) => ({ dataKey: item.key }))} />
          </ChartContext>
        )}
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
 * @see https://ui.ouroboros.bot/docs/chart
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

/** The plot box's size, the font its axis labels are measured in, and whether it reads right to left. */
interface PlotSize {
  width: number;
  height: number;
  font: string;
  rtl: boolean;
}

/**
 * The plot box's size, read before the first paint and again whenever it changes, and once more when the page's fonts
 * have loaded, as labels measured in a fallback font would sit a little off. `null` on the server, and for a Recharts
 * chart passed as children, which sizes itself.
 */
function usePlotSize(ref: RefObject<HTMLDivElement | null>, enabled: boolean): PlotSize | null {
  const [size, setSize] = useState<PlotSize | null>(null);
  useLayoutEffect(() => {
    if (!enabled) return;
    const element = ref.current!;
    const read = () => {
      // The layout size, which a transform on an ancestor (a dialog scaling in) leaves alone.
      const style = getComputedStyle(element);
      setSize({
        width: element.clientWidth,
        height: element.clientHeight,
        font: `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`,
        rtl: style.direction === "rtl",
      });
    };
    read();
    const observer = new ResizeObserver(read);
    observer.observe(element);
    // Labels measured in a fallback font sit a little off once the page's own font arrives.
    void document.fonts.ready.then(read);
    return () => observer.disconnect();
  }, [ref, enabled]);
  return size;
}

let measuring: CanvasRenderingContext2D | undefined;

/** How wide a label draws in a font, in CSS pixels. */
function textWidth(text: string, font: string): number {
  measuring ??= document.createElement("canvas").getContext("2d")!;
  measuring.font = font;
  return measuring.measureText(text).width;
}

/** Room between an axis label and the plot: a tick's length and its margin, as Recharts' axes leave it. */
const tickRoom = 14;
/** The x axis' height under the plot, and the margin above and to the right of the plot. */
const xAxisHeight = 30;
const plotMargin = 8;
/** The room kept between x-axis labels: from the last label back, one that would come closer is left out, as Recharts' axis does. */
const minTickGap = 16;
/** How far the tooltip card sits from the point it describes. */
const cardOffset = 10;

/** A number that can be drawn: `Number.isFinite` is false for anything else, a string of digits included. */
const isValue = (value: unknown): value is number => Number.isFinite(value);

interface SeriesPlotProps {
  type: ChartType;
  data: ReadonlyArray<Record<string, unknown>>;
  categoryKey: string;
  series: Series[];
  formatValue: (value: number, series: string) => string;
  plotProps: Record<string, string>;
  size: PlotSize;
}

/** Where the tooltip is: the category it describes, and the point in the plot its card is placed from. */
interface Active {
  index: number;
  x: number;
  y: number;
}

/**
 * The chart `type` draws, as Ouro's own SVG: a grid, both axes, one mark per series and category, and the tooltip,
 * which the pointer and the arrow keys move from category to category. Recharts plays no part in it.
 *
 * @claim "The chart `type` draws, as Ouro's" registry/ouro/components/ouro/chart/chart.test.tsx verify:testExists(registry/ouro/components/ouro/chart/chart.test.tsx::Chart > draws lines with a different point shape per series)
 * @claim "The chart `type` draws, as Ouro's" registry/ouro/components/ouro/chart/chart.test.tsx verify:testExists(registry/ouro/components/ouro/chart/chart.test.tsx::Chart > shows the tooltip from the keyboard: Tab to the plot, then the arrow keys)
 * @claim "Recharts plays no part in it" registry/ouro/components/ouro/chart/chart.load.test.tsx verify:testExists(registry/ouro/components/ouro/chart/chart.load.test.tsx::draws a chart with type without ever importing recharts)
 */
function SeriesPlot({ type, data, categoryKey, series, formatValue, plotProps, size }: SeriesPlotProps): JSX.Element {
  const { width, height, font, rtl } = size;
  const count = data.length;
  const layout = useMemo(() => {
    let low = 0;
    let high = 0;
    for (const row of data) for (const item of series) if (isValue(row[item.key])) [low, high] = [Math.min(low, row[item.key] as number), Math.max(high, row[item.key] as number)];
    const ticks = niceTicks(low, high);
    const labels = ticks.map((tick) => formatValue(tick, ""));
    // The y axis' gutter: beside the start of a line of text, so it moves to the plot's right in a right-to-left page.
    const gutter = Math.ceil(labels.reduce((widest, label) => Math.max(widest, textWidth(label, font)), 0)) + tickRoom;
    const left = rtl ? plotMargin : gutter;
    const right = rtl ? Math.max(width - gutter, left + 1) : Math.max(width - plotMargin, left + 1);
    const top = plotMargin;
    const bottom = Math.max(height - xAxisHeight, top + 1);
    const [first, last] = [ticks[0]!, ticks.at(-1)!];
    const y = (value: number) => bottom - ((value - first) / (last - first)) * (bottom - top);
    // Bars take a band each; lines and areas run edge to edge, a point per category.
    const band = (right - left) / Math.max(count, 1);
    const step = (right - left) / Math.max(count - 1, 1);
    const x = (index: number) => (type === "bar" ? left + band * (index + 0.5) : count > 1 ? left + step * index : (left + right) / 2);
    // Each category label centered on its category, kept inside the plot's box; from the last one back, a label that
    // would come within minTickGap of the one after it is left out.
    const categories: Array<{ index: number; text: string; x: number }> = [];
    let edge = Infinity;
    for (let index = count - 1; index >= 0; index--) {
      const text = String(data[index]![categoryKey] ?? "");
      const half = textWidth(text, font) / 2;
      const center = Math.min(Math.max(x(index), half), width - half);
      if (center + half + minTickGap > edge) continue;
      categories.unshift({ index, text, x: center });
      edge = center - half;
    }
    return { ticks, labels, left, right, top, bottom, y, band, step, x, categories };
  }, [data, series, categoryKey, formatValue, type, count, width, height, font, rtl]);
  const { ticks, labels, left, right, top, bottom, y, band, step, x, categories } = layout;
  const [active, setActive] = useState<Active | null>(null);
  // A tooltip at a category the data no longer has is put away, so it cannot come back when the data grows again.
  if (active && active.index >= count) setActive(null);
  const index = active && active.index < count ? active.index : null;
  const card = useRef<HTMLDivElement>(null);
  const [cardWidth, setCardWidth] = useState(0);
  const [cardHeight, setCardHeight] = useState(0);
  // The card's size, so it can sit beside its point and turn to the other side at the plot's edge, before it paints. Its
  // size changes only with what it shows: the category, and the data, series and format it shows them in.
  useLayoutEffect(() => {
    if (!card.current) return;
    setCardWidth(card.current.offsetWidth);
    setCardHeight(card.current.offsetHeight);
  }, [index, data, series, formatValue]);

  /** The category under a point of the plot; outside the plot area, the tooltip is put away. */
  const at = (pointX: number, pointY: number): Active | null => {
    const inside = Math.min(pointX - left, right - pointX, pointY - top, bottom - pointY) >= 0;
    if (count === 0 || !inside) return null;
    // A line's points are a step apart; one point alone is nearest anywhere.
    const near = type === "bar" ? Math.floor((pointX - left) / band) : Math.round((pointX - left) / step);
    return { index: Math.min(Math.max(near, 0), count - 1), x: pointX, y: pointY };
  };
  const follow = (event: PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    setActive(at(event.clientX - box.left, event.clientY - box.top));
  };
  /** The tooltip at a category the keyboard reached, placed from the category's point at the top of the plot. */
  const reach = (next: number) => setActive({ index: next, x: x(next), y: top });
  const keys: Record<string, (current: number) => number> = {
    ArrowRight: (current) => Math.min(current + 1, count - 1),
    ArrowLeft: (current) => Math.max(current - 1, 0),
    Home: () => 0,
    End: () => count - 1,
  };

  const cursor =
    index === null ? null : type === "bar" ? (
      <rect data-ouro-chart-cursor="" x={left + band * index} y={top} width={band} height={bottom - top} className="fill-muted" />
    ) : (
      <line data-ouro-chart-cursor="" x1={x(index)} x2={x(index)} y1={top} y2={bottom} className="stroke-border" strokeWidth={1} />
    );
  // The ticks always reach 0, so bars and areas grow from it.
  const zero = y(0);
  // The marks do not change as the tooltip moves, so a pointer move redraws only the cursor, the points and the card.
  const marks = useMemo(() => {
    const slots = barSlots(band, series.length);
    return series.map((item, place) => {
      const color = `var(--color-${item.key})`;
      if (type === "bar") {
        return (
          <g key={item.key} data-ouro-chart-series={item.key} className={`ouro-chart-series-${item.key}`}>
            {data.map((row, category) => {
              const value = row[item.key];
              if (!isValue(value)) return null;
              const slot = slots[place]!;
              const [from, to] = [zero, y(value)];
              return (
                <rect
                  key={category}
                  data-ouro-chart-bar=""
                  x={left + band * category + slot.x}
                  y={Math.min(from, to)}
                  width={slot.width}
                  height={Math.abs(to - from)}
                  rx={4}
                  fill={color}
                />
              );
            })}
          </g>
        );
      }
      // A missing value breaks the line, as Recharts' does without connectNulls.
      const runs: Array<Array<readonly [number, number]>> = [[]];
      data.forEach((row, category) => {
        const value = row[item.key];
        if (isValue(value)) runs.at(-1)!.push([x(category), y(value)]);
        else runs.push([]);
      });
      const lines = runs.filter((run) => run.length > 0);
      return (
        <g key={item.key} data-ouro-chart-series={item.key} className={`ouro-chart-series-${item.key}`}>
          {type === "area" &&
            lines.map((run, number) => (
              <path key={`area-${number}`} data-ouro-chart-area="" d={`${curvePath(run)}L${run.at(-1)![0]},${zero}L${run[0]![0]},${zero}Z`} fill={color} fillOpacity={0.2} />
            ))}
          {lines.map((run, number) => (
            <path key={number} data-ouro-chart-line="" d={curvePath(run)} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          ))}
        </g>
      );
    });
  }, [series, data, type, band, left, x, y, zero]);
  const dots =
    type === "bar"
      ? null
      : series.map((item) => (
          <g key={item.key} data-ouro-chart-dots={item.key}>
            {data.map((row, category) =>
              isValue(row[item.key]) ? (
                <g
                  key={category}
                  data-ouro-chart-dot={item.shape}
                  data-ouro-chart-series={item.key}
                  transform={`translate(${x(category)} ${y(row[item.key] as number)})`}
                  color={`var(--color-${item.key})`}
                >
                  {/* The point under the tooltip grows, so the eye finds it; with reduced motion it changes size at once. */}
                  <g
                    data-ouro-part="dot"
                    data-highlighted={category === index ? "" : undefined}
                    className="[transform-box:fill-box] origin-center transition-[scale] duration-(--ouro-duration-fast) ease-(--ouro-ease-out) data-highlighted:scale-140 motion-reduce:transition-none"
                  >
                    <MarkerPath shape={item.shape} size={9} />
                  </g>
                </g>
              ) : null,
            )}
          </g>
        ));
  /** Where the card goes along one side: past the point, or before it where it would run out of the plot's box. */
  const beside = (point: number, card: number, room: number) => (point + cardOffset + card > room ? Math.max(point - cardOffset - card, 0) : point + cardOffset);
  return (
    <>
      <svg
        {...plotProps}
        data-ouro-chart-surface=""
        role="application"
        tabIndex={0}
        width={width}
        height={height}
        // The plot moves its own y axis gutter to the right in a right-to-left page; its text keeps a left-to-right
        // direction throughout, so "end" and "start" below always mean a label's visual right and left edge.
        direction="ltr"
        // Some fonts draw a glyph's ink past its box (a 1's flag), so the plot lets the axis labels show whole. A
        // horizontal drag on a touch screen moves the tooltip; a vertical one still scrolls the page.
        className="absolute inset-0 touch-pan-y overflow-visible rounded-ouro-md outline-ring outline-offset-2 focus-visible:outline-2 focus-visible:outline-solid"
        onPointerDown={follow}
        onPointerMove={follow}
        // A finger lifted leaves the tooltip where it was read; a mouse that leaves takes it away.
        onPointerLeave={(event) => event.pointerType !== "touch" && setActive(null)}
        // An empty chart has no first category; the check above puts the tooltip away again.
        onFocus={() => setActive((last) => last ?? { index: 0, x: x(0), y: top })}
        onBlur={() => setActive(null)}
        onKeyDown={(event) => {
          // Escape puts the tooltip away and goes no further, so a dialog around the chart stays open; with no tooltip, it reaches the dialog.
          if (event.key === "Escape" && index !== null) {
            event.stopPropagation();
            setActive(null);
          }
          const move = keys[event.key];
          if (!move || count === 0) return;
          event.preventDefault();
          reach(move(index ?? -1));
        }}
      >
        <g data-ouro-chart-grid="" className="stroke-border">
          {ticks.map((tick) => (
            <line key={tick} x1={left} x2={right} y1={y(tick)} y2={y(tick)} />
          ))}
        </g>
        {/* The band behind the bars; the line over the areas, under the points. */}
        {type === "bar" && cursor}
        {marks}
        {type !== "bar" && cursor}
        {dots}
        <g data-ouro-chart-axis="y" className="fill-muted-foreground">
          {ticks.map((tick, place) => (
            <text key={tick} data-ouro-chart-tick="" x={rtl ? right + tickRoom : left - tickRoom} y={y(tick)} dy="0.355em" textAnchor={rtl ? "start" : "end"}>
              {labels[place]}
            </text>
          ))}
        </g>
        <g data-ouro-chart-axis="x" className="fill-muted-foreground">
          {categories.map((category) => (
            <text key={category.index} data-ouro-chart-tick="" x={category.x} y={bottom + tickRoom} dy="0.71em" textAnchor="middle">
              {category.text}
            </text>
          ))}
        </g>
      </svg>
      {index !== null && (
        // Fades in where it first shows, then glides from point to point; with reduced motion it only fades.
        <div
          ref={card}
          data-ouro-chart-tooltip-place=""
          className="pointer-events-none absolute top-0 transition-[opacity,translate] duration-(--ouro-duration-fast) ease-(--ouro-ease-out) starting:opacity-0 motion-reduce:transition-opacity"
          style={{ left: 0, translate: `${beside(active!.x, cardWidth, width)}px ${beside(active!.y, cardHeight, height)}px` }}
        >
          <TooltipContent
            active
            payload={series.map((item) => ({ dataKey: item.key, value: data[index]![item.key] }))}
            label={data[index]![categoryKey]}
          />
        </div>
      )}
    </>
  );
}

/**
 * A marker centered on 0,0, filled with the current color, outlined in the page's background.
 *
 * @claim "A marker centered on 0,0, filled" registry/ouro/components/ouro/chart/chart.test.tsx verify:testExists(registry/ouro/components/ouro/chart/chart.test.tsx::Chart > gives five series five marker shapes)
 */
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
    <svg aria-hidden="true" data-ouro-chart-marker={item.shape} viewBox="-6 -6 12 12" className="size-ouro-3 shrink-0" style={{ color: item.color }}>
      <MarkerPath shape={item.shape} size={10} />
    </svg>
  );
}

interface TooltipEntry {
  dataKey?: unknown;
  value?: unknown;
}

/**
 * The tooltip card: the category, then each series' marker, label and value. Series not in config are left out.
 *
 * @claim "The tooltip card: the category, then" registry/ouro/components/ouro/chart/chart.test.tsx verify:testExists(registry/ouro/components/ouro/chart/chart.test.tsx::Chart > labels each series in a legend with a marker shape, so color is not the only cue)
 * @claim "The tooltip card: the category, then" registry/ouro/components/ouro/chart/chart.test.tsx verify:testExists(registry/ouro/components/ouro/chart/chart.test.tsx::Chart > leaves series that are not in config out of the tooltip and the legend)
 */
function TooltipContent({ active, payload, label }: { active: boolean; payload: readonly TooltipEntry[]; label: unknown }): JSX.Element | null {
  const { byKey, formatValue } = useChartPart("ChartTooltip");
  const entries = payload.flatMap((entry) => {
    const item = byKey.get(String(entry.dataKey));
    return item ? [{ item, value: entry.value }] : [];
  });
  if (!active || entries.length === 0) return null;
  // Recharts gives an active tooltip no label only for a moment, as when a chart is drawn under a
  // resting pointer, which no test can hold; without the fallback the card would read "undefined".
  /* istanbul ignore next @preserve -- a momentary Recharts state, above */
  // Stryker disable next-line StringLiteral: the fallback shows only in that momentary state, which no test can hold.
  const heading = String(label ?? "");
  return (
    // A polite live region (recharts' own card is assertive), so a screen reader in the plot
    // hears each point the arrow keys reach.
    <div
      data-ouro-chart-tooltip=""
      role="status"
      aria-live="polite"
      className="grid min-w-ouro-32 gap-1.5 rounded-ouro-lg border border-solid border-border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-(--shadow-lg)"
    >
      <div className="font-medium">{heading}</div>
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

/** The parts of a recharts chart passed as children. */
const partsOf = (chart: ReactElement) => Children.toArray((chart.props as { children?: ReactNode }).children).filter(isValidElement);

/** Whether a recharts chart passed as children holds a `ChartLegend`. */
function hasLegend(chart: ReactElement): boolean {
  return partsOf(chart).some((part) => partTag(part.type)?.name === "ChartLegend");
}

/** The series a recharts chart passed as children draws, as its legend lists them, by their `dataKey`s. */
function drawnKeys(chart: ReactElement): { dataKey?: unknown }[] {
  return partsOf(chart).map((part) => ({ dataKey: (part.props as { dataKey?: unknown }).dataKey }));
}

/**
 * The legend: each drawn series' marker and label from config, in a row under the plot.
 *
 * @claim "The legend: each drawn series' marker" registry/ouro/components/ouro/chart/chart.test.tsx verify:testExists(registry/ouro/components/ouro/chart/chart.test.tsx::Chart > labels each series in a legend with a marker shape, so color is not the only cue)
 * @claim "The legend: each drawn series' marker" registry/ouro/components/ouro/chart/chart.test.tsx verify:testExists(registry/ouro/components/ouro/chart/chart.test.tsx::Chart > leaves series that are not in config out of the tooltip and the legend)
 */
function LegendContent({ payload }: { payload: readonly { dataKey?: unknown }[] }): JSX.Element {
  const { byKey } = useChartPart("ChartLegend");
  const shown = payload.flatMap((entry) => byKey.get(String(entry.dataKey)) ?? []);
  return (
    <ul data-ouro-chart-legend="" className="m-0 flex list-none flex-wrap items-center justify-center gap-x-4 gap-y-1 p-0 text-xs text-foreground">
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
 * @see https://ui.ouroboros.bot/docs/chart
 *
 * @example
 * <Chart title="Recipes cooked" data={months} categoryKey="month" config={config}>
 *   <LineChart>
 *     <Line dataKey="cooked" stroke="var(--color-cooked)" />
 *     <ChartTooltip />
 *   </LineChart>
 * </Chart>
 * @claim "The tooltip for a recharts chart" registry/ouro/components/ouro/chart/chart.test.tsx verify:testExists(registry/ouro/components/ouro/chart/chart.test.tsx::Chart > labels each series in a legend with a marker shape, so color is not the only cue)
 * @claim "The tooltip for a recharts chart" registry/ouro/components/ouro/chart/chart.test.tsx verify:testExists(registry/ouro/components/ouro/chart/chart.test.tsx::Chart > colors each series from the theme's chart tokens, in light and dark)
 */
// A pure call with its tag inside it, so an app that never renders the part leaves it, and Recharts, out of its build.
export const ChartTooltip = /* @__PURE__ */ memo(
  /* @__PURE__ */ Object.assign(function ChartTooltip(props: ChartTooltipProps): JSX.Element | null {
    const { warnKey } = useChartPart("ChartTooltip");
    const parts = useRecharts();
    useEffect(() => {
      /* istanbul ignore else @preserve -- the else path exists only in production bundles; scripts/dev-strip.test.mjs covers it */
      if (process.env.NODE_ENV !== "production") checkPartContent(ChartTooltip, props, warnKey);
    });
    if (!parts) return null;
    return <parts.Tooltip cursor content={(tooltip) => <TooltipContent active={tooltip.active} payload={tooltip.payload as readonly TooltipEntry[]} label={tooltip.label} />} />;
  }, { ouroChartPart: { name: "ChartTooltip", load: loadRecharts } satisfies PartTag }),
);

/**
 * The legend for a recharts chart inside `Chart`: each series' marker shape and label from
 * the chart's `config`, under the plot. `Chart` adds it for you with `type` when it draws two
 * or more series.
 *
 * Use `Chart` with `type` instead when bars, lines or areas are enough: it adds the legend
 * itself. Use it only inside a recharts chart passed to `Chart` as children.
 *
 * @group Data
 * @see https://ui.ouroboros.bot/docs/chart
 *
 * @example
 * <Chart title="Recipes" data={months} categoryKey="month" config={config}>
 *   <BarChart>
 *     <Bar dataKey="cooked" fill="var(--color-cooked)" />
 *     <Bar dataKey="saved" fill="var(--color-saved)" />
 *     <ChartLegend />
 *   </BarChart>
 * </Chart>
 * @claim "The legend for a recharts chart" registry/ouro/components/ouro/chart/chart.test.tsx verify:testExists(registry/ouro/components/ouro/chart/chart.test.tsx::Chart > labels each series in a legend with a marker shape, so color is not the only cue)
 * @claim "The legend for a recharts chart" registry/ouro/components/ouro/chart/chart.test.tsx verify:testExists(registry/ouro/components/ouro/chart/chart.test.tsx::Chart > leaves out the legend for a single series, which the title already names)
 * @claim "`Chart` adds it for you with" registry/ouro/components/ouro/chart/chart.test.tsx verify:testExists(registry/ouro/components/ouro/chart/chart.test.tsx::Chart > leaves out the legend for a single series, which the title already names)
 * @claim "`Chart` adds it for you with" registry/ouro/components/ouro/chart/chart.test.tsx verify:testExists(registry/ouro/components/ouro/chart/chart.test.tsx::Chart > draws lines with a different point shape per series)
 */
export const ChartLegend = /* @__PURE__ */ memo(
  /* @__PURE__ */ Object.assign(function ChartLegend(props: ChartLegendProps): JSX.Element | null {
    const { legendTarget, warnKey } = useChartPart("ChartLegend");
    const parts = useRecharts();
    useEffect(() => {
      /* istanbul ignore else @preserve -- the else path exists only in production bundles; scripts/dev-strip.test.mjs covers it */
      if (process.env.NODE_ENV !== "production") checkPartContent(ChartLegend, props, warnKey);
    });
    // Recharts measures the plot before it renders its children, by which time the slot is mounted. A null
    // target would make Legend fall back to the list inside the chart's own wrapper, so render nothing then.
    /* istanbul ignore if @preserve -- the slot mounts before Recharts measures the plot, so a target is always set when this renders */
    // Stryker disable next-line ConditionalExpression: the slot mounts before Recharts measures the plot, so this never runs with a null target and forcing it false changes nothing.
    if (legendTarget === null) return null;
    if (!parts) return null;
    return <parts.Legend verticalAlign="bottom" portal={legendTarget} content={(legend) => <LegendContent payload={legend.payload as readonly { dataKey?: unknown }[]} />} />;
  }, { ouroChartPart: { name: "ChartLegend", load: loadRecharts } satisfies PartTag }),
);
