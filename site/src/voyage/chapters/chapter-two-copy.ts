import { claim } from "@/registry/ouro/lib/ouro/claims";
import type { CrewLine, SheetLine } from "./copy";

/**
 * Every word Chapter II says ("Plan the voyage", site-design.md): the chart room, where you plan the
 * route, the specimen book, where you sort the sea's creatures, and the ship's radio, where you chat
 * with the crew. In one place so the readability check (chapter-two.test.tsx) reads exactly what a
 * visitor reads, at grade 6 or under. Nobody needs to have read the book: the crew are named with
 * their jobs (ROLES in frame.tsx), and every odd word is explained where it appears.
 */

/**
 * Every control in Chapter II, by the `data-chapter-control` its wrapper carries, in page order.
 * site/e2e/chapter-two.spec.ts operates each in a test named "control: <id>" and asserts what it
 * changes; site/scripts/stage-census.test.mjs fails when one here has no such test.
 */
export const CHAPTER_TWO_CONTROLS = ["chart-room-code", "ports", "departure", "legs", "catalogue-code", "sort", "filter", "notes", "classify", "museum", "radio-code", "channels", "react", "compose"] as const;
export type ChapterTwoControl = (typeof CHAPTER_TWO_CONTROLS)[number];

export const CHAPTER_TWO = {
  number: "Chapter II",
  title: "Plan the voyage",
  intro: "The ship is built. Now plan the trip: where she goes, and when she sails.",
  /** Over the course line from Chapter I into this one. */
  handoff: "She floats! Now, where to?",
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
  { id: "vigo", name: "Vigo Bay", short: "Vigo", lat: 42.24, lon: -8.75, why: "Old treasure ships sank here. Their gold is still on the sea floor." },
  { id: "crespo", name: "Crespo Island", short: "Crespo", lat: 32.67, lon: -157.83, why: "A whole forest grows here, under the sea." },
  { id: "tunnel", name: "The Red Sea tunnel", short: "Tunnel", lat: 29.97, lon: 32.55, why: "A secret shortcut under the land, from one sea to the next." },
  { id: "atlantis", name: "Atlantis", short: "Atlantis", lat: 33.37, lon: -16.28, why: "A lost city that sank long ago. Who lived there?" },
  { id: "pole", name: "The South Pole", short: "Pole", lat: -90, lon: -40, why: "The captain wants to plant his flag at the bottom of the world." },
];

/** The plan the chart room starts with: a long way round, so there is something to put right. */
export const START_ROUTE: readonly PortId[] = ["pole", "vigo", "crespo", "tunnel", "atlantis"];

/** The order the Nautilus meets them in Jules Verne's 1870 story. */
export const BOOK_ROUTE: readonly PortId[] = ["crespo", "tunnel", "vigo", "atlantis", "pole"];

/** The day the plan sails on at first (the Nautilus's voyage starts in November 1867). */
export const START_DAY = "1867-11-06";

export const CHART_ROOM = {
  title: "The chart room",
  intro: `Drag the ports into order. The map draws your route and counts the leagues. ${claim("A league is about 4 km, or 2.5 miles.", { source: { spec: "https://en.wikipedia.org/wiki/League_(unit)" }, verify: { urlOk: "https://en.wikipedia.org/wiki/League_(unit)" } })}`,
  file: "chart-room.tsx",
  map: "The chart of the voyage",
  ports: "Ports of call",
  departure: "Day we sail",
  sail: (day: string) => `Sail ${day}`,
  arrive: (day: string) => `Reach it ${day}`,
  total: "Leagues to sail",
  leagues: (count: string) => `${count} leagues`,
  best: (count: string) => `Best: ${count}`,
  legs: "Leagues per leg",
  legsHint: "A taller bar is a longer hop.",
  home: (day: string) => `Last port on ${day}.`,
} as const;

/** What the crew says about the plan. */
export const ROUTE = {
  opening: { name: "Captain Nemo", text: "Pick our route. The map will tell us how far it is." },
  shortest: {
    name: "Conseil",
    text: claim("That is the shortest way! I tried every order to be sure.", {
      source: { test: "site/src/voyage/chapters/chapter-two.test.tsx::Chapter II's route > knows the shortest way, of every order the ports can go in" },
      verify: { testExists: "site/src/voyage/chapters/chapter-two.test.tsx::Chapter II's route > knows the shortest way, of every order the ports can go in" },
    }),
  },
  book: {
    name: "Professor Aronnax",
    text: claim("Ha! That is the route from the first story, in 1870.", {
      source: [{ spec: "https://www.gutenberg.org/ebooks/164" }, { test: "site/src/voyage/chapters/chapter-two.test.tsx::Chapter II's route > follows the book: Crespo, the tunnel, Vigo, Atlantis, the pole" }],
      verify: [{ urlOk: "https://www.gutenberg.org/ebooks/164" }, { testExists: "site/src/voyage/chapters/chapter-two.test.tsx::Chapter II's route > follows the book: Crespo, the tunnel, Vigo, Atlantis, the pole" }],
    }),
  },
  longer: (extra: string): CrewLine => ({ name: "Conseil", text: `Not bad! But I know a way that is ${extra} leagues shorter.` }),
  first: (port: string): CrewLine => ({ name: "Ned Land", text: `${port} first? Fine by me. I will pack a snack.` }),
  day: (day: string): CrewLine => ({ name: "Captain Nemo", text: `We sail on ${day}. Do not be late!` }),
  leg: (port: string, leagues: string): CrewLine => ({ name: "Professor Aronnax", text: `${leagues} leagues to ${port}.` }),
} as const satisfies Record<string, unknown>;

export type SpecimenClass = "fish" | "mammal" | "mollusc" | "crustacean" | "zoophyte";

/** The groups the sea's creatures sort into, as the specimen book names them (a zoophyte is a coral). */
export const CLASSES: ReadonlyArray<{ value: SpecimenClass; label: string; plural: string }> = [
  { value: "fish", label: "Fish", plural: "Fish" },
  { value: "mammal", label: "Mammal", plural: "Mammals" },
  { value: "mollusc", label: "Mollusc", plural: "Molluscs" },
  { value: "crustacean", label: "Crustacean", plural: "Crustaceans" },
  { value: "zoophyte", label: "Coral", plural: "Corals" },
];

export interface Specimen {
  id: string;
  name: string;
  kind: SpecimenClass;
  /** How deep it was seen, in metres. */
  depth: number;
  /** Where to read about it. */
  href: string;
  /** The scientist's fun fact, in the hover card. */
  note: string;
}

/** What the specimen book holds before you add to it: creatures the story meets. */
export const SPECIMENS: readonly Specimen[] = [
  { id: "argonaut", name: "Argonaut", kind: "mollusc", depth: 0, href: "https://en.wikipedia.org/wiki/Argonaut_(animal)", note: "A whole fleet of them sailed past in shells as thin as paper." },
  { id: "dugong", name: "Dugong", kind: "mammal", depth: 4, href: "https://en.wikipedia.org/wiki/Dugong", note: "The harpooner met one. It was bigger than his boat!" },
  { id: "narwhal", name: "Narwhal", kind: "mammal", depth: 40, href: "https://en.wikipedia.org/wiki/Narwhal", note: "People once thought our ship was a giant one of these. Rude." },
  { id: "pearl-oyster", name: "Pearl oyster", kind: "mollusc", depth: 12, href: "https://en.wikipedia.org/wiki/Pinctada", note: "One holds a pearl as big as a coconut. The captain lets it grow." },
  { id: "torpedo", name: "Torpedo ray", kind: "fish", depth: 55, href: "https://en.wikipedia.org/wiki/Electric_ray", note: "It can give you a zap, like a little battery. Do not pet it." },
  { id: "coral", name: "Red coral", kind: "zoophyte", depth: 90, href: "https://en.wikipedia.org/wiki/Precious_coral", note: "It looks like a plant, but it is made of tiny animals." },
];

/** What the crew brings in for you to sort, one at a time, with what gives each away, and a hint that teaches the group. */
export const FINDS = [
  { id: "crab", name: "Spider crab", kind: "crustacean", depth: 75, href: "https://en.wikipedia.org/wiki/Japanese_spider_crab", note: "Its legs are longer than you are tall!", clue: claim("It has a hard shell and ten long legs.", { source: { spec: "https://en.wikipedia.org/wiki/Decapoda" }, verify: { urlOk: "https://en.wikipedia.org/wiki/Decapoda" } }), hint: claim("Crabs, lobsters and shrimp have hard shells and lots of legs. They are crustaceans.", { source: { spec: "https://en.wikipedia.org/wiki/Crustacean" }, verify: { urlOk: "https://en.wikipedia.org/wiki/Crustacean" } }) },
  { id: "octopus", name: "Octopus", kind: "mollusc", depth: 110, href: "https://en.wikipedia.org/wiki/Octopus", note: claim("It has a beak like a parrot's, and three hearts.", { source: { spec: "https://en.wikipedia.org/wiki/Octopus" }, verify: { urlOk: "https://en.wikipedia.org/wiki/Octopus" } }), clue: claim("It has eight arms and a beak like a parrot's.", { source: { spec: "https://en.wikipedia.org/wiki/Octopus" }, verify: { urlOk: "https://en.wikipedia.org/wiki/Octopus" } }), hint: claim("It has a soft body and no bones, like a snail. Snails and octopuses are molluscs.", { source: { spec: "https://en.wikipedia.org/wiki/Octopus" }, verify: { urlOk: "https://en.wikipedia.org/wiki/Octopus" } }) },
  { id: "flying-fish", name: "Flying fish", kind: "fish", depth: 0, href: "https://en.wikipedia.org/wiki/Flying_fish", note: "It leaps out of the sea and glides on its fins.", clue: "It breathes water and glides on its long fins.", hint: claim("It breathes water with gills, like other fish.", { source: { spec: "https://en.wikipedia.org/wiki/Fish" }, verify: { urlOk: "https://en.wikipedia.org/wiki/Fish" } }) },
  { id: "seal", name: "Seal", kind: "mammal", depth: 20, href: "https://en.wikipedia.org/wiki/Earless_seal", note: "We met lots of them, lazing on the ice near the pole.", clue: "It breathes air and feeds its pups on milk.", hint: claim("It breathes air and has fur, like a dog. That makes it a mammal.", { source: { spec: "https://en.wikipedia.org/wiki/Mammal" }, verify: { urlOk: "https://en.wikipedia.org/wiki/Mammal" } }) },
] as const satisfies readonly (Specimen & { clue: string; hint: string })[];

export const CATALOGUE = {
  title: "The specimen book",
  intro: "The ship's scientist keeps a book of the sea creatures we meet. Point at a name for a fun fact, then help sort the new finds.",
  file: "specimens.tsx",
  table: "Specimens",
  sort: "Sort by",
  sorts: [
    { value: "name", label: "Name" },
    { value: "kind", label: "Group" },
    { value: "depth", label: "Depth" },
  ],
  filter: "Show",
  every: "Any group",
  name: "Creature",
  kind: "Group",
  depth: "Depth",
  depthLabel: (depth: number) => (depth === 0 ? "At the top" : `${depth} m`),
  shown: (shown: number, total: number) => (shown === total ? `${total} in the book` : `${shown} of ${total} shown`),
  none: "Nothing in that group yet.",
  added: "New",
  find: "A new find",
  classify: "Which group?",
  classifyHint: "Pick the group it belongs to.",
  done: "Sorted! The book is tidy.",
  museum: "Visit the museum",
} as const;

/** What the scientist's helper says as you sort the finds. */
export const CLASSING = {
  opening: { name: "Conseil", text: "A new find! Which group does it go in?" },
  wrong: (kind: string, hint: string): CrewLine => ({ name: "Conseil", text: `Hmm, not a ${kind.toLowerCase()}. ${hint}` }),
  right: (name: string, kind: string): CrewLine => ({ name: "Conseil", text: `${name}: ${kind.toLowerCase()}. Yes! Into the book it goes.` }),
  toast: (kind: string) => `Sorted: ${kind}`,
  toastNote: (name: string) => `The ${name.toLowerCase()} is in the book.`,
  finished: { name: "Conseil", text: "That was the last one. What a tidy book!" },
} as const satisfies Record<string, unknown>;

/** The rail beside the chapter. */
export const PLANNING = {
  label: "How the plan stands",
  route: "Find the shortest route",
  routeDone: "The shortest way.",
  routeLeft: (leagues: string) => `${leagues} leagues so far.`,
  sail: "Choose the day",
  sailOn: (day: string) => `Sail on ${day}.`,
  sailNot: "Not chosen yet.",
  classes: "Sort the finds",
  classed: (count: number, total: number) => `${count} of ${total} sorted.`,
} as const;

/** The treasures of Nemo's museum, in the saloon, for the Museum sheet. */
export const MUSEUM = {
  title: "Captain Nemo's museum",
  description: "A few treasures from the saloon of the Nautilus.",
  treasures: [
    { name: "The great pearl", note: "As big as a coconut. The captain keeps it in its shell, so it can grow." },
    { name: "Shells", note: "Rows of them, in glass cases, from seas far and near." },
    { name: "Paintings", note: "Famous paintings on the walls, deep under the sea." },
    { name: "The organ", note: "The captain plays it late at night. Ask him nicely." },
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
    title: "How the specimen book is built",
    description: "Ouro HX shows the table. The site sorts it and checks your answers.",
    hx: [
      { text: "Table: the rows and headers, read in order, and its own scroll on a phone.", code: `<Table caption="Creatures" columns={columns} rows={sorted} />` },
      { text: "SegmentedControl and Select: the sort and the filter.", code: `<SegmentedControl label="Sort by" items={sorts} value={sort} onValueChange={setSort} />\n<Select label="Show" options={groups} value={show} onValueChange={setShow} />` },
      { text: "HoverCard and Link: a note when you point at a name, and the link when you tap it.", code: `<HoverCard trigger={<Link href={href} external>{name}</Link>}>{note}</HoverCard>` },
      { text: "Combobox: the list of groups, filtered as you type.", code: `<Combobox label="Which group?" items={groups} value={guess} onValueChange={check} />` },
      { text: "Toast and Sheet: the news when a find is sorted, and the museum.", code: `toast("Sorted: Mollusc", { tone: "success" })\n<Sheet title="Captain Nemo's museum" trigger={<Button>Visit the museum</Button>}>` },
    ],
    site: ["The order of the rows, and which ones show.", "The right group for a find.", "The museum's treasures."],
  },
  radio: {
    title: "How the radio is built",
    description: `Ouro HX does the chat. ${claim("The site writes the crew's replies from a script, with no network and no AI.", { source: { file: "site/src/voyage/chapters/chapter-two-copy.ts" }, verify: { testExists: "site/src/voyage/chapters/chapter-two.test.tsx::the ship's radio > answers from a script: the squid makes someone new call, a greeting gets a wave, and the crew take turns" } })}`,
    hx: [
      { text: "ConversationList: who you can call, with a dot for news, and one Tab stop.", code: `<ConversationList label="Who to call" items={channels} selectedId={channel} onSelect={setChannel} />` },
      { text: `MessageList and Message: the chat, which keeps up with new lines and reads them out. ${claim("Each line shows its writer's dot.", { source: { file: "site/src/voyage/chapters/chapter-two-radio.tsx" }, verify: { testExists: "site/src/voyage/chapters/chapter-two.test.tsx::the ship's radio > shows the crew's presence on their lines, as in the list of who is on the air" } })}`, code: `<MessageList label="Radio: The whole crew">\n  <Message role="assistant" name="Ned Land" presence="away" presenceLabel="Napping">Ha! Good one.</Message>\n</MessageList>` },
      { text: "Composer: the box you write in. Enter sends, and Shift and Enter start a new line.", code: `<Composer label="Message" sendOn="enter" onSend={send} />` },
      { text: "ReactionBar: the emoji under a line. Press one to add yours, and again to take it back.", code: `<ReactionBar reactions={line.reactions} quick={quick} onReact={react} />` },
      { text: "Avatar: who is on the radio, and a dot that shows if they are free, busy or away.", code: `<Avatar name="Ned Land" presence="away" presenceLabel="Napping" />` },
    ],
    site: ["What the crew says back, and who says it.", "When someone new calls."],
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
    CATALOGUE.depthLabel(0),
    CATALOGUE.depthLabel(40),
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
    ...allRadioText(),
    ...[CODE_SHEETS_TWO.chartRoom, CODE_SHEETS_TWO.catalogue, CODE_SHEETS_TWO.radio].flatMap((sheet) => [sheet.title, sheet.description, ...sheet.hx.map((line: SheetLine) => line.text), ...sheet.site]),
  ];
}

/** The ship's radio's conversations: the whole crew, the captain alone, and, once it calls, someone new. */
export type ChannelId = "crew" | "captain" | "caller";

/** A reaction the radio offers, by key. */
export const REACTIONS = [
  { key: "like", label: "Like", emoji: "👍" },
  { key: "love", label: "Love", emoji: "❤️" },
  { key: "funny", label: "Funny", emoji: "😂" },
  { key: "hooray", label: "Hooray", emoji: "🎉" },
  { key: "wave", label: "Wave", emoji: "👋" },
] as const;
export type ReactionKey = (typeof REACTIONS)[number]["key"];

/** A line on the radio: who says it and what, and how the crew reacts to it to begin with. */
export interface RadioLine {
  name: string;
  text: string;
  reactions?: ReadonlyArray<{ key: ReactionKey; count: number }>;
}

/** The radio's answer to a message: who replies, how the crew reacts to the message, and whether someone new calls. */
export interface RadioReply {
  line: RadioLine;
  reaction: ReactionKey;
  call: boolean;
}

export const RADIO = {
  title: "The ship's radio",
  intro: "Say hello to the crew. They write back, and they love a good emoji.",
  file: "radio.tsx",
  channels: "Who to call",
  crew: "The whole crew",
  crewNote: "Four aboard",
  captain: "Captain Nemo",
  captainNote: "On the bridge",
  caller: "Unknown caller",
  callerNote: "👋👋👋👋👋👋👋👋",
  unread: "New",
  onAir: "On the radio",
  you: "You",
  list: (channel: string) => `Radio: ${channel}`,
  compose: "Message",
  placeholder: "Say hi to the crew…",
  send: "Send",
  writing: "Writing",
  /** Each of the crew's presence on the radio, by name. */
  presence: {
    "Captain Nemo": { presence: "available", label: "On the bridge" },
    "Professor Aronnax": { presence: "busy", label: "Busy in the lab" },
    Conseil: { presence: "available", label: "Here, sir" },
    "Ned Land": { presence: "away", label: "Napping" },
  },
  /** Once the harpooner has said something, he is awake. */
  awake: "Awake now",
  /** When someone new calls: a note in the crew's conversation. */
  crackle: "📻 The radio crackles. Someone new is calling…",
} as const;

/** What each conversation holds when the radio first comes on. */
export const RADIO_START: Record<ChannelId, readonly RadioLine[]> = {
  crew: [
    { name: "Captain Nemo", text: "Welcome aboard! This is the ship's radio. Say hi to the crew.", reactions: [{ key: "wave", count: 3 }] },
    { name: "Ned Land", text: "Ask us anything. Just do not mention the squid.", reactions: [{ key: "funny", count: 1 }] },
    { name: "Conseil", text: "Squid? What squid, sir?", reactions: [{ key: "like", count: 1 }] },
  ],
  captain: [{ name: "Captain Nemo", text: "The captain here, on the bridge. What can I do for you?" }],
  caller: [
    { name: "Unknown caller", text: "Hello? Hello! Is this the little ship? 👋" },
    { name: "Unknown caller", text: `I have been following you. ${claim("I have eight arms, and two more just for hugs.", { source: { spec: "https://en.wikipedia.org/wiki/Giant_squid" }, verify: { urlOk: "https://en.wikipedia.org/wiki/Giant_squid" } })}` },
    { name: "Unknown caller", text: "I am coming to say hi. See you very soon! 🦑", reactions: [{ key: "wave", count: 1 }] },
  ],
};

/**
 * How the radio answers, first match wins: a pattern the message matches, the crew's reply, the
 * captain's when you call him alone, and the reaction the crew puts on your message. A mention of
 * the squid makes someone new call.
 */
const RULES: ReadonlyArray<{ match: RegExp; crew: RadioLine; captain: string; reaction: ReactionKey; call?: true }> = [
  { match: /squid|octopus|kraken|tentacle|🦑/i, crew: { name: "Ned Land", text: "Shh! Do not say that word. It might hear you." }, captain: "A squid? Out here? Nonsense. Well… probably nonsense.", reaction: "funny", call: true },
  { match: /\b(hi|hello|hey|ahoy|hiya|howdy|yo)\b|👋/i, crew: { name: "Captain Nemo", text: "Ahoy there! Glad to have you aboard." }, captain: "Ahoy! Good to hear your voice.", reaction: "wave" },
  { match: /food|eat|lunch|dinner|snack|hungry|breakfast|cook/i, crew: { name: "Conseil", text: "Dinner tonight is seaweed soup. Again." }, captain: "We eat what the sea gives us. Tonight, that is seaweed.", reaction: "funny" },
  { match: /treasure|gold|pirate|rich/i, crew: { name: "Professor Aronnax", text: "There is real gold at Vigo Bay. Put it on your route!" }, captain: "Gold? Yes, at Vigo Bay. Heaps of it.", reaction: "hooray" },
  { match: /where|route|map|plan|trip/i, crew: { name: "Captain Nemo", text: "Wherever your plan says. You have the map!" }, captain: "You plan the route. I just steer.", reaction: "like" },
  { match: /thank|love|cool|great|awesome|nice|wow|fun|❤️/i, crew: { name: "Ned Land", text: "Aw, shucks. You are not so bad yourself." }, captain: "You are kind. Now, back to work!", reaction: "love" },
  { match: /\?\s*$/, crew: { name: "Professor Aronnax", text: "Good question! Let me look it up in my specimen book." }, captain: "A fine question. I will think on it.", reaction: "like" },
];

/** When nothing else matches, the crew take turns, and so does the captain. */
const ROUND: readonly RadioLine[] = [
  { name: "Professor Aronnax", text: "How interesting. Tell me more!" },
  { name: "Ned Land", text: "Ha! Good one." },
  { name: "Conseil", text: "Noted, and filed, sir." },
  { name: "Captain Nemo", text: "Message received. Full speed ahead!" },
];
const CAPTAIN_ROUND = ["Noted. Now, back to the map.", "Hmm. Very interesting.", "Good. Carry on, sailor!"] as const;
const CALLER_ROUND = ["Blub! 🫧", "I like you. I will give you a big hug soon.", "🦑💕", "Hee hee. You are funny."] as const;

/** How many messages you send before someone new calls anyway. */
export const CALL_AFTER = 3;

/** The radio's answer to your `count`th message (from 0) on a conversation. Scripted: no network, no AI. */
export function radioReply(text: string, channel: ChannelId, count: number): RadioReply {
  if (channel === "caller") return { line: { name: RADIO.caller, text: CALLER_ROUND[count % CALLER_ROUND.length]! }, reaction: "love", call: false };
  const rule = RULES.find((each) => each.match.test(text));
  const call = Boolean(rule?.call) || count + 1 >= CALL_AFTER;
  if (channel === "captain") return { line: { name: "Captain Nemo", text: rule?.captain ?? CAPTAIN_ROUND[count % CAPTAIN_ROUND.length]! }, reaction: rule?.reaction ?? "like", call };
  return { line: rule?.crew ?? ROUND[count % ROUND.length]!, reaction: rule?.reaction ?? "like", call };
}

/** Every line the radio can say, for the readability check. */
export function allRadioText(): string[] {
  return [
    ...Object.values(RADIO).flatMap((value) => (typeof value === "string" ? [value] : [])),
    RADIO.list(RADIO.crew),
    ...Object.values(RADIO.presence).map((each) => each.label),
    ...REACTIONS.map((reaction) => reaction.label),
    ...Object.values(RADIO_START).flatMap((lines) => lines.map((line) => line.text)),
    ...RULES.flatMap((rule) => [rule.crew.text, rule.captain]),
    ...ROUND.map((line) => line.text),
    ...CAPTAIN_ROUND,
    ...CALLER_ROUND,
  ];
}
