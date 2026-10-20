/**
 * Every word Chapter I says ("Build the ship", site-design.md): the chapter's heading, the shipyard's
 * jobs and the crew's lines about them, and the ship's articles. In one place so the readability
 * check (chapter-one.test.tsx) reads exactly what a visitor reads, at grade 6 or under.
 */
import type { CrewName } from "../stage/copy";

/** One thing Ouro HX does in an exhibit, and the line of the exhibit that asks it to. */
export interface SheetLine {
  text: string;
  code: string;
}

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
  /** Over the course line from the themes into the chapter. */
  handoff: "Before she can sail, she must be built.",
} as const;

/** The rail beside the chapter: how the voyage stands, as the yard and the articles change it. */
export const EXPEDITION = {
  label: "How the voyage stands",
  picture: "The yard on the island",
  build: "Build her",
  built: (count: number) => (count === PARTS.length ? "All five jobs done." : `${count} of ${PARTS.length} jobs done.`),
  launch: "Launch her",
  afloat: (afloat: boolean) => (afloat ? "She is afloat." : "Still on the slip."),
  sign: "Sign on",
  signed: (you: { name: string; trade: string } | null) => (you ? `${you.name}, ${you.trade.toLowerCase()}.` : "Not yet."),
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

/** The order the yard starts in: the lantern before the hull, so there is something to put right. */
export const START_ORDER: readonly PartId[] = ["lantern", "hull", "windows", "organ", "engine"];

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
  launch: { name: "Ned Land", text: "Hurrah! Look at her float!" },
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
  /** A name of spaces only. */
  blank: "Write your name.",
  /** Someone has started to sign but the articles are not done. */
  pending: "Not signed yet",
  signed: (name: string) => `${name} signed on`,
  onList: "Your name is on the crew list now.",
} as const;

export const SIGN = {
  opening: { name: "Conseil", text: "Sign below, and I will add you to the list." },
  welcome: (name: string, trade: string): CrewLine => ({ name: "Conseil", text: `Welcome, ${name}. I have you down as: ${trade}.` }),
  left: { name: "Ned Land", text: "Gone so soon? The sea is not for all." },
  /** Conseil will not write you down without a name. */
  needName: { name: "Conseil", text: "If you please, I need a name to write down." },
  /** Conseil, polite but firm, until the trade and the oath are given. */
  refuse: (wants: readonly ("trade" | "oath")[]): CrewLine => ({
    name: "Conseil",
    text: wants.length === 2 ? "Forgive me. I may not sign you on without your trade and the oath." : wants[0] === "trade" ? "Forgive me. I may not sign you on without your trade." : "Forgive me. You must swear the oath first.",
  }),
  /** What the pending line on the list waits for. */
  waiting: (wants: readonly ("trade" | "oath")[]) => (wants.length === 2 ? "Waiting for your trade and the oath." : wants[0] === "trade" ? "Waiting for your trade." : "Waiting for the oath."),
  /** The one aboard with that name, when you sign as them. */
  mine: (name: CrewName): CrewLine => ({ name, text: "That is my name! Sign your own." }),
} as const satisfies Record<string, unknown>;

/** What each composition's Code sheet says: which part is Ouro HX's and which is this site's own. */
export const CODE_SHEETS = {
  shipyard: {
    title: "How the shipyard is built",
    description: "Ouro HX does the controls. The site does the ship.",
    hx: [
      { text: "Reorderable: the drag, the moves by key and by menu, and what screen readers hear.", code: `<Reorderable label="Order of work" items={plan} onReorder={reorder} />` },
      { text: "Checklist: the ticks, the line through each done job, and the day on each row.", code: `<Checklist label="Jobs" items={jobs} onCheckedChange={tick} />` },
      { text: "Progress: the bar, and the number screen readers read.", code: `<Progress label="Ship built" value={built * 20} showValue />` },
      { text: "Button: the press, and Launch kept off until the work is done.", code: `<Button disabled={left > 0} onClick={launch}>Launch</Button>` },
      { text: "Sheet: this panel.", code: `<Sheet title="How the shipyard is built" side="right" open={open} onOpenChange={setOpen}>` },
    ],
    site: ["The plan of the ship, and the parts it draws.", "The rule for a good order, and what the crew says.", "The launch."],
  },
  articles: {
    title: "How the articles are built",
    description: "Ouro HX does the form. The site does the crew.",
    hx: [
      { text: "Form: it checks each field when you sign, puts each note under its field, and takes you to the first.", code: `<Form errors={formErrors(answer, answer?.errors)} onSubmit={sign}>` },
      { text: "TextField, Select and Checkbox: the labels, the marks on what you must fill in, and the notes.", code: `<TextField label="Your name" name="name" required />\n<Select label="Your trade" name="trade" options={trades} required />\n<Checkbox label="I will keep the Nautilus a secret." name="oath" required />` },
      { text: "ItemGroup, Item, Avatar and Badge: the crew list.", code: `<ItemGroup aria-label="Crew list">\n  <Item media={<Avatar name={name} />} title={name} actions={<Badge>{trade}</Badge>} />\n</ItemGroup>` },
      { text: "Toast: the note when you sign on.", code: `toast(\`\${name} signed on\`, { tone: "success" })` },
    ],
    site: ["Who is aboard already.", "The list of names, and you on it.", "What Conseil says when the articles are not done."],
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
    EXPEDITION.label,
    EXPEDITION.picture,
    EXPEDITION.build,
    EXPEDITION.built(3),
    EXPEDITION.built(5),
    EXPEDITION.launch,
    EXPEDITION.afloat(true),
    EXPEDITION.afloat(false),
    EXPEDITION.sign,
    EXPEDITION.signed({ name: "Ada", trade: "Cook" }),
    EXPEDITION.signed(null),
    ...TRADES.map((trade) => trade.label),
    ...CREW.flatMap((member) => [member.name, member.trade]),
    ...Object.values(ARTICLES).flatMap((value) => (typeof value === "string" ? [value] : [])),
    ARTICLES.aboard(5),
    ARTICLES.taken("Ned Land"),
    ARTICLES.signed("Ada"),
    SIGN.welcome("Ada", "Cook").text,
    SIGN.opening.text,
    SIGN.left.text,
    SIGN.needName.text,
    SIGN.refuse(["trade", "oath"]).text,
    SIGN.refuse(["trade"]).text,
    SIGN.refuse(["oath"]).text,
    SIGN.waiting(["trade", "oath"]),
    SIGN.waiting(["trade"]),
    SIGN.waiting(["oath"]),
    SIGN.mine("Ned Land").text,
    ...[CODE_SHEETS.shipyard, CODE_SHEETS.articles].flatMap((sheet) => [sheet.title, sheet.description, ...sheet.hx.map((line) => line.text), ...sheet.site]),
    CODE_SHEETS.hxHeading,
    CODE_SHEETS.siteHeading,
    CODE_SHEETS.source,
  ];
}
