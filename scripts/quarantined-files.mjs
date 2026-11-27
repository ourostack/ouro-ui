import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const quarantine = process.env.OURO_QUARANTINE_FILE ?? join(root, ".github/quarantine.json");

/**
 * The files a live whole-file quarantine entry (title `*`) names, from `entries`: a hang in one
 * starves the tests beside it, so no test name fails and the judge cannot forgive it. Blocking jobs
 * leave these files out and one non-blocking job runs them. An expired or removed entry drops out.
 */
export function quarantinedFiles(entries, now = new Date()) {
  const live = entries.filter((entry) => entry.title === "*" && new Date(entry.expiry).getTime() > now.getTime());
  return [...new Set(live.map((entry) => entry.file))].sort();
}

/** The live whole-file entries' files in .github/quarantine.json. */
export const quarantinedFilesNow = () => quarantinedFiles(JSON.parse(readFileSync(quarantine, "utf8")));
