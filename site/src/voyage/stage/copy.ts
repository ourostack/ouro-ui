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
export const STAGE_CONTROLS = ["depth", "tank-fore", "tank-middle", "tank-aft", "dive", "speed", "lights", "bell"] as const;
export type StageControl = (typeof STAGE_CONTROLS)[number];

export type CrewName = "Captain Nemo" | "Professor Aronnax" | "Conseil" | "Ned Land";

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

export const TANKS = [
  { id: "fore", label: "Fore", noun: "The fore tank" },
  { id: "middle", label: "Middle", noun: "The middle tank" },
  { id: "aft", label: "Aft", noun: "The aft tank" },
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
  diveHint: (full: number) => (full === 3 ? "All three tanks are full." : `Fill all three tanks to dive. ${full} of 3 full.`),
  lights: "Floodlights",
  speed: "Speed",
  bell: "Ring the bell",
  log: "Ship's log",
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
  { name: "Captain Nemo", text: "Welcome aboard. The controls are yours." },
];

export const LOG = {
  band: {
    sunlit: { name: "Conseil", text: "Sunlit water, Professor. Sardines. Many sardines." },
    twilight: { name: "Professor Aronnax", text: "The light is going blue. A ray just flew by!" },
    midnight: { name: "Ned Land", text: "It is very dark down here. I do not like it." },
  },
  tankFull: (noun: string): LogLine => ({ name: "Conseil", text: `${noun} is full of sea water.` }),
  tankEmpty: (noun: string): LogLine => ({ name: "Conseil", text: `${noun} is empty again.` }),
  allFull: { name: "Captain Nemo", text: "All three tanks are full. We can dive." },
  dive: { name: "Captain Nemo", text: "Mobilis in mobili. Down we go!" },
  surface: { name: "Captain Nemo", text: "Blow the tanks. Up we go!" },
  lightsOnDeep: { name: "Ned Land", text: "Something down there just smiled at me." },
  lightsOn: { name: "Professor Aronnax", text: "The lantern is on. Look who came to see!" },
  lightsOff: { name: "Conseil", text: "Lights off. The fish can rest." },
  speed: {
    stop: { name: "Captain Nemo", text: "All stop. Let the sea be still." },
    half: { name: "Captain Nemo", text: "Half speed ahead." },
    full: { name: "Ned Land", text: "Full speed! Now we are sailing!" },
  },
  bell: { name: "Conseil", text: "The bell rang. I counted it." },
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
    STAGE_COPY.diveHint(1),
    STAGE_COPY.diveHint(3),
    ...BANDS.map((band) => band.label),
    ...TANKS.map((tank) => tank.label),
    ...SPEEDS.map((speed) => speed.label),
    ...OPENING_LOG.map((line) => line.text),
    ...Object.values(LOG.band).map((line) => line.text),
    LOG.tankFull(TANKS[0].noun).text,
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
