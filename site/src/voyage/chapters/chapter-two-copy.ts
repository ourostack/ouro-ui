import { claim } from "@/registry/ouro/lib/ouro/claims";
import type { CrewLine, SheetLine } from "./copy";

/**
 * Every word Chapter II says ("Plan the voyage", site-design.md): the chart room, where you plan the
 * route, and Aronnax's catalogue, where you sort the finds and Conseil checks how you class a new
 * one. In one place so the readability check (chapter-two.test.tsx) reads exactly what a visitor
 * reads, at grade 6 or under.
 */

/**
 * Every control in Chapter II, by the `data-chapter-control` its wrapper carries, in page order.
 * site/e2e/chapter-two.spec.ts operates each in a test named "control: <id>" and asserts what it
 * changes; site/scripts/stage-census.test.mjs fails when one here has no such test.
 */
export const CHAPTER_TWO_CONTROLS = ["chart-room-code", "ports", "departure", "legs", "catalogue-code", "sort", "filter", "notes", "classify", "museum"] as const;
export type ChapterTwoControl = (typeof CHAPTER_TWO_CONTROLS)[number];

export const CHAPTER_TWO = {
  number: "Chapter II",
  title: "Plan the voyage",
  intro: "Twenty thousand leagues is a long way. Where shall we go?",
  /** Over the course line from Chapter I into this one. */
  handoff: "She floats. Now, where to?",
} as const;

/** One port of call: where it is (degrees north and east; south and west are negative) and why we go. */
export interface Port {
  id: PortId;
  name: string;
  short: string;
  lat: number;
  lon: number;
  why: string;
}
export type PortId = "vigo" | "crespo" | "tunnel" | "atlantis" | "pole";

/**
 * The ports of call, where Verne puts them: Crespo Island at 32° 40′ N, 157° 50′ W (Part One,
 * Chapter XIV) and Atlantis at 33° 22′ N, 16° 17′ W (Part Two, Chapter IX); Vigo Bay, the Arabian
 * Tunnel's Red Sea end at Suez, and the South Pole where they are on the map.
 */
export const PORTS: readonly Port[] = [
  { id: "vigo", name: "Vigo Bay", short: "Vigo", lat: 42.24, lon: -8.75, why: "Gold from old Spanish ships lies on the sea bed." },
  { id: "crespo", name: "Crespo Island", short: "Crespo", lat: 32.67, lon: -157.83, why: "A forest under the sea, for a hunt." },
  { id: "tunnel", name: "The Red Sea tunnel", short: "Tunnel", lat: 29.97, lon: 32.55, why: "A secret way from the Red Sea to the Mediterranean." },
  { id: "atlantis", name: "Atlantis", short: "Atlantis", lat: 33.37, lon: -16.28, why: "A lost city, deep under the sea." },
  { id: "pole", name: "The South Pole", short: "Pole", lat: -90, lon: -40, why: "Captain Nemo wants to plant his flag there." },
];

/** The plan the chart room starts with: a long way round, so there is something to put right. */
export const START_ROUTE: readonly PortId[] = ["pole", "vigo", "crespo", "tunnel", "atlantis"];

/** The order the Nautilus meets them in Verne's book. */
export const BOOK_ROUTE: readonly PortId[] = ["crespo", "tunnel", "vigo", "atlantis", "pole"];

/** The day the plan sails on at first (the Nautilus's voyage starts in November 1867). */
export const START_DAY = "1867-11-06";

export const CHART_ROOM = {
  title: "The chart room",
  intro: "Put the ports in order. The chart draws the route and counts the leagues.",
  file: "chart-room.tsx",
  map: "The chart of the voyage",
  ports: "Ports of call",
  departure: "Day we sail",
  sail: (day: string) => `Sail ${day}`,
  arrive: (day: string) => `Reach it ${day}`,
  total: "Leagues to sail",
  leagues: (count: string) => `${count} leagues`,
  best: (count: string) => `Conseil can do it in ${count}`,
  legs: "Leagues per leg",
  legsHint: "A bar for a leg of the trip, port to port.",
  home: (day: string) => `Last port on ${day}.`,
} as const;

/** What the crew says about the plan. */
export const ROUTE = {
  opening: { name: "Captain Nemo", text: "Plan the route, Professor. The chart will tell us how far." },
  shortest: {
    name: "Conseil",
    text: claim("This is the shortest way. I tried them one by one.", {
      source: { test: "site/src/voyage/chapters/chapter-two.test.tsx::Chapter II's route > knows the shortest way, of every order the ports can go in" },
      verify: { testExists: "site/src/voyage/chapters/chapter-two.test.tsx::Chapter II's route > knows the shortest way, of every order the ports can go in" },
    }),
  },
  book: {
    name: "Professor Aronnax",
    text: claim("This is the way we went in the book!", {
      source: [{ spec: "https://www.gutenberg.org/ebooks/164" }, { test: "site/src/voyage/chapters/chapter-two.test.tsx::Chapter II's route > follows the book: Crespo, the tunnel, Vigo, Atlantis, the pole" }],
      verify: [{ urlOk: "https://www.gutenberg.org/ebooks/164" }, { testExists: "site/src/voyage/chapters/chapter-two.test.tsx::Chapter II's route > follows the book: Crespo, the tunnel, Vigo, Atlantis, the pole" }],
    }),
  },
  longer: (extra: string): CrewLine => ({ name: "Conseil", text: `I know a way that saves ${extra} leagues.` }),
  first: (port: string): CrewLine => ({ name: "Ned Land", text: `${port} first? Fine by me.` }),
  day: (day: string): CrewLine => ({ name: "Captain Nemo", text: `We sail on ${day}.` }),
  leg: (port: string, leagues: string): CrewLine => ({ name: "Professor Aronnax", text: `${leagues} leagues to ${port}.` }),
} as const satisfies Record<string, unknown>;

export type SpecimenClass = "fish" | "mammal" | "mollusc" | "crustacean" | "zoophyte";

/** The classes Conseil sorts the sea's creatures into, as the catalogue names them. */
export const CLASSES: ReadonlyArray<{ value: SpecimenClass; label: string; plural: string }> = [
  { value: "fish", label: "Fish", plural: "Fish" },
  { value: "mammal", label: "Mammal", plural: "Mammals" },
  { value: "mollusc", label: "Mollusc", plural: "Molluscs" },
  { value: "crustacean", label: "Crustacean", plural: "Crustaceans" },
  { value: "zoophyte", label: "Zoophyte", plural: "Zoophytes" },
];

export interface Specimen {
  id: string;
  name: string;
  kind: SpecimenClass;
  /** How deep it was seen, in fathoms. */
  depth: number;
  /** Where to read about it. */
  href: string;
  /** Aronnax's field note, in the hover card. */
  note: string;
}

/** What Aronnax has in the catalogue before you add to it: creatures the book meets. */
export const SPECIMENS: readonly Specimen[] = [
  { id: "argonaut", name: "Argonaut", kind: "mollusc", depth: 0, href: "https://en.wikipedia.org/wiki/Argonaut_(animal)", note: "A whole fleet of them sailed past in their thin shells." },
  { id: "dugong", name: "Dugong", kind: "mammal", depth: 2, href: "https://en.wikipedia.org/wiki/Dugong", note: "Ned met one in the Red Sea. It was far bigger than his boat." },
  { id: "narwhal", name: "Narwhal", kind: "mammal", depth: 20, href: "https://en.wikipedia.org/wiki/Narwhal", note: "The world thought the Nautilus was one of these. It was not." },
  { id: "pearl-oyster", name: "Pearl oyster", kind: "mollusc", depth: 7, href: "https://en.wikipedia.org/wiki/Pinctada", note: "One holds a pearl as big as a coconut. Nemo lets it grow." },
  { id: "torpedo", name: "Torpedo ray", kind: "fish", depth: 30, href: "https://en.wikipedia.org/wiki/Electric_ray", note: "It gives a shock, like the Nautilus's own engine." },
  { id: "coral", name: "Red coral", kind: "zoophyte", depth: 50, href: "https://en.wikipedia.org/wiki/Precious_coral", note: "It looks like a plant, but it is made of tiny animals." },
];

/** What the crew brings in for you to class, one at a time, with what gives each away. */
export const FINDS = [
  { id: "crab", name: "Spider crab", kind: "crustacean", depth: 40, href: "https://en.wikipedia.org/wiki/Japanese_spider_crab", note: "Its legs are longer than Conseil is tall.", clue: claim("It has a hard shell and ten long legs.", { source: { spec: "https://en.wikipedia.org/wiki/Decapoda" }, verify: { urlOk: "https://en.wikipedia.org/wiki/Decapoda" } }), hint: "Count its legs, and feel its hard shell." },
  { id: "octopus", name: "Octopus", kind: "mollusc", depth: 60, href: "https://en.wikipedia.org/wiki/Octopus", note: "It has a beak like a parrot's. I drew it at once.", clue: claim("It has eight arms and a beak like a parrot's.", { source: { spec: "https://en.wikipedia.org/wiki/Octopus" }, verify: { urlOk: "https://en.wikipedia.org/wiki/Octopus" } }), hint: claim("It has no bones and no shell, but a beak.", { source: { spec: "https://en.wikipedia.org/wiki/Octopus" }, verify: { urlOk: "https://en.wikipedia.org/wiki/Octopus" } }) },
  { id: "flying-fish", name: "Flying fish", kind: "fish", depth: 0, href: "https://en.wikipedia.org/wiki/Flying_fish", note: "It leaps out of the sea and glides on its fins.", clue: "It breathes water and glides on its long fins.", hint: "It breathes water, with gills." },
  { id: "seal", name: "Seal", kind: "mammal", depth: 10, href: "https://en.wikipedia.org/wiki/Earless_seal", note: "We met many of them on the ice near the pole.", clue: "It breathes air and feeds its pups on milk.", hint: "It breathes air and has fur." },
] as const satisfies readonly (Specimen & { clue: string; hint: string })[];

export const CATALOGUE = {
  title: "Aronnax's catalogue",
  intro: "Sort the finds, read the notes, and help Conseil class each new one.",
  file: "catalogue.tsx",
  table: "Specimens",
  sort: "Sort by",
  sorts: [
    { value: "name", label: "Name" },
    { value: "kind", label: "Class" },
    { value: "depth", label: "Depth" },
  ],
  filter: "Show",
  every: "Any class",
  name: "Specimen",
  kind: "Class",
  depth: "Depth",
  fathoms: (depth: number) => (depth === 0 ? "At the top" : `${depth} fathoms`),
  shown: (shown: number, total: number) => (shown === total ? `${total} in the catalogue` : `${shown} of ${total} shown`),
  none: "Nothing in that class yet.",
  added: "New",
  find: "A new find",
  classify: "Its class",
  classifyHint: "Choose the class it belongs to.",
  done: "Conseil is done. The catalogue is tidy.",
  museum: "Visit the museum",
} as const;

/** What Conseil says as you class the finds. */
export const CLASSING = {
  opening: { name: "Conseil", text: "A new find, Professor! What class is it?" },
  wrong: (kind: string, hint: string): CrewLine => ({ name: "Conseil", text: `Not a ${kind.toLowerCase()}, I think. ${hint}` }),
  right: (name: string, kind: string): CrewLine => ({ name: "Conseil", text: `${name}: ${kind.toLowerCase()}. Quite right! I have filed it.` }),
  toast: (kind: string) => `Classed: ${kind}`,
  toastNote: (name: string) => `Conseil added the ${name.toLowerCase()} to the catalogue.`,
  finished: { name: "Conseil", text: "That is the last of them. A tidy catalogue!" },
} as const satisfies Record<string, unknown>;

/** The rail beside the chapter. */
export const PLANNING = {
  label: "How the plan stands",
  route: "Find the best route",
  routeDone: "The shortest way.",
  routeLeft: (leagues: string) => `${leagues} leagues so far.`,
  sail: "Choose the day",
  sailOn: (day: string) => `Sail on ${day}.`,
  sailNot: "Not chosen yet.",
  classes: "Class the finds",
  classed: (count: number, total: number) => `${count} of ${total} classed.`,
} as const;

/** The treasures of Nemo's museum, in the saloon, for the Museum sheet. */
export const MUSEUM = {
  title: "Captain Nemo's museum",
  description: "A few treasures from the saloon of the Nautilus.",
  treasures: [
    { name: "The great pearl", note: "As big as a coconut. Nemo keeps it in its shell, so it can grow." },
    { name: "Shells", note: "Rows of them, in glass cases, from seas far and near." },
    { name: "Paintings", note: "Old masters on the walls, deep under the sea." },
    { name: "The organ", note: "Nemo plays it late at night." },
  ],
} as const;

/** What each composition's Code sheet says: which part is Ouro HX's and which is this site's own. */
export const CODE_SHEETS_TWO = {
  chartRoom: {
    title: "How the chart room is built",
    description: "Ouro HX does the controls and the chart. The site does the map and the maths.",
    hx: [
      { text: "Reorderable: the drag, the moves by key and by menu, and what screen readers hear.", code: `<Reorderable label="Ports of call" items={ports} onReorder={plan} />` },
      { text: "DatePicker: typing a day or picking it, and the phone's own picker on a phone.", code: `<DatePicker label="Day we sail" value={day} onValueChange={setDay} />` },
      { text: "Chart: the bars in the theme's colours, the table screen readers read, and the arrow keys.", code: `<Chart title="Leagues per leg" type="bar" data={legs} categoryKey="port" config={config} />` },
      { text: "Sheet: this panel.", code: `<Sheet title="How the chart room is built" side="right" open={open} onOpenChange={setOpen}>` },
    ],
    site: ["The map, and the route drawn on it.", "The leagues from port to port, and the days.", "The shortest way, and what the crew says."],
  },
  catalogue: {
    title: "How the catalogue is built",
    description: "Ouro HX shows the table. The site sorts it and checks your answers.",
    hx: [
      { text: "Table: the rows and headers, read in order, and its own scroll on a phone.", code: `<Table caption="Specimens" columns={columns} rows={sorted} />` },
      { text: "SegmentedControl and Select: the sort and the filter.", code: `<SegmentedControl label="Sort by" items={sorts} value={sort} onValueChange={setSort} />\n<Select label="Show" options={classes} value={show} onValueChange={setShow} />` },
      { text: "HoverCard and Link: a note when you point at a name, and the link when you tap it.", code: `<HoverCard trigger={<Link href={href} external>{name}</Link>}>{note}</HoverCard>` },
      { text: "Combobox: the list of classes, filtered as you type.", code: `<Combobox label="Its class" items={classes} value={guess} onValueChange={check} />` },
      { text: "Toast and Sheet: Conseil's note, and the museum.", code: `toast("Classed: Mollusc", { tone: "success" })\n<Sheet title="Captain Nemo's museum" trigger={<Button>Visit the museum</Button>}>` },
    ],
    site: ["The order of the rows, and which ones show.", "The right class for a find.", "The museum's treasures."],
  },
} as const;

/** Every line a visitor can read in Chapter II, the Code sheets too, for the readability check. */
export function allChapterTwoText(example: { day: string; leagues: string; more: string }): string[] {
  const kinds = CLASSES.map((kind) => kind.label);
  return [
    ...Object.values(CHAPTER_TWO),
    ...PORTS.flatMap((port) => [port.name, port.why]),
    ...Object.values(CHART_ROOM).flatMap((value) => (typeof value === "string" ? [value] : [])),
    CHART_ROOM.sail(example.day),
    CHART_ROOM.arrive(example.day),
    CHART_ROOM.leagues(example.leagues),
    CHART_ROOM.best(example.leagues),
    CHART_ROOM.home(example.day),
    ROUTE.opening.text,
    ROUTE.shortest.text,
    ROUTE.book.text,
    ROUTE.longer(example.more).text,
    ROUTE.first("Vigo Bay").text,
    ROUTE.day(example.day).text,
    ROUTE.leg("Vigo Bay", example.more).text,
    ...kinds,
    ...CLASSES.map((kind) => kind.plural),
    ...[...SPECIMENS, ...FINDS].flatMap((specimen) => [specimen.name, specimen.note]),
    ...FINDS.flatMap((find) => [find.clue, find.hint]),
    ...Object.values(CATALOGUE).flatMap((value) => (typeof value === "string" ? [value] : [])),
    ...CATALOGUE.sorts.map((sort) => sort.label),
    CATALOGUE.fathoms(0),
    CATALOGUE.fathoms(40),
    CATALOGUE.shown(3, 6),
    CATALOGUE.shown(6, 6),
    CLASSING.opening.text,
    CLASSING.wrong("Fish", FINDS[1].hint).text,
    CLASSING.right("Octopus", "Mollusc").text,
    CLASSING.toast("Mollusc"),
    CLASSING.toastNote("Octopus"),
    CLASSING.finished.text,
    ...Object.values(PLANNING).flatMap((value) => (typeof value === "string" ? [value] : [])),
    PLANNING.routeLeft(example.leagues),
    PLANNING.sailOn(example.day),
    PLANNING.classed(2, 4),
    MUSEUM.title,
    MUSEUM.description,
    ...MUSEUM.treasures.flatMap((treasure) => [treasure.name, treasure.note]),
    ...[CODE_SHEETS_TWO.chartRoom, CODE_SHEETS_TWO.catalogue].flatMap((sheet) => [sheet.title, sheet.description, ...sheet.hx.map((line: SheetLine) => line.text), ...sheet.site]),
  ];
}
