// A product's own walker that tries to exclude a hit: only the built-in walkers' closed exclusions count.
import type { Walker } from "../types.mts";

export const walk: Walker = async ({ product, source }) => ({
  doors: [{ id: "skill:start-task", kind: "skill", product, name: "start-task", description: "", file: `${source}/start-task/SKILL.md`, line: 1, card: null, evidence: {} }],
  errors: [],
  excluded: [{ hit: "skills/secret", category: "vendored" }],
});
