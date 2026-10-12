import { HoverCard } from "@/components/ouro/hover-card/hover-card";
import { Link } from "@/components/ouro/link/link";

// expect: Ouro hover card link
// expect: href="/cooks/ari"
export default function HoverCardSection() {
  return (
    <HoverCard trigger={<Link href="/cooks/ari">Ouro hover card link</Link>}>Hover card preview</HoverCard>
  );
}
