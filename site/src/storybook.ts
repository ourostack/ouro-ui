/**
 * The storybook world (ourostack/.github, brand/): Ouro's meadow at dawn, each product's friends in a
 * scene of their own, and the same scene at night for dark mode. site/public/brand/storybook/ holds byte-for-byte copies of the scenes this site
 * shows, listed with their checksums in its provenance.json (site/scripts/brand.test.mjs holds them
 * to it). Which page opens on which scene, and which card its link preview shows, is decided here.
 */

import { claim } from "../../registry/ouro/lib/ouro/claims.ts";

/** The scenes this site shows. */
export type SceneName = "ouro-hx" | "ouro-ui-apple" | "ouro-ui-core" | "playwright-focus-proof" | "ouroboros-skills" | "ourostack";

export interface Scene {
  /** What the picture shows, for a screen reader: the friends in it and what they are up to. */
  alt: string;
  /**
   * The colour along the scene's top edge, left to right in fifths (sampled from the 1536px header), for the address's
   * pill on a link-preview card (site/scripts/og-cards.mts).
   */
  sky: readonly [string, string, string, string, string];
  /** The 1536px header's height: 576, or 512 for the whole-world panorama. */
  height: 576 | 512;
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
  "/nautilus/": { file: "nautilus.jpg", scene: "ouroboros-skills", kicker: "A story in chapters", title: "The Nautilus" },
  "/ax/": { file: "ax.jpg", scene: "playwright-focus-proof", kicker: "Ouro AX", title: "A morning with an agent", size: 46 },
  "/apple/": { file: "apple.jpg", scene: "ouro-ui-apple", kicker: APPLE, title: "Same manners, now in Swift.", size: 44 },
  "/apple/hx/": { file: "apple-hx.jpg", scene: "ouro-ui-apple", kicker: APPLE, title: "Ouro HX for Apple" },
  "/apple/feel/": { file: "apple-feel.jpg", scene: "ouro-ui-apple", kicker: APPLE, title: "Ouro Feel" },
  "/apple/ax/": { file: "apple-ax.jpg", scene: "ouro-ui-apple", kicker: APPLE, title: "Ouro AX for Apple" },
  "/apple/reins/": { file: "apple-reins.jpg", scene: "ouro-ui-apple", kicker: APPLE, title: "Ouro Reins" },
  "/apple/start/": { file: "apple-start.jpg", scene: "ouro-ui-apple", kicker: APPLE, title: "Get started" },
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
