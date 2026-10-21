/** The hero's proof line and install item, computed when the site builds (site/scripts/proof.mts). */
declare module "virtual:site-proof" {
  const proof: {
    components: number;
    typescript: boolean;
    engines: string[];
    touch: boolean;
    coverage: number;
    themes: number;
    claims: Array<{ text: string; href: string; where: string }>;
    line: string;
  };
  export default proof;
  /** The component the hero's install command adds, at the latest release. */
  export const install: { item: string; release: string; count: number };
}
