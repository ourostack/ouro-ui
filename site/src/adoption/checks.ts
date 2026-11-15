import type { Ledger, LedgerCell, Surface } from "./ledger";

/*
 * The page's reading of the ledger: for each product, its four checks and, for each one that is not met, one short line
 * saying what is missing and where that came from. It reads only what the ledger says. A check is "met" only when the
 * ledger's own condition is met, "unmeasured" when the measurement behind it has no value, and "na" when the ledger says
 * the check does not apply; anything else is "missing".
 */

export type CheckKey = "current" | "oneAction" | "must" | "gaveBack";
export type CheckState = "met" | "missing" | "unmeasured" | "na";

export const CHECK_KEYS: readonly CheckKey[] = ["current", "oneAction", "must", "gaveBack"];

/** The column headings: one or two words each, the ledger's own label being the long form. */
export const CHECK_SHORT: Record<CheckKey, string> = { current: "Current", oneAction: "Actions", must: "AX must", gaveBack: "Gave back" };

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
}

const sentence = (text: string): string => (text ? text[0]!.toUpperCase() + text.slice(1) : text);

/** A cell's note without the ledger's "not measured: " or "n/a: " lead-in, and without a full stop at the end. */
const reason = (cell: LedgerCell<unknown>, fallback: string): string => sentence((cell.note ?? fallback).replace(/^(not measured|n\/a):\s*/i, "").replace(/\.$/, ""));

const plural = (count: number, word: string): string => `${count} ${word}${count === 1 ? "" : "s"}`;

/** The ledger's reason for a missing measurement, shortened where it is one the page knows. */
const PRIVATE = /\bprivate\b/i;
const unmeasured = (cell: LedgerCell<unknown>, otherwise?: string): string => (PRIVATE.test(cell.note ?? "") ? "Private repository, so not readable" : (otherwise ?? reason(cell, "not measured yet")));

function unmeasuredOrNa(cell: LedgerCell<unknown>): CheckState {
  return /^n\/a\b/i.test(cell.note ?? "") ? "na" : "unmeasured";
}

function current(surface: Surface): Omit<Check, "key" | "label"> {
  const cell = surface.cells.pins;
  const met = surface.conditions.current.met;
  if (met) return { state: "met", why: null, source: cell.source };
  if (cell.value === null) return { state: unmeasuredOrNa(cell), why: unmeasured(cell), source: cell.source };
  if (cell.value.length === 0) return { state: "missing", why: "Doesn't use Ouro UI yet", source: cell.source };
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

function oneAction(surface: Surface): Omit<Check, "key" | "label"> {
  const cell = surface.cells.actions;
  if (surface.conditions.oneAction.met) return { state: "met", why: null, source: cell.source };
  if (cell.value === null) return { state: unmeasuredOrNa(cell), why: reason(cell, "not measured yet"), source: cell.source };
  // The ledger's note says how it looked; the row needs only the gap, and the link carries the detail.
  return { state: "missing", why: /not released/i.test(cell.note ?? "") ? reason(cell, "") : "Actions not declared yet", source: cell.source };
}

function must(surface: Surface): Omit<Check, "key" | "label"> {
  const cell = surface.cells.xray;
  if (surface.conditions.must.met) return { state: "met", why: null, source: cell.value?.run ?? cell.source };
  if (cell.value === null) return { state: unmeasuredOrNa(cell), why: unmeasured(cell, /x-ray/i.test(cell.note ?? "") ? "X-ray doesn't run in CI yet" : undefined), source: cell.source };
  const { must: total, mustHolding, run } = cell.value;
  if (total === 0) return { state: "missing", why: "Must claims not written yet", source: run ?? cell.source };
  return { state: "missing", why: `${total - mustHolding} of ${plural(total, "must claim")} fail`, source: run ?? cell.source };
}

function gaveBack(surface: Surface): Omit<Check, "key" | "label"> {
  const cell = surface.cells.giveBack;
  if (surface.conditions.gaveBack.met) return { state: "met", why: null, source: cell.source };
  if (cell.value === null) return { state: unmeasuredOrNa(cell), why: reason(cell, "not measured yet"), source: cell.source };
  return { state: "missing", why: "Nothing given back yet", source: cell.source };
}

const READERS: Record<CheckKey, (surface: Surface) => Omit<Check, "key" | "label">> = { current, oneAction, must, gaveBack };

/** A product's four checks, in the page's column order. */
export function checksOf(surface: Surface): Check[] {
  return CHECK_KEYS.map((key) => ({ key, label: surface.conditions[key].label, ...READERS[key](surface) }));
}

/** A line every counted product shares for one check, said once on the page instead of on every row. */
export interface Shared {
  key: CheckKey;
  label: string;
  why: string;
  source: string | null;
}

export interface Board {
  total: number;
  green: number;
  /** The counted products, furthest from green first, as the ledger orders them. */
  rows: Array<{ surface: Surface; checks: Check[] }>;
  /** The counted products in a fixed order (by id), so a product keeps its place in the sky as the ledger changes. */
  sky: Surface[];
  shared: Shared[];
}

/** Everything the page shows, read from a ledger. Green is the ledger's own `confirmed`, never worked out here. */
export function boardOf(ledger: Ledger): Board {
  const counted = ledger.surfaces.filter((surface) => surface.inScope);
  const byId = new Map(counted.map((surface) => [surface.id, surface]));
  const ordered = [...ledger.summary.order.map((id) => byId.get(id)).filter((surface): surface is Surface => Boolean(surface)), ...counted.filter((surface) => !ledger.summary.order.includes(surface.id))];
  const rows = ordered.map((surface) => ({ surface, checks: checksOf(surface) }));
  const shared: Shared[] = [];
  for (const key of CHECK_KEYS) {
    const column = rows.map((row) => row.checks.find((check) => check.key === key)!);
    const first = column[0];
    if (rows.length > 1 && first && first.state !== "met" && first.why && column.every((check) => check.state === first.state && check.why === first.why)) {
      shared.push({ key, label: first.label, why: first.why, source: first.source });
    }
  }
  return {
    total: ledger.summary.total,
    green: ledger.summary.confirmed,
    rows,
    sky: [...counted].sort((a, b) => a.id.localeCompare(b.id)),
    shared,
  };
}
