import { RouteProgress } from "@/components/ouro/route-progress/route-progress";

// expect: data-ouro="route-progress"
// expect: role="status"
// expect: Ouro route progress
export default function RouteProgressSection() {
  return <RouteProgress active label="Ouro route progress" />;
}
