import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";

/** Stands in for every content hash in a built file, as long as a hash, so a renamed chunk measures the same. */
const PLACEHOLDER = "________";

/**
 * The content hashes in a build's file names (`name-<hash>.js`): Vite's eight characters before the extension. A chunk
 * names the chunks it imports by those file names, so one module's change renames every chunk that imports it.
 */
export function assetHashes(files: Iterable<string>): string[] {
  return [...new Set([...files].flatMap((file) => /-([\w-]{8})\.[a-z0-9]+$/i.exec(file)?.[1] ?? []))];
}

/**
 * A built file's gzip size with every content hash in it replaced by one placeholder. Without that, a module that changes
 * by a few bytes renames itself in each chunk that imports it, and the new names compress differently: noise several times
 * the change's own cost over the voyage's first load (ourostack/ouro-ui#1276), so a ceiling near its limit failed at random. Measured this way, a rename costs nothing and the count moves only with what the code is.
 */
export function stableGzip(source: string, hashes: readonly string[]): number {
  if (hashes.length === 0) return gzipSync(source).byteLength;
  const pattern = new RegExp(hashes.join("|"), "g");
  return gzipSync(source.replace(pattern, PLACEHOLDER)).byteLength;
}

/** The hashes of every file the site's build wrote to `site/dist/assets`. */
export function distHashes(): string[] {
  return assetHashes(readdirSync(resolve("site/dist/assets")));
}

/** A file in `site/dist`, measured with stableGzip. */
export function distGzip(file: string, hashes: readonly string[]): number {
  return stableGzip(readFileSync(resolve("site/dist", file), "utf8"), hashes);
}
