import { claim } from "@/registry/ouro/lib/ouro/claims";
import type { CrewLine } from "./copy";

/**
 * Every word Chapter III says ("Face the squid", site-design.md): the encounter at the porthole,
 * the orders you give by dialog, menu and palette, and the organ at the end. In one place so the
 * readability check (chapter-three.test.tsx) reads exactly what a visitor reads, at grade 6 or under.
 * The squid is curious, not a monster, and squid are drawn to light: the crew coax it off the
 * propeller with a lamp held out on deck, it drifts back into the dark, and it comes back to hear the
 * organ. The `feathers` order keeps its control id and its name in the code; only its words changed.
 */

/**
 * Every control in Chapter III, by the `data-chapter-control` its wrapper carries, in page order
 * (the dialog's two choices are in the dialog, over the page). site/e2e/chapter-three.spec.ts
 * operates each in a test named "control: <id>" and asserts what it changes;
 * site/scripts/stage-census.test.mjs fails when one here has no such test.
 */
export const CHAPTER_THREE_CONTROLS = ["encounter-code", "alarm", "orders", "palette", "feathers", "surface", "saloon-code", "organ", "handoff", "components", "again"] as const;
export type ChapterThreeControl = (typeof CHAPTER_THREE_CONTROLS)[number];

export const CHAPTER_THREE = {
  number: "Chapter III",
  title: "Face the squid",
  intro: "Something very large has taken hold of the ship. It seems more curious than cross.",
  /** Over the course line from Chapter II into this one. */
  handoff: "Far out at sea, the ship stops dead. Something is holding on.",
} as const;

/** The orders the crew can be given, by the menu and the palette alike. */
export const ORDERS = {
  surface: "Surface",
  dive: "Dive",
  lights: "Floodlights",
  feathers: "Light the deck lamp",
  organ: "Play the organ",
} as const;
export type Order = keyof typeof ORDERS;

export const ENCOUNTER = {
  title: "The encounter",
  intro: "A giant squid has wrapped an arm round the propeller. Give the crew orders and get her moving again.",
  file: "encounter.tsx",
  scene: "The view from the porthole",
  alarm: "Sound the alarm",
  orders: "Orders",
  palette: "Give an order",
  paletteTitle: "Orders for the crew",
  paletteSearch: "Search orders",
  dialog: "A giant squid has the propeller",
  dialogText: "One long arm is wrapped round the screw, so we cannot move. What are your orders?",
  dialogBody: "Squid are drawn to light. A lamp held out on deck might coax it off, but first we must surface.",
  hope: "Surface first",
  status: "On board",
  surfaced: "On the surface",
  deep: "Deep down",
  lightsOn: "Lights on",
  lightsOff: "Lights off",
  feathersReady: "Lamp lit",
  feathersStowed: "Lamp stowed",
  free: "Ship is free",
  held: "Propeller held",
} as const;

/** The scene in words, for screen readers. */
export function describeEncounter(state: { surfaced: boolean; lights: boolean; won: boolean; played?: boolean }): string {
  const squid = state.played ? "The squid has come back to listen. It drifts by the glass, slow and calm." : state.won ? "The squid lets go and sinks back into the dark, one arm trailing." : "A giant squid holds the glass with one long arm. A great green eye looks in.";
  const sea = state.surfaced ? "We are on the surface." : "We are deep down.";
  const lights = state.lights ? "The floodlights are on." : "";
  return [squid, sea, lights].filter(Boolean).join(" ");
}

/** What the crew says as the rescue goes. */
export const FIGHT = {
  opening: { name: "Ned Land", text: "Something out there is looking in at us. Something big." },
  alarm: { name: "Captain Nemo", text: "Crew to stations. We have company on the hull." },
  diveHeld: { name: "Captain Nemo", text: "We cannot dive with a squid on the propeller." },
  dive: { name: "Captain Nemo", text: "Take her down. Gently." },
  surface: { name: "Captain Nemo", text: "Up we come. It is still holding on. Bring a lamp up on deck." },
  surfaceFree: { name: "Captain Nemo", text: "Up we come. Clear water all round." },
  surfaceAgain: { name: "Conseil", text: "We are on the surface already, sir." },
  feathersDeep: { name: "Captain Nemo", text: "Lamp lit. Now take us up, so we can carry it out on deck." },
  feathersAgain: { name: "Ned Land", text: "The lamp is lit, and I am holding it. Steady as a lighthouse." },
  lightsOnHeld: { name: "Conseil", text: "It leans toward the floodlights, but they are behind glass. It wants a lamp it can reach." },
  lightsOn: { name: "Professor Aronnax", text: "Floodlights on. The whole sea turns green and gold." },
  lightsOff: { name: "Conseil", text: "Floodlights off." },
  win: { name: "Ned Land", text: "It follows the lamp, lets go, and slips off into the dark. Good night, friend." },
  organHeld: { name: "Captain Nemo", text: "Music can wait. We have a squid on the propeller." },
  organ: { name: "Captain Nemo", text: "And now, a little music." },
  again: { name: "Conseil", text: "It is back at the glass. I think it liked the organ." },
} as const satisfies Record<string, CrewLine>;

export const TOASTS = {
  win: "The propeller is free",
  winNote: "The squid followed the lamp into the dark.",
} as const;

export const SALOON = {
  title: "The saloon",
  intro: "With the ship free, the captain sits down at his organ. Turn your sound on.",
  file: "saloon.tsx",
  organ: "Captain Nemo's organ",
  play: "Play the organ",
  playAgain: "Play it again",
  playHint: "First, free the propeller.",
  playing: "The captain plays. Someone large has come back to listen.",
  log: "The ship's log",
  /** The log's lines, each written only once it has happened. */
  logHeld: "Stopped dead. A giant squid has the propeller.",
  logFree: "Lamp lit on deck. The squid let go and slipped away.",
  logPlayed: "Music in the saloon. The squid came back to listen.",
  next: claim("Every control on this voyage is a real Ouro HX part.", { source: [{ test: "site/e2e/chapter-one.spec.ts::every operable element in Chapter I is one of its listed controls, in page order" }, { test: "site/e2e/chapter-two.spec.ts::every operable element in Chapter II is one of its listed controls, in page order" }, { test: "site/e2e/chapter-three.spec.ts::every operable element in Chapter III is one of its listed controls, in page order" }], verify: [{ testExists: "site/e2e/chapter-one.spec.ts::every operable element in Chapter I is one of its listed controls, in page order" }, { testExists: "site/e2e/chapter-two.spec.ts::every operable element in Chapter II is one of its listed controls, in page order" }, { testExists: "site/e2e/chapter-three.spec.ts::every operable element in Chapter III is one of its listed controls, in page order" }] }),
  build: "Now build yours.",
  components: "Browse components",
  again: "Sail again",
} as const;

/** The rail beside the chapter. */
export const BATTLE = {
  label: "Freeing the ship",
  surface: "Surface",
  surfaceDone: "On the surface.",
  surfaceNot: "Still deep down.",
  feathers: "Light the deck lamp",
  feathersDone: "The lamp is lit.",
  feathersNot: "Still in its locker.",
  organ: "Play the organ",
  organDone: "The captain plays.",
  organNot: "The saloon is quiet.",
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
        code: `<Dialog title="A giant squid has the propeller" open={open} onOpenChange={setOpen} footer={<Button onClick={lightLamp}>Light the deck lamp</Button>}>`,
      },
      { text: "Menu: the list of orders, the arrow keys, and the tick by the floodlights.", code: `<Menu trigger={<Button>Orders</Button>}>\n  <MenuItem onClick={surface}>Surface</MenuItem>\n  <MenuCheckboxItem checked={lights} onCheckedChange={setLights}>Floodlights</MenuCheckboxItem>\n</Menu>` },
      { text: "Command: the palette, its search, and the order you pick.", code: `<Command title="Orders for the crew" trigger={<Button>Give an order</Button>} items={orders} />` },
      { text: "Badge and Toast: how the ship stands, and the news when the squid lets go.", code: `<Badge tone="success">Ship is free</Badge>\ntoast("The propeller is free", { tone: "success" })` },
    ],
    site: ["The porthole, the squid, and the sea.", "What an order does, and when the ship is free.", "What the crew says."],
    uses: ["Dialog", "Menu", "Command", "Badge", "Toast"],
  },
  saloon: {
    title: "How the saloon is built",
    description: "Ouro HX does the buttons and the toast. The site does the organ, its tune and the log.",
    hx: [
      { text: "Button: the press, and Play kept off until the ship is free.", code: `<Button disabled={!free} onClick={play}>Play the organ</Button>` },
      { text: "Button and Toast: Copy puts the line for your agent on the clipboard, and a toast says so.", code: `<Button onClick={copy}>Copy</Button>\ntoast("Copied. Paste it to your agent.", { tone: "success" })` },
      { text: "Button as a link: the way into the docs.", code: `<Button href="/docs/">Browse components</Button>` },
    ],
    site: ["The organ, its tune, and the notes that rise from it.", "The squid that comes back to listen.", "The log, and what goes in it."],
    uses: ["Button", "Toast"],
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
