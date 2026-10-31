import { claim } from "@/registry/ouro/lib/ouro/claims";

/**
 * The words the homepage, the head tags (routes.ts), README.md and site/public/llms.txt
 * share. Change them here; site.test.tsx fails when README.md or llms.txt disagree.
 */
export const HERO_TITLE = "Designed down to the last tap and the last prop.";

export const HERO_SUBLINE =
  "Interactions that feel right to the humans using them. Code that's obvious to the agents building with them.";

/** The homepage's meta description, and the first lines of README.md and llms.txt. */
export const HERO_COPY = `${HERO_TITLE} ${HERO_SUBLINE}`;

/**
 * The voyage hero's words (site-design.md, revision 4), which replace the ones above when the voyage
 * becomes the landing page. The title is two sentences, one for the people using an app and one for
 * the agents building it; the hero sets each on its own lines. The eyebrow is the name alone: apps
 * ship with HX, so it no longer says "under construction" (Ari, 2026-10-30).
 */
export const VOYAGE_HERO = {
  eyebrow: "Ouro HX",
  title: ["Feels right to the people using it.", "Obvious to the agents building it."],
  subline: claim("A React component library you copy into your app and own. Its taps, motion and screen-reader announcements are tested in real browsers.", {
    source: [
      { test: "registry/ouro/components/ouro/accordion/accordion.touch.test.tsx::keeps 44px titles with 16px text on a phone, also in landscape, and opens on tap" },
      { file: "scripts/motion-coverage.mts" },
      { test: "registry/ouro/lib/ouro/testing/announcements.test.tsx::records the text each live region exposes, polite and assertive, once per change" },
      { test: "registry/ouro/components/ouro/copy-button/copy-button.test.tsx::CopyButton > puts the value on the clipboard, says Copied once, calls onCopy and reads Copy again after two seconds" },
    ],
    verify: [
      { fileLine: "registry/ouro/lib/ouro/testing/vitest.ts", pattern: "ouro-touch" },
      { testExists: "registry/ouro/components/ouro/accordion/accordion.touch.test.tsx::keeps 44px titles with 16px text on a phone, also in landscape, and opens on tap" },
      { ciJob: "motion-coverage" },
      { testExists: "registry/ouro/lib/ouro/testing/announcements.test.tsx::records the text each live region exposes, polite and assertive, once per change" },
      { testExists: "registry/ouro/components/ouro/copy-button/copy-button.test.tsx::CopyButton > puts the value on the clipboard, says Copied once, calls onCopy and reads Copy again after two seconds" },
    ],
  }),
} as const;

export const SHADCN_BADGE = claim("Works with shadcn/ui", {
  source: { file: "scripts/install-test.sh" },
  verify: [{ ciJob: "install" }, { fileLine: "scripts/install-test.sh", pattern: "Stock shadcn button beside Ouro's" }],
});

export const SHADCN_LINE =
  "Installs with the shadcn CLI, uses shadcn's theme tokens, and sits alongside the shadcn/ui components you already have.";

/** The home page's Ouro AX section (home-reference.tsx), which leads to the Ouro AX page (ax/ax-page.tsx). */
export const AX_SECTION = {
  eyebrow: "Ouro AX",
  title: "Obvious to the agents using it, too",
  intro:
    "Ouro HX is for the screens people use. Ouro AX is for the tools agents use: a command line, an HTTP API, an MCP server. It's a standard of checkable claims, a kit that meets them and an X-ray that checks any tool against them.",
  morning: "Spend a morning with an agent",
  guide: "Read the guide",
} as const;
