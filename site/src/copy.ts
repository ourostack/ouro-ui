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
  /**
   * What a person choosing a design system gets, in their terms: they pick it, their agent builds with it, and what the
   * agent builds wears their theme, works for every way people use a screen, and asks the person first (Ari, 2026-11-17:
   * "a human will never do that npx"). What is Ouro's own, consent built in, stays in the lede.
   */
  subline: claim(
    "You pick it and your agent builds with it. The screens it makes wear your theme, work by keyboard, touch and screen reader, and ask the person before an agent does anything consequential.",
    {
      source: [
        { test: "test/theme-tokens.test.tsx::theme fixtures > puts a fixture's values in place of the Ouro look, and its @theme inline fonts too" },
        { test: "test/conformance/interactions.test.tsx::actions at $width px > $id keeps focus in the page and announces each message once after every action" },
        { file: "registry/ouro/lib/ouro/touch-target.tsx" },
        { test: "registry/ouro/components/ouro/a2ui-surface/a2ui-surface.test.tsx::A2UISurface > asks the person to confirm a consequential action with what the agent prepared, and sends it only on confirm" },
      ],
      verify: [
        { testExists: "test/theme-tokens.test.tsx::theme fixtures > puts a fixture's values in place of the Ouro look, and its @theme inline fonts too" },
        { testExists: "test/conformance/interactions.test.tsx::actions at $width px > $id keeps focus in the page and announces each message once after every action" },
        { fileLine: "registry/ouro/lib/ouro/touch-target.tsx", pattern: "pointer-coarse" },
        { testExists: "registry/ouro/components/ouro/a2ui-surface/a2ui-surface.test.tsx::A2UISurface > asks the person to confirm a consequential action with what the agent prepared, and sends it only on confirm" },
      ],
    },
  ),
  /** The lede on a phone, short enough to keep the hand-off and the paint on its first screen. */
  phoneSubline: claim("You pick it and your agent builds with it: screens in your theme that ask the person before an agent acts.", {
    source: [
      { test: "test/theme-tokens.test.tsx::theme fixtures > puts a fixture's values in place of the Ouro look, and its @theme inline fonts too" },
      { test: "registry/ouro/components/ouro/a2ui-surface/a2ui-surface.test.tsx::A2UISurface > asks the person to confirm a consequential action with what the agent prepared, and sends it only on confirm" },
    ],
    verify: [
      { testExists: "test/theme-tokens.test.tsx::theme fixtures > puts a fixture's values in place of the Ouro look, and its @theme inline fonts too" },
      { testExists: "registry/ouro/components/ouro/a2ui-surface/a2ui-surface.test.tsx::A2UISurface > asks the person to confirm a consequential action with what the agent prepared, and sends it only on confirm" },
    ],
  }),
  /** Under the subline: where to check the claim, and the platform gap, said plainly. */
  links: {
    benchmark: { label: "Agent benchmark", href: "/docs/agent-interfaces/" },
    reviews: { label: "Model reviews", href: "/docs/model-reviews/" },
    platforms: {
      label: claim("Android: emulators only", {
        source: { file: "docs/platforms/README.md" },
        verify: [{ fileLine: "docs/platforms/README.md", pattern: "checked on emulators because nobody here owns an Android device" }],
      }),
      href: "/docs/platforms/",
    },
  },
} as const;

/**
 * What a person does on the home page: choose Ouro UI and hand it to their coding agent, who does the installing. So the
 * hero gives them one line to paste to the agent, never a command to run; the commands are in the install section, for
 * agents and the curious. The prompt sends the agent to llms.txt, which routes it to the quickstart, a page pattern or
 * the install steps for what it is building.
 */
export const HANDOFF = {
  label: "Hand it to your agent",
  prompt: "Build this app's interface with Ouro UI. Read https://ui.ouroboros.bot/llms.txt first and follow it.",
  caption: "Paste it into your coding agent's chat.",
  commands: { text: "Setting it up yourself? The commands are below.", href: "#install" },
  copied: "Copied. Paste it to your agent.",
} as const;

/**
 * Composed UI, said in the Ouro AX section (home-reference.tsx): agents compose interfaces as data in Ouro's own tree,
 * Ouro HX draws it with each button's consent, and MCP Apps and A2UI are formats the tree speaks, never the format Ouro
 * composes in (decision 2026-11-17-composed-tree-leads in ourostack/ouro-ui-core). MCP Apps comes first because the most
 * hosts render it. Each format links to its renderer's docs, and `guide` to the composed UI guide.
 */
export const WORKS_WITH = {
  label: "Composed UI.",
  lede: claim("Agents compose interfaces as validated data in Ouro's own tree, and Ouro HX draws it on the web and in SwiftUI, with every button following its action's consent class.", {
    source: [
      { test: "registry/ouro/components/ouro/composed-surface/composed-surface.test.tsx::ComposedSurface > draws a tree built in code, which core's validator accepts, with HX components" },
      { test: "registry/ouro/components/ouro/composed-surface/composed-surface.test.tsx::ComposedSurface > asks the person to confirm a consequential action with what the agent prepared, and presses it only on confirm" },
      { spec: "https://github.com/ourostack/ouro-ui-apple/blob/b0580c86da4d81e8d4e07bb8dcaf143a01454cd9/Sources/OuroA2UI/ComposedSurface.swift" },
    ],
    verify: [
      { testExists: "registry/ouro/components/ouro/composed-surface/composed-surface.test.tsx::ComposedSurface > draws a tree built in code, which core's validator accepts, with HX components" },
      { testExists: "registry/ouro/components/ouro/composed-surface/composed-surface.test.tsx::ComposedSurface > asks the person to confirm a consequential action with what the agent prepared, and presses it only on confirm" },
      { urlOk: "https://github.com/ourostack/ouro-ui-apple/blob/b0580c86da4d81e8d4e07bb8dcaf143a01454cd9/Sources/OuroA2UI/ComposedSurface.swift" },
    ],
  }),
  speaks: claim("It speaks", {
    source: [{ test: "registry/ouro/components/ouro/mcp-app/ouro-mcp-app.test.tsx::OuroMcpApp > draws a composed tree in structuredContent.ouro with ComposedSurface" }, { test: "registry/ouro/components/ouro/a2ui-surface/a2ui-surface.test.tsx::A2UISurface > renders the agent's card with HX components, its data bound and its template repeated" }],
    verify: [{ testExists: "registry/ouro/components/ouro/mcp-app/ouro-mcp-app.test.tsx::OuroMcpApp > draws a composed tree in structuredContent.ouro with ComposedSurface" }, { testExists: "registry/ouro/components/ouro/a2ui-surface/a2ui-surface.test.tsx::A2UISurface > renders the agent's card with HX components, its data bound and its template repeated" }],
  }),
  formats: [
    { label: "MCP Apps", href: "/docs/ouro-mcp-app/" },
    { label: "A2UI", href: "/docs/a2ui-surface/" },
  ],
  guide: { label: "How composed UI works", href: "/docs/composed-ui/" },
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
