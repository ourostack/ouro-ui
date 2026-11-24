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
 * The six-word story's second half: what agents build with Ouro UI serves the people using a screen (every story is
 * checked by keyboard, touch and screen reader) and the agents using a tool (X-ray calls it as an agent would).
 */
export const FOR_EVERYONE = claim("by agents, for everyone.", {
  source: [{ test: "test/conformance/interactions.test.tsx::actions at $width px > $id keeps focus in the page and announces each message once after every action" }, { file: "registry/ouro/lib/ouro/touch-target.tsx" }, { test: "registry/ouro/ax/xray.test.mts::the kit's example tool conforms, and the X-ray acts on nothing" }],
  verify: [{ testExists: "test/conformance/interactions.test.tsx::actions at $width px > $id keeps focus in the page and announces each message once after every action" }, { fileLine: "registry/ouro/lib/ouro/touch-target.tsx", pattern: "pointer-coarse" }, { testExists: "registry/ouro/ax/xray.test.mts::the kit's example tool conforms, and the X-ray acts on nothing" }],
});

/**
 * The voyage hero's words. The north star leads (Ari, 2026-11-23: "About to build any kind of interface at all? Pick Ouro
 * UI and never think about it again."): the title is the six-word story (Ari, 2026-11-17: "ouro ui is a complete kit for
 * agents to build delightful interfaces for both humans and other agents", and "6 word story would be nice"), set as one
 * flowing headline whose second half answers the first, and the lede asks the reader's question and answers it. The
 * platform row under the lede links each platform's own page. Copy: the launch copy deck, section 3.2.
 */
export const VOYAGE_HERO = {
  eyebrow: "Open source, for coding agents",
  title: ["Delightful interfaces,", FOR_EVERYONE],
  /** The reader's question, the answer, and why it's safe to stop thinking: one lede at every width, short enough for a phone. */
  subline: [
    "About to build an interface, for people or for agents, on any platform? Pick Ouro UI and never think about it again.",
    claim("Your agent builds with it and checks its own work, and paying, sending and deleting stay with the person.", {
      source: [{ test: "scripts/check/check.test.mts::Ouro check > finds each rule on its fail page and nothing on any pass page, with a report, a contact sheet and close-ups" }, { file: "scripts/ouro-actions/ouro-actions.mts" }, { spec: "https://github.com/ourostack/ouro-ui-core/blob/20d06ff7ff7ffb3c50e33add65959608148edcd6/docs/guides/actions.md#L45" }],
      verify: [
        { testExists: "scripts/check/check.test.mts::Ouro check > finds each rule on its fail page and nothing on any pass page, with a report, a contact sheet and close-ups" },
        { fileLine: "scripts/ouro-actions/ouro-actions.mts", pattern: "CONSENTS = Object\\.freeze\\(\\[\"read\", \"write\", \"consequential\", \"person-only\"\\]" },
        { urlOk: "https://github.com/ourostack/ouro-ui-core/blob/20d06ff7ff7ffb3c50e33add65959608148edcd6/docs/guides/actions.md#L45" },
      ],
    }),
  ].join(" "),
  /** The platform row: each platform's own page. */
  platforms: [
    { label: "Web", href: "/docs/" },
    { label: "Apple", href: "/apple/" },
    { label: "Windows", href: "/docs/platforms/windows/" },
    { label: "Android", href: "/docs/platforms/android/" },
  ],
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
  commands: { text: "Install it yourself", href: "#install" },
  blocked: "The browser blocked copying. Select the line and copy it yourself.",
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

/** Beside the porthole (hero.tsx): what it is and what to do with it. */
export const TRY = {
  title: claim("Every switch here is Ouro HX", {
    source: { file: "site/src/voyage/stage/stage.tsx" },
    verify: { testExists: "site/e2e/stage.spec.ts::each control on the stage > control: xray outlines every HX component on the page, only when pressed" },
  }),
  lede: claim("Fill the tanks, dive and ring the bell. The porthole is a small app built from the components your agent gets: turn on X-ray in the header to see each one.", {
    source: [{ file: "site/src/voyage/stage/stage.tsx" }, { file: "site/e2e/stage.spec.ts" }],
    verify: { testExists: "site/e2e/stage.spec.ts::each control on the stage > control: xray outlines every HX component on the page, only when pressed" },
  }),
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
