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
}

export interface Issue {
  number: number | null;
  title: string;
  url: string | null;
  state: string;
  updatedAt?: string;
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
    xray: LedgerCell<XrayValue>;
    giveBack: LedgerCell<number> & { prs: GiveBackPr[] };
    tracking: LedgerCell<Issue[]>;
  };
  conditions: Record<"current" | "oneAction" | "must" | "gaveBack", { label: string; met: boolean }>;
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
  summary: { total: number; confirmed: number; listed: number; unmeasuredCells: number; order: string[] };
  program: { issue: Issue | null; steps: Step[]; headline: Headline[]; source: string; note: string | null };
  cards: { id: string; title: string; outcome: string; surfaces: string[]; issue: Issue | null }[];
  surfaces: Surface[];
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
