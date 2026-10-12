import { Button } from "@/components/ouro/button/button";

// expect: Ouro button
// expect: Ouro link
// Button's href rendered through OuroProvider's linkComponent, next/link.
// expect: href="/recipes"
export default function ButtonSection() {
  return (
    <>
      <Button>Ouro button</Button>
      <Button href="/recipes">Ouro link</Button>
    </>
  );
}
