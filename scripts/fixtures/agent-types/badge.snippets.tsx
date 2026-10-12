// What agents write with badge: snippets whose cases are in badge.cases.ts.
import { Badge } from "@/registry/ouro/components/ouro/badge/badge";

export const badge01 = <Badge variant="destructive">Failed</Badge>;
export const badge02 = <Badge variant="secondary">Draft</Badge>;
export const badge03 = <Badge tone="danger">Failed</Badge>;
export const badge04 = <Badge asChild>Vegan</Badge>;
export const badge05 = <Badge color="amber">Low stock</Badge>;
export const badgeOk01 = <Badge tone="success" variant="soft">Published</Badge>;
export const badgeOk02 = <Badge href="/tags/vegan" variant="outline">Vegan</Badge>;
export const badgeOk03 = <Badge onClick={() => {}} aria-pressed>Quick</Badge>;
