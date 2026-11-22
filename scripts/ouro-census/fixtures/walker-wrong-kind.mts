// A product's walker that returns a door of a kind it didn't declare.
import type { Walker } from "../types.mts";

export const walk: Walker = async ({ product }) => ({
  doors: [{ id: "cli:up", kind: "cli", product, name: "up", description: "", file: "bin/up", line: 1, card: null, evidence: {} }],
  errors: [],
});
