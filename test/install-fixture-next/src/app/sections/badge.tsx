import { Badge } from "@/components/ouro/badge/badge";

// expect: Ouro badge
// A badge with href takes the same linkComponent path as Button and Link.
// expect: href="/tags/ouro"
export default function BadgeSection() {
  return (
    <>
      <Badge tone="success">Ouro badge</Badge>
      <Badge href="/tags/ouro">Ouro tag</Badge>
    </>
  );
}
