import { type JSX } from "react";
import { Freshness } from "@/registry/ouro/components/ouro/freshness/freshness";

// The live demo at the top of docs/freshness/: the component as an app would use it, with its props, nothing else.

const updatedAt = Date.now() - 3 * 60_000;

export default function FreshnessDemo(): JSX.Element {
  return <Freshness updatedAt={updatedAt} refreshing />;
}
