// The census's release manifest: every file a product vendors, pinned by SHA-256, and the checker's hash a report
// carries (`checker.sha256`), so the adoption ledger can tell a report came from a released census rather than one a
// product edited.
//
//   node scripts/ouro-census/manifest.mts --check   (exit 1 when dist-manifest.json is out of date)
//   node scripts/ouro-census/manifest.mts --write
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { CENSUS_VERSION, CHECKER_FILES, checkerHash } from "./checker.mts";

const HERE = dirname(fileURLToPath(import.meta.url));

/** What a product copies: the checker's files, and the helper CI uses to find a pull request's base commit. */
export const VENDORED_FILES: readonly string[] = [...CHECKER_FILES, "base.mts"].sort();

export interface CensusManifest {
  tool: "ouro-census";
  version: string;
  checker: string;
  files: Record<string, string>;
}

export async function censusManifest(dir = HERE): Promise<CensusManifest> {
  const files: Record<string, string> = {};
  for (const file of VENDORED_FILES) files[file] = createHash("sha256").update(await readFile(join(dir, file))).digest("hex");
  return { tool: "ouro-census", version: CENSUS_VERSION, checker: await checkerHash(dir), files };
}

const text = (m: CensusManifest) => `${JSON.stringify(m, null, 2)}\n`;

/** `--write` writes the manifest, `--check` fails (1) when it is out of date; anything else is a usage error (2). */
export async function runManifest(flag: string | undefined, dir = HERE): Promise<{ code: number; message?: string }> {
  const path = join(dir, "dist-manifest.json");
  const wanted = text(await censusManifest(dir));
  if (flag === "--write") {
    await writeFile(path, wanted);
    return { code: 0 };
  }
  if (flag === "--check") {
    const committed = await readFile(path, "utf8").catch(() => "");
    if (committed === wanted) return { code: 0 };
    return { code: 1, message: "ouro-census: dist-manifest.json is out of date. Fix: node scripts/ouro-census/manifest.mts --write" };
  }
  return { code: 2, message: "usage: node scripts/ouro-census/manifest.mts --check | --write" };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { code, message } = await runManifest(process.argv[2]);
  if (message) process.stderr.write(`${message}\n`);
  process.exitCode = code;
}
