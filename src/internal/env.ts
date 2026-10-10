/**
 * True when running in a production bundle. Uses the bundler convention
 * (`process.env.NODE_ENV`), which consumers' bundlers replace statically so dev
 * messages are stripped. Without a `process` object (a plain browser with no
 * bundler), this counts as development.
 */
export function isProduction(): boolean {
  return typeof process !== "undefined" && process.env.NODE_ENV === "production";
}
