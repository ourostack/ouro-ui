export { findDecisionIssues };
export type { Condition, Decision };

import type { PageIssue } from "./size-check.ts";

// A decision a person made, written down as a check that runs with the rest (ouro-check.json "decisions"): the
// elements `selector` matches, what must hold for them, and where.
//
//   name      what was decided, in the person's words: it heads the finding
//   selector  the elements the decision is about
//   pages     a page glob (two stars for all pages); all pages when it is left out
//   width     { min, max }: the screen widths it holds at, in pixels; all when it is left out
//   within    a CSS selector for the boxes `count` is counted in, one box at a time; the whole page when it is left out
//   count     how many drawn matches there may be: a number, or { min, max }
//   only      every drawn match must also match this selector ("the toolbar holds only window-wide actions")
//   expect    each drawn match's computed style by property name ("border-radius"), or its box by "@width", "@height",
//             "@x", "@y", "@right" or "@bottom" (pixels, from the page's top left), against a condition
//
// A condition is a text the value must equal, a number it must equal to within half a pixel, or { min, max, not, match }:
// at least, at most, not equal to, and a regular expression's source the value must match.
type Condition = string | number | { min?: number; max?: number; not?: string | number; match?: string };

interface Decision {
  name: string;
  selector: string;
  pages?: string;
  width?: { min?: number; max?: number };
  within?: string;
  count?: number | { min?: number; max?: number };
  only?: string;
  expect?: Record<string, Condition>;
}

// Runs in the page (page.evaluate), so nothing in it may close over anything outside its function.
function findDecisionIssues(decisions: Decision[]): PageIssue[] {
  const issues: PageIssue[] = [];
  const counter = window as unknown as { __ouroCheckRef?: number };
  const ref = (els: Element[]) => {
    counter.__ouroCheckRef = (counter.__ouroCheckRef ?? 0) + 1;
    const id = `d${counter.__ouroCheckRef}`;
    for (const el of els) el.setAttribute("data-ouro-check-ref", `${el.getAttribute("data-ouro-check-ref") ?? ""} ${id}`.trim());
    return id;
  };
  const describe = (el: Element) => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${el.classList.length ? `.${[...el.classList].slice(0, 3).join(".")}` : ""}`;
  const drawn = (el: Element) => el.getClientRects().length > 0 && !el.closest("[data-ouro-veil], [hidden], template");
  const read = (el: Element, key: string) => {
    if (!key.startsWith("@")) return getComputedStyle(el).getPropertyValue(key).trim();
    const r = el.getBoundingClientRect();
    return String({ "@width": r.width, "@height": r.height, "@x": r.left + scrollX, "@y": r.top + scrollY, "@right": r.right + scrollX, "@bottom": r.bottom + scrollY }[key]);
  };
  const same = (value: string, want: string | number) => (typeof want === "number" ? Math.abs(parseFloat(value) - want) <= 0.5 : value === want);
  // Why a value fails its condition, or null when it holds.
  const unmet = (value: string, want: Condition): string | null => {
    if (typeof want !== "object") return same(value, want) ? null : `is ${value}, not ${want}`;
    const n = parseFloat(value);
    if (want.min !== undefined && !(n >= want.min)) return `is ${value}, under ${want.min}`;
    if (want.max !== undefined && !(n <= want.max)) return `is ${value}, over ${want.max}`;
    if (want.not !== undefined && same(value, want.not)) return `is ${value}, which it must not be`;
    if (want.match !== undefined && !new RegExp(want.match).test(value)) return `is ${value}, which does not match ${want.match}`;
    return null;
  };
  const bounds = (want: number | { min?: number; max?: number }) => (typeof want === "number" ? { min: want, max: want } : want);
  for (const { name, selector, within, count, only, expect } of decisions) {
    const find = (css: string) => {
      try {
        return [...document.querySelectorAll(css)].filter(drawn);
      } catch {
        issues.push({ ref: ref([document.body]), rule: "decision", element: "body", detail: `"${name}": ${css} is not a CSS selector` });
        return null;
      }
    };
    const matches = find(selector);
    const boxes = count === undefined ? [] : within ? find(within) : [document.body];
    if (!matches || !boxes) continue;
    const fail = (els: Element[], what: string) =>
      issues.push({ ref: ref(els), rule: "decision", element: els.length === 1 ? describe(els[0]!) : `${els.length} × ${describe(els[0]!)}`, detail: `"${name}": ${what}` });
    if (count !== undefined) {
      const { min = 0, max = Infinity } = bounds(count);
      for (const box of boxes) {
        const inside = matches.filter((el) => box.contains(el));
        const wanted = `${min === max ? min : max === Infinity ? `at least ${min}` : `${min} to ${max}`} of ${selector}`;
        if (inside.length < min || inside.length > max) fail(inside.length ? inside : [box], `${within ? `in ${describe(box)} ` : ""}${inside.length} found, ${wanted} wanted`);
      }
    }
    for (const el of matches) {
      if (only && !el.matches(only)) fail([el], `${describe(el)} is not ${only}`);
      for (const [key, want] of Object.entries(expect ?? {})) {
        const why = unmet(read(el, key), want);
        if (why) fail([el], `${key} ${why}`);
      }
    }
  }
  return issues;
}
