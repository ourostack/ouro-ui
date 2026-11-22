import type { Ledger, LedgerCell, Previous, Surface } from "./ledger";

/*
 * The page's reading of the ledger: for each product, its four checks and, for each one that is not met, one short line
 * saying what is missing and where that came from. It reads only what the ledger says. A check is "met" only when the
 * ledger's own condition is met, "unmeasured" when the measurement behind it has no value, and "na" when the ledger says
 * the check does not apply; anything else is "missing".
 */

export type CheckKey = "current" | "census" | "must" | "gaveBack";
export type CheckState = "met" | "missing" | "unmeasured" | "na";

export const CHECK_KEYS: readonly CheckKey[] = ["current", "census", "must", "gaveBack"];

/** The column headings: one or two words each, the ledger's own label being the long form. */
export const CHECK_SHORT: Record<CheckKey, string> = { current: "Current", census: "Census", must: "AX must", gaveBack: "Gave back" };

export const STATE_WORD: Record<CheckState, string> = { met: "passes", missing: "missing", unmeasured: "not measured yet", na: "does not apply" };

export interface Check {
  key: CheckKey;
  /** The ledger's label for the condition, such as "On current Ouro UI". */
  label: string;
  state: CheckState;
  /** What is missing, in one short line; null when the check passes. */
  why: string | null;
  /** Where the line's fact came from. */
  source: string | null;
  /** Whether the line only restates the mark (the check has not started), so the page can leave it out and say what is particular instead. */
  generic?: boolean;
}

const sentence = (text: string): string => (text ? text[0]!.toUpperCase() + text.slice(1) : text);

/** A cell's note without the ledger's "not measured: " or "n/a: " lead-in, and without a full stop at the end. */
const reason = (cell: LedgerCell<unknown>, fallback: string): string => sentence((cell.note ?? fallback).replace(/^(not measured|n\/a):\s*/i, "").replace(/\.$/, ""));

const plural = (count: number, word: string): string => `${count} ${word}${count === 1 ? "" : "s"}`;

/** The ledger's reason for a missing measurement, shortened where it is one the page knows. */
const PRIVATE = /\bprivate\b/i;
const unmeasured = (cell: LedgerCell<unknown>, otherwise?: string): string => (PRIVATE.test(cell.note ?? "") ? "Private repository, so not\u00a0readable" : (otherwise ?? reason(cell, "not measured yet")));

function unmeasuredOrNa(cell: LedgerCell<unknown>): CheckState {
  return /^n\/a\b/i.test(cell.note ?? "") ? "na" : "unmeasured";
}

function current(surface: Surface): Omit<Check, "key" | "label"> {
  const cell = surface.cells.pins;
  const met = surface.conditions.current.met;
  if (met) return { state: "met", why: null, source: cell.source };
  if (cell.value === null) return { state: unmeasuredOrNa(cell), why: unmeasured(cell), source: cell.source };
  if (cell.value.length === 0) return { state: "missing", why: "Doesn't use Ouro UI yet", source: cell.source, generic: true };
  const behind = cell.value.filter((pin) => typeof pin.behind === "number" && pin.behind > 0).sort((a, b) => (b.behind ?? 0) - (a.behind ?? 0));
  const furthest = behind[0];
  if (!furthest) {
    const unread = cell.value.find((pin) => pin.behind === null);
    return { state: "unmeasured", why: unread ? `Could not read the ${unread.label} pin` : reason(cell, "not measured yet"), source: unread?.source ?? cell.source };
  }
  const named = cell.value.length > 1 ? `${furthest.label} ` : "";
  return {
    state: "missing",
    why: `${named}${furthest.tag ?? "?"} → ${furthest.latestTag ?? "latest"}, ${furthest.behind} behind`,
    source: furthest.source ?? cell.source,
  };
}

const orList = (items: readonly string[]): string => (items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} or ${items.at(-1)}`);

function census(surface: Surface): Omit<Check, "key" | "label"> {
  const cell = surface.cells.census;
  if (surface.conditions.census.met) return { state: "met", why: null, source: cell.value?.run ?? cell.source };
  if (cell.value === null) {
    // The row needs only the gap when no census runs yet; any other reason (an old checker, a stale report) is particular.
    const none = !PRIVATE.test(cell.note ?? "") && /no Ouro AX census runs/i.test(cell.note ?? "");
    return { state: unmeasuredOrNa(cell), why: none ? "Census not in CI yet" : unmeasured(cell), source: cell.source, ...(none ? { generic: true } : {}) };
  }
  const { found, gaps, missingKinds, run } = cell.value;
  if (gaps > 0) return { state: "missing", why: `${plural(gaps, "gap")} among ${plural(found, "door")}`, source: run };
  if (missingKinds.length) return { state: "missing", why: `Doesn't walk ${orList(missingKinds)} doors yet`, source: run };
  return { state: "missing", why: "The census finds nothing to count", source: run };
}

function must(surface: Surface): Omit<Check, "key" | "label"> {
  const cell = surface.cells.xray;
  if (surface.conditions.must.met) return { state: "met", why: null, source: cell.value?.run ?? cell.source };
  if (cell.value === null) {
    const xrayMissing = !PRIVATE.test(cell.note ?? "") && /x-ray/i.test(cell.note ?? "");
    return { state: unmeasuredOrNa(cell), why: unmeasured(cell, xrayMissing ? "X-ray doesn't run in CI yet" : undefined), source: cell.source, ...(xrayMissing ? { generic: true } : {}) };
  }
  const { must: total, mustHolding, run, missingSurfaces = [] } = cell.value;
  if (missingSurfaces.length) return { state: "missing", why: `No X-ray of its ${orList(missingSurfaces)} doors yet`, source: run ?? cell.source };
  if (total === 0) return { state: "missing", why: "Must claims not written yet", source: run ?? cell.source };
  return { state: "missing", why: `${total - mustHolding} of ${plural(total, "must claim")} fail`, source: run ?? cell.source };
}

function gaveBack(surface: Surface): Omit<Check, "key" | "label"> {
  const cell = surface.cells.giveBack;
  if (surface.conditions.gaveBack.met) return { state: "met", why: null, source: cell.source };
  if (cell.value === null) return { state: unmeasuredOrNa(cell), why: reason(cell, "not measured yet"), source: cell.source };
  return { state: "missing", why: "Nothing given back yet", source: cell.source, generic: true };
}

const READERS: Record<CheckKey, (surface: Surface) => Omit<Check, "key" | "label">> = { current, census, must, gaveBack };

const CELL_OF: Record<CheckKey, keyof Surface["cells"]> = { current: "pins", census: "census", must: "xray", gaveBack: "giveBack" };

/** A check the ledger counts as held because it does not apply (the upstream's give-back, AX on a site with no agent interface). */
function notApplicable(surface: Surface, key: CheckKey): Omit<Check, "key" | "label"> | null {
  const cell = surface.cells[CELL_OF[key]] as LedgerCell<unknown>;
  if (!surface.conditions[key].met || cell.value !== null || !/^n\/a\b/i.test(cell.note ?? "")) return null;
  return { state: "na", why: reason(cell, "does not apply"), source: cell.source };
}

/** A product's four checks, in the page's column order. */
export function checksOf(surface: Surface): Check[] {
  return CHECK_KEYS.map((key) => ({ key, label: surface.conditions[key].label, ...(notApplicable(surface, key) ?? READERS[key](surface)) }));
}

/** A line every counted product shares for one check, said once on the page instead of on every row. */
export interface Shared {
  key: CheckKey;
  label: string;
  why: string;
  source: string | null;
}

export interface Row {
  surface: Surface;
  checks: Check[];
  /** The gap lines particular to this product: the ones that say more than its marks do. */
  notes: Check[];
}

/** One line of the list: a product, or products that stand in the same place with nothing particular to say. */
export type Entry = { kind: "product"; row: Row } | { kind: "group"; rows: Row[]; checks: Check[] };

export interface Board {
  total: number;
  green: number;
  /** The counted products, furthest from green first, as the ledger orders them. */
  rows: Row[];
  /** The list as the page shows it: closest to green first, products alike in every check and with nothing particular to say folded into one line. */
  entries: Entry[];
  /** The counted products in a fixed order (by id), so a product keeps its place in the sky as the ledger changes. */
  sky: Surface[];
  shared: Shared[];
}

/** Everything the page shows, read from a ledger. Green is the ledger's own `confirmed`, never worked out here. */
export function boardOf(ledger: Ledger): Board {
  const counted = ledger.surfaces.filter((surface) => surface.inScope);
  const byId = new Map(counted.map((surface) => [surface.id, surface]));
  const ordered = [...ledger.summary.order.map((id) => byId.get(id)).filter((surface): surface is Surface => Boolean(surface)), ...counted.filter((surface) => !ledger.summary.order.includes(surface.id))];
  const rows: Row[] = ordered.map((surface) => {
    const checks = checksOf(surface);
    return { surface, checks, notes: checks.filter((check) => check.why && check.state !== "met" && check.state !== "na" && !check.generic) };
  });
  const shared: Shared[] = [];
  for (const key of CHECK_KEYS) {
    const column = rows.map((row) => row.checks.find((check) => check.key === key)!);
    const first = column[0];
    if (rows.length > 1 && first && first.state !== "met" && first.why && column.every((check) => check.state === first.state && check.why === first.why)) {
      shared.push({ key, label: first.label, why: first.why, source: first.source });
    }
  }
  const shown = rows.map((row) => ({ ...row, notes: row.notes.filter((note) => !shared.some((item) => item.key === note.key)) }));
  const signature = (row: Row): string => row.checks.map((check) => check.state).join(" ");
  const entries: Entry[] = [];
  const groups = new Map<string, Extract<Entry, { kind: "group" }>>();
  const alike = new Map<string, number>();
  for (const row of shown) if (!row.notes.length) alike.set(signature(row), (alike.get(signature(row)) ?? 0) + 1);
  for (const row of [...shown].reverse()) {
    const key = signature(row);
    if (row.notes.length || row.surface.confirmed || (alike.get(key) ?? 0) < 2) {
      entries.push({ kind: "product", row });
      continue;
    }
    const group = groups.get(key);
    if (group) group.rows.push(row);
    else {
      const created = { kind: "group" as const, rows: [row], checks: row.checks };
      groups.set(key, created);
      entries.push(created);
    }
  }
  return {
    total: ledger.summary.total,
    green: ledger.summary.confirmed,
    rows: shown,
    entries,
    sky: [...counted].sort((a, b) => a.id.localeCompare(b.id)),
    shared,
  };
}

/** A check that changed between two ledgers: it passes now and did not, or the other way round. */
export interface Change {
  id: string;
  name: string;
  key: CheckKey;
  label: string;
  passes: boolean;
}

/** What changed between an earlier ledger and this one, by the ledger's own conditions; products in only one of them are left out. */
export function changesBetween(before: Pick<Previous, "surfaces">, after: Ledger): Change[] {
  const earlier = new Map(before.surfaces.map((surface) => [surface.id, surface]));
  const changes: Change[] = [];
  for (const surface of after.surfaces.filter((item) => item.inScope)) {
    const old = earlier.get(surface.id);
    if (!old?.conditions) continue;
    for (const key of CHECK_KEYS) {
      const was = (old.conditions as Partial<Record<string, { met: boolean }>>)[key]?.met;
      const is = surface.conditions[key].met;
      if (typeof was === "boolean" && was !== is) changes.push({ id: surface.id, name: surface.name, key, label: CHECK_SHORT[key], passes: is });
    }
  }
  return changes;
}
