import { claim } from "@/registry/ouro/lib/ouro/claims";

/**
 * Every word the porthole stage says: the rail's labels, the crew's log lines and the bell's toasts.
 * In one place so the readability check (stage.test.tsx) reads exactly what a visitor reads: the
 * stage is for a nine-year-old too, so each line stays at or under grade 6.
 */

/**
 * Every control on the stage, by the `data-stage-control` its wrapper carries, in page order.
 * site/e2e/stage.spec.ts operates each one in a test named "control: <id>" and asserts what it
 * changes; site/scripts/stage-census.test.mjs fails when one here has no such test.
 */
export const STAGE_CONTROLS = ["depth", "speed", "tank-fore", "tank-middle", "tank-aft", "dive", "lights", "log", "bell", "xray"] as const;
export type StageControl = (typeof STAGE_CONTROLS)[number];

export type CrewName = "Captain Nemo" | "Professor Aronnax" | "Conseil" | "Ned Land";

/**
 * How the stage names each speaker: by name and job, so someone who has never read the book knows
 * who is talking (Ari, 2026-10-30: "not at all inside baseball").
 */
export const SPEAKER: Record<CrewName, string> = {
  "Captain Nemo": "Captain Nemo",
  "Professor Aronnax": "Aronnax, the scientist",
  Conseil: "Conseil, the helper",
  "Ned Land": "Ned, the harpooner",
};

export interface LogLine {
  name: CrewName;
  text: string;
}

export type Band = "sunlit" | "twilight" | "midnight";
export type Speed = "stop" | "half" | "full";

/** The depths where the water and its fish change, in fathoms. */
export const BANDS: ReadonlyArray<{ band: Band; from: number; label: string }> = [
  { band: "sunlit", from: 0, label: "Sunlit water" },
  { band: "twilight", from: 50, label: "Twilight water" },
  { band: "midnight", from: 200, label: "Midnight water" },
];

export const MAX_DEPTH = 300;

export function bandAt(depth: number): Band {
  return depth >= 200 ? "midnight" : depth >= 50 ? "twilight" : "sunlit";
}

/** The ballast tanks: the word on the gauge, the switch's name, and how the crew says it. */
export const TANKS = [
  { id: "fore", label: "Forward", name: "Forward tank", noun: "The forward tank" },
  { id: "middle", label: "Middle", name: "Middle tank", noun: "The middle tank" },
  { id: "aft", label: "Aft", name: "Aft tank", noun: "The aft tank" },
] as const;

export const SPEEDS: ReadonlyArray<{ value: Speed; label: string }> = [
  { value: "stop", label: "Stop" },
  { value: "half", label: "Half" },
  { value: "full", label: "Full" },
];

export const STAGE_COPY = {
  title: "The view from the Nautilus",
  sceneLabel: "Through the porthole",
  rail: "Ship's controls",
  depth: "Depth",
  ballast: "Ballast tanks",
  dive: "Dive",
  surface: "Surface",
  diveHint: (full: number) => (full === 3 ? "All three tanks are full." : "Fill all three to dive."),
  tankCount: (full: number) => `${full} of 3 full`,
  surfaceHint: "Surface empties the tanks.",
  lights: "Floodlights",
  speed: "Speed",
  bell: "Ring the bell",
  log: "Ship's log",
  logAll: (count: number) => `Ship's log (${count})`,
  real: claim("Every control here is a real Ouro HX component", {
    source: [{ file: "site/src/voyage/stage/stage.tsx" }, { file: "site/e2e/stage.spec.ts" }],
    verify: { testExists: "site/e2e/stage.spec.ts::each control on the stage > control: xray outlines every HX component on the page, only when pressed" },
  }),
  xray: "See how it’s built",
  source: "Source",
  ready: "Ready to dive",
  /** Engraved on the porthole's ring: the ship's name, which needs no explaining. */
  motto: "The Nautilus",
} as const;

/** The scene in words, for screen readers: what the picture shows right now. */
export function describeScene(state: { band: Band; dived: boolean; lights: boolean; tanks: number; speed: Speed }): string {
  const water = { sunlit: "Bright blue water with sardines and kelp.", twilight: "Deep blue water. A ray glides past.", midnight: "Dark water with tiny glowing fish." }[state.band];
  const ship = state.dived ? "The Nautilus is down here with us." : state.tanks > 0 ? "The Nautilus sits low at the top of the sea." : "The Nautilus floats at the top of the sea.";
  const lights = state.lights ? (state.dived && state.band !== "sunlit" ? "Its lantern shines on an anglerfish and an octopus." : "Its lantern is on.") : "";
  const speed = state.speed === "stop" ? "The fish hold still." : "";
  return [water, ship, lights, speed].filter(Boolean).join(" ");
}

export const OPENING_LOG: readonly LogLine[] = [
  { name: "Captain Nemo", text: "Welcome aboard my secret sub! Fill three tanks to dive." },
];

export const LOG = {
  band: {
    sunlit: { name: "Conseil", text: "Sunlit water. Sardines. Many sardines." },
    twilight: { name: "Professor Aronnax", text: "The light is going blue. A ray just flew by!" },
    midnight: { name: "Ned Land", text: "Too dark to see a thing. Turn on the floodlights!" },
  },
  tankFull: (noun: string, full: number): LogLine => ({
    name: "Conseil",
    text: full === 1 ? `${noun} is full. Two more to go.` : `${noun} is full. One more to go.`,
  }),
  tankEmpty: (noun: string): LogLine => ({ name: "Conseil", text: `${noun} is empty again.` }),
  allFull: { name: "Captain Nemo", text: "All three tanks are full. Press Dive!" },
  dive: { name: "Captain Nemo", text: "Down we go! Light the lamps when it gets dark." },
  surface: { name: "Captain Nemo", text: "Blow the tanks. Up we go!" },
  lightsOnDeep: { name: "Ned Land", text: "Something down there just smiled at me." },
  lightsOn: { name: "Professor Aronnax", text: "Lantern on! Dive deep to see who lives there." },
  lightsOff: { name: "Conseil", text: "Lights off. The fish can rest." },
  speed: {
    stop: { name: "Captain Nemo", text: "All stop. Let the sea be still." },
    half: { name: "Captain Nemo", text: "Half speed ahead." },
    full: { name: "Ned Land", text: "Full speed! Now we are sailing!" },
  },
  bell: { name: "Conseil", text: "The bell rang. I counted it. One." },
} as const satisfies Record<string, unknown>;

/** What the crew says when the bell rings, in turn. */
export const BELL_TOASTS: readonly LogLine[] = [
  { name: "Ned Land", text: "Is it lunch?" },
  { name: "Conseil", text: "Classified: one bell." },
  { name: "Professor Aronnax", text: "I hope that means dinner." },
  { name: "Captain Nemo", text: "The bell is for the crew, not for the fish." },
];

/** Every line a visitor can read on the stage, for the readability check. */
export function allStageText(): string[] {
  const lines: string[] = [
    ...Object.values(STAGE_COPY).flatMap((value) => (typeof value === "string" ? [value] : [])),
    ...Object.values(SPEAKER),
    STAGE_COPY.diveHint(1),
    STAGE_COPY.diveHint(3),
    STAGE_COPY.tankCount(1),
    STAGE_COPY.logAll(3),
    ...BANDS.map((band) => band.label),
    ...TANKS.map((tank) => tank.label),
    ...SPEEDS.map((speed) => speed.label),
    ...OPENING_LOG.map((line) => line.text),
    ...Object.values(LOG.band).map((line) => line.text),
    LOG.tankFull(TANKS[0].noun, 1).text,
    LOG.tankFull(TANKS[0].noun, 2).text,
    LOG.tankEmpty(TANKS[0].noun).text,
    LOG.allFull.text,
    LOG.dive.text,
    LOG.surface.text,
    LOG.lightsOnDeep.text,
    LOG.lightsOn.text,
    LOG.lightsOff.text,
    ...Object.values(LOG.speed).map((line) => line.text),
    LOG.bell.text,
    ...BELL_TOASTS.map((line) => line.text),
  ];
  for (const band of ["sunlit", "twilight", "midnight"] as const) {
    for (const dived of [false, true]) {
      lines.push(describeScene({ band, dived, lights: true, tanks: dived ? 3 : 1, speed: "stop" }));
    }
  }
  return lines;
}
