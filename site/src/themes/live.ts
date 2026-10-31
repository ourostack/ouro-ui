/**
 * Live, the site's ambient theme: Pearl, tinted by the reader's own sky. The local clock gives the
 * time of day (dawn, day, dusk or night, by a sunrise and sunset table for the month), the month
 * gives the season, and the time zone's name says which hemisphere the seasons run in. Nothing is
 * asked of the browser and nothing leaves it: no location, no network. The prerendered <head> runs
 * `applyLive` inline (prepaint.ts) when the stored choice is Live, so the right sky is on the page
 * before first paint; while the page is open, `live-clock.ts` moves it on as the sun does.
 */

export const PHASES = ["dawn", "day", "dusk", "night"] as const;
export type Phase = (typeof PHASES)[number];
export const SEASONS = ["spring", "summer", "autumn", "winter"] as const;
export type Season = (typeof SEASONS)[number];
export const WEATHERS = ["clear", "clouds", "rain", "snow", "fog"] as const;
export type Weather = (typeof WEATHERS)[number];

/** Theme variables Live sets over Pearl's, by name without the leading `--`. */
export type Palette = Readonly<Record<string, string>>;

/**
 * Each phase's colours over Pearl, light and dark. Text keeps 4.5:1 on every surface
 * (live.test.ts); `live-*` variables colour the porthole's sky, sun and sea (stage.css).
 * Day is Pearl itself, under a daytime sky.
 */
export const LIVE_PALETTES: Readonly<Record<Phase, { light: Palette; dark: Palette }>> = {
  dawn: {
    light: {
      background: "#fffaf7",
      primary: "#b8336a",
      "primary-foreground": "#ffffff",
      ring: "#d0457f",
      "chart-1": "#b8336a",
      "chart-3": "#d9773f",
      "sidebar-primary": "#b8336a",
      "sidebar-ring": "#d0457f",
      "live-sky": "#f7d9cf",
      "live-sun": "#ffb38a",
      "live-sea": "#46608a",
    },
    dark: {
      background: "#0b0709",
      primary: "#ff8fb3",
      "primary-foreground": "#2b0816",
      ring: "#ff8fb3",
      "chart-1": "#ff8fb3",
      "chart-3": "#ffb08a",
      "sidebar-primary": "#ff8fb3",
      "sidebar-primary-foreground": "#2b0816",
      "sidebar-ring": "#ff8fb3",
      "live-sky": "#3a2230",
      "live-sun": "#ff9a7a",
      "live-sea": "#3d4f7a",
    },
  },
  day: {
    light: { "live-sky": "#d6e8fa", "live-sun": "#ffe08a", "live-sea": "#0066cc" },
    dark: { "live-sky": "#14324f", "live-sun": "#ffe08a", "live-sea": "#2997ff" },
  },
  dusk: {
    light: {
      background: "#fffaf3",
      primary: "#a8521a",
      "primary-foreground": "#ffffff",
      ring: "#c96a24",
      "chart-1": "#a8521a",
      "chart-3": "#e08a2c",
      "sidebar-primary": "#a8521a",
      "sidebar-ring": "#c96a24",
      "live-sky": "#f6c79c",
      "live-sun": "#ff8a3d",
      "live-sea": "#3b4f86",
    },
    dark: {
      background: "#0b0805",
      primary: "#ffad5c",
      "primary-foreground": "#2a1300",
      ring: "#ffad5c",
      "chart-1": "#ffad5c",
      "chart-3": "#ffc46b",
      "sidebar-primary": "#ffad5c",
      "sidebar-primary-foreground": "#2a1300",
      "sidebar-ring": "#ffad5c",
      "live-sky": "#3b2414",
      "live-sun": "#ff8a3d",
      "live-sea": "#33427a",
    },
  },
  night: {
    light: {
      background: "#f8f8fc",
      primary: "#4b49c8",
      "primary-foreground": "#ffffff",
      ring: "#5e5ce6",
      "chart-1": "#4b49c8",
      "chart-3": "#8e8be0",
      "sidebar-primary": "#4b49c8",
      "sidebar-ring": "#5e5ce6",
      "live-sky": "#1d2445",
      "live-sun": "#f4f1dc",
      "live-sea": "#28306e",
    },
    dark: {
      background: "#05050c",
      primary: "#8f8cff",
      "primary-foreground": "#0c0b2a",
      ring: "#8f8cff",
      "chart-1": "#8f8cff",
      "chart-3": "#d9d7ff",
      "sidebar-primary": "#8f8cff",
      "sidebar-primary-foreground": "#0c0b2a",
      "sidebar-ring": "#8f8cff",
      "live-sky": "#0a0e22",
      "live-sun": "#f4f1dc",
      "live-sea": "#2a2f73",
    },
  },
};

/** What the sky is doing for the reader right now. */
export interface Sky {
  phase: Phase;
  season: Season;
}

/**
 * The reader's sky at `now`, from the local clock alone. `southern` flips the months, for the
 * southern hemisphere's seasons and day lengths. Self-contained (no imports, no closures): the
 * prepaint script carries it into the page with Function.prototype.toString.
 */
export function skyAt(now: { getMonth(): number; getHours(): number; getMinutes(): number }, southern: boolean): Sky {
  // Clock time of sunrise and sunset by month near 40°N (with summer time), in hours.
  const sun = [
    [7.3, 17.1], [6.9, 17.7], [7.0, 19.1], [6.5, 19.7], [5.9, 20.2], [5.6, 20.5],
    [5.8, 20.5], [6.3, 20.0], [6.8, 19.2], [7.3, 18.4], [6.8, 16.8], [7.2, 16.6],
  ];
  const month = (now.getMonth() + (southern ? 6 : 0)) % 12;
  const [rise, set] = sun[month]!;
  const hour = now.getHours() + now.getMinutes() / 60;
  const phase = hour >= rise! - 0.75 && hour < rise! + 1 ? "dawn" : hour >= rise! + 1 && hour < set! - 1 ? "day" : hour >= set! - 1 && hour < set! + 0.75 ? "dusk" : "night";
  const season = month >= 2 && month <= 4 ? "spring" : month >= 5 && month <= 7 ? "summer" : month >= 8 && month <= 10 ? "autumn" : "winter";
  return { phase, season };
}

/** Whether an IANA time zone lies south of the equator, coarsely: enough to turn the seasons round. Self-contained. */
export function isSouthern(timeZone: string): boolean {
  return /^(Australia|Antarctica)\/|^Pacific\/(Auckland|Chatham|Fiji|Tongatapu|Noumea|Efate|Apia|Tahiti|Rarotonga)$|^America\/(Argentina\/|Buenos_Aires|Santiago|Punta_Arenas|Montevideo|Asuncion|Sao_Paulo|Rio_Branco|Porto_Velho|Cuiaba|Campo_Grande|Bahia|Maceio|Recife|Fortaleza|Belem|Araguaina|Noronha|La_Paz|Lima)|^Africa\/(Johannesburg|Maseru|Mbabane|Maputo|Harare|Lusaka|Lubumbashi|Blantyre|Gaborone|Windhoek|Luanda|Dar_es_Salaam)$|^Indian\/(Mauritius|Reunion|Antananarivo|Mayotte|Comoro)$|^Atlantic\/(Stanley|South_Georgia|St_Helena)$/.test(timeZone);
}

/**
 * The stylesheet for one phase: Pearl's variables with the phase's over them, light on
 * html[data-live] and dark on html.dark[data-live]. Self-contained.
 */
export function liveCss(palette: { light: Palette; dark: Palette }): string {
  const body = (values: Palette) =>
    Object.keys(values)
      .map((name) => `--${name}:${values[name]}`)
      .join(";");
  return `html[data-live]{${body(palette.light)}}html.dark[data-live]{${body(palette.dark)}}`;
}

/**
 * Turns Live on for `now`: data-live, data-sky, data-season and data-weather on the root, and the
 * phase's colours in a <style id="ouro-live"> of their own. Returns the sky it painted. Self-contained,
 * so the prepaint script can carry it; `sky` and `css` are skyAt and liveCss, passed in.
 */
export function applyLive(
  document: Document,
  now: Date,
  timeZone: string,
  weather: string,
  palettes: Readonly<Record<string, { light: Palette; dark: Palette }>>,
  sky: typeof skyAt,
  southern: typeof isSouthern,
  css: typeof liveCss,
): Sky {
  const root = document.documentElement;
  const current = sky(now, southern(timeZone));
  root.setAttribute("data-live", "");
  root.setAttribute("data-sky", current.phase);
  root.setAttribute("data-season", current.season);
  root.setAttribute("data-weather", weather);
  let style = document.getElementById("ouro-live");
  if (!style) {
    style = document.createElement("style");
    style.id = "ouro-live";
    document.head.appendChild(style);
  }
  style.textContent = css(palettes[current.phase]!);
  return current;
}

/** Turns Live off: the root's attributes and the phase's stylesheet go, and the preset's own colours return. */
export function clearLive(document: Document): void {
  const root = document.documentElement;
  for (const name of ["data-live", "data-sky", "data-season", "data-weather"]) root.removeAttribute(name);
  document.getElementById("ouro-live")?.remove();
}

/** The reader's time zone, or "" where the browser will not say. */
export function localTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
  } catch {
    return "";
  }
}
