// What agents write with card: snippets whose cases are in card.cases.ts.
import { Card } from "@/registry/ouro/components/ouro/card/card";

export const card01 = <Card title="Pantry" subtitle="12 recipes">Flour</Card>;
export const card02 = <Card title="Pantry" image="/cover.jpg">Flour</Card>;
export const card03 = <Card title="Pantry" variant="elevated">Flour</Card>;
export const card04 = <Card title="Dinners" to="/cookbooks/1" />;
export const card06 = <Card title="Pantry" actions="Edit">Flour</Card>;
export const card08 = <Card href="/guides/braising" title="Braising" interactive />;
export const card10 = <Card title="Weeknight dinners" titleSize="lg" />;
export const card07 = <Card href="/cookbooks/1" title="Weeknight dinners" description="12 recipes" headingLevel={2} size="sm" stackBelow="sm">Fast dinners</Card>;
export const card09 = <Card href="/guides/braising" title="Braising" description="Low heat, a lid, and time" media={<img src="/braise.jpg" alt="" />} zoomMedia revealDescription />;
export const card11 = <Card title="Weeknight dinners" titleSize="inherit" />;
