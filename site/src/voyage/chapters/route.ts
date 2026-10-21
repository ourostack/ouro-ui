import { BOOK_ROUTE, PORTS, type Port, type PortId } from "./chapter-two-copy";

/**
 * The chart room's maths, which is the site's and not Ouro HX's: how far it is from port to port,
 * the shortest way round, where each port sits on the chart, and the day the Nautilus reaches it.
 */

const EARTH_KM = 6371;
/** A league as Verne counts it: four kilometres. */
const KM_PER_LEAGUE = 4;
/** How far the Nautilus goes in a day, in leagues, at the steady pace of the book's ten months. */
export const LEAGUES_PER_DAY = 70;

export const portNamed = (id: PortId): Port => PORTS.find((port) => port.id === id)!;

const radians = (degrees: number) => (degrees * Math.PI) / 180;

/** The leagues between two ports, the short way round the globe. */
export function leaguesBetween(from: PortId, to: PortId): number {
  const a = portNamed(from);
  const b = portNamed(to);
  const h = Math.sin(radians(b.lat - a.lat) / 2) ** 2 + Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(radians(b.lon - a.lon) / 2) ** 2;
  return (2 * EARTH_KM * Math.asin(Math.sqrt(h))) / KM_PER_LEAGUE;
}

/** Each leg of a route, to the port it reaches, in whole leagues. */
export function legs(route: readonly PortId[]): Array<{ to: PortId; leagues: number }> {
  return route.slice(1).map((to, index) => ({ to, leagues: Math.round(leaguesBetween(route[index]!, to)) }));
}

/** The whole route, in whole leagues. */
export function routeLeagues(route: readonly PortId[]): number {
  return legs(route).reduce((total, leg) => total + leg.leagues, 0);
}

function orders<T>(items: readonly T[]): T[][] {
  if (items.length < 2) return [[...items]];
  return items.flatMap((item, index) => orders([...items.slice(0, index), ...items.slice(index + 1)]).map((rest) => [item, ...rest]));
}

/** Every order the ports can be visited in. */
export const ALL_ROUTES: readonly (readonly PortId[])[] = orders(PORTS.map((port) => port.id));

/** The fewest leagues any order takes. */
export const SHORTEST = Math.min(...ALL_ROUTES.map(routeLeagues));

export const isShortest = (route: readonly PortId[]): boolean => routeLeagues(route) === SHORTEST;
export const isBook = (route: readonly PortId[]): boolean => route.join() === BOOK_ROUTE.join();

/** The chart's size, and where a port sits on it (voyage-chart.svg's grid). */
export const CHART = { width: 720, height: 341 } as const;
export function chartPoint(id: PortId): { x: number; y: number } {
  const port = portNamed(id);
  return { x: (port.lon + 180) * 3, y: Math.min((65 - port.lat) * 2.2, CHART.height - 14) };
}

/** The route as a line on the chart: a gentle curve from port to port, as a course is drawn. */
export function routePath(route: readonly PortId[]): string {
  const points = route.map(chartPoint);
  return points
    .map((point, index) => {
      if (index === 0) return `M${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
      const from = points[index - 1]!;
      const bend = index % 2 ? 0.18 : -0.18;
      const cx = (from.x + point.x) / 2 - (point.y - from.y) * bend;
      const cy = (from.y + point.y) / 2 + (point.x - from.x) * bend;
      return `Q${cx.toFixed(1)} ${cy.toFixed(1)} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
    })
    .join(" ");
}

const dayFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** An ISO day as the chart room writes it: "6 Nov 1867". */
export function writeDay(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? iso : dayFormat.format(date);
}

/** The ISO day the Nautilus reaches each port, sailing on `departure` from the first. */
export function arrivals(route: readonly PortId[], departure: string): string[] {
  const start = new Date(`${departure}T00:00:00Z`).getTime();
  let leagues = 0;
  return route.map((id, index) => {
    if (index > 0) leagues += Math.round(leaguesBetween(route[index - 1]!, id));
    return new Date(start + Math.round(leagues / LEAGUES_PER_DAY) * 86_400_000).toISOString().slice(0, 10);
  });
}

const thousands = new Intl.NumberFormat("en-US");
export const writeLeagues = (leagues: number): string => thousands.format(leagues);
