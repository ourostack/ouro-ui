// Web and Apple parity as data, from core's own files: Ouro HX's component claims (each names how
// web proves it and how Apple proves it), Ouro AX's action claims (each names the surfaces it
// covers) and parity.json (the web files core generates, compared byte for byte). Nothing here is
// typed by hand: a claim whose web check is missing shows as "Not yet" on the page.
//
// Pure, so the site renders the same rows scripts/platform-parity.mjs writes into
// docs/platforms/README.md.

/** Where each surface of an action runs. The ids are the ones actions.claims.json's appliesTo uses. */
export const SURFACES = {
  cli: { name: "Command line", platform: "Any" },
  mcp: { name: "MCP tool", platform: "Any" },
  webmcp: { name: "WebMCP tool", platform: "Web" },
  "web-control": { name: "Web control", platform: "Web" },
  "app-intent": { name: "App Intent", platform: "Apple" },
  "swiftui-button": { name: "SwiftUI button", platform: "Apple" },
  reins: { name: "Reins action", platform: "Apple" },
};

const NOT_YET = /Not yet checked on (web|apple):\s*(.+?)(?:\.(?:\s|$))/i;

/** How one side proves a claim: "checked", "partly" (with what is still open), or "none". */
export function sideState(text) {
  if (typeof text !== "string" || text.trim() === "") return { state: "none", open: "" };
  const gap = NOT_YET.exec(text);
  return gap ? { state: "partly", open: gap[2] } : { state: "checked", open: "" };
}

/** One row per Ouro HX component claim, in the claim file's order. */
export function componentRows(claimsFile) {
  return claimsFile.claims.map((claim) => ({
    id: claim.id,
    tier: claim.tier,
    appliesTo: claim.appliesTo,
    web: sideState(claim.checks?.web),
    apple: sideState(claim.checks?.apple),
  }));
}

/** One row per surface an action claim covers, with how many of the claims name it. */
export function surfaceRows(actionClaimsFile) {
  const claims = actionClaimsFile.claims;
  return Object.entries(SURFACES)
    .map(([id, surface]) => ({ id, ...surface, claims: claims.filter((claim) => claim.appliesTo.includes(id)).map((claim) => claim.id) }))
    .filter((row) => row.claims.length > 0);
}

/** The totals the parity table sums up. */
export function totals(rows) {
  const count = (side, state) => rows.filter((row) => row[side].state === state).length;
  return {
    claims: rows.length,
    web: { checked: count("web", "checked"), partly: count("web", "partly"), none: count("web", "none") },
    apple: { checked: count("apple", "checked"), partly: count("apple", "partly"), none: count("apple", "none") },
  };
}

/** The words for one side's state in a table cell. */
export function cellText({ state, open }) {
  if (state === "checked") return "Covered";
  if (state === "partly") return `Partly. Not yet: ${open}`;
  return "Not yet";
}
