import { claim } from "@/registry/ouro/lib/ouro/claims";
import type { CrewLine } from "./copy";

/**
 * Every word Chapter III says ("Face the squid", site-design.md): the encounter at the porthole,
 * the orders you give by dialog, menu and palette, and the organ at the end. In one place so the
 * readability check (chapter-three.test.tsx) reads exactly what a visitor reads, at grade 6 or under.
 */

/**
 * Every control in Chapter III, by the `data-chapter-control` its wrapper carries, in page order
 * (the dialog's two choices are in the dialog, over the page). site/e2e/chapter-three.spec.ts
 * operates each in a test named "control: <id>" and asserts what it changes;
 * site/scripts/stage-census.test.mjs fails when one here has no such test.
 */
export const CHAPTER_THREE_CONTROLS = ["encounter-code", "alarm", "orders", "palette", "axes", "surface", "saloon-code", "organ", "install", "components", "again"] as const;
export type ChapterThreeControl = (typeof CHAPTER_THREE_CONTROLS)[number];

export const CHAPTER_THREE = {
  number: "Chapter III",
  title: "Face the squid",
  intro: "Something enormous is outside the window.",
  /** Over the course line from Chapter II into this one. */
  handoff: "Then, one day, the Nautilus stops dead.",
} as const;

/** The orders the crew can be given, by the menu and the palette alike. */
export const ORDERS = {
  surface: "Surface",
  dive: "Dive",
  lights: "Floodlights",
  axes: "Ready the axes",
  organ: "Play the organ",
} as const;
export type Order = keyof typeof ORDERS;

export const ENCOUNTER = {
  title: "The encounter",
  intro: "A squid has the ship. Give your orders and send it off.",
  file: "encounter.tsx",
  scene: "The view from the porthole",
  alarm: "Sound the alarm",
  orders: "Orders",
  palette: "Give an order",
  paletteTitle: "Orders for the crew",
  paletteSearch: "Search orders",
  dialog: "A giant squid has seized the hull!",
  dialogText: "Its beak is caught in the screw, so we cannot move. What shall we do?",
  dialogBody: "The crew has axes, and Ned has his harpoon. But they can only fight up on deck.",
  hope: "Surface and hope",
  status: "On board",
  surfaced: "At the top",
  deep: "Deep down",
  lightsOn: "Lights on",
  lightsOff: "Lights off",
  axesReady: "Axes ready",
  axesStowed: "Axes stowed",
  free: "Ship is free",
  held: "Squid holds on",
} as const;

/** The scene in words, for screen readers. */
export function describeEncounter(state: { surfaced: boolean; lights: boolean; won: boolean }): string {
  const squid = state.won ? "The squid swims away in a cloud of ink." : "A giant squid holds the glass with one long arm. Its great green eye looks in.";
  const sea = state.surfaced ? "We are at the top of the sea." : "We are deep down.";
  const lights = state.lights ? "The floodlights are on." : "";
  return [squid, sea, lights].filter(Boolean).join(" ");
}

/** What the crew says as the fight goes. */
export const FIGHT = {
  opening: { name: "Ned Land", text: "Professor! Something is looking in at the window!" },
  alarm: { name: "Captain Nemo", text: "Hands on deck! We have a guest on the hull." },
  diveHeld: { name: "Captain Nemo", text: "It holds the screw. We cannot dive with it on us." },
  dive: { name: "Captain Nemo", text: "Down we go again, safe and sound." },
  surface: { name: "Captain Nemo", text: "Up we go. Hope will not do it, though. Ready the axes!" },
  surfaceAgain: { name: "Conseil", text: "We are at the top already, sir." },
  axesDeep: { name: "Captain Nemo", text: "Axes ready. Now we must go up, to open the hatch." },
  axesAgain: { name: "Ned Land", text: "My harpoon is ready too." },
  lightsOnHeld: { name: "Conseil", text: "Its eye shrinks from the light. But it does not let go." },
  lightsOn: { name: "Professor Aronnax", text: "Lights on. The sea is calm again." },
  lightsOff: { name: "Conseil", text: "Lights off." },
  win: { name: "Ned Land", text: "Back to the deep with you, beast! Hurrah!" },
  organHeld: { name: "Captain Nemo", text: "Not now! A squid has the ship." },
  organ: { name: "Captain Nemo", text: "Now I will play. Listen." },
  again: { name: "Conseil", text: "And here it comes again. It must like us." },
} as const satisfies Record<string, CrewLine>;

export const TOASTS = {
  win: "The squid let go!",
  winNote: "The Nautilus is free to sail on.",
  organ: "Twenty thousand leagues",
  organNote: "The voyage is in the log. Thank you for sailing.",
} as const;

export const SALOON = {
  title: "The saloon",
  intro: "Once the squid is gone, Captain Nemo plays his organ, and the log is done.",
  file: "saloon.tsx",
  organ: "Captain Nemo's organ",
  play: "Play the organ",
  playHint: "First, send off the squid.",
  playing: "Nemo is playing.",
  log: "The ship's log",
  logWaiting: "The log waits for the end of the fight.",
  stamp: "Twenty thousand leagues",
  logDone: "Built, planned, and safe at last. The voyage is done.",
  next: "Now build yours.",
  install: "Install Ouro HX",
  components: "Browse components",
  again: "Sail again",
} as const;

/** The rail beside the chapter. */
export const BATTLE = {
  label: "How the fight stands",
  surface: "Go up",
  surfaceDone: "We are at the top.",
  surfaceNot: "Still deep down.",
  axes: "Ready the axes",
  axesDone: "The crew has them.",
  axesNot: "Still in the rack.",
  organ: "Play the organ",
  organDone: "Nemo plays.",
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
        code: `<Dialog title="A giant squid has seized the hull!" open={open} onOpenChange={setOpen} footer={<Button onClick={axes}>Ready the axes</Button>}>`,
      },
      { text: "Menu: the list of orders, the arrow keys, and the tick by the floodlights.", code: `<Menu trigger={<Button>Orders</Button>}>\n  <MenuItem onClick={surface}>Surface</MenuItem>\n  <MenuCheckboxItem checked={lights} onCheckedChange={setLights}>Floodlights</MenuCheckboxItem>\n</Menu>` },
      { text: "Command: the palette, its search, and the order you pick.", code: `<Command title="Orders for the crew" trigger={<Button>Give an order</Button>} items={orders} />` },
      { text: "Badge and Toast: how the ship stands, and the news when the squid lets go.", code: `<Badge tone="success">Ship is free</Badge>\ntoast("The squid let go!", { tone: "success" })` },
    ],
    site: ["The porthole, the squid, and the sea.", "What an order does, and when the fight is won.", "What the crew says."],
  },
  saloon: {
    title: "How the saloon is built",
    description: "Ouro HX does the buttons and the toast. The site does the organ and the log.",
    hx: [
      { text: "Button: the press, and Play kept off until the fight is won.", code: `<Button disabled={!won} onClick={play}>Play the organ</Button>` },
      { text: "Button as a link: the way into the docs.", code: `<Button href="/ouro-ui/docs/installing/">Install Ouro HX</Button>` },
      { text: "Toast: the last line of the voyage.", code: `toast("Twenty thousand leagues", { tone: "success" })` },
    ],
    site: ["The organ, and the notes that rise from it.", "The log, and its stamp."],
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
    ...Object.values(FIGHT).map((line) => line.text),
    ...Object.values(TOASTS),
    ...Object.values(SALOON),
    ...Object.values(BATTLE),
    ...[CODE_SHEETS_THREE.encounter, CODE_SHEETS_THREE.saloon].flatMap((sheet) => [sheet.title, sheet.description, ...sheet.hx.map((line) => line.text), ...sheet.site]),
  ];
}
