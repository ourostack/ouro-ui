import pkg from "../../package.json" with { type: "json" };

/** The published version of `@ouro.bot/ui`, read from `package.json` at build time. */
export const version: string = pkg.version;
