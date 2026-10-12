import { Button } from "@/components/ouro/button/button";
import { ButtonGroup } from "@/components/ouro/button-group/button-group";

// expect: aria-label="Ouro button group"
// expect: Ouro previous
// expect: Ouro next
export default function ButtonGroupSection() {
  return (
    <ButtonGroup label="Ouro button group">
      <Button variant="outline">Ouro previous</Button>
      <Button variant="outline">Ouro next</Button>
    </ButtonGroup>
  );
}
