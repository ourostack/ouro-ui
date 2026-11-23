import snapshot from "./ledger.json";

/** One measurement: its value, the source it came from and when it was measured. A value of `null` is "not measured yet". */
export interface LedgerCell<Value> {
  value: Value | null;
  note: string | null;
  source: string | null;
  measuredAt: string;
}

export interface Pin {
  label: string;
  latestOf: string;
  latestTag: string | null;
  tag: string | null;
  behind: number | null;
  /** The releases after the pin that came out more than a day ago. Ledgers before 2026-11-14 lack it. */
  late?: number | null;
  note: string | null;
  source?: string;
}

export interface GiveBackPr {
  repo: string;
  number: number;
  title: string;
  url: string;
  mergedAt: string;
}

export interface XrayValue {
  claims: number;
  holding: number;
  must: number;
  mustHolding: number;
  score: number | null;
  tool: string;
  app: string | null;
  reportAt: string;
  run: string;
  /** The surfaces the reports check (`cli`, `mcp`, `tools`, `app-intents`). Ledgers before 2026-11-22 lack it. */
  surfaces?: string[];
  /** The surfaces the config lists for the product that no report checks: the must check fails while any is left. */
  missingSurfaces?: string[];
  /** Why the claim set its reports check doesn't count: unreleased, behind a newer one that adds a claim, or unreadable. */
  claimSetProblems?: string[];
}

export interface Issue {
  number: number | null;
  title: string;
  url: string | null;
  state: string;
  updatedAt?: string;
}

/** A product's Ouro AX census, as scripts/adoption/ledger.mjs (`measureCensus`) reads it from the product's CI. */
export interface CensusValue {
  found: number;
  declared: number;
  /** Weak, undeclared, unwalked and stale doors, added up: Census at zero needs none. */
  gaps: number;
  weak: number;
  undeclared: number;
  unwalked: number;
  stale: number;
  baseline: number;
  walked: string[];
  /** The door kinds the product has that its census doesn't walk yet, or walks only with a walker not reviewed. */
  missingKinds: string[];
  productWalkers: string[];
  checker: string;
  commit: string;
  reportAt: string;
  run: string;
}

export interface Surface {
  id: string;
  name: string;
  kind: string;
  repo: string;
  url: string | null;
  inScope: boolean;
  scopeNote: string | null;
  cells: {
    pins: LedgerCell<Pin[]>;
    hx: LedgerCell<string>;
    ax: LedgerCell<string>;
    actions: LedgerCell<number>;
    census: LedgerCell<CensusValue>;
    xray: LedgerCell<XrayValue>;
    giveBack: LedgerCell<number> & { prs: GiveBackPr[] };
    tracking: LedgerCell<Issue[]>;
  };
  conditions: Record<"current" | "hx" | "census" | "must" | "gaveBack", { label: string; met: boolean }>;
  met: number;
  confirmed: boolean;
}

export interface Step {
  id: string;
  dependsOn: string[];
  repo: string | null;
  state: string;
  evidence: string;
  source: string;
}

export interface Headline extends LedgerCell<string | number> {
  key: string;
  label: string;
}

export interface Ledger {
  schema: number;
  generatedAt: string;
  summary: {
    total: number;
    confirmed: number;
    listed: number;
    unmeasuredCells: number;
    /** Every in-scope product's measured pins, added up. Ledgers before 2026-11-14 lack it. */
    releasesBehind?: number;
    /** The products that have lacked a release for more than a day. */
    late?: Array<{ id: string; name: string; late: number; behind: number }>;
    order: string[];
  };
  program: { issue: Issue | null; steps: Step[]; headline: Headline[]; source: string; note: string | null };
  cards: { id: string; title: string; outcome: string; surfaces: string[]; issue: Issue | null }[];
  surfaces: Surface[];
  /** Each product's checks as the hourly run left them a day earlier, for what changed since. Ledgers before 2026-11-15 lack it. */
  previous?: Previous | null;
}

/** An earlier ledger's checks, as scripts/adoption/ledger.mjs (`previousOf`) writes them. */
export interface Previous {
  generatedAt: string;
  surfaces: Array<{ id: string; conditions?: Partial<Record<string, { met: boolean }>> }>;
}

/** The ledger as it was when the site was built; the page asks for a newer one when it opens. */
export const SNAPSHOT = snapshot as unknown as Ledger;

/** Where the hourly workflow (.github/workflows/adoption-ledger.yml) publishes the newest ledger. */
export const LIVE_URL = "https://raw.githubusercontent.com/ourostack/ouro-ui/adoption-data/ledger.json";

/** Whether a fetched value is a ledger of a shape this page reads, and newer than the one it has. */
export function isNewer(candidate: unknown, current: Ledger): candidate is Ledger {
  const value = candidate as Partial<Ledger> | null;
  return Boolean(value && value.schema === current.schema && Array.isArray(value.surfaces) && value.summary && typeof value.generatedAt === "string" && value.generatedAt > current.generatedAt);
}

/** A UTC time as people read it: `2026-11-13 22:14 UTC`. */
export const stamp = (iso: string): string => `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
