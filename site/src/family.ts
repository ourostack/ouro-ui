import family from "./family.json";

/**
 * The Ouro family's sites, in the family's one order: a byte-for-byte copy of ourostack/.github's brand/family.json
 * (site/scripts/brand.test.mjs holds it to that file). The family bar over the header, the family footer and the menu
 * list them; this site is `ouro-ui`.
 */
export const FAMILY: ReadonlyArray<{ id: string; label: string; href: string }> = family.links;

/** This site's place in the family. */
export const FAMILY_CURRENT = "ouro-ui";
