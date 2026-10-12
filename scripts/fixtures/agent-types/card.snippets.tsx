// What agents write with card: snippets whose cases are in card.cases.ts.
import { Card } from "@/registry/ouro/components/ouro/card/card";

export const card01 = <Card title="Pantry" subtitle="12 recipes">Flour</Card>;
export const card02 = <Card title="Pantry" image="/cover.jpg">Flour</Card>;
export const card03 = <Card title="Pantry" variant="elevated">Flour</Card>;
export const card04 = <Card title="Dinners" to="/cookbooks/1" />;
export const card06 = <Card title="Pantry" actions="Edit">Flour</Card>;
export const card07 = <Card href="/cookbooks/1" title="Weeknight dinners" description="12 recipes" headingLevel={2} size="sm">Fast dinners</Card>;
