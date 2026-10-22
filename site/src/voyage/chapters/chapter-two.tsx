import { createContext, memo, startTransition, use, useDeferredValue, useEffect, useMemo, useRef, useState, useSyncExternalStore, type JSX, type ReactNode, type RefObject } from "react";
import { Badge } from "@/registry/ouro/components/ouro/badge/badge";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { DatePicker } from "@/registry/ouro/components/ouro/calendar/date-picker";
import { Chart } from "@/registry/ouro/components/ouro/chart/chart";
import { Combobox } from "@/registry/ouro/components/ouro/combobox/combobox";
import { HoverCard } from "@/registry/ouro/components/ouro/hover-card/hover-card";
import { Item } from "@/registry/ouro/components/ouro/item/item";
import { ItemGroup } from "@/registry/ouro/components/ouro/item/item-group";
import { Link } from "@/registry/ouro/components/ouro/link/link";
import { Reorderable } from "@/registry/ouro/components/ouro/reorderable/reorderable";
import { SegmentedControl } from "@/registry/ouro/components/ouro/segmented-control/segmented-control";
import { Select } from "@/registry/ouro/components/ouro/select/select";
import { Sheet } from "@/registry/ouro/components/ouro/sheet/sheet";
import { Table } from "@/registry/ouro/components/ouro/table/table";
import { toast } from "@/registry/ouro/lib/ouro/toast";
import chartSource from "../../nautilus/art/voyage-chart.svg?raw";
import compassSource from "../../nautilus/art/compass.svg?raw";
import { keepClearOfToasts } from "../clear-of-toasts";
import { Container } from "../layout";
import { labelBox, labelStyle, parseArt, type Art } from "../stage/art";
import type { CrewLine } from "./copy";
import {
  CATALOGUE,
  CHAPTER_TWO,
  CHART_ROOM,
  CLASSES,
  CLASSING,
  CODE_SHEETS_TWO,
  FINDS,
  MUSEUM,
  PLANNING,
  ROUTE,
  SPECIMENS,
  START_DAY,
  START_ROUTE,
  type PortId,
  type Specimen,
  type SpecimenClass,
} from "./chapter-two-copy";
import { Composition, Crew, Handoff, PhoneMarker, Steps, useChapterReady, type Step } from "./frame";
import { arrivals, chartPoint, isBook, isShortest, legs, portNamed, routeLeagues, routePath, SHORTEST, writeDay, writeLeagues } from "./route";
// What only changes once the chapter answers (the route drawing in, a port's number): it comes
// inside this island's script and goes into the page as the island hydrates.
import chapterStyles from "./chapter-two.css?inline";

// The sea and the land take the theme's colours in the drawing's own markup, so the server HTML has
// them without a rule in the first load's CSS (catalog.spec.ts).
const map = parseArt(chartSource);
const chart: Art = {
  ...map,
  inner: map.inner
    .replace('class="ch-sea"', 'class="ch-sea" style="fill:color-mix(in oklab,var(--primary) 6%,var(--card))"')
    .replace('class="ch-land"', 'class="ch-land" style="fill:color-mix(in oklab,var(--chart-3) 18%,var(--card))"'),
};
const compass = parseArt(compassSource);

/** How the plan stands: the chart room and the catalogue write it, the rail beside them reads it. */
interface Plan {
  route: readonly PortId[];
  day: string | null;
  classed: number;
}

function createPlan() {
  let state: Plan = { route: START_ROUTE, day: null, classed: 0 };
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set(next: Partial<Plan>) {
      state = { ...state, ...next };
      for (const listener of listeners) listener();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}
type PlanStore = ReturnType<typeof createPlan>;
const PlanContext = createContext<PlanStore | null>(null);
const usePlanStore = () => use(PlanContext)!;

const kindLabel = (kind: SpecimenClass) => CLASSES.find((each) => each.value === kind)!.label;

/**
 * Chapter II, "Plan the voyage" (site-design.md): the chart room, where Ouro HX's Reorderable,
 * DatePicker and Chart plan the route on an engraved map, and Aronnax's catalogue, where HX's
 * Table, HoverCard, Combobox and Sheet show the finds and Conseil checks your classing. Each is one
 * framed application with a Code sheet saying which part is HX's and which the site's. The page
 * hydrates it only as it nears the screen, so its Chart (and Recharts with it) never loads first.
 */
export default function ChapterTwo(): JSX.Element {
  const root = useRef<HTMLElement>(null);
  const [plan] = useState(createPlan);
  useChapterReady(root, "chapter-two-styles", chapterStyles);
  return (
    <section ref={root} id="chapter-two" aria-labelledby="chapter-two-title" className="pb-20 lg:pb-32" data-chapter="two">
      <Handoff art={compass} line={CHAPTER_TWO.handoff} />
      <PlanContext value={plan}>
        <PlanningMarker />
        <Container className="grid grid-cols-[minmax(0,1fr)] gap-x-6 gap-y-12 lg:grid-cols-12">
          <header className="lg:sticky lg:top-24 lg:col-span-4 lg:self-start">
            <p className="site-eyebrow">{CHAPTER_TWO.number}</p>
            <h2 id="chapter-two-title" className="site-h2 mt-3">
              {CHAPTER_TWO.title}
            </h2>
            <p className="site-lede mt-4">{CHAPTER_TWO.intro}</p>
            <Planning />
          </header>
          <div className="grid grid-cols-[minmax(0,1fr)] gap-20 lg:col-span-8">
            <Composition id="chart-room" title={CHART_ROOM.title} intro={CHART_ROOM.intro} file={CHART_ROOM.file} sheet={CODE_SHEETS_TWO.chartRoom}>
              <ChartRoom />
            </Composition>
            <Composition id="catalogue" title={CATALOGUE.title} intro={CATALOGUE.intro} file={CATALOGUE.file} sheet={CODE_SHEETS_TWO.catalogue}>
              <Catalogue />
            </Composition>
          </div>
        </Container>
      </PlanContext>
    </section>
  );
}

/** How the plan stands, as steps: the best route, a day to sail, the finds classed. */
function usePlanning(): Step[] {
  const store = usePlanStore();
  const { route, day, classed } = useSyncExternalStore(store.subscribe, store.get, store.get);
  return [
    { label: PLANNING.route, done: isShortest(route), status: isShortest(route) ? PLANNING.routeDone : PLANNING.routeLeft(writeLeagues(routeLeagues(route))) },
    { label: PLANNING.sail, done: day !== null, status: day ? PLANNING.sailOn(writeDay(day)) : PLANNING.sailNot },
    { label: PLANNING.classes, done: classed === FINDS.length, status: PLANNING.classed(classed, FINDS.length) },
  ];
}

/** The rail beside the chapter: the compass on the chart, and how the plan stands. Left out on a phone. */
function Planning(): JSX.Element {
  const steps = usePlanning();
  return (
    <div className="mt-10 hidden lg:block" data-chapter-planning="">
      <svg
        className="site-compass"
        style={{ display: "block", width: "60%", height: "auto", color: "color-mix(in oklab, var(--primary) 60%, var(--foreground))" }}
        viewBox={compass.viewBox}
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        data-done={steps.filter((step) => step.done).length}
        dangerouslySetInnerHTML={{ __html: compass.inner }}
      />
      <Steps label={PLANNING.label} steps={steps} />
    </div>
  );
}

function PlanningMarker(): JSX.Element {
  return <PhoneMarker chapter={CHAPTER_TWO.number} title={CHAPTER_TWO.title} steps={usePlanning()} />;
}

/** Where each port's name sits beside its mark, so no two names cover each other. */
const LABEL_AT: Record<PortId, { dx: number; dy: number; anchor: "start" | "end" | "middle" }> = {
  vigo: { dx: 12, dy: -8, anchor: "start" },
  crespo: { dx: 13, dy: 4, anchor: "start" },
  tunnel: { dx: 0, dy: 22, anchor: "middle" },
  atlantis: { dx: -13, dy: 14, anchor: "end" },
  pole: { dx: 13, dy: 4, anchor: "start" },
};

/** The route in words, for screen readers: the ports in order and how far it is. */
function describeRoute(route: readonly PortId[]): string {
  return `${CHART_ROOM.map}: ${route.map((id) => portNamed(id).name).join(", then ")}. ${CHART_ROOM.leagues(writeLeagues(routeLeagues(route)))}.`;
}

/** A label on the chart, as HTML in a foreignObject: SVG text costs WebKit a whole-page layout and repaint on every press (htmlLabels in art.ts). */
function ChartLabel({ x, y, anchor, className, fontSize, fontWeight, halo = false, children }: { x: number; y: number; anchor: string; className: string; fontSize: number; fontWeight: number; halo?: boolean; children: ReactNode }): JSX.Element {
  const box = labelBox(x, y, anchor);
  return (
    <foreignObject className={className} x={box.x} y={box.y} width={box.width} height={box.height} fontSize={fontSize} fontWeight={fontWeight}>
      <div
        style={{
          ...labelStyle,
          textAlign: box.align,
          // A halo of the card's colour, so the name reads across coasts and the route.
          ...(halo ? { WebkitTextStroke: "3px var(--card)", paintOrder: "stroke fill" } : {}),
        }}
      >
        {children}
      </div>
    </foreignObject>
  );
}

/** The engraved chart, with the route drawn from port to port and each port's place in it. */
const RouteMap = memo(function RouteMap({ route }: { route: readonly PortId[] }): JSX.Element {
  return (
    <figure className="m-0 border-b border-border/70">
      <svg className="site-chart block h-auto w-full font-[family-name:var(--font-heading)]" viewBox={chart.viewBox} role="img" aria-label={describeRoute(route)} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" data-route={route.join(" ")}>
        <g dangerouslySetInnerHTML={{ __html: chart.inner }} />
        {/* A new route draws itself in afresh. */}
        <path key={route.join()} className="ch-route" d={routePath(route)} pathLength={1} strokeWidth={2.2} style={{ stroke: "var(--primary)" }} />
        {/* The ports' marks, card-filled and ringed in the primary colour, and their numbers and names in the page's sans and the foreground colour, which their HTML takes from here. */}
        <g style={{ fill: "var(--card)", stroke: "var(--primary)", fontFamily: "var(--font-sans)", color: "var(--foreground)" }}>
          {route.map((id, index) => {
            const { x, y } = chartPoint(id);
            const label = LABEL_AT[id];
            return (
              <g key={id} className="ch-port" data-port={id} transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}>
                <g className="ch-mark">
                  <circle r={9} strokeWidth={1.4} />
                  <ChartLabel className="ch-port-number" x={0} y={3.6} anchor="middle" fontSize={10} fontWeight={600}>
                    {index + 1}
                  </ChartLabel>
                  <ChartLabel className="ch-port-name" x={label.dx} y={label.dy} anchor={label.anchor} fontSize={11} fontWeight={500} halo>
                    {portNamed(id).short}
                  </ChartLabel>
                </g>
              </g>
            );
          })}
        </g>
      </svg>
    </figure>
  );
});

/** A port's row in the plan: its name, and the day the Nautilus sails from it or reaches it. */
function PortRow({ id, day, first }: { id: PortId; day: string; first: boolean }): JSX.Element {
  return (
    <span className="flex min-w-0 flex-1 items-baseline justify-between gap-3">
      <span className="min-w-0">{portNamed(id).name}</span>
      <span className="shrink-0 text-sm text-muted-foreground" data-chapter-day="">
        {first ? CHART_ROOM.sail(writeDay(day)) : CHART_ROOM.arrive(writeDay(day))}
      </span>
    </span>
  );
}

/**
 * The chart room: put the ports in order (Reorderable), choose the day you sail (DatePicker), and
 * the chart draws the route, the counter adds up the leagues and the Chart shows each leg. The site
 * owns the route, the map and the maths; HX owns how each control behaves and what it announces.
 */
function ChartRoom(): JSX.Element {
  const store = usePlanStore();
  const [route, setRoute] = useState<readonly PortId[]>(START_ROUTE);
  const [day, setDay] = useState(START_DAY);
  const [line, setLine] = useState<CrewLine>(ROUTE.opening);
  // The map, the total and the chart follow the controls a frame later: a press repaints its own
  // control first (and the days beside the ports, which are cheap), then the drawing and the chart.
  const shown = useDeferredValue(route);
  useEffect(() => store.set({ route: shown }), [store, shown]);
  const days = arrivals(route, day);
  const say = (next: CrewLine) => startTransition(() => setLine(next));

  const reorder = (ids: string[]) => {
    const next = ids as PortId[];
    setRoute(next);
    if (isShortest(next)) say(ROUTE.shortest);
    else if (isBook(next)) say(ROUTE.book);
    else say(ROUTE.longer(writeLeagues(routeLeagues(next) - SHORTEST)));
  };
  // A typed day that is not a date yet reports "": the plan keeps the last good day until it is one.
  const pickDay = (value: string) => {
    if (!value) return;
    setDay(value);
    store.set({ day: value });
    say(ROUTE.day(writeDay(value)));
  };
  return (
    <div>
      <RouteMap route={shown} />
      <div className="grid gap-6 p-4 sm:grid-cols-2 sm:p-6">
        <div data-chapter-control="ports">
          <p className="site-eyebrow mb-2" aria-hidden="true">
            {CHART_ROOM.ports}
          </p>
          <Reorderable label={CHART_ROOM.ports} items={route.map((id, index) => ({ id, label: portNamed(id).name, content: <PortRow id={id} day={days[index]!} first={index === 0} /> }))} onReorder={reorder} />
        </div>
        <div className="grid content-start gap-6">
          <div data-chapter-control="departure">
            <DatePicker label={CHART_ROOM.departure} defaultValue={START_DAY} min="1867-01-01" max="1869-12-31" locale="en-GB" onValueChange={pickDay} />
          </div>
          <Total route={shown} last={writeDay(days.at(-1)!)} />
        </div>
      </div>
      <div className="grid gap-4 border-t border-border/70 p-4 sm:p-6">
        <div data-chapter-control="legs">
          <Legs route={shown} />
        </div>
        <Crew line={line} />
      </div>
    </div>
  );
}

/** The leagues counter: the whole route, Conseil's best beside it, and the day the last port is reached. */
function Total({ route, last }: { route: readonly PortId[]; last: string }): JSX.Element {
  const leagues = routeLeagues(route);
  return (
    <div className="grid gap-1" data-chapter-total="">
      <p className="site-eyebrow">{CHART_ROOM.total}</p>
      <p className="site-leagues m-0 font-heading text-4xl font-semibold tracking-tight tabular-nums text-foreground" data-shortest={leagues === SHORTEST ? "" : undefined}>
        {writeLeagues(leagues)}
      </p>
      <p className="m-0 text-sm text-muted-foreground">
        {CHART_ROOM.best(writeLeagues(SHORTEST))} · {CHART_ROOM.home(last)}
      </p>
    </div>
  );
}

/** One of the chart's axis labels, where Recharts put it, from the top left of the chart's box. */
interface AxisLabel {
  x: number;
  y: number;
  text: string;
}

/**
 * The legs chart's x-axis labels, read from where Recharts drew them. Recharts draws them as SVG
 * text, which costs WebKit a whole-page layout and repaint on every press (htmlLabels in art.ts),
 * so chapter-two.css hides them and Legs puts these over the chart as HTML instead.
 */
function useAxisLabels(host: RefObject<HTMLElement | null>): AxisLabel[] {
  const [labels, setLabels] = useState<AxisLabel[]>([]);
  useEffect(() => {
    const element = host.current!;
    let last = "";
    const read = () => {
      const origin = element.getBoundingClientRect();
      const svg = element.querySelector("svg.recharts-surface");
      const surface = svg?.getBoundingClientRect();
      const next = [...element.querySelectorAll(".recharts-xAxis-tick-labels .recharts-cartesian-axis-tick-value")].map((text) => ({
        x: surface!.left - origin.left + Number(text.getAttribute("x")),
        y: surface!.top - origin.top + Number(text.getAttribute("y")),
        text: text.textContent ?? "",
      }));
      const key = JSON.stringify(next);
      if (key !== last) {
        last = key;
        setLabels(next);
      }
    };
    read();
    const mutations = new MutationObserver(read);
    mutations.observe(element, { subtree: true, childList: true, characterData: true, attributeFilter: ["x", "y"] });
    const resizes = new ResizeObserver(read);
    resizes.observe(element);
    return () => {
      mutations.disconnect();
      resizes.disconnect();
    };
  }, [host]);
  return labels;
}

/** Each leg of the route as a bar: HX Chart, with its table for screen readers, and its x-axis labels as HTML (useAxisLabels). */
const Legs = memo(function Legs({ route }: { route: readonly PortId[] }): JSX.Element {
  const data = useMemo(() => legs(route).map((leg) => ({ port: portNamed(leg.to).short, leagues: leg.leagues })), [route]);
  const host = useRef<HTMLDivElement>(null);
  const labels = useAxisLabels(host);
  return (
    <div ref={host} className="site-legs relative">
      <Chart title={CHART_ROOM.legs} description={CHART_ROOM.legsHint} type="bar" data={data} categoryKey="port" config={{ leagues: { label: "Leagues" } }} className="h-52" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 text-xs text-muted-foreground" data-chapter-axis="">
        {labels.map((label) => (
          <span key={`${label.text}-${label.x}`} className="absolute -translate-x-1/2 whitespace-nowrap leading-none" style={{ left: label.x, top: label.y }}>
            {label.text}
          </span>
        ))}
      </div>
    </div>
  );
});

type Sort = "name" | "kind" | "depth";

/** The catalogue's rows, filtered to a class and sorted: the site's work, not the Table's. */
function arrange(rows: readonly Specimen[], sort: Sort, show: string): Specimen[] {
  const shown = show === "all" ? [...rows] : rows.filter((row) => row.kind === show);
  const byName = (a: Specimen, b: Specimen) => a.name.localeCompare(b.name);
  if (sort === "kind") return shown.sort((a, b) => kindLabel(a.kind).localeCompare(kindLabel(b.kind)) || byName(a, b));
  if (sort === "depth") return shown.sort((a, b) => a.depth - b.depth || byName(a, b));
  return shown.sort(byName);
}

/**
 * Aronnax's catalogue: sort and filter the specimens (the site does both; HX Table shows the rows),
 * point at a name for Aronnax's note (HoverCard), class each new find (Combobox, checked by
 * Conseil with a Toast), and visit Nemo's museum (Sheet).
 */
function Catalogue(): JSX.Element {
  const store = usePlanStore();
  const box = useRef<HTMLDivElement>(null);
  const [sort, setSort] = useState<Sort>("name");
  const [show, setShow] = useState("all");
  const [found, setFound] = useState<readonly string[]>([]);
  const [guess, setGuess] = useState<string | null>(null);
  const [line, setLine] = useState<CrewLine>(CLASSING.opening);
  const [museum, setMuseum] = useState(false);
  const find = FINDS[found.length];
  const all = useMemo(() => [...SPECIMENS, ...FINDS.filter((each) => found.includes(each.id))], [found]);
  const rows = useMemo(() => arrange(all, sort, show), [all, sort, show]);
  useEffect(() => store.set({ classed: found.length }), [store, found]);
  const say = (next: CrewLine) => startTransition(() => setLine(next));

  const classify = (value: string | null) => {
    setGuess(value);
    if (!value || !find) return;
    const kind = kindLabel(value as SpecimenClass);
    if (value !== find.kind) {
      say(CLASSING.wrong(kind, find.hint));
      return;
    }
    setFound([...found, find.id]);
    setGuess(null);
    say(found.length + 1 === FINDS.length ? CLASSING.finished : CLASSING.right(find.name, kind));
    toast(CLASSING.toast(kind), { tone: "success", description: CLASSING.toastNote(find.name) });
    keepClearOfToasts(box.current?.querySelector("[data-chapter-crew]"));
  };

  return (
    <div ref={box}>
      <div className="flex flex-wrap items-end gap-4 border-b border-border/70 p-4 sm:p-6">
        <div data-chapter-control="sort">
          <SegmentedControl label={CATALOGUE.sort} items={CATALOGUE.sorts} value={sort} onValueChange={(value) => setSort(value as Sort)} />
        </div>
        <div data-chapter-control="filter">
          <Select
            label={CATALOGUE.filter}
            className="w-44"
            value={show}
            onValueChange={(value) => setShow(String(value))}
            options={[{ value: "all", label: CATALOGUE.every }, ...CLASSES.map((kind) => ({ value: kind.value, label: kind.plural }))]}
          />
        </div>
        <span className="ms-auto pb-2 text-sm text-muted-foreground" data-chapter-shown="">
          {CATALOGUE.shown(rows.length, all.length)}
        </span>
      </div>
      <div className="p-4 sm:p-6" data-chapter-control="notes">
        <Table
          caption={CATALOGUE.table}
          hideCaption
          rows={rows}
          rowKey="id"
          empty={CATALOGUE.none}
          columns={[
            {
              key: "name",
              header: CATALOGUE.name,
              rowHeader: true,
              cell: (row) => (
                <HoverCard side="top" align="start" trigger={<Link href={row.href} external>{row.name}</Link>}>
                  <p className="m-0 text-sm">{row.note}</p>
                </HoverCard>
              ),
            },
            {
              key: "kind",
              header: CATALOGUE.kind,
              cell: (row) => (
                <span className="inline-flex flex-wrap gap-1.5">
                  <Badge tone="secondary" variant="soft">
                    {kindLabel(row.kind)}
                  </Badge>
                  {found.includes(row.id) ? <Badge tone="primary">{CATALOGUE.added}</Badge> : null}
                </span>
              ),
            },
            { key: "depth", header: CATALOGUE.depth, align: "end", cell: (row) => CATALOGUE.fathoms(row.depth) },
          ]}
        />
      </div>
      <div className="grid gap-6 border-t border-border/70 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end sm:p-6">
        {find ? (
          <div className="grid gap-3" data-chapter-find={find.id}>
            <p className="site-eyebrow">{CATALOGUE.find}</p>
            <p className="m-0 font-medium">{find.clue}</p>
            <div data-chapter-control="classify">
              <Combobox key={find.id} label={CATALOGUE.classify} description={CATALOGUE.classifyHint} items={CLASSES.map((kind) => ({ value: kind.value, label: kind.label }))} value={guess} onValueChange={classify} />
            </div>
          </div>
        ) : (
          <p className="m-0 font-medium" data-chapter-find="">
            {CATALOGUE.done}
          </p>
        )}
        <div data-chapter-control="museum">
          <Button variant="outline" tone="secondary" aria-haspopup="dialog" onClick={() => setMuseum(true)}>
            {CATALOGUE.museum}
          </Button>
        </div>
      </div>
      <div className="border-t border-border/70 p-4 sm:px-6">
        <Crew line={line} />
      </div>
      <Sheet title={MUSEUM.title} description={MUSEUM.description} side="right" open={museum} onOpenChange={setMuseum}>
        <ItemGroup aria-label={MUSEUM.title}>
          {MUSEUM.treasures.map((treasure) => (
            <Item key={treasure.name} title={treasure.name} description={treasure.note} />
          ))}
        </ItemGroup>
      </Sheet>
    </div>
  );
}

