// What agents write with show-more: snippets whose cases are in show-more.cases.ts.
import { ShowMore } from "@/registry/ouro/components/ouro/collapsible/show-more";

const items = ["Recipe 1", "Recipe 2"];

export const showMore01 = <ShowMore maxLines={3}>Long text</ShowMore>;
export const showMore02 = <ShowMore items={items} limit={3} />;
export const showMoreOk01 = <ShowMore items={items} initialCount={3} ordered showMoreLabel="More" showLessLabel="Less" />;
