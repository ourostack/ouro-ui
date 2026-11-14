// The files behind the parity tables on the site's Apple page (site/src/apple/system.tsx): copies of core's
// component claims, action claims and parity.json at the release scripts/parity-data/provenance.json names.
//
//   node scripts/platform-parity.mjs   fail when a copy differs from its recorded hash
//   node scripts/platform-parity.mjs --pins   also fail when a copy differs from core's release (network)
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dataDir = join(dirname(fileURLToPath(import.meta.url)), "parity-data");

const read = (name, dir = dataDir) => JSON.parse(readFileSync(join(dir, name), "utf8"));

export function load(dir = dataDir) {
  return { provenance: read("provenance.json", dir), components: read("components.claims.json", dir), actions: read("actions.claims.json", dir), parity: read("parity.json", dir) };
}

const sha = (buffer) => createHash("sha256").update(buffer).digest("hex");

/** Each copy's hash against provenance.json: the offline half of --pins. */
export function pinProblems(provenance, dir = dataDir) {
  return Object.entries(provenance.files).flatMap(([name, expected]) => {
    const actual = sha(readFileSync(join(dir, name)));
    return actual === expected ? [] : [`${name} is ${actual}, and provenance.json says ${expected}.`];
  });
}

async function get(url) {
  const response = await globalThis.fetch(url, { headers: process.env.GH_TOKEN ? { authorization: `Bearer ${process.env.GH_TOKEN}` } : {} });
  if (!response.ok) throw new Error(`${url} answered ${response.status}.`);
  return Buffer.from(await response.arrayBuffer());
}

/** The copies against core's release itself: the manifest's hashes, and parity.json's bytes at the tag. */
async function releaseProblems(provenance) {
  const { coreRepo: repo, coreTag: tag } = provenance;
  const manifest = JSON.parse(await get(`https://github.com/${repo}/releases/download/${tag}/dist-manifest.json`));
  const problems = [];
  for (const [name, path] of [["components.claims.json", "dist/hx/components.claims.json"], ["actions.claims.json", "dist/ax/actions.claims.json"]]) {
    if (manifest.files[path] !== provenance.files[name]) problems.push(`${name}: core ${tag} says ${manifest.files[path]}, provenance.json says ${provenance.files[name]}.`);
  }
  const atTag = sha(await get(`https://raw.githubusercontent.com/${repo}/${tag}/parity.json`));
  if (atTag !== provenance.files["parity.json"]) problems.push(`parity.json at ${tag} is ${atTag}, provenance.json says ${provenance.files["parity.json"]}.`);
  return problems;
}

async function main(args) {
  const data = load();
  if (args.includes("--pins")) {
    const problems = [...pinProblems(data.provenance), ...(await releaseProblems(data.provenance))];
    for (const problem of problems) console.log(`::error::${problem}`);
    if (problems.length === 0) console.log(`The copies in scripts/parity-data match core ${data.provenance.coreTag}.`);
    return problems.length === 0 ? 0 : 1;
  }
  const problems = pinProblems(data.provenance);
  for (const problem of problems) console.log(`::error::${problem}`);
  if (problems.length > 0) return 1;
  console.log(`The copies in scripts/parity-data match their recorded hashes (core ${data.provenance.coreTag}).`);
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = await main(process.argv.slice(2));
