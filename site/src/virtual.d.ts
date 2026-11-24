/** The hero's proof line and install item, computed when the site builds (site/scripts/proof.mts). */
declare module "virtual:site-proof" {
  const proof: {
    components: number;
    typescript: boolean;
    engines: string[];
    touch: boolean;
    coverage: number;
    themes: number;
    claims: Array<{ text: string; href: string }>;
    line: string;
  };
  export default proof;
  /** The component the hero's install command adds, at the latest release. */
  export const install: { item: string; release: string; count: number };
}

/** A file's text under its own module id, so the page that reads it shares no chunk with the docs that render it (proof/). */
declare module "*?raw&proof" {
  const text: string;
  export default text;
}
