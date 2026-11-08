/**
 * The storybook world (ourostack/.github, brand/): Ouro's meadow at dawn, each product's friends in a
 * scene of their own. site/public/brand/storybook/ holds byte-for-byte copies of the scenes this site
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
   * The colour along the scene's top edge, left to right in fifths (sampled from the 1536px header),
   * so the sky above the picture carries on from it without a seam.
   */
  sky: readonly [string, string, string, string, string];
  /** The 1536px header's height: 576, or 512 for the whole-world panorama. */
  height: 576 | 512;
  /**
   * The phone crop's height at 768px wide: each crop is cut to hold the whole of its scene's friends,
   * so its shape is its own (ourostack/.github brand/AGENTS.md), and the picture follows it.
   */
  phoneHeight: number;
  /** Where the sun rises in the wide scene, in percent across and down, for its glow. */
  sun: readonly [number, number];
}

export const SCENES: Record<SceneName, Scene> = {
  "ouro-hx": {
    alt: "A woman and a little white robot build a big green switch panel on a wooden workbench at dawn, while Ouro, a smiling green snake curled into an O, watches from the glowing trail.",
    sky: ["#cfc0d0", "#c4c1da", "#cfcbdb", "#faceb4", "#fbd9b6"],
    height: 576,
    phoneHeight: 432,
    sun: [86, 30],
  },
  "ouro-ui-apple": {
    alt: "A little white robot leans over a phone, a tablet and a laptop on a garden bench, each showing the same green card with a switch, while Ouro smiles beside them.",
    sky: ["#fcbdac", "#f9bda6", "#f9b39e", "#fdc794", "#fde893"],
    height: 576,
    phoneHeight: 432,
    sun: [87, 11],
  },
  "ouro-ui-core": {
    alt: "Six jars of paint on a bench pour glowing ribbons of colour onto a phone, a laptop and a tablet below, all painted to match, while Ouro watches the pour.",
    sky: ["#edb6b1", "#f7c7b1", "#fac0a5", "#fcd693", "#fdec95"],
    height: 576,
    phoneHeight: 576,
    sun: [86, 13],
  },
  "playwright-focus-proof": {
    alt: "One morning in the meadow: a woman works on her laptop in an armchair, two little robots type on laptops of their own at a picnic table, a tall garden clock keeps the time, and Ouro looks on.",
    sky: ["#dac0c6", "#d1c5cf", "#d3ceda", "#f9cfb6", "#fbd6a7"],
    height: 576,
    phoneHeight: 320,
    sun: [87, 28],
  },
  "ouroboros-skills": {
    alt: "A little robot reads an unrolled scroll beside a bookshelf full of ribboned scrolls and books, while Ouro hands another scroll to a second robot.",
    sky: ["#ebb7ae", "#f1c3a0", "#fcc4a8", "#fcda9d", "#fdeca2"],
    height: 576,
    phoneHeight: 384,
    sun: [86, 16],
  },
  ourostack: {
    alt: "Ouro's whole world at dawn: Ouro curled on the glowing trail, a toy factory puffing steam, a desk under a blossom tree, a reading lectern, a green card on an easel, two friends and two robots waving from a picnic blanket, and robot sheep grazing by a shepherd's crook.",
    sky: ["#f8bcad", "#fabc9f", "#fbb59b", "#fdcb9d", "#fde99e"],
    height: 512,
    phoneHeight: 384,
    sun: [86, 12],
  },
};

/** Where the copies live under the site's base. */
export const STORYBOOK = "/brand/storybook/";

/** A page's link-preview card: a scene with the page's title set in its sky (site/scripts/og-cards.mts draws them). */
export interface Card {
  /** The file under site/public/og/. */
  file: string;
  scene: SceneName;
  /** The small line above the title. */
  kicker: string;
  title: string;
  /** Which side of the sky is clear enough for the words. */
  side: "left" | "right";
  /** How wide the words may run, in pixels of the 1200px card: no further than the clear sky. */
  width?: number;
}

const APPLE = "Ouro UI for Apple";

/** Every card, by the page that shows it. A docs page shows the docs card. */
export const CARDS: Record<string, Card> = {
  "/": { file: "home.jpg", scene: "ouro-hx", kicker: "Ouro HX", title: "Feels right to the people using it. Obvious to the agents building it.", side: "right" },
  "/nautilus/": { file: "nautilus.jpg", scene: "ouroboros-skills", kicker: "A story in chapters", title: "The Nautilus", side: "right" },
  "/ax/": { file: "ax.jpg", scene: "playwright-focus-proof", kicker: "Ouro AX", title: "A morning with an agent", side: "left" },
  "/apple/": { file: "apple.jpg", scene: "ouro-ui-apple", kicker: APPLE, title: "Same manners, now in Swift.", side: "left", width: 400 },
  "/apple/hx/": { file: "apple-hx.jpg", scene: "ouro-ui-apple", kicker: APPLE, title: "Ouro HX for Apple", side: "left", width: 400 },
  "/apple/feel/": { file: "apple-feel.jpg", scene: "ouro-ui-apple", kicker: APPLE, title: "Ouro Feel", side: "left", width: 400 },
  "/apple/ax/": { file: "apple-ax.jpg", scene: "ouro-ui-apple", kicker: APPLE, title: "Ouro AX for Apple", side: "left", width: 400 },
  "/apple/reins/": { file: "apple-reins.jpg", scene: "ouro-ui-apple", kicker: APPLE, title: "Ouro Reins", side: "left", width: 400 },
  "/apple/start/": { file: "apple-start.jpg", scene: "ouro-ui-apple", kicker: APPLE, title: "Get started", side: "left", width: 400 },
  "/docs/": {
    file: "docs.jpg",
    scene: "ouro-ui-core",
    kicker: "Ouro HX docs",
    title: claim("Every component, with a live demo to poke.", {
      source: [{ file: "site/src/site.test.tsx" }, { file: "site/src/docs/demos.tsx" }],
      verify: { testExists: "site/src/site.test.tsx::docs > has a page for every registry item at docs/<name>" },
    }),
    side: "left",
  },
};

/** The card a page's link preview shows: its own, or the docs card for every docs page (and the 404). */
export function cardFor(path: string): Card {
  return CARDS[path] ?? CARDS["/docs/"]!;
}

/** What a card shows, for its alt text: its words, then its scene. */
export function cardAlt(card: Card): string {
  return `${card.kicker}: ${card.title} ${SCENES[card.scene].alt}`;
}

/** The srcsets a scene's picture offers: the phone crop, and the wide scene, each in AVIF and WebP. */
export function sceneSources(scene: SceneName, at: (path: string) => string = (path) => `${STORYBOOK}${path}`) {
  const phone = (type: "avif" | "webp") => `${at(`phone/${scene}-384.${type}`)} 384w, ${at(`phone/${scene}-768.${type}`)} 768w`;
  const wide = (type: "avif" | "webp") =>
    `${at(`scenes/${scene}-640.${type}`)} 640w, ${at(`scenes/${scene}-960.${type}`)} 960w, ${type === "avif" ? at(`scenes/${scene}-1536.avif`) : at(`headers/${scene}.webp`)} 1536w`;
  return { phone, wide };
}
