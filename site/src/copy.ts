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
 * the agents building it; the hero sets them as one flowing headline. The eyebrow is the name alone: apps
 * ship with HX, so it no longer says "under construction" (Ari, 2026-10-30). The site is Ouro UI,
 * whose two halves are HX and AX (coordinator's ruling, 2026-11-08). The header already names Ouro UI, so the
 * eyebrow names its two halves instead of saying the name twice.
 */
export const VOYAGE_HERO = {
  eyebrow: "Ouro HX + Ouro AX",
  title: ["Feels right to the people using it.", "Obvious to the agents building it."],
  subline: claim("A design system for people and agents. It renders A2UI and adds what A2UI leaves to the app: one action declaration that becomes a button, a CLI command, MCP and WebMCP tools and an App Intent, with person-only actions refused to agents and an X-ray to check it.", {
    source: [
      { spec: "https://github.com/ourostack/ouro-ui-core/blob/20d06ff7ff7ffb3c50e33add65959608148edcd6/docs/guides/actions.md#L5" },
      { spec: "https://github.com/ourostack/ouro-ui-core/blob/20d06ff7ff7ffb3c50e33add65959608148edcd6/docs/guides/actions.md#L45" },
      { test: "registry/ouro/components/ouro/a2ui-surface/a2ui-surface.test.tsx::A2UISurface > renders the agent's card with HX components, its data bound and its template repeated" },
      { test: "registry/ouro/ax/xray.test.mts::the kit's example tool conforms, and the X-ray acts on nothing" },
    ],
    verify: [
      { urlOk: "https://github.com/ourostack/ouro-ui-core/blob/20d06ff7ff7ffb3c50e33add65959608148edcd6/docs/guides/actions.md#L5" },
      { urlOk: "https://github.com/ourostack/ouro-ui-core/blob/20d06ff7ff7ffb3c50e33add65959608148edcd6/docs/guides/actions.md#L45" },
      { testExists: "registry/ouro/components/ouro/a2ui-surface/a2ui-surface.test.tsx::A2UISurface > renders the agent's card with HX components, its data bound and its template repeated" },
      { testExists: "registry/ouro/ax/xray.test.mts::the kit's example tool conforms, and the X-ray acts on nothing" },
    ],
  }),
  /**
   * The lede on a phone, where the porthole must start on the first screen (site/e2e/stage-pacing.spec.ts), so it is no
   * taller than the old one: the same claim, short, with the benchmark and the reviews linked after it.
   */
  phoneSubline: claim("A design system for people and agents that renders A2UI and adds one action model for both.", {
    source: [
      { spec: "https://github.com/ourostack/ouro-ui-core/blob/20d06ff7ff7ffb3c50e33add65959608148edcd6/docs/guides/actions.md#L5" },
      { test: "registry/ouro/components/ouro/a2ui-surface/a2ui-surface.test.tsx::A2UISurface > renders the agent's card with HX components, its data bound and its template repeated" },
    ],
    verify: [
      { urlOk: "https://github.com/ourostack/ouro-ui-core/blob/20d06ff7ff7ffb3c50e33add65959608148edcd6/docs/guides/actions.md#L5" },
      { testExists: "registry/ouro/components/ouro/a2ui-surface/a2ui-surface.test.tsx::A2UISurface > renders the agent's card with HX components, its data bound and its template repeated" },
    ],
  }),
  /** Under the subline: where to check the claim, and the platform gap, said plainly. */
  links: {
    benchmark: { label: "Agent benchmark", href: "/docs/agent-interfaces/" },
    reviews: { label: "Model reviews", href: "/docs/model-reviews/" },
    platforms: {
      label: claim("No Android or Windows kit yet", {
        source: { file: "docs/platforms/README.md" },
        verify: [
          { fileLine: "docs/platforms/README.md", pattern: "\\| For Android \\| none yet" },
          { fileLine: "docs/platforms/README.md", pattern: "\\| For Windows \\| none yet" },
        ],
      }),
      href: "/docs/platforms/",
    },
  },
} as const;

export const SHADCN_BADGE = claim("Works with shadcn/ui", {
  source: { file: "scripts/install-test.sh" },
  verify: [{ ciJob: "install" }, { fileLine: "scripts/install-test.sh", pattern: "Stock shadcn button beside Ouro's" }],
});

export const SHADCN_LINE =
  "Installs with the shadcn CLI, uses shadcn's theme tokens, and sits alongside the shadcn/ui components you already have.";

/**
 * Ouro UI's two halves, named under the hero's install (hero.tsx): HX for the people using a screen,
 * AX for the agents using a tool. Each says what it is for, not what it ships; HX's row points at the
 * page you are on, AX's leads to the Ouro AX page.
 */
export const HALVES = {
  title: "Ouro UI has a half for people and a half for agents",
  hx: { name: "Ouro HX", href: "/docs/", expansion: "human experience", line: "For the screens people use, like this one." },
  ax: { name: "Ouro AX", href: "/ax/", expansion: "agent experience", line: "For the tools agents use, like a CLI or an MCP server." },
} as const;

/** The home page's Ouro AX section (home-reference.tsx), which leads to the Ouro AX page (ax/ax-page.tsx). */
export const AX_SECTION = {
  eyebrow: "Ouro AX",
  title: "Obvious to the agents using it, too",
  intro:
    "A standard of checkable claims, a kit that meets them and an X-ray that checks any command line, HTTP API or MCP server against them.",
  morning: "Spend a morning with an agent",
  guide: "Read the guide",
} as const;
