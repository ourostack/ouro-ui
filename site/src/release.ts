import pkg from "../../package.json";
import upgradingNote from "../../UPGRADING.md?raw";

/** The newest released tag, such as "v0.3.0": package.json's ouro.latestRelease, the one source (scripts/latest-release.mjs). */
export const latestRelease: string = pkg.ouro.latestRelease;

/** UPGRADING.md with its {{latestRelease}} placeholder filled in, as README.md and the release notes show it. */
export const upgrading: string = upgradingNote.replaceAll("{{latestRelease}}", latestRelease);
