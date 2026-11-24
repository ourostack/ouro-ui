import { claim } from "@/registry/ouro/lib/ouro/claims";

/*
 * The words on /proof/ (copy deck v7, sections 2, 3.2 and 3.3). The numbers are not here: proof.tsx reads them from their
 * sources (benchmark.ts, reviews.ts, the adoption ledger) and fills each {placeholder} with `fill`.
 */

/** A sentence with its {placeholders} filled in. */
export const fill = (text: string, values: Record<string, string | number>): string => text.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key]));

export const HERO = {
  eyebrow: "Proof",
  title: "Proof, not promises.",
  lede: claim("The benchmark, what frontier models said when they compared toolkits, every product on the adoption board, how to run Ouro UI at a company, and the projects we borrowed from.", { source: [{ file: "docs/guides/agent-interfaces.md" }, { file: "docs/guides/company.md" }, { file: "site/src/adoption/ledger.json" }], verify: [{ fileLine: "docs/guides/agent-interfaces.md", pattern: "checked trials" }, { fileLine: "docs/guides/company.md", pattern: "# Ouro UI at a company" }, { testExists: "site/src/proof/proof.test.tsx::Proof's page > has a route, a forward from /benchmark/, and a section for each part of the proof" }] }),
  sections: [
    { id: "benchmark", label: "The benchmark" },
    { id: "errand", label: "The Errand" },
    { id: "reviews", label: "Model reviews" },
    { id: "adoption", label: "Adoption" },
    { id: "company", label: "At a company" },
    { id: "borrowed", label: "What we borrowed" },
  ],
} as const;

/** The benchmark section, in the deck's words (3.2), with the page's numbers. */
export const BENCHMARK_COPY = {
  eyebrow: "The benchmark",
  title: claim("When the action knows what's yours, agents keep their hands off it.", { source: [{ file: "docs/guides/agent-interfaces.md" }], verify: [{ testExists: "site/src/proof/proof.test.tsx::the benchmark > reads every number from the benchmark page, and the deck's words still hold" }] }),
  body: claim("{Models} models ran the same everyday jobs in two small apps we built for the test, four ways in. Every run was scored on the app's real state afterwards, never on what the model said it did.", { source: [{ file: "docs/guides/agent-interfaces.md" }, { file: "scripts/agent-benchmark/METHODOLOGY.md" }], verify: [{ testExists: "site/src/proof/proof.test.tsx::the benchmark > reads every number from the benchmark page, and the deck's words still hold" }, { fileLine: "docs/guides/agent-interfaces.md", pattern: "The model's own account of what it did is recorded and never scored" }] }),
  errand: claim("One job ends with \"order the groceries and pay.\" The app marks paying as the person's to do. Agents driving the browser paid anyway, {browser}. Agents with a plain MCP server, hand-written for the same app, where only the model can decline, paid {plain}. Through Ouro's actions: {actions}. The action itself said no.", { source: [{ file: "docs/guides/agent-interfaces.md" }], verify: [{ testExists: "site/src/proof/proof.test.tsx::the benchmark > reads every number from the benchmark page, and the deck's words still hold" }, { fileLine: "docs/guides/agent-interfaces.md", pattern: "Paying is marked as the person's to do" }, { fileLine: "docs/guides/agent-interfaces.md", pattern: "Through browser driving and the plain server, only the model can decline" }] }),
  rest: claim("Ouro's actions got {percent} of jobs done, within a point of the best, in the fewest steps and the fewest tokens of all four (under half the screen bridge's), with no screen open at all.", { source: [{ file: "docs/guides/agent-interfaces.md" }], verify: [{ testExists: "site/src/proof/proof.test.tsx::the benchmark > reads every number from the benchmark page, and the deck's words still hold" }] }),
  caption: claim("Every model together, four ways in", { source: [{ file: "docs/guides/agent-interfaces.md" }], verify: [{ fileLine: "docs/guides/agent-interfaces.md", pattern: "## All models together" }, { testExists: "site/src/proof/proof.test.tsx::the benchmark > reads every number from the benchmark page, and the deck's words still hold" }] }),
  columns: { way: "Way in", done: "Jobs done", steps: "Steps", tokens: "Tokens", paid: "Paid without the person" },
  method: claim("Method and every run ({trials} checked trials)", { source: [{ file: "docs/guides/agent-interfaces.md" }], verify: [{ testExists: "site/src/proof/proof.test.tsx::the benchmark > reads every number from the benchmark page, and the deck's words still hold" }, { fileLine: "docs/guides/agent-interfaces.md", pattern: "Every trial's transcript is beside its results file" }] }),
} as const;

/** The Errand: the grocery job replayed from four real transcripts. */
export const ERRAND_COPY = {
  eyebrow: "The Errand",
  title: claim("The grocery job, four ways in.", { source: [{ file: "scripts/agent-benchmark/results/2026-11-14-frontier/transcripts/grok-4-7--action-model--place-order--2.json" }, { file: "scripts/agent-benchmark/results/2026-11-14-screens-serial/transcripts/grok-4-7--bridge--place-order--2.json" }, { file: "scripts/agent-benchmark/results/2026-11-14-screens-serial/transcripts/grok-4-7--browser--place-order--2.json" }, { file: "scripts/agent-benchmark/results/2026-11-14-frontier/transcripts/grok-4-7--plain-mcp--place-order--2.json" }], verify: [{ testExists: "site/src/proof/proof.test.tsx::the Errand > replays Grok 4.7's four real grocery runs: two pay, two hand it back" }] }),
  lede: claim("One model, Grok 4.7, ran the same errand each way in. These are its real runs, replayed on their own clocks. Two pay. Ouro's actions stop at the till and hand it back: paying was never a tool. The bridge offers the button, then refuses to press it.", { source: [{ file: "scripts/agent-benchmark/results/2026-11-14-frontier/transcripts/grok-4-7--action-model--place-order--2.json" }, { file: "scripts/agent-benchmark/results/2026-11-14-screens-serial/transcripts/grok-4-7--bridge--place-order--2.json" }, { file: "scripts/agent-benchmark/results/2026-11-14-screens-serial/transcripts/grok-4-7--browser--place-order--2.json" }, { file: "scripts/agent-benchmark/results/2026-11-14-frontier/transcripts/grok-4-7--plain-mcp--place-order--2.json" }, { file: "docs/guides/agent-interfaces.md" }], verify: [{ testExists: "site/src/proof/proof.test.tsx::the Errand > replays Grok 4.7's four real grocery runs: two pay, two hand it back" }, { fileLine: "docs/guides/agent-interfaces.md", pattern: "ordering and paying is person-only, so it is not a tool" }, { fileLine: "docs/guides/agent-interfaces.md", pattern: "refuses the control marked as the person's" }] }),
  person: "The person",
  paid: "Paid without the person",
  receipt: "Receipt",
  handedBack: "Handed back",
  transcript: "The transcript",
  replay: "Replay the errand",
  skip: "Skip to the till",
  finished: "Replay finished",
  note: claim("Each lane is Grok 4.7's second of three runs that way in: the one where Ouro's actions read the list before answering. Each tool call keeps its own recorded time, and the model's thinking shares out the rest of the run's wall time evenly.", { source: [{ file: "scripts/agent-benchmark/results/2026-11-14-frontier/transcripts/grok-4-7--action-model--place-order--2.json" }, { file: "scripts/agent-benchmark/results/2026-11-14-screens-serial/transcripts/grok-4-7--bridge--place-order--2.json" }, { file: "scripts/agent-benchmark/results/2026-11-14-screens-serial/transcripts/grok-4-7--browser--place-order--2.json" }, { file: "scripts/agent-benchmark/results/2026-11-14-frontier/transcripts/grok-4-7--plain-mcp--place-order--2.json" }], verify: [{ testExists: "site/src/proof/proof.test.tsx::the Errand > replays Grok 4.7's four real grocery runs: two pay, two hand it back" }, { testExists: "site/src/proof/proof.test.tsx::the Errand > times each step from the run's own clock, and ends with the reply" }] }),
} as const;

/** Model reviews: what the latest panel picked, read from its run (reviews.ts). */
export const REVIEWS_COPY = {
  eyebrow: "Model reviews",
  title: "What frontier models said when they compared toolkits.",
  picks: claim("In the latest review, on {date}, {picked} of {models} frontier models picked Ouro UI from {toolkits} toolkits for real jobs.", { source: [{ file: "docs/guides/model-reviews.md" }], verify: [{ testExists: "site/src/proof/proof.test.tsx::model reviews > reads the latest review's picks from its page" }] }),
  issues: claim("What they pushed back on became issues, and the page says what each one changed, including the results that went against Ouro.", { source: [{ file: "docs/guides/model-reviews.md" }], verify: [{ fileLine: "docs/guides/model-reviews.md", pattern: "filed as issues" }, { fileLine: "docs/guides/model-reviews.md", pattern: "including the ones that went against Ouro" }] }),
  link: "Read the picks, the quotes and what changed",
} as const;

/** Adoption: the board's live count. */
export const ADOPTION_COPY = {
  eyebrow: "Adoption",
  title: claim("Every product Ari maintains, checked hourly, in public.", { source: [{ file: ".github/workflows/adoption-ledger.yml" }], verify: [{ fileLine: ".github/workflows/adoption-ledger.yml", pattern: "cron: \"7 \\* \\* \\* \\*\"" }] }),
  count: claim("{total} products on the board, {green} of them green on every check, as of {when}.", { source: [{ file: "site/src/adoption/ledger.json" }], verify: [{ testExists: "site/src/proof/proof.test.tsx::adoption > counts the board's products, and takes a newer ledger when it loads" }] }),
  link: "See the board",
} as const;

/** Ouro UI at a company (docs/guides/company.md). */
export const COMPANY_COPY = {
  eyebrow: "At a company",
  title: "Ouro UI at a company",
  body: claim("A registry your company owns, updates that wait for a person, and a report of which apps are behind or have edited what.", { source: [{ file: "docs/guides/company.md" }], verify: [{ fileLine: "docs/guides/company.md", pattern: "a registry your company owns, updates that wait for a person, and a report of which apps are behind or have edited what" }] }),
  link: "Ouro UI at a company",
} as const;

/** One project we borrowed from: its name, where it lives, and what we took. */
export interface Borrowing {
  name: string;
  href: string;
  took: string;
}

/** What we borrowed: the credit line (deck 3.2), then each project with what we took, from the record that says so. */
export const BORROWED_COPY = {
  eyebrow: "Credit",
  title: "What we borrowed",
  lede: claim("Good pieces of this exist, and we borrowed from many of them. Ouro UI puts them in one kit, for people and agents, on the web and native.", { source: [{ spec: "https://github.com/ourostack/ouro-ui-core/blob/8ffe74b1e8a0e60325866403f7316b2c900845be/docs/decisions/2026-11-13-agents-use-agent-interfaces.md#L47" }], verify: [{ urlOk: "https://github.com/ourostack/ouro-ui-core/blob/8ffe74b1e8a0e60325866403f7316b2c900845be/docs/decisions/2026-11-13-agents-use-agent-interfaces.md#L47" }] }),
  took: "What we took",
  items: [
    {
      name: "Shopify Reflex",
      href: "https://shopify.engineering/reflex",
      took: claim("The idea behind Ouro Reins: an agent drives an app's screens as state and actions, headless, in milliseconds.", { source: [{ file: "site/llms.txt" }], verify: [{ fileLine: "site/llms.txt", pattern: "The idea is Shopify's Reflex" }] }),
    },
    {
      name: "Shopify's native rewrite",
      href: "https://shopify.engineering/back-to-native",
      took: claim("A native kit on every platform, kept in step by shared specifications and tests rather than shared code.", { source: [{ spec: "https://github.com/ourostack/ouro-ui-core/blob/8ffe74b1e8a0e60325866403f7316b2c900845be/docs/decisions/2026-11-17-native-kits-no-cross-platform.md#L33" }], verify: [{ urlOk: "https://github.com/ourostack/ouro-ui-core/blob/8ffe74b1e8a0e60325866403f7316b2c900845be/docs/decisions/2026-11-17-native-kits-no-cross-platform.md#L33" }] }),
    },
    {
      name: "Vercel UI SDK",
      href: "https://github.com/vercel-labs/ui",
      took: claim("Four ideas: every change says who made it, undo that touches only the agent's changes, suggestions staged on the real controls, and refusing a label that matches more than one control.", { source: [{ spec: "https://github.com/ourostack/ouro-ui-core/blob/8ffe74b1e8a0e60325866403f7316b2c900845be/docs/decisions/2026-11-13-agents-use-agent-interfaces.md#L47" }], verify: [{ urlOk: "https://github.com/ourostack/ouro-ui-core/blob/8ffe74b1e8a0e60325866403f7316b2c900845be/docs/decisions/2026-11-13-agents-use-agent-interfaces.md#L47" }] }),
    },
    {
      name: "SWR",
      href: "https://swr.vercel.app/",
      took: claim("Stale-while-revalidate, model and name: show what's cached, refresh it, then show what's fresh, one request per key.", { source: [{ spec: "https://github.com/ourostack/ouro-ui-core/blob/8ffe74b1e8a0e60325866403f7316b2c900845be/docs/decisions/2026-11-04-responsiveness.md#L92" }], verify: [{ urlOk: "https://github.com/ourostack/ouro-ui-core/blob/8ffe74b1e8a0e60325866403f7316b2c900845be/docs/decisions/2026-11-04-responsiveness.md#L92" }] }),
    },
    {
      name: "WebMCP",
      href: "https://github.com/webmachinelearning/webmcp",
      took: claim("Tools in the page as a cheap projection of each action, with its read-only and consequential hints mapped onto our consent classes.", { source: [{ spec: "https://github.com/ourostack/ouro-ui-core/blob/8ffe74b1e8a0e60325866403f7316b2c900845be/docs/decisions/2026-11-13-agents-use-agent-interfaces.md#L51" }], verify: [{ urlOk: "https://github.com/ourostack/ouro-ui-core/blob/8ffe74b1e8a0e60325866403f7316b2c900845be/docs/decisions/2026-11-13-agents-use-agent-interfaces.md#L51" }] }),
    },
    {
      name: "A2UI",
      href: "https://a2ui.org/",
      took: claim("Interface as validated data, limited to a catalog and drawn natively: the framing Composed UI says itself in.", { source: [{ spec: "https://github.com/ourostack/ouro-ui-core/blob/8ffe74b1e8a0e60325866403f7316b2c900845be/docs/decisions/2026-11-17-composed-tree-leads.md#L31" }], verify: [{ urlOk: "https://github.com/ourostack/ouro-ui-core/blob/8ffe74b1e8a0e60325866403f7316b2c900845be/docs/decisions/2026-11-17-composed-tree-leads.md#L31" }] }),
    },
    {
      name: "MCP Apps",
      href: "https://github.com/modelcontextprotocol/ext-apps",
      took: claim("The ui:// resource and its handshake, spoken over postMessage with no SDK, so composed cards reach any MCP Apps host.", { source: [{ spec: "https://github.com/ourostack/ouro-ui-core/blob/8ffe74b1e8a0e60325866403f7316b2c900845be/docs/decisions/2026-11-13-a2ui-catalog.md#L49" }], verify: [{ urlOk: "https://github.com/ourostack/ouro-ui-core/blob/8ffe74b1e8a0e60325866403f7316b2c900845be/docs/decisions/2026-11-13-a2ui-catalog.md#L49" }] }),
    },
    {
      name: "Base UI",
      href: "https://base-ui.com/",
      took: claim("The accessible primitives under Ouro HX for web, and the starting and ending styles every transition runs on.", { source: [{ file: "package.json" }, { file: "AGENTS.md" }], verify: [{ fileLine: "package.json", pattern: "\"@base-ui/react\"" }, { fileLine: "AGENTS.md", pattern: "Base UI's `data-starting-style`/`data-ending-style`" }] }),
    },
    {
      name: "Tailwind CSS",
      href: "https://tailwindcss.com/",
      took: claim("The utilities every web component is styled with, compiled by your own app's Tailwind CSS v4.", { source: [{ file: "AGENTS.md" }, { file: "package.json" }], verify: [{ fileLine: "AGENTS.md", pattern: "apps compile the components with their own Tailwind CSS v4" }, { fileLine: "package.json", pattern: "\"tailwindcss\"" }] }),
    },
    {
      name: "shadcn/ui",
      href: "https://ui.shadcn.com/",
      took: claim("The registry and CLI that copy components into your app, and the theme tokens they read, so any shadcn theme works.", { source: [{ file: "scripts/install-test.sh" }, { spec: "https://github.com/ourostack/ouro-ui-core/blob/8ffe74b1e8a0e60325866403f7316b2c900845be/docs/decisions/2026-11-20-hover-and-selected-states.md#L25" }], verify: [{ fileLine: "scripts/install-test.sh", pattern: "shadcn@4\\.21\\.1" }, { urlOk: "https://github.com/ourostack/ouro-ui-core/blob/8ffe74b1e8a0e60325866403f7316b2c900845be/docs/decisions/2026-11-20-hover-and-selected-states.md#L25" }] }),
    },
  ] satisfies Borrowing[],
} as const;
