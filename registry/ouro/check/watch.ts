export { changesBetween, waitForChange, watchLoop };

import { watch } from "node:fs";

/** A run's open findings, keyed by identity: a finding keeps its key from one run to the next. */
type Open = Map<string, string>;

// What a run adds and what it clears, in the order they are read: new findings first.
function changesBetween(before: Open, now: Open): string[] {
  return [...[...now].filter(([key]) => !before.has(key)).map(([, line]) => `+ ${line}`), ...[...before].filter(([key]) => !now.has(key)).map(([, line]) => `- ${line}`)];
}

// Resolves when a file under one of the folders changes (after it has been quiet for 300 ms, so a save that writes twice
// reruns once), or after the seconds, whichever comes first.
function waitForChange(folders: string[], seconds: number): Promise<void> {
  return new Promise((done) => {
    let quiet: NodeJS.Timeout | undefined;
    const watchers = folders.map((folder) =>
      watch(folder, { recursive: true }, () => {
        clearTimeout(quiet);
        quiet = setTimeout(finish, 300);
      }),
    );
    const limit = setTimeout(finish, seconds * 1000);
    function finish() {
      clearTimeout(quiet);
      clearTimeout(limit);
      for (const watcher of watchers) watcher.close();
      done();
    }
  });
}

/**
 * Runs the check, prints what changed since the run before (the first run prints the whole open list), waits, and goes
 * again, `times` runs or until the process stops. Returns the findings open at the end.
 */
async function watchLoop(options: { run: () => Promise<Open>; wait: () => Promise<void>; times: number; log: (line: string) => void }): Promise<Open> {
  let before: Open = new Map();
  for (let n = 1; n <= options.times; n++) {
    const now = await options.run();
    const lines = changesBetween(before, now);
    options.log(lines.length ? lines.join("\n") : `· no change, ${now.size} open`);
    before = now;
    if (n < options.times) await options.wait();
  }
  return before;
}
