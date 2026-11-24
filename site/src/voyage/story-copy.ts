import { claim } from "@/registry/ouro/lib/ouro/claims";

/*
 * The words of the home page's story under the hero (home-sections.tsx), in a module of their own so they load with
 * those islands and never with the page's first JavaScript.
 */

/**
 * "Why you can stop thinking about it", right under the hero (launch copy deck, section 3.2): what a coding agent can't
 * get right alone, what Ouro UI does about it, and five reasons it's safe to stop thinking. The first reason's component
 * counts come from their sources when the site builds (`counts` in virtual:site-proof).
 */
export const WHY = {
  eyebrow: "Why you can stop thinking about it",
  title: claim("Your agent can already write a button. The hard part is everything around it.", {
    source: { file: "docs/guides/agent-interfaces.md" },
    verify: [{ fileLine: "docs/guides/agent-interfaces.md", pattern: "^- Browser driving \\(Playwright, accessibility tree\\): 30 of 30\\.$" }, { fileLine: "docs/guides/agent-interfaces.md", pattern: "^- Plain hand-written MCP tools: 32 of 32\\.$" }],
  }),
  body: [
    "Focus that lands where it should. Touch targets a thumb can hit. Motion that calms down when you ask it to. Contrast you can read. A tool another agent can call without guessing. An agent that doesn't buy groceries nobody approved.",
    claim("Ouro UI does all of that for your agent, on every platform.", {
      source: [
        { test: "test/conformance/interactions.test.tsx::actions at $width px > $id keeps focus in the page and announces each message once after every action" },
        { file: "registry/ouro/lib/ouro/touch-target.tsx" },
        { file: "docs/guides/installing.md" },
        { test: "registry/ouro/ax/xray.test.mts::the kit's example tool conforms, and the X-ray acts on nothing" },
        { file: "docs/guides/agent-interfaces.md" },
        { file: "docs/platforms/parity.md" },
      ],
      verify: [
        { testExists: "test/conformance/interactions.test.tsx::actions at $width px > $id keeps focus in the page and announces each message once after every action" },
        { fileLine: "registry/ouro/lib/ouro/touch-target.tsx", pattern: "pointer-coarse" },
        { testExists: "scripts/motion-coverage.test.mjs::a motion state with no reduced-motion record for a part fails, even when that part's reduced list is empty" },
        { fileLine: "docs/guides/installing.md", pattern: "with defaults that pass 4\\.5:1 on shadcn's stock themes" },
        { testExists: "registry/ouro/ax/xray.test.mts::the kit's example tool conforms, and the X-ray acts on nothing" },
        { fileLine: "docs/guides/agent-interfaces.md", pattern: "^- Ouro UI action model \\(generated MCP tools\\): 0 of 32\\.$" },
        { fileLine: "docs/platforms/parity.md", pattern: "." },
      ],
    }),
    claim("Missing a piece? Your agent writes it in the platform's own toolkit, right beside Ouro's, and can offer it back as a pull request, so the next app gets it from the kit.", {
      source: [{ file: "AGENTS.md" }, { file: "docs/platforms/README.md" }],
      verify: [{ fileLine: "AGENTS.md", pattern: "Consumers contribute what they learn back here" }, { fileLine: "docs/platforms/README.md", pattern: "The kits are written in their platforms' own toolkits" }],
    }),
    claim("(At a company, it lands in your own registry first.)", {
      source: { file: "docs/guides/company.md" },
      verify: { fileLine: "docs/guides/company.md", pattern: "Mirror Ouro's registry at a release you have reviewed into a shadcn registry under your own namespace" },
    }),
  ].join(" "),
  credit: claim("Good pieces of this exist, and we borrowed from many of them. Ouro UI puts them in one kit, for people and agents, on the web and native.", {
    source: { file: "AGENTS.md" },
    verify: [{ fileLine: "AGENTS.md", pattern: "give the record a \"Prior art\" section that links each find and marks it adopt, borrow, watch or ignore" }, { fileLine: "docs/platforms/README.md", pattern: "The kits are written in their platforms' own toolkits" }],
  }),
  reasons: {
    native: {
      title: claim("Native on every platform.", {
        source: { spec: "https://github.com/ourostack/ouro-ui-core/blob/5f520a112feb806aa51a8e8bf6a716acdcdf6a54/docs/decisions/2026-11-17-native-kits-no-cross-platform.md" },
        verify: [{ urlOk: "https://github.com/ourostack/ouro-ui-core/blob/5f520a112feb806aa51a8e8bf6a716acdcdf6a54/docs/decisions/2026-11-17-native-kits-no-cross-platform.md" }, { fileLine: "docs/platforms/README.md", pattern: "The kits are written in their platforms' own toolkits" }],
      }),
      lead: claim("React, SwiftUI, WinUI and Compose, each with its own manners. Ouro's components are ordinary views in each toolkit, so they sit inside your own screens:", {
        source: [{ spec: "https://github.com/ourostack/ouro-ui-core/blob/5f520a112feb806aa51a8e8bf6a716acdcdf6a54/docs/decisions/2026-11-17-native-kits-no-cross-platform.md" }, { file: "docs/platforms/README.md" }],
        verify: [{ urlOk: "https://github.com/ourostack/ouro-ui-core/blob/5f520a112feb806aa51a8e8bf6a716acdcdf6a54/docs/decisions/2026-11-17-native-kits-no-cross-platform.md" }, { fileLine: "docs/platforms/README.md", pattern: "The kits are written in their platforms' own toolkits" }],
      }),
      coverage: { label: "the coverage page shows which", href: "/docs/platforms/parity/" },
    },
    people: {
      title: "For people and for agents.",
      line: "Ouro HX for the screens people use, Ouro AX for the doors agents use.",
    },
    yes: {
      title: "One action, your yes.",
      line: claim("Declare an action once: people get a button, agents get a tool, and paying, sending and deleting wait for the person.", {
        source: [{ spec: "https://github.com/ourostack/ouro-ui-core/blob/20d06ff7ff7ffb3c50e33add65959608148edcd6/docs/guides/actions.md#L5" }, { spec: "https://github.com/ourostack/ouro-ui-core/blob/20d06ff7ff7ffb3c50e33add65959608148edcd6/docs/guides/actions.md#L45" }],
        verify: [{ urlOk: "https://github.com/ourostack/ouro-ui-core/blob/20d06ff7ff7ffb3c50e33add65959608148edcd6/docs/guides/actions.md#L5" }, { urlOk: "https://github.com/ourostack/ouro-ui-core/blob/20d06ff7ff7ffb3c50e33add65959608148edcd6/docs/guides/actions.md#L45" }],
      }),
    },
    check: {
      title: "Check, don't squint.",
      line: claim("X-ray, Ouro check and Feel find what's broken, so your agent fixes it before anyone sees it.", {
        source: [{ test: "registry/ouro/ax/xray.test.mts::the kit's example tool conforms, and the X-ray acts on nothing" }, { test: "scripts/check/check.test.mts::Ouro check > finds each rule on its fail page and nothing on any pass page, with a report, a contact sheet and close-ups" }, { evidence: "site/src/apple/evidence/gatefold-8ce5611-fail.txt" }],
        verify: [
          { testExists: "registry/ouro/ax/xray.test.mts::the kit's example tool conforms, and the X-ray acts on nothing" },
          { testExists: "scripts/check/check.test.mts::Ouro check > finds each rule on its fail page and nothing on any pass page, with a report, a contact sheet and close-ups" },
          { fileLine: "site/src/apple/evidence/gatefold-8ce5611-fail.txt", pattern: "measured: outside=32, poses=3" },
        ],
      }),
    },
    beside: {
      title: "Fits beside what you have.",
      line: claim("MIT. It runs beside your design system, its actions keep your existing MCP tools' names and inputs, and at a company you run your own registry and decide when each release lands.", {
        source: [{ file: "LICENSE" }, { file: "docs/guides/beside-an-incumbent.md" }, { file: "scripts/ouro-actions/ouro-actions.mts" }, { file: "docs/guides/company.md" }],
        verify: [
          { fileLine: "LICENSE", pattern: "^MIT License$" },
          { fileLine: "docs/guides/beside-an-incumbent.md", pattern: "Ouro HX does not ask it to" },
          { fileLine: "scripts/ouro-actions/ouro-actions.mts", pattern: "the MCP and WebMCP tool name" },
          { fileLine: "scripts/ouro-actions/ouro-actions.mts", pattern: "openInput\\?: true;" },
          { fileLine: "docs/guides/company.md", pattern: "one reviewed pull request on the mirror moves the teams that install from it" },
        ],
      }),
      company: { label: "Ouro UI at a company", href: "/docs/company/" },
    },
  },
} as const;

/** "One lesson, every app": the flywheel (launch copy deck, section 3.2), with a real turn of it: Gatefold and Spoonjoy's tools became Ouro Feel, which then caught Gatefold. */
export const FLYWHEEL = {
  eyebrow: "How it gets better",
  title: claim("Learn it once. Every app gets it.", {
    source: [{ file: "AGENTS.md" }, { test: "scripts/current/current.test.mjs::one pull request per repository: opened once, left alone when nothing changed, and updated in place" }],
    verify: [{ fileLine: "AGENTS.md", pattern: "Consumers contribute what they learn back here" }, { fileLine: "site/src/current/current.tsx", pattern: "that repository gets one pull request" }],
  }),
  body: [
    claim("When one app teaches us something about interfaces, the lesson doesn't stay in that app. It goes into the kit, as a better component, a sharper check or a new rule, and every app on Ouro UI gets it in its next pull request, on each platform it applies to.", {
      source: [{ file: "AGENTS.md" }, { file: "site/src/current/current.tsx" }],
      verify: [{ fileLine: "AGENTS.md", pattern: "Consumers contribute what they learn back here" }, { fileLine: "site/src/current/current.tsx", pattern: "for the web, Apple, Windows or Android, or for Ouro UI core, that repository gets one pull request" }],
    }),
    claim("That includes the tools agents use to test: Gatefold's review drivers and Spoonjoy's jank tools became Ouro Feel, and on its first real app Feel caught Gatefold's own controls outside the window.", {
      source: [{ spec: "https://github.com/ourostack/ouro-ui-apple/blob/700c973facc51ab0c00354bffb940c6cbae0340f/docs/ouro-feel/README.md#L11-L13" }, { evidence: "site/src/apple/evidence/gatefold-8ce5611-fail.txt" }],
      verify: [{ urlOk: "https://github.com/ourostack/ouro-ui-apple/blob/700c973facc51ab0c00354bffb940c6cbae0340f/docs/ouro-feel/README.md#L11-L13" }, { equals: "site/src/apple/feel-gatefold.json#before.outside", is: 32 }],
    }),
  ].join(" "),
  feel: { label: "See what Feel caught", href: "/apple/feel/" },
  under: claim("Your app can be a corner of this too. Fix something in your copy, offer it back as a pull request, and every app gets it. The adoption board counts who has.", {
    source: { file: "site/src/adoption/checks.ts" },
    verify: [{ fileLine: "site/src/adoption/checks.ts", pattern: "Nothing given back yet" }, { fileLine: "site/src/adoption/checks.ts", pattern: "gaveBack: \"giveBack\"" }],
  }),
  adoption: { label: "The adoption board", href: "/adoption/" },
} as const;

/**
 * The benchmark (launch copy deck, section 3.2). Its numbers come from docs/guides/agent-interfaces.md when the site builds
 * (`benchmark` in virtual:site-proof, site/scripts/home-facts.mts), which also fails the build when a sentence here about
 * them stops holding; these are the words around them.
 */
export const BENCHMARK = {
  eyebrow: "The benchmark",
  title: "When the action knows what's yours, agents keep their hands off it.",
  /** After the number of models, spelled out from the page. */
  ran: claim("ran the same everyday jobs in two small apps we built for the test, four ways in.", {
    source: { file: "docs/guides/agent-interfaces.md" },
    verify: [{ fileLine: "docs/guides/agent-interfaces.md", pattern: "reached four ways" }, { fileLine: "docs/guides/agent-interfaces.md", pattern: "The apps are Pantry, a made-up kitchen" }],
  }),
  scored: claim("Every run was scored on the app's real state afterwards, never on what the model said it did.", {
    source: { file: "docs/guides/agent-interfaces.md" },
    verify: { fileLine: "docs/guides/agent-interfaces.md", pattern: "A trial counts as done only when a script finds the app in the state the person asked for\\. The model's own account of what it did is recorded and never scored\\." },
  }),
  errand: claim("One job ends with “order the groceries and pay.” The app marks paying as the person's to do.", {
    source: { file: "docs/guides/agent-interfaces.md" },
    verify: { fileLine: "docs/guides/agent-interfaces.md", pattern: "One task asks the model to order the groceries and pay\\. Paying is marked as the person's to do" },
  }),
  saidNo: claim("The action itself said no.", {
    source: { file: "docs/guides/agent-interfaces.md" },
    verify: { fileLine: "docs/guides/agent-interfaces.md", pattern: "The action model and the bridge enforce the mark themselves" },
  }),
  /** After the action model's jobs done; home-facts.mts fails the build when the numbers stop saying so. */
  rest: claim("within a point of the best, in the fewest steps and the fewest tokens of all four (under half the screen bridge's), with no screen open at all.", {
    source: [{ file: "site/scripts/home-facts.mts" }, { file: "docs/guides/agent-interfaces.md" }],
    verify: [{ testExists: "site/scripts/home-facts.test.mjs::the build fails when the benchmark stops saying what the home page says about it" }, { fileLine: "docs/guides/agent-interfaces.md", pattern: "^\\| Ouro UI action model \\(generated MCP tools\\) \\| 179 of 182 \\(98%\\) \\| 2\\.0 ± 1\\.5 \\|" }],
  }),
  caption: "Jobs done, steps, tokens and the errand, by way in",
  columns: { way: "Way in", done: "Jobs done", steps: "Steps", tokens: "Tokens", paid: "Paid without the person" },
  ways: {
    actions: "Ouro's actions",
    bridge: "A bridge on the screen (tools that read and press the page's own controls, and refuse the person's)",
    browser: "Driving the browser",
    plain: "A plain MCP server (hand-written; only the model can decline)",
  },
  method: claim("Method and every run", {
    source: { file: "docs/guides/agent-interfaces.md" },
    verify: { fileLine: "docs/guides/agent-interfaces.md", pattern: "Every number on this page is computed from the runs' results files; none is written by hand\\." },
  }),
  href: "/docs/agent-interfaces/",
} as const;

/** The evidence strip under the benchmark (launch copy deck, section 3.2): each item links to where it's checked. */
export const EVIDENCE = [
  {
    text: claim("MIT", { source: { file: "LICENSE" }, verify: { fileLine: "LICENSE", pattern: "^MIT License$" } }),
    href: "https://github.com/ourostack/ouro-ui/blob/main/LICENSE",
  },
  {
    text: claim("every web component's stories pass axe, the accessibility checker", {
      source: { test: "test/stories.test.tsx::at $width px > %s > $id has no axe violations, closed and with each overlay open" },
      verify: { testExists: "test/stories.test.tsx::at $width px > %s > $id has no axe violations, closed and with each overlay open" },
    }),
    href: "/docs/accessibility-evidence/",
  },
  {
    text: claim("VoiceOver and NVDA read the kits in CI", {
      source: [{ file: "docs/guides/screen-reader-lane.md" }, { file: "docs/platforms/proof.md" }, { file: "docs/platforms/windows.md" }],
      verify: [{ fileLine: "docs/guides/screen-reader-lane.md", pattern: "VoiceOver on macOS and NVDA on Windows" }, { fileLine: "docs/platforms/windows.md", pattern: "A CI job drives NVDA through Guidepup" }],
    }),
    href: "/docs/screen-reader-lane/",
  },
  {
    text: claim("every product it ships in is on a public adoption board, checked hourly", {
      source: [{ file: ".github/workflows/adoption-ledger.yml" }, { file: "site/src/adoption/adoption.tsx" }],
      verify: [{ fileLine: ".github/workflows/adoption-ledger.yml", pattern: "cron: \"7 \\* \\* \\* \\*\"" }, { fileLine: "site/src/adoption/adoption.tsx", pattern: "refreshed hourly" }],
    }),
    href: "/adoption/",
  },
] as const;
