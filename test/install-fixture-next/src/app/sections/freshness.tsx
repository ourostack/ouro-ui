import { Freshness } from "@/components/ouro/freshness/freshness";

// expect: data-ouro="freshness"
// expect: Updated
export default function FreshnessSection() {
  return <Freshness updatedAt="2026-01-01T00:00:00Z" />;
}
