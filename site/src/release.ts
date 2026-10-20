import upgradingNote from "../../UPGRADING.md?raw";
import { latestRelease } from "./latest-release";

export { latestRelease };

/**
 * UPGRADING.md with its {{latestRelease}} placeholder filled in, as README.md and the release
 * notes show it, without the line that explains the placeholder to readers of the raw file
 * (scripts/upgrade-note.mjs rawHint).
 */
export const upgrading: string = upgradingNote
  .replace(/^> \*\*Reading this file on GitHub\?\*\*.*\n+/m, "")
  .replaceAll("{{latestRelease}}", latestRelease);
