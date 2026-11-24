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

/** The home page's story numbers, computed when the site builds (site/scripts/home-facts.mts, served by proof.mts). */
declare module "virtual:site-home-facts" {
  /** The benchmark's summary, from docs/guides/agent-interfaces.md (site/scripts/home-facts.mts). */
  export const benchmark: {
    trials: number;
    models: number;
    rows: Array<{ way: "actions" | "bridge" | "browser" | "plain"; done: number; steps: string; tokens: string; paid: string }>;
    behindBest: number;
  };
  /** Components per platform (site/scripts/home-facts.mts). */
  export const counts: { web: number; apple: number; windows: number; android: number };
}

/** A file's text under its own module id, so the page that reads it shares no chunk with the docs that render it (proof/). */
declare module "*?raw&proof" {
  const text: string;
  export default text;
}
