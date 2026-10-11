import pkg from "../../package.json";
import upgradingNote from "../../UPGRADING.md?raw";

/** The newest released tag, such as "v0.3.0": package.json's ouro.latestRelease, the one source (scripts/latest-release.mjs). */
export const latestRelease: string = pkg.ouro.latestRelease;

/**
 * UPGRADING.md with its {{latestRelease}} placeholder filled in, as README.md and the release
 * notes show it, without the line that explains the placeholder to readers of the raw file
 * (scripts/upgrade-note.mjs rawHint).
 */
export const upgrading: string = upgradingNote
  .replace(/^> \*\*Reading this file on GitHub\?\*\*.*\n+/m, "")
  .replaceAll("{{latestRelease}}", latestRelease);
