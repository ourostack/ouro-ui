/**
 * Every word Chapter I says ("Build the ship", site-design.md): the chapter's heading, the shipyard's
 * jobs and the crew's lines about them, and the ship's articles. In one place so the readability
 * check (chapter-one.test.tsx) reads exactly what a visitor reads, at grade 6 or under.
 */
import type { CrewName } from "../stage/copy";

/**
 * Every control in Chapter I, by the `data-chapter-control` its wrapper carries, in page order.
 * site/e2e/chapter-one.spec.ts operates each in a test named "control: <id>" and asserts what it
 * changes; site/scripts/stage-census.test.mjs fails when one here has no such test.
 */
export const CHAPTER_ONE_CONTROLS = ["shipyard-code", "order", "jobs", "launch", "articles-code", "name", "trade", "oath", "sign", "leave"] as const;
export type ChapterOneControl = (typeof CHAPTER_ONE_CONTROLS)[number];

export interface CrewLine {
  name: CrewName;
  text: string;
}

export const CHAPTER_ONE = {
  number: "Chapter I",
  title: "Build the ship",
  intro: "Captain Nemo is building a submarine in secret, on a far island. Help him finish it.",
  next: "Then sign on. A ship needs a crew.",
  code: "Code",
} as const;

/** The parts of the Nautilus, in the order a sound plan puts them: the hull first. */
export const PARTS = [
  { id: "hull", name: "Double hull", job: "Join the double hull" },
  { id: "windows", name: "Great windows", job: "Fit the great windows" },
  { id: "engine", name: "Electric engine", job: "Put in the engine" },
  { id: "lantern", name: "Lantern", job: "Hang the lantern" },
  { id: "organ", name: "Organ", job: "Tune the organ" },
] as const;
export type PartId = (typeof PARTS)[number]["id"];

export const SHIPYARD = {
  title: "The shipyard",
  intro: "Put the jobs in order, then tick them off. The plan fills in as you build.",
  file: "shipyard.tsx",
  blueprint: "The plan of the Nautilus",
  order: "Order of work",
  jobs: "Jobs",
  day: (day: number) => `Day ${day}`,
  progress: "Ship built",
  launch: "Launch",
  again: "Build her again",
  launchHint: (left: number) => (left === 0 ? "All done. She is ready." : left === 1 ? "One job left." : `${left} jobs left.`),
  launched: "She is afloat.",
} as const;

/** What the crew says as the work goes on. */
export const YARD = {
  opening: { name: "Captain Nemo", text: "Hull first, then the rest. Put the jobs in order." },
  built: {
    hull: { name: "Ned Land", text: "Two hulls, one in the other. She is strong now." },
    windows: { name: "Professor Aronnax", text: "Now we can watch the fish from the saloon!" },
    engine: { name: "Captain Nemo", text: "All by electricity. No coal and no smoke." },
    lantern: { name: "Ned Land", text: "A lamp for the dark. Good." },
    organ: { name: "Conseil", text: "The organ is in tune. You may play." },
  },
  /** A part put on before the hull is there to hold it. */
  noHull: (part: string): CrewLine => ({ name: "Conseil", text: `The ${part.toLowerCase()} is waiting for a hull.` }),
  undone: (part: string): CrewLine => ({ name: "Conseil", text: `${part} off again. I made a note.` }),
  /** Conseil, when the plan puts something before the hull. */
  outOfOrder: {
    windows: { name: "Conseil", text: "Windows with no hull would let in the whole sea." },
    engine: { name: "Conseil", text: "An engine with no hull will just sink." },
    lantern: { name: "Conseil", text: "If you please, a lantern needs a hull to hang on." },
    organ: { name: "Conseil", text: "The organ cannot float on its own, I think." },
  },
  inOrder: { name: "Conseil", text: "Hull first. A good plan. I have sorted it." },
  ready: { name: "Captain Nemo", text: "Every job is done. Press Launch!" },
  launch: { name: "Captain Nemo", text: "She floats! Mobilis in mobili." },
  again: { name: "Conseil", text: "Back to the first plank, then." },
} as const satisfies Record<string, unknown>;

/** The trades a new hand may sign on as. */
export const TRADES = [
  { value: "harpooner", label: "Harpooner" },
  { value: "naturalist", label: "Naturalist" },
  { value: "engineer", label: "Engineer" },
  { value: "cook", label: "Cook" },
  { value: "cabin", label: "Cabin boy or girl" },
] as const;

/** Who is aboard before you sign. */
export const CREW = [
  { name: "Captain Nemo", trade: "Captain" },
  { name: "Professor Aronnax", trade: "Naturalist" },
  { name: "Conseil", trade: "Servant" },
  { name: "Ned Land", trade: "Harpooner" },
] as const;

export const ARTICLES = {
  title: "Sign the ship's articles",
  intro: "Every sailor signs before the ship sails. Add your name to the crew.",
  file: "articles.tsx",
  form: "The ship's articles",
  name: "Your name",
  nameHint: "As you would sign it.",
  trade: "Your trade",
  tradePlaceholder: "Choose a trade",
  oath: "I will keep the Nautilus a secret.",
  sign: "Sign the articles",
  roster: "Crew list",
  aboard: (count: number) => `${count} aboard`,
  you: "You",
  leave: "Leave the crew",
  /** Someone of that name is aboard already. */
  taken: (name: string) => `${name} is aboard already. Sign your own name.`,
  signed: (name: string) => `${name} signed on`,
} as const;

export const SIGN = {
  opening: { name: "Conseil", text: "Sign below, and I will add you to the list." },
  welcome: (name: string, trade: string): CrewLine => ({ name: "Conseil", text: `Welcome, ${name}. I have you down as: ${trade}.` }),
  left: { name: "Ned Land", text: "Gone so soon? The sea is not for all." },
} as const satisfies Record<string, unknown>;

/** What each composition's Code sheet says: which part is Ouro HX's and which is this site's own. */
export const CODE_SHEETS = {
  shipyard: {
    title: "How the shipyard is built",
    description: "Ouro HX does the controls. The site does the ship.",
    hx: [
      "Reorderable: the drag, the moves by key and by menu, and what screen readers hear.",
      "Checklist: the ticks, the line through each done job, and the day on each row.",
      "Progress: the bar, and the number screen readers read.",
      "Button: the press, and Launch kept off until the work is done.",
      "Sheet: this panel.",
    ],
    site: ["The plan of the ship, and the parts it draws.", "The rule for a good order, and what the crew says.", "The launch."],
  },
  articles: {
    title: "How the articles are built",
    description: "Ouro HX does the form. The site does the crew.",
    hx: [
      "Form: it checks each field when you sign, puts each note under its field, and takes you to the first.",
      "TextField, Select and Checkbox: the labels, the marks on what you must fill in, and the notes.",
      "ItemGroup, Item, Avatar and Badge: the crew list.",
      "Toast: the note when you sign on.",
    ],
    site: ["Who is aboard already.", "The list of names, and you on it."],
  },
  hxHeading: "Ouro HX does",
  siteHeading: "The site does",
  source: "Read the source",
} as const;

/** Every line a visitor can read in Chapter I, the Code sheets too, for the readability check. */
export function allChapterOneText(): string[] {
  return [
    ...Object.values(CHAPTER_ONE),
    ...PARTS.flatMap((part) => [part.name, part.job]),
    ...Object.values(SHIPYARD).flatMap((value) => (typeof value === "string" ? [value] : [])),
    SHIPYARD.day(1),
    SHIPYARD.launchHint(0),
    SHIPYARD.launchHint(1),
    SHIPYARD.launchHint(3),
    YARD.opening.text,
    ...Object.values(YARD.built).map((line) => line.text),
    YARD.noHull("Lantern").text,
    YARD.undone("Lantern").text,
    ...Object.values(YARD.outOfOrder).map((line) => line.text),
    YARD.inOrder.text,
    YARD.ready.text,
    YARD.launch.text,
    YARD.again.text,
    ...TRADES.map((trade) => trade.label),
    ...CREW.flatMap((member) => [member.name, member.trade]),
    ...Object.values(ARTICLES).flatMap((value) => (typeof value === "string" ? [value] : [])),
    ARTICLES.aboard(5),
    ARTICLES.taken("Ned Land"),
    ARTICLES.signed("Ada"),
    SIGN.welcome("Ada", "Cook").text,
    SIGN.opening.text,
    SIGN.left.text,
    ...[CODE_SHEETS.shipyard, CODE_SHEETS.articles].flatMap((sheet) => [sheet.title, sheet.description, ...sheet.hx, ...sheet.site]),
    CODE_SHEETS.hxHeading,
    CODE_SHEETS.siteHeading,
    CODE_SHEETS.source,
  ];
}
