import { ouro } from "../../package.json";

/**
 * The newest released tag, such as "v0.3.0": package.json's ouro.latestRelease, the one source
 * (scripts/latest-release.mjs). Its own module so a page that only needs the tag doesn't carry
 * UPGRADING.md (release.ts) in its JavaScript.
 */
export const latestRelease: string = ouro.latestRelease;
