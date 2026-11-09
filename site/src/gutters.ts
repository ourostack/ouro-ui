/**
 * Side gutters for a full-width strip whose contents line up with the site's one column (75rem, 1200px at 16px:
 * voyage/layout.tsx Container, which the docs share). The header's bars and the footer use them, on every page alike,
 * so the logo, the family's links and the footer's start at the same place wherever you are; only the content inside
 * the column changes. In rem, so the column grows with the type on a very wide screen (styles.css).
 */
const SITE = "ps-[max(1rem,calc(50%-37.5rem))] pe-[max(1rem,calc(50%-37.5rem))] sm:ps-[max(2rem,calc(50%-37.5rem))] sm:pe-[max(2rem,calc(50%-37.5rem))]";
export const GUTTERS = { voyage: SITE, docs: SITE } as const;
