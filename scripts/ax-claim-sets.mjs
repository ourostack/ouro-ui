#!/usr/bin/env node
// Keeps registry/ouro/ax/claim-sets.json: every Ouro AX claim set a release shipped, newest first, with the hash an X-ray
// report carries. The adoption ledger reads it at Ouro UI's latest release to tell a released claim set from a local
// or branch build, and how far behind an older one is.
//
//   node scripts/ax-claim-sets.mjs           # says whether the file lists the current claim set first
//   node scripts/ax-claim-sets.mjs --write   # puts the current claim set first when it changed
import { readFileSync, writeFileSync } from "node:fs";
import { URL, fileURLToPath } from "node:url";
import { CLAIM_SET } from "../registry/ouro/ax/ax-claims.ts";
import { claimSetHash } from "../registry/ouro/ax/xray.ts";

export const CLAIM_SETS_PATH = fileURLToPath(new URL("../registry/ouro/ax/claim-sets.json", import.meta.url));
const SHOWN_PATH = "registry/ouro/ax/claim-sets.json";

/** The current claim set as the file lists it; the release it first ships in is found by the ledger. */
export const currentClaimSet = () => ({
  version: CLAIM_SET.version,
  hash: claimSetHash(),
  firstRelease: null,
  claims: CLAIM_SET.claims.map(({ id, surface, tier }) => ({ id, surface, tier })),
});

/** `manifest` with the current claim set first, listed once. */
export function withCurrent(manifest) {
  const current = currentClaimSet();
  if (manifest.sets[0]?.hash === current.hash) return manifest;
  return { ...manifest, sets: [current, ...manifest.sets.filter((set) => set.hash !== current.hash)] };
}

/** What's wrong with `manifest`, as lines that say the fix. */
export function check(manifest) {
  if (manifest.sets[0]?.hash === claimSetHash()) return [];
  return [`${SHOWN_PATH} doesn't list Ouro AX's claim set ${CLAIM_SET.version} (${claimSetHash().slice(0, 12)}) first. Fix: node scripts/ax-claim-sets.mjs --write`];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const manifest = JSON.parse(readFileSync(CLAIM_SETS_PATH, "utf8"));
  if (process.argv.includes("--write")) {
    writeFileSync(CLAIM_SETS_PATH, `${JSON.stringify(withCurrent(manifest), null, 2)}\n`);
  } else {
    const problems = check(manifest);
    console.log(problems.length ? problems.join("\n") : `${SHOWN_PATH} lists claim set ${CLAIM_SET.version} first.`);
    process.exitCode = problems.length ? 1 : 0;
  }
}
