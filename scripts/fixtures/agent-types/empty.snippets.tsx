// What agents write with empty: snippets whose cases are in empty.cases.ts.
import { Empty } from "@/registry/ouro/components/ouro/empty/empty";

export const empty01 = <Empty heading="No recipes" />;
export const empty02 = <Empty title="No recipes" message="Add one" />;
export const empty03 = <Empty title="No recipes" align="left" />;
export const empty04 = <Empty title="No recipes yet" description="Add one." variant="plain" align="start" headingLevel={2} />;
