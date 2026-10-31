import { claim } from "@/registry/ouro/lib/ouro/claims";
import type { CrewLine } from "./copy";

/**
 * Every word Chapter III says ("Face the squid", site-design.md): the encounter at the porthole,
 * the orders you give by dialog, menu and palette, and the organ at the end. In one place so the
 * readability check (chapter-three.test.tsx) reads exactly what a visitor reads, at grade 6 or under.
 * The squid is a friend who hugs too hard, not a monster: the crew tickle it loose with feathers,
 * and it comes back to hear the organ.
 */

/**
 * Every control in Chapter III, by the `data-chapter-control` its wrapper carries, in page order
 * (the dialog's two choices are in the dialog, over the page). site/e2e/chapter-three.spec.ts
 * operates each in a test named "control: <id>" and asserts what it changes;
 * site/scripts/stage-census.test.mjs fails when one here has no such test.
 */
export const CHAPTER_THREE_CONTROLS = ["encounter-code", "alarm", "orders", "palette", "feathers", "surface", "saloon-code", "organ", "install", "components", "again"] as const;
export type ChapterThreeControl = (typeof CHAPTER_THREE_CONTROLS)[number];

export const CHAPTER_THREE = {
  number: "Chapter III",
  title: "Face the squid",
  intro: "Someone big and curious has come to say hello.",
  /** Over the course line from Chapter II into this one. */
  handoff: "Then, one day, the ship stops with a bump.",
} as const;

/** The orders the crew can be given, by the menu and the palette alike. */
export const ORDERS = {
  surface: "Surface",
  dive: "Dive",
  lights: "Floodlights",
  feathers: "Grab the feathers",
  organ: "Play the organ",
} as const;
export type Order = keyof typeof ORDERS;

export const ENCOUNTER = {
  title: "The encounter",
  intro: "A giant squid is hugging the ship, and it will not let go. Give the crew orders to set her free.",
  file: "encounter.tsx",
  scene: "The view from the porthole",
  alarm: "Sound the alarm",
  orders: "Orders",
  palette: "Give an order",
  paletteTitle: "Orders for the crew",
  paletteSearch: "Search orders",
  dialog: "A giant squid is hugging the ship!",
  dialogText: "It has wrapped an arm round the propeller, so we cannot move. What shall we do?",
  dialogBody: "Squids are very ticklish. The crew has feathers, but they can only reach it from up on deck.",
  hope: "Go up and wave",
  status: "On board",
  surfaced: "At the top",
  deep: "Deep down",
  lightsOn: "Lights on",
  lightsOff: "Lights off",
  feathersReady: "Feathers ready",
  feathersStowed: "Feathers stowed",
  free: "Ship is free",
  held: "Squid hugging",
} as const;

/** The scene in words, for screen readers. */
export function describeEncounter(state: { surfaced: boolean; lights: boolean; won: boolean; played?: boolean }): string {
  const squid = state.played ? "The squid has come back to listen to the music. It sways along." : state.won ? "The squid swims off in a little puff of ink, waving goodbye." : "A giant squid hugs the glass with one long arm. Its big green eye peeks in.";
  const sea = state.surfaced ? "We are at the top of the sea." : "We are deep down.";
  const lights = state.lights ? "The floodlights are on." : "";
  return [squid, sea, lights].filter(Boolean).join(" ");
}

/** What the crew says as the fight goes. */
export const FIGHT = {
  opening: { name: "Ned Land", text: "Hey! Something is looking in the window!" },
  alarm: { name: "Captain Nemo", text: "Up you get, crew! We have a visitor on the hull." },
  diveHeld: { name: "Captain Nemo", text: "It is holding the propeller. We cannot dive with a squid on us." },
  dive: { name: "Captain Nemo", text: "Down we go again, safe and sound." },
  surface: { name: "Captain Nemo", text: "Up we go. It waves back, but it still holds on. Grab the feathers!" },
  surfaceAgain: { name: "Conseil", text: "We are at the top already, sir." },
  feathersDeep: { name: "Captain Nemo", text: "Feathers ready! Now we go up, so we can open the hatch." },
  feathersAgain: { name: "Ned Land", text: "I have a big fluffy feather. Ready!" },
  lightsOnHeld: { name: "Conseil", text: "It blinks at the light. Still hugging, though." },
  lightsOn: { name: "Professor Aronnax", text: "Lights on. What a pretty sea." },
  lightsOff: { name: "Conseil", text: "Lights off." },
  win: { name: "Ned Land", text: "Tickle, tickle! It giggled and let go. Bye, big friend!" },
  organHeld: { name: "Captain Nemo", text: "Not now! We have a squid stuck to us." },
  organ: { name: "Captain Nemo", text: "And now, some music. Listen..." },
  again: { name: "Conseil", text: "It is back for another hug! I think it likes us." },
} as const satisfies Record<string, CrewLine>;

export const TOASTS = {
  win: "The squid let go!",
  winNote: "It giggled, waved, and swam off.",
  organ: "Voyage complete!",
  organNote: "Ship built, trip planned, squid tickled. Thanks for sailing!",
} as const;

export const SALOON = {
  title: "The saloon",
  intro: "With the ship free, the captain plays his giant organ. Turn your sound on!",
  file: "saloon.tsx",
  organ: "Captain Nemo's organ",
  play: "Play the organ",
  playHint: "First, set the ship free.",
  playing: "The captain is playing. Look who came back to listen!",
  log: "The ship's log",
  logWaiting: "The log waits until the ship is free.",
  stamp: "Voyage complete",
  logDone: "Ship built, trip planned, squid tickled. What a voyage!",
  next: "This ship is built from real Ouro HX parts. Now build yours.",
  install: "Install Ouro HX",
  components: "Browse components",
  again: "Sail again",
} as const;

/** The rail beside the chapter. */
export const BATTLE = {
  label: "How the rescue stands",
  surface: "Go up",
  surfaceDone: "We are at the top.",
  surfaceNot: "Still deep down.",
  feathers: "Grab the feathers",
  feathersDone: "The crew has them.",
  feathersNot: "Still in the box.",
  organ: "Play the organ",
  organDone: "The captain plays.",
  organNot: "It is quiet.",
} as const;

/** What each composition's Code sheet says: which part is Ouro HX's and which is this site's own. */
export const CODE_SHEETS_THREE = {
  encounter: {
    title: "How the encounter is built",
    description: "Ouro HX does the dialog, the menu and the palette. The site does the squid.",
    hx: [
      {
        text: claim("Dialog: it takes focus, keeps it inside, and gives it back to the alarm when it closes.", {
          source: { test: "site/e2e/chapter-three.spec.ts::by keyboard alone > the alarm opens the dialog, and focus comes back to it when it closes" },
          verify: { testExists: "site/e2e/chapter-three.spec.ts::by keyboard alone > the alarm opens the dialog, and focus comes back to it when it closes" },
        }),
        code: `<Dialog title="A giant squid is hugging the ship!" open={open} onOpenChange={setOpen} footer={<Button onClick={tickle}>Grab the feathers</Button>}>`,
      },
      { text: "Menu: the list of orders, the arrow keys, and the tick by the floodlights.", code: `<Menu trigger={<Button>Orders</Button>}>\n  <MenuItem onClick={surface}>Surface</MenuItem>\n  <MenuCheckboxItem checked={lights} onCheckedChange={setLights}>Floodlights</MenuCheckboxItem>\n</Menu>` },
      { text: "Command: the palette, its search, and the order you pick.", code: `<Command title="Orders for the crew" trigger={<Button>Give an order</Button>} items={orders} />` },
      { text: "Badge and Toast: how the ship stands, and the news when the squid lets go.", code: `<Badge tone="success">Ship is free</Badge>\ntoast("The squid let go!", { tone: "success" })` },
    ],
    site: ["The porthole, the squid, and the sea.", "What an order does, and when the ship is free.", "What the crew says."],
  },
  saloon: {
    title: "How the saloon is built",
    description: "Ouro HX does the buttons and the toast. The site does the organ, its tune and the log.",
    hx: [
      { text: "Button: the press, and Play kept off until the ship is free.", code: `<Button disabled={!free} onClick={play}>Play the organ</Button>` },
      { text: "Button as a link: the way into the docs.", code: `<Button href="/ouro-ui/docs/installing/">Install Ouro HX</Button>` },
      { text: "Toast: the last line of the voyage.", code: `toast("Voyage complete!", { tone: "success" })` },
    ],
    site: ["The organ, its tune, and the notes that rise from it.", "The squid that comes back to listen.", "The log, and its stamp."],
  },
} as const;

/** Every line a visitor can read in Chapter III, the Code sheets too, for the readability check. */
export function allChapterThreeText(): string[] {
  return [
    ...Object.values(CHAPTER_THREE),
    ...Object.values(ORDERS),
    ...Object.values(ENCOUNTER),
    describeEncounter({ surfaced: false, lights: true, won: false }),
    describeEncounter({ surfaced: true, lights: false, won: true }),
    describeEncounter({ surfaced: true, lights: false, won: true, played: true }),
    ...Object.values(FIGHT).map((line) => line.text),
    ...Object.values(TOASTS),
    ...Object.values(SALOON),
    ...Object.values(BATTLE),
    ...[CODE_SHEETS_THREE.encounter, CODE_SHEETS_THREE.saloon].flatMap((sheet) => [sheet.title, sheet.description, ...sheet.hx.map((line) => line.text), ...sheet.site]),
  ];
}
