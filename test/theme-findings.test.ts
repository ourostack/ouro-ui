import { expect, it } from "vitest";
import { compareFinding, themeFindings, type ThemeFinding } from "./themes/theme-findings.ts";

// The themes suite (test/themes/) lets a story keep a violation its fixture's own values cause
// only when it is pinned in themeFindings, node by node. This checks that pinning.

const contrast = { phase: "closed", rule: "color-contrast", target: 'button[aria-label="Save"] > span' };
const finding: ThemeFinding = { violations: [contrast], why: "The theme's primary is 4.54:1 on its page." };

it("accepts a story that flags exactly its pinned nodes", () => {
  expect(compareFinding([contrast], finding)).toEqual({ unexpected: [], missing: [] });
});

it("still fails on a new node, rule or phase in a story with a finding", () => {
  const extra = [
    contrast,
    { ...contrast, target: 'button[aria-label="Delete"] > span' },
    { ...contrast, rule: "link-name" },
    { ...contrast, phase: 'with "Actions" open' },
  ];
  expect(compareFinding(extra, finding).unexpected).toEqual([
    'closed | color-contrast | button[aria-label="Delete"] > span',
    'closed | link-name | button[aria-label="Save"] > span',
    'with "Actions" open | color-contrast | button[aria-label="Save"] > span',
  ]);
});

it("fails once a pinned node passes, so the finding goes", () => {
  expect(compareFinding([], finding)).toEqual({ unexpected: [], missing: ['closed | color-contrast | button[aria-label="Save"] > span'] });
});

it("treats every violation as unexpected in a story with no finding", () => {
  expect(compareFinding([contrast], undefined)).toEqual({ unexpected: ['closed | color-contrast | button[aria-label="Save"] > span'], missing: [] });
});

it("pins every listed finding to at least one node, with its reason", () => {
  for (const [story, entry] of Object.entries(themeFindings)) {
    expect(story).toMatch(/^(nova|vega|cookbook) (light|dark) \S+\/\S+$/);
    expect(entry.violations.length, story).toBeGreaterThan(0);
    expect(entry.why, story).not.toBe("");
  }
});
