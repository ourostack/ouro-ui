// The site's drawings, in site/src/nautilus/art, and where each came from (manifest.json):
//
//   node site/scripts/art.mts           fails when a drawing is unlisted or missing, its checksum
//                                       or licence is off, a public-domain plate breaks the rules
//                                       below, a Nautilus drawing has no Verne quotes for its
//                                       shape, or the drawings outgrow the hero's budget
//   node site/scripts/art.mts --write   rewrites each entry's sha256 from its file
//
// Original drawings are licensed with the repository. Public-domain art is allowed only from the
// novel's own illustrators (de Neuville and Riou, 1869 to 1871), from Wikimedia Commons or Gallica,
// so nothing from the 1954 film's design can arrive by way of "public domain".
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repo = join(dirname(fileURLToPath(import.meta.url)), "../..");
export const artDir = join(repo, "site/src/nautilus/art");

/** The hero's art budget: every drawing together, gzipped (site-design.md, Budgets). */
export const ART_BUDGET = 35 * 1024;

export const LICENCES = ["repository", "public-domain"] as const;
const ILLUSTRATORS = ["Alphonse de Neuville", "Édouard Riou"];
const HOSTS = ["commons.wikimedia.org", "upload.wikimedia.org", "gallica.bnf.fr"];
const REQUIRED = ["file", "title", "creator", "source", "published", "licence", "sha256", "modifications"] as const;

export interface ShapeNote {
  quote: string;
  chapter: string;
}

export interface ArtEntry {
  file: string;
  title: string;
  creator: string;
  source: string;
  published: string;
  licence: string;
  sha256: string;
  modifications: string;
  shape?: ShapeNote[];
}

export interface ArtSet {
  manifest: { art: ArtEntry[] };
  files: Map<string, Buffer>;
}

export function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function readArt(dir: string): ArtSet {
  const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")) as ArtSet["manifest"];
  const files = new Map<string, Buffer>();
  for (const name of readdirSync(dir).sort()) {
    if (name === "manifest.json") continue;
    files.set(name, readFileSync(join(dir, name)));
  }
  return { manifest, files };
}

function hostOf(source: string): string | undefined {
  try {
    return new URL(source).host;
  } catch {
    return undefined;
  }
}

/** Every way the drawings and their manifest disagree, as one line each. Empty when all is well. */
export function checkArt({ manifest, files }: ArtSet): string[] {
  const errors: string[] = [];
  const listed = new Set(manifest.art.map((entry) => entry.file));
  for (const name of files.keys()) if (!listed.has(name)) errors.push(`${name} is not in manifest.json: add who drew it, where it came from and its licence`);

  for (const entry of manifest.art) {
    const name = entry.file;
    for (const field of REQUIRED) if (typeof entry[field] !== "string" || entry[field].trim() === "") errors.push(`${name}: ${field} is required`);
    const bytes = files.get(name);
    if (!bytes) {
      errors.push(`${name} is listed but missing from site/src/nautilus/art`);
      continue;
    }
    const actual = sha256(bytes);
    if (entry.sha256 !== actual) errors.push(`${name}: sha256 is ${entry.sha256} but the file's is ${actual}: run node site/scripts/art.mts --write after checking the change`);
    if (!(LICENCES as readonly string[]).includes(entry.licence)) errors.push(`${name}: licence "${entry.licence}" is not one of ${LICENCES.join(", ")}`);

    if (entry.source === "original-svg") {
      if (entry.licence !== "repository") errors.push(`${name}: an original drawing is licensed with the repository, not "${entry.licence}"`);
    } else if (entry.licence === "public-domain") {
      if (!ILLUSTRATORS.includes(entry.creator)) errors.push(`${name}: public-domain art must be by ${ILLUSTRATORS.join(" or ")}, not ${entry.creator}`);
      const year = Number(/\d{4}/.exec(entry.published ?? "")?.[0]);
      if (!(year <= 1871)) errors.push(`${name}: public-domain art must be published by 1871, not ${entry.published}`);
      const host = hostOf(entry.source);
      if (!host || !HOSTS.includes(host)) errors.push(`${name}: public-domain art must come from commons.wikimedia.org or gallica.bnf.fr, not ${entry.source}`);
    } else {
      errors.push(`${name}: source is "original-svg" or a public-domain plate's URL`);
    }

    if (entry.source === "original-svg" && /nautilus/i.test(entry.title ?? "")) {
      if (!entry.shape?.length) errors.push(`${name}: a drawing of the Nautilus needs shape notes quoting Verne for every feature it draws`);
      else if (entry.shape.some((note) => !note.quote?.trim() || !note.chapter?.trim())) errors.push(`${name}: each shape note needs a quote and its chapter`);
    }
  }

  const total = gzipSync(Buffer.concat([...files.values()])).length;
  if (total > ART_BUDGET) errors.push(`The drawings are ${total} bytes gzipped, over the hero's ${ART_BUDGET} byte gzip budget`);
  return errors;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const set = readArt(artDir);
  if (process.argv.includes("--write")) {
    for (const entry of set.manifest.art) {
      const bytes = set.files.get(entry.file);
      if (bytes) entry.sha256 = sha256(bytes);
    }
    writeFileSync(join(artDir, "manifest.json"), `${JSON.stringify(set.manifest, null, 2)}\n`);
  }
  const errors = checkArt(set);
  if (errors.length) {
    console.error(errors.join("\n"));
    process.exit(1);
  }
  console.log(`${set.manifest.art.length} drawings match manifest.json`);
}
