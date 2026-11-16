import { renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

/**
 * Writes `text` to `path` through a file beside it that is then renamed over it, so a reader in
 * another process sees the old file or the new one, never one cut short. A generated file such as
 * registry.json is read by checks that run beside the tests that write it again (#1615).
 */
export function writeAtomic(path, text) {
  const next = join(dirname(path), `.${basename(path)}.${process.pid}.tmp`);
  try {
    writeFileSync(next, text);
    renameSync(next, path);
  } finally {
    rmSync(next, { force: true });
  }
}
