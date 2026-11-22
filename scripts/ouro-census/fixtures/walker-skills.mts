// A product's own walker, as a config's `walkers` names it: it finds two skill doors under its source folder.
import type { Walker } from "../types.mts";

export const walk: Walker = async ({ product, source }) => ({
  doors: ["start-task", "lesson-capture"].map((name, i) => ({
    id: `skill:${name}`,
    kind: "skill",
    product,
    name,
    description: "",
    file: `${source}/${name}/SKILL.md`,
    line: i + 1,
    card: null,
    evidence: {},
  })),
  errors: [],
});
