// The registry files core owns: copied from an ourostack/ouro-ui-core release byte for byte and pinned by SHA-256 in
// test/fixtures/a2ui/core.json, which test/a2ui.test.ts checks, along with this list. Core's own tests and its
// conformance cases hold their lines, and an edit here to cover a line or disable a mutant would break the pin, so
// coverage (the first entry of vitest.config.ts's coverage exclude), mutation testing (scripts/mutation/cache.mjs)
// and the docs' type index (scripts/gen-docs.mts) leave them out. Web's tests still run every conformance case
// through them.

/** Repository paths of the registry files vendored from core. */
export const vendored = ["registry/ouro/lib/ouro/a2ui-core.ts"];
