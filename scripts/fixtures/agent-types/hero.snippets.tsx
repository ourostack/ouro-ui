// What agents write with hero: snippets whose cases are in hero.cases.ts.
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Hero } from "@/registry/ouro/components/ouro/hero/hero";

export const hero01 = <Hero title="Dinner, sorted" subtitle="Plan the week in one place." />;
export const hero02 = <Hero title="Dinner, sorted" headingLevel={3} />;
export const heroOk01 = <Hero eyebrow="Recipes" title="Dinner, sorted" description="Plan the week in one place." actions={<Button>Start planning</Button>} picture={{ light: { src: "/brand/storybook/headers/ouro-ui-core.webp", width: 1536, height: 576, alt: "A table set for four" }, dark: { src: "/brand/storybook/headers/ouro-ui-core-night.webp", width: 1536, height: 576 } }} layout="column" motion="none" headingLevel={2} />;
export const heroOk02 = <Hero title="Dinner, sorted" picture={{ src: "/brand/storybook/headers/ouro-ui-core.webp", width: 1536, height: 576, alt: "A table set for four" }} />;
