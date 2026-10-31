import type { Phase, Season, Weather } from "../themes/live";

/** Every word Live says about the reader's sky. */
export const SKY_WORDS = {
  phase: { dawn: "dawn", day: "day", dusk: "dusk", night: "night" } satisfies Record<Phase, string>,
  season: { spring: "spring", summer: "summer", autumn: "autumn", winter: "winter" } satisfies Record<Season, string>,
  weather: { clear: "Clear", clouds: "Clouds", rain: "Rain", snow: "Snow", fog: "Fog" } satisfies Record<Weather, string>,
  /** The line under the dots while Live is on. */
  now: (phase: Phase, season: Season) =>
    ({
      dawn: `Dawn where you are, this ${season}. The page woke up rosy.`,
      day: `Broad ${season} daylight where you are. Blue skies, all hands on deck.`,
      dusk: `Dusk where you are, this ${season}. Everything's gone golden.`,
      night: `Night where you are, this ${season}. The page has lit its lanterns.`,
    })[phase],
};
