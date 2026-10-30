/**
 * The words the voyage pages add around the hero, the stage and the chapters (which have copy files
 * of their own): the home page's two ships and the Nautilus's opening. Here, not in site/src/copy.ts,
 * so the docs, which share that file, do not load them.
 */

/**
 * The home page's "two ships" section: the Nautilus, the story built to show Ouro HX off, and
 * Spoonjoy, a real app built with it. Ari approved the headings on 2026-10-30.
 */
export const TWO_SHIPS = {
  eyebrow: "Built with Ouro HX",
  title: "Two ships, same parts.",
  nautilus: {
    title: "The Nautilus: built for the story.",
    body: "Captain Nemo is building a submarine in secret. Help him finish it, with controls built from Ouro HX.",
    open: "Come aboard",
    xray: "X-ray it",
  },
  spoonjoy: {
    title: "Spoonjoy: built for dinner.",
    /** Before and after the component count, which is a claim (site.test.tsx compares it with spoonjoy.json). */
    body: ["A real recipe app, in its own look, built with", "."],
    open: "Try the Test Kitchen",
    xray: "X-ray it",
    source: "Source",
  },
} as const;

/** The Nautilus's own page (/nautilus/): the story's opening and its chapters. routes.ts repeats the intro in the page's description. */
export const NAUTILUS_PAGE = {
  title: "The Nautilus",
  motto: "Mobilis in mobili",
  intro: "Captain Nemo is building a submarine in secret. Help him finish it.",
  chaptersLabel: "Chapters",
  chapters: [
    { number: "Chapter I", title: "Build the ship", ready: true },
    { number: "Chapter II", title: "Plan the voyage", ready: false },
    { number: "Chapter III", title: "Face the squid", ready: false },
  ],
  open: "Start here",
  building: "Still being built",
} as const;
