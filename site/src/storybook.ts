/**
 * The storybook world (ourostack/.github, brand/): Ouro's meadow at dawn, each product's friends in a
 * scene of their own, and the same scene at night for dark mode. site/public/brand/storybook/ holds byte-for-byte copies of the scenes this site
 * shows, listed with their checksums in its provenance.json (site/scripts/brand.test.mjs holds them
 * to it). Which page opens on which scene, and which card its link preview shows, is decided here.
 */

import { claim } from "../../registry/ouro/lib/ouro/claims.ts";

/** The scenes this site shows. */
export type SceneName =
  | "ouro-hx"
  | "ouro-ui-apple"
  | "ouro-ui-windows"
  | "ouro-ui-android"
  | "ouro-ui-core"
  | "playwright-focus-proof"
  | "ouroboros-skills"
  | "ourostack"
  | "nautilus"
  | "nautilus-shipyard"
  | "nautilus-library"
  | "nautilus-squid"
  | "nautilus-shipyard-afloat"
  | "nautilus-library-planned"
  | "nautilus-squid-free"
  | "nautilus-porthole"
  | "nautilus-porthole-free"
  | "nautilus-organ"
  | "nautilus-organ-playing"
  | "nautilus-organ-asleep"
  | "actions"
  | "composed-ui"
  | "xray"
  | "hackamore";

export interface Scene {
  /** What the picture shows, for a screen reader: the friends in it and what they are up to. */
  alt: string;
  /**
   * The colour along the scene's top edge, left to right in fifths (sampled from the 1536px header), for the address's
   * pill on a link-preview card (site/scripts/og-cards.mts).
   */
  sky: readonly [string, string, string, string, string];
  /** The 1536px header's height: 576, 512 for the whole-world panorama, or 1024 for a 3:2 picture shown whole (the Nautilus chapters). */
  height: 576 | 512 | 1024;
  /**
   * The phone crop's height at 768px wide: each crop is cut to hold the whole of its scene's friends,
   * so its shape is its own (ourostack/.github brand/AGENTS.md), and the picture follows it.
   */
  phoneHeight: number;
  /**
   * Where a short band of the wide scene sits, in percent down (CSS object-position): a docs page opens on a 3:1 band,
   * eight ninths of a 576px scene's height (a 512px panorama shows whole), framed so its friends' heads are whole and
   * Ouro's ring too, his head to the bottom of his coil, by day and at night.
   */
  band: number;
  /**
   * Where a page opener's shorter crop sits, in percent down (CSS object-position), when the default (42) would cut
   * the picture's top edge through mountains or a friend's head rather than sky.
   */
  shortY?: number;
  /**
   * The same scene at night, shown in dark mode (files named `<scene>-dark`, at the same widths): its phone crop's
   * height, which is its own where the night crop was framed differently. It shares the scene's `alt` unless that names
   * the time of day, when it has its own.
   */
  night: { phoneHeight: number; alt?: string };
}

export const SCENES: Record<SceneName, Scene> = {
  "ouro-hx": {
    alt: "On a mountain cabin's deck in golden morning light, a faceless glass person in a navy jacket stands at a walnut test board beside a glowing glass push button he has just pressed, while a small coral robot on a crate reads the brass gauge, and Ouro, a smiling emerald snake curled into an O, rests on a folded towel.",
    sky: ["#84563b", "#885e48", "#cadaec", "#d9e4f1", "#d5e5f5"],
    height: 512,
    phoneHeight: 384,
    band: 27,
    night: {
      phoneHeight: 384,
      alt: "On a mountain cabin's deck at night under a full moon, a faceless glass person in a navy jacket stands at a walnut test board beside a softly glowing glass push button, while a small coral robot on a crate, its eyes glowing, reads the brass gauge, and Ouro, a smiling emerald snake curled into an O, rests on a folded towel.",
    },
  },
  "ouro-ui-apple": {
    alt: "In a calm, bright studio by a window onto a city park, a small white robot in a blue apron checks the same settings card on a phone, a tablet and a laptop lined up on a long pale table, while Ouro, a smiling emerald snake curled into an O, watches from a folded cloth.",
    sky: ["#e6ecf4", "#dce5f3", "#e7eefa", "#e5eaf2", "#e3e8ef"],
    height: 576,
    phoneHeight: 576,
    band: 16,
    shortY: 20,
    night: { phoneHeight: 576, alt: "At night under a crescent moon, in a calm studio by a window onto a city park with a few lit windows across it, a small white robot in a blue apron checks the same settings card on a phone, a tablet and a laptop lined up on a long pale table, while Ouro, a smiling emerald snake curled into an O, watches from a folded cloth." },
  },
  "ouro-ui-windows": {
    alt: "In a log cabin study, a glass person at a desk points at a settings card on a monitor, while a small mint robot swings open a window pane and Ouro, a smiling emerald snake curled into an O, basks on the sill.",
    sky: ["#622c0c", "#ca897b", "#ecb3a1", "#e9bf92", "#dda778"],
    height: 512,
    phoneHeight: 432,
    band: 40,
    night: { phoneHeight: 432 },
  },
  "ouro-ui-android": {
    alt: "In an orchard where phones grow like fruit, a small mint robot on a stepladder lifts one down to check it, a glass person reaches for another, and Ouro, a smiling emerald snake curled into an O, rests in a basket of picked phones.",
    sky: ["#c1a8d1", "#bc9c85", "#8b7120", "#f8ccab", "#fdd8b7"],
    height: 512,
    phoneHeight: 461,
    band: 40,
    night: { phoneHeight: 461 },
  },
  "ouro-ui-core": {
    alt: "In a skylit design studio, a small robot and Ouro, a smiling emerald snake curled into an O, rest on a towel at a long worktable with fabric swatches.",
    sky: ["#bcb2b0", "#c1baba", "#d7e4f0", "#b4ada2", "#d5dce6"],
    height: 576,
    phoneHeight: 576,
    band: 60,
    night: { phoneHeight: 576, alt: "At night in a skylit design studio under warm pendant lamps and a crescent moon, a small robot and Ouro, a smiling emerald snake curled into an O, rest on a towel at a long worktable with fabric swatches." },
  },
  "playwright-focus-proof": {
    alt: "Inside a sleek high-speed train in low golden morning sun, two small robots type at their laptops across a window table while a faceless glass person in a sage hoodie leans back across the aisle, hands in pocket, with Ouro the green snake curled on the seat beside them, under a station clock on the end wall.",
    sky: ["#c2a379", "#cfa079", "#c29874", "#b8a593", "#e2dada"],
    height: 576,
    phoneHeight: 384,
    band: 100,
    night: {
      phoneHeight: 384,
      alt: "Inside a sleek high-speed train late at night under warm ceiling lights, two small robots type at their laptops across a window table while a faceless glass person in a sage hoodie leans back across the aisle, hands in pocket, with Ouro the green snake curled on the seat beside them, under a station clock on the end wall.",
    },
  },
  "ouroboros-skills": {
    alt: "In a bright kitchen on a sunny morning, a small blue robot in an apron reads a blank recipe card while a small apricot robot in a chef's cap whisks batter under a white pendant lamp, and Ouro the green snake watches from a folded tea towel.",
    sky: ["#937f64", "#c8bab0", "#cededb", "#cfcdbf", "#d3d7b2"],
    height: 576,
    phoneHeight: 576,
    band: 25,
    shortY: 8,
    night: {
      phoneHeight: 576,
      alt: "The same kitchen at night, lit by the white pendant lamp over the counter, with a deep blue night sky in the windows: a small blue robot in an apron reads a blank recipe card while a small apricot robot in a chef's cap whisks batter, and Ouro the green snake watches from a folded tea towel.",
    },
  },
  ourostack: {
    alt: "On a meadow hillside at dawn, two faceless glass friends wrapped in plaid throws share a picnic while a jade robot pours their tea and an amber robot lifts a loaf from the hamper, and Ouro, a smiling emerald snake curled into an O, dozes on a quilt beside them.",
    sky: ["#adbfe6", "#b6caeb", "#b8ceec", "#c6b29a", "#cbd4e7"],
    height: 512,
    phoneHeight: 384,
    band: 65,
    night: {
      phoneHeight: 384,
      alt: "On a meadow hillside at night, two faceless glass friends wrapped in plaid throws share a picnic while a jade robot pours their tea and an amber robot lifts a loaf from the hamper, and Ouro, a smiling emerald snake curled into an O, dozes on a quilt beside them.",
    },
  },
  nautilus: {
    alt: "At sunrise, seen half above and half below a calm sea, Captain Nemo's long iron submarine lies surfaced: a faceless glass person in a navy pea coat stands in its open hatch, a small sea-blue robot in a striped jersey and red cap looks through a brass spyglass beside the lens-windowed wheelhouse, Ouro, a smiling emerald snake curled into an O, rests on the deck, and under the water a small coral robot in a brass diving helmet swims beside the hull with a lamp.",
    sky: ["#75a8e7", "#83b0ea", "#97baea", "#adc2e8", "#b5c0e1"],
    height: 512,
    phoneHeight: 384,
    band: 40,
    night: {
      phoneHeight: 384,
      alt: "At night under a full moon, seen half above and half below a calm sea, Captain Nemo's long iron submarine lies surfaced: a faceless glass person in a navy pea coat stands in its open hatch, a small sea-blue robot in a striped jersey and red cap looks through a brass spyglass beside the wheelhouse, whose lens windows glow amber, Ouro, a smiling emerald snake curled into an O, rests on the deck, and under the water a small coral robot in a brass diving helmet swims beside the hull, its lamp lit.",
    },
  },
  "nautilus-shipyard": {
    alt: "In a hidden volcanic cove at dawn, the iron submarine Nautilus sits nearly finished on its timber slipway: a small amber robot in goggles and a leather apron hammers a rivet from the scaffold, a small teal robot in a cap pumps the bellows at a glowing brazier, a faceless glass person in a long charcoal coat looks up at the hull, and Ouro, a smiling emerald snake curled into an O, dozes on a coil of rope.",
    sky: ["#a5744d", "#55463b", "#524a49", "#bec4df", "#4b4c50"],
    height: 1024,
    phoneHeight: 512,
    band: 50,
    night: {
      phoneHeight: 512,
      alt: "In a hidden volcanic cove at night, with the full moon in the sea arch, the iron submarine Nautilus sits nearly finished on its timber slipway: a small amber robot in goggles hammers a rivet from the scaffold, a small teal robot pumps the bellows at the glowing brazier, a faceless glass person in a long charcoal coat looks up at the hull, and Ouro, a smiling emerald snake curled into an O, dozes on a coil of rope.",
    },
  },
  "nautilus-library": {
    alt: "Down a long aisle of the Nautilus's walnut library, between shelves of books that run to a small porthole at the far end, a faceless glass person in a green velvet jacket sits in a leather wingback chair under a reading lamp with a big closed atlas on their lap, deciding the route, while a small sea-blue robot turns the globe toward them, a small lilac robot on the library ladder carries down a rolled sea chart, and Ouro, a smiling emerald snake curled into an O, watches from the chair's arm.",
    sky: ["#42190b", "#300f05", "#290901", "#2b0d05", "#3d180b"],
    height: 1024,
    phoneHeight: 512,
    band: 50,
    night: {
      phoneHeight: 512,
      alt: "The Nautilus's library aisle at night, lit by a single reading lamp: a faceless glass person in a green velvet jacket sits in a leather wingback chair with a big closed atlas on their lap, a small sea-blue robot turns the globe, a small lilac robot on the ladder carries a rolled sea chart, Ouro, a smiling emerald snake curled into an O, watches from the chair's arm, and the small porthole at the aisle's end shows the dark night sea.",
    },
  },
  "nautilus-squid": {
    alt: "In the Nautilus's great saloon, a giant squid rests one huge, gentle eye against the oval window, curious, while a small coral robot in a yellow raincoat stands on the sofa's back with its mitten on the glass to meet it, a faceless glass person in a navy coat watches calmly from behind the sofa, and Ouro, a smiling emerald snake curled into an O, looks on from the sofa's arm.",
    sky: ["#1e0c09", "#230c06", "#260f0a", "#291009", "#26110c"],
    height: 1024,
    phoneHeight: 512,
    band: 50,
    night: {
      phoneHeight: 512,
      alt: "In the Nautilus's great saloon at night, lit by its brass wall lamps, a softly glowing giant squid rests one huge, gentle eye against the oval window, while a small coral robot in a yellow raincoat stands on the sofa's back with its mitten on the glass, a faceless glass person in a navy coat watches calmly from behind the sofa, and Ouro, a smiling emerald snake curled into an O, looks on from the sofa's arm.",
    },
  },
  // The chapter pictures' second states, which the page cross-fades to as the voyage goes: each is its chapter's picture
  // with only what changed redrawn, so nothing else moves when it fades in.
  "nautilus-shipyard-afloat": {
    alt: "The same hidden cove at dawn, the Nautilus launched: she floats on the calm water out by the sea arch, the slipway's trestles stand empty, the small amber robot in goggles stands on one with its hammer at its side to watch her go, the teal robot works the bellows at the brazier, the glass person in the charcoal coat looks on, and Ouro dozes on his coil of rope.",
    sky: ["#503f29", "#4a3d30", "#554e49", "#bfc5de", "#4e4f50"],
    height: 1024,
    phoneHeight: 512,
    band: 50,
    night: {
      phoneHeight: 512,
      alt: "The same hidden cove at night under the full moon, the Nautilus launched: she floats out by the sea arch with her wheelhouse windows lit amber, the slipway's trestles stand empty, the small amber robot stands on one to watch her go, the teal robot works the bellows at the glowing brazier, the glass person looks on, and Ouro dozes on his coil of rope.",
    },
  },
  "nautilus-library-planned": {
    alt: "The Nautilus's walnut library aisle with the voyage planned: the glass person in the green velvet jacket has the atlas open on their lap at a sea chart with a dotted red route across it, the small sea-blue robot holds the globe with the same red route winding round it, the lilac robot carries a rolled chart down the ladder, and Ouro watches from the chair's arm.",
    sky: ["#431a0c", "#311006", "#290a02", "#2c0e06", "#3e190b"],
    height: 1024,
    phoneHeight: 512,
    band: 50,
    night: {
      phoneHeight: 512,
      alt: "The Nautilus's library aisle at night, lit by a single reading lamp, with the voyage planned: the atlas lies open on the glass person's lap at a sea chart with a dotted red route, the sea-blue robot holds the globe with the same route round it, the lilac robot carries a chart down the ladder, and Ouro watches from the chair's arm.",
    },
  },
  "nautilus-squid-free": {
    alt: "The Nautilus's great saloon after the squid has let go: the oval window shows only open blue-green sea, a shoal of silver fish and a last cloud of ink far off, while the small coral robot in the yellow raincoat keeps its mitten up to the glass, the glass person in the navy coat watches from behind the sofa, and Ouro looks on from the sofa's arm.",
    sky: ["#1f0c09", "#240c07", "#270f0b", "#29100a", "#27110c"],
    height: 1024,
    phoneHeight: 512,
    band: 50,
    night: {
      phoneHeight: 512,
      alt: "The Nautilus's great saloon at night after the squid has let go: the oval window shows only the dark night sea and a last cloud of ink far off, while the small coral robot in the yellow raincoat keeps its mitten up to the glass, the glass person watches from behind the sofa, and Ouro looks on from the sofa's arm.",
    },
  },
  // The encounter's porthole: the sea outside the glass, of which the page shows the centre circle inside its brass ring.
  "nautilus-porthole": {
    alt: "Through the porthole glass, a giant rose-coloured squid holds fast to the hull, its big, gentle eye peering in and its tentacle tips curled against the glass, in clear blue-green water with shafts of light from above.",
    sky: ["#0e809d", "#63e1ee", "#6f85a2", "#2e6b94", "#036685"],
    height: 1024,
    phoneHeight: 512,
    band: 50,
    night: {
      phoneHeight: 512,
      alt: "Through the porthole glass at night, a giant rose-coloured squid holds fast to the hull, lit warm by the ship's lamps, its big, gentle eye peering in and its tentacle tips curled against the glass, in the dark night sea.",
    },
  },
  "nautilus-porthole-free": {
    alt: "Through the porthole glass, the squid has let go: only a cloud of its ink drifts in the blue-green water, a shoal of silver fish swims by, and far below the squid swims off into the deep.",
    sky: ["#0e90a8", "#72edf4", "#58e2f1", "#1fb8d6", "#03738c"],
    height: 1024,
    phoneHeight: 512,
    band: 50,
    night: {
      phoneHeight: 512,
      alt: "Through the porthole glass at night, the squid has let go: a cloud of its ink drifts in the lamplit dark water, silver fish glint by, and far below the squid swims off, glowing faintly rose.",
    },
  },
  // The saloon's organ, quiet and then playing; the squid comes back to the window to listen.
  "nautilus-organ": {
    alt: "In the Nautilus's great saloon, the glass person in the navy coat sits at the walnut pipe organ with one glass hand on the keys, a small lilac robot in a leather apron grips the bellows handle, Ouro waits on top of the organ's case, and the great oval window beside them shows only the empty sea.",
    sky: ["#1f1211", "#301107", "#5b320f", "#6d3c13", "#331206"],
    height: 1024,
    phoneHeight: 512,
    band: 50,
    night: {
      phoneHeight: 512,
      alt: "The Nautilus's great saloon at night, its lamps turned low: the glass person in the navy coat sits at the walnut pipe organ with one glass hand on the keys, a small lilac robot grips the bellows handle, Ouro waits on top of the organ's case, and the great oval window shows only the dark sea.",
    },
  },
  "nautilus-organ-playing": {
    alt: "The captain plays the Nautilus's great organ: its brass pipes glow warm gold, the small lilac robot pumps the bellows, Ouro listens from the organ's top, and at the great oval window the giant squid has come back, one gentle eye to the glass, to listen.",
    sky: ["#1f1211", "#301107", "#995712", "#a25f14", "#502107"],
    height: 1024,
    phoneHeight: 512,
    band: 50,
    night: {
      phoneHeight: 512,
      alt: "The captain plays the Nautilus's great organ at night: its glowing brass pipes are the brightest light in the dim saloon, the small lilac robot pumps the bellows, Ouro listens from the organ's top, and at the great oval window the giant squid has come back, one gentle eye to the glass, to listen.",
    },
  },
  "nautilus-organ-asleep": {
    alt: "The captain plays the Nautilus's great organ softly: its brass pipes glow warm gold, the small lilac robot pumps the bellows, Ouro listens from the organ's top, and at the great oval window the giant squid rests against the glass with its eye closed, fast asleep.",
    sky: ["#1f1212", "#301107", "#995713", "#a25e15", "#502108"],
    height: 1024,
    phoneHeight: 512,
    band: 50,
    night: {
      phoneHeight: 512,
      alt: "The captain plays the Nautilus's great organ softly at night: its glowing brass pipes are the brightest light in the dim saloon, the small lilac robot pumps the bellows, Ouro listens from the organ's top, and at the great oval window the giant squid rests against the glass with its eye closed, fast asleep.",
    },
  },
  actions: {
    alt: "At a market stall in warm light, a faceless glass person in a mitten reaches over a brass bell on the counter, a small saffron robot behind the counter waits with its hand ready, and Ouro, a smiling emerald snake curled into an O, rests on a crate of apples.",
    sky: ["#cba487","#c99e7d","#c59a7a","#c09679","#c79a7b"],
    height: 576,
    phoneHeight: 384,
    band: 50,
    night: { phoneHeight: 384 },
  },
  "composed-ui": {
    alt: "In an easel studio, a faceless glass person holds a mug and watches while a small lilac robot slides a blank glass card into the easel's slot, a tray of star, circle and blob glass pieces beside them, and Ouro, a smiling emerald snake curled into an O, rests on top of the easel.",
    sky: ["#eed0a6","#f0c798","#a87443","#a17959","#784b2c"],
    height: 576,
    phoneHeight: 512,
    band: 50,
    night: { phoneHeight: 512 },
  },
  xray: {
    alt: "In an apothecary, a faceless glass person holds a brass lens up to a tall cabinet of small drawers and sees emerald cogs inside, a small sea-blue robot peeks round the side of the cabinet, and Ouro, a smiling emerald snake curled into an O, rests on top.",
    sky: ["#e9cb8d","#e5ca9b","#d6b189","#cba884","#be9b78"],
    height: 576,
    phoneHeight: 384,
    band: 50,
    night: { phoneHeight: 384 },
  },
  hackamore: {
    alt: "In a pear orchard in blossom, a small pink robot leads a carved carousel horse on a wheeled platform by a rope hackamore instead of a bit, while Ouro, a smiling emerald snake curled into an O, sits in the saddle.",
    sky: ["#dfb970","#f5ddb0","#f3dcc2","#e1cbb3","#957a41"],
    height: 576,
    phoneHeight: 512,
    band: 50,
    night: { phoneHeight: 512 },
  },
};

/** Where the copies live under the site's base. */
export const STORYBOOK = "/brand/storybook/";

/** A page's link-preview card: the page's words on a plain band above a scene, never on it (site/scripts/og-cards.mts draws them). */
export interface Card {
  /** The file under site/public/og/. */
  file: string;
  scene: SceneName;
  /** The small line above the title. */
  kicker: string;
  title: string;
  /** The title's size in pixels, where the default 48 would wrap it onto a third line in the band. */
  size?: number;
  /**
   * Which stretch of the wide 1536px header to show, left to right, drawn across the card's width under a band of the
   * page's plain background that holds the words and the site's address; the whole header by default.
   */
  crop?: { from: number; to: number };
}

const APPLE = "Ouro UI for Apple";

/** Every card, by the page that shows it. A docs page shows the docs card. */
export const CARDS: Record<string, Card> = {
  "/": { file: "home.jpg", scene: "ouro-hx", kicker: "Ouro UI", title: claim("Delightful interfaces, by agents, for everyone.", { source: [{ test: "test/conformance/interactions.test.tsx::actions at $width px > $id keeps focus in the page and announces each message once after every action" }, { test: "registry/ouro/ax/xray.test.mts::the kit's example tool conforms, and the X-ray acts on nothing" }], verify: [{ testExists: "test/conformance/interactions.test.tsx::actions at $width px > $id keeps focus in the page and announces each message once after every action" }, { testExists: "registry/ouro/ax/xray.test.mts::the kit's example tool conforms, and the X-ray acts on nothing" }] }) },
  "/nautilus/": { file: "nautilus.jpg", scene: "nautilus", kicker: "A story in chapters", title: "The Nautilus" },
  "/ax/": { file: "ax.jpg", scene: "playwright-focus-proof", kicker: "Ouro AX", title: "A morning with an agent", size: 46 },
  "/apple/": { file: "apple.jpg", scene: "ouro-ui-apple", kicker: APPLE, title: "Same manners, now in Swift.", size: 44 },
  "/apple/hx/": { file: "apple-hx.jpg", scene: "ouro-ui-apple", kicker: APPLE, title: "Ouro HX for Apple" },
  "/apple/feel/": { file: "apple-feel.jpg", scene: "ouro-ui-apple", kicker: APPLE, title: "Ouro Feel" },
  "/apple/ax/": { file: "apple-ax.jpg", scene: "ouro-ui-apple", kicker: APPLE, title: "Ouro AX for Apple" },
  "/apple/reins/": { file: "apple-reins.jpg", scene: "ouro-ui-apple", kicker: APPLE, title: "Ouro Reins" },
  "/apple/start/": { file: "apple-start.jpg", scene: "ouro-ui-apple", kicker: APPLE, title: "Get started" },
  "/hx/": { file: "hx.jpg", scene: "ouro-hx", kicker: "Ouro HX", title: "Components for people's screens", size: 44 },
  "/windows/": { file: "windows.jpg", scene: "ouro-ui-windows", kicker: "Ouro UI for Windows", title: "Same manners, now in WinUI.", size: 44 },
  "/windows/start/": { file: "windows-start.jpg", scene: "ouro-ui-windows", kicker: "Ouro UI for Windows", title: "Get started" },
  "/android/": { file: "android.jpg", scene: "ouro-ui-android", kicker: "Ouro UI for Android", title: "Same manners, now in Compose.", size: 44 },
  "/android/start/": { file: "android-start.jpg", scene: "ouro-ui-android", kicker: "Ouro UI for Android", title: "Get started" },
  "/docs/": {
    file: "docs.jpg",
    scene: "ouro-ui-core",
    kicker: "Ouro HX docs",
    title: claim("Every component, with a live demo to poke.", {
      source: [{ file: "site/src/site.test.tsx" }, { file: "site/src/docs/demos.tsx" }],
      verify: { testExists: "site/src/site.test.tsx::docs > has a page for every registry item at docs/<name>" },
    }),
    size: 40,
    // The og crop cuts Ouro's coil at the right edge (render QA, 2026-11-14): the paint pots to Ouro's tail, whole.
    crop: { from: 40, to: 1456 },
  },
};

/** The card a page's link preview shows: its own, or the docs card for every docs page (and the 404). */
export function cardFor(path: string): Card {
  return CARDS[path] ?? CARDS["/docs/"]!;
}

/** What a card shows, for its alt text: its words, then its scene. */
export function cardAlt(card: Card): string {
  return `${card.kicker}: ${card.title}${/[.!?]$/.test(card.title) ? "" : "."} ${SCENES[card.scene].alt}`;
}

/**
 * The srcsets a scene's picture offers: the phone crop, and the wide scene, each in AVIF and WebP. With `night`, the same
 * scene at night, whose files carry `-dark` after the scene's name.
 */
export function sceneSources(scene: SceneName, at: (path: string) => string = (path) => `${STORYBOOK}${path}`, night = false) {
  const name = night ? `${scene}-dark` : scene;
  const phone = (type: "avif" | "webp") => `${at(`phone/${name}-384.${type}`)} 384w, ${at(`phone/${name}-768.${type}`)} 768w, ${at(`phone/${name}-1152.${type}`)} 1152w, ${at(`phone/${name}-1536.${type}`)} 1536w`;
  const wide = (type: "avif" | "webp") =>
    `${at(`scenes/${name}-640.${type}`)} 640w, ${at(`scenes/${name}-960.${type}`)} 960w, ${type === "avif" ? at(`scenes/${name}-1536.avif`) : at(`headers/${name}.webp`)} 1536w, ${at(`scenes/${name}-3072.${type}`)} 3072w`;
  return { phone, wide, header: at(`headers/${name}.webp`) };
}
