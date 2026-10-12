import { Card } from "@/components/ouro/card/card";

// expect: Ouro card
// expect: Ouro linked card
// Card's href through the same linkComponent path.
// expect: href="/cookbooks"
export default function CardSection() {
  return (
    <>
      <Card title="Ouro card" description="Rendered by a Server Component">
        Card body
      </Card>
      <Card href="/cookbooks" title="Ouro linked card" />
    </>
  );
}
