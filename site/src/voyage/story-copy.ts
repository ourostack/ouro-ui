import { claim } from "@/registry/ouro/lib/ouro/claims";

/*
 * The words of the home page's story under the hero (home-sections.tsx), in a module of their own so they load with
 * those islands and never with the page's first JavaScript.
 */

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
