/** The hero's proof line, computed when the site builds (site/scripts/proof.mts). */
declare module "virtual:site-proof" {
  const proof: { components: number; engines: string[]; touch: boolean; coverage: number; themes: number; line: string };
  export default proof;
}
