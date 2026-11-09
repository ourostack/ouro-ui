/**
 * Side gutters for a full-width strip whose contents line up with a page's column: the voyage's 1200px column
 * (voyage/layout.tsx Container) or the docs' (components/layout.tsx Container). The header's bars and the footer use them.
 */
export const GUTTERS = {
  voyage: "ps-[max(1rem,calc(50%-600px))] pe-[max(1rem,calc(50%-600px))] sm:ps-[max(2rem,calc(50%-600px))] sm:pe-[max(2rem,calc(50%-600px))]",
  docs: "ps-[max(1rem,calc(50%-560px))] pe-[max(1rem,calc(50%-560px))] sm:ps-[max(1.5rem,calc(50%-554px))] sm:pe-[max(1.5rem,calc(50%-554px))] lg:ps-[max(2rem,calc(50%-544px))] lg:pe-[max(2rem,calc(50%-544px))]",
} as const;
