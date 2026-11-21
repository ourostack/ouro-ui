// What agents write with freshness: valid snippets only; updatedAt is required.
import { Freshness } from "@/registry/ouro/components/ouro/freshness/freshness";

export const freshnessOk01 = <Freshness updatedAt={Date.now()} refreshing={false} />;
