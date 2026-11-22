// The count of .github/headroom.json's exemptions against the pull request's base: it only goes
// down, and a larger file needs a `headroom: <reason>` line in the description, as claims.mjs ratchet
// does for claims.config.json's exemptions.
//
//   HEADROOM_BASE_REF=origin/main PR_BODY="…" node scripts/headroom-ratchet.mjs
import { execFileSync } from "node:child_process";
import { ratchetProblems, readExemptions } from "./headroom.mjs";

const ref = process.env.HEADROOM_BASE_REF;
if (!ref) {
  process.stderr.write("headroom-ratchet needs HEADROOM_BASE_REF, the pull request's base (origin/main).\n");
  process.exit(2);
}
const show = () => {
  try {
    return JSON.parse(execFileSync("git", ["show", `${ref}:.github/headroom.json`], { encoding: "utf8" }));
  } catch {
    return [];
  }
};
const problems = ratchetProblems({ base: show(), head: readExemptions(), body: process.env.PR_BODY ?? "" });
for (const problem of problems) process.stderr.write(`${problem}\n`);
if (problems.length > 0) process.exit(1);
process.stdout.write("No headroom exemption added without a reason.\n");
