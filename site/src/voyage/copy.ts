/**
 * The words the voyage pages add around the hero, the stage and the chapters (which have copy files
 * of their own): the home page's two ships and the Nautilus's opening. Here, not in site/src/copy.ts,
 * so the docs, which share that file, do not load them.
 */

/**
 * The home page's "two ships" section: two showcases of Ouro HX, not the list of what is built with
 * it. The Nautilus is a story made up to show the parts off; Spoonjoy is a real app you can open and
 * X-ray. No counts (Ari, 2026-10-30). Ari approved the headings on 2026-10-30.
 */
export const TWO_SHIPS = {
  eyebrow: "Showcases",
  title: "Two ships, same parts.",
  intro: "One is a story we made up to show the parts off. The other is a real recipe app you can open and X-ray.",
  nautilus: {
    title: "The Nautilus: built for the story.",
    body: "Captain Nemo is building a submarine in secret. Help him get her ready to dive, with controls built from Ouro HX.",
    open: "Come aboard",
    xray: "X-ray it",
  },
  spoonjoy: {
    title: "Spoonjoy: built for dinner.",
    body: "A recipe app with a look of its own. Open its Test Kitchen, then turn on X-ray to see the Ouro HX parts inside.",
    open: "Try the Test Kitchen",
    xray: "X-ray it",
    source: "Source",
  },
} as const;

/**
 * The Nautilus's own page (/nautilus/): the story's opening and its chapters. routes.ts repeats the
 * intro in the page's description. Written for someone who has never heard of the book: the one
 * nod to it (`book`) says where Nemo comes from, in plain words (Ari, 2026-10-30).
 */
export const NAUTILUS_PAGE = {
  title: "The Nautilus",
  eyebrow: "A story in chapters",
  intro: "Captain Nemo is building a submarine in secret, on a far-off island. Help him get her ready, then sail with him.",
  parts: "The levers, lists and logbooks along the way are Ouro HX components.",
  /** Before and after the book's title, which nautilus.tsx sets as a cited claim. */
  book: ["Nemo and his ship come from Jules Verne’s", "A league is a distance, not a depth. You don’t need to have read it."],
  chaptersLabel: "Chapters",
  chapters: [
    { number: "Chapter I", title: "Build the ship", ready: true, id: "chapter-one" },
    { number: "Chapter II", title: "Plan the voyage", ready: true, id: "chapter-two" },
    { number: "Chapter III", title: "Face the squid", ready: true, id: "chapter-three" },
  ],
  open: "Start here",
  /** The link to each chapter after the first. */
  jump: "Jump in",
  building: "Still being built",
} as const;

/**
 * What an island (a chapter, or the home page's agents and install sections) says when its code
 * would not load: island.tsx shows it in place of the island, and the rest of the page still works.
 */
export const ISLAND_FALLBACK = {
  text: "This part of the page did not load.",
  reload: "Reload the page",
} as const;
