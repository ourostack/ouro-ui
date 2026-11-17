// What agents write with section-header: snippets whose cases are in section-header.cases.ts.
import { SectionHeader } from "@/registry/ouro/components/ouro/section-header/section-header";

export const sectionHeader01 = <SectionHeader title="Recipes" count="12 recipes" />;
export const sectionHeader02 = <SectionHeader title="Recipes" level={1} />;
export const sectionHeaderOk01 = <SectionHeader title="Recipes" meta="12 recipes" actions={null} level={3} divider={false} className="mt-8" />;
