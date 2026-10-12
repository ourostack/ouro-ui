import { type JSX } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { ButtonGroup } from "@/registry/ouro/components/ouro/button-group/button-group";

// The live demo at the top of docs/button-group/: the component as an app would use it, with its props, nothing else.

export default function ButtonGroupDemo(): JSX.Element {
  return (
    <div className="grid justify-items-center gap-4">
      <ButtonGroup label="Pagination">
        <Button variant="outline" tone="secondary">
          Previous
        </Button>
        <Button variant="outline" tone="secondary">
          1
        </Button>
        <Button variant="outline" tone="secondary">
          2
        </Button>
        <Button variant="outline" tone="secondary">
          Next
        </Button>
      </ButtonGroup>
      <ButtonGroup label="Servings">
        <Button variant="soft">Fewer</Button>
        <Button variant="soft">More</Button>
      </ButtonGroup>
    </div>
  );
}
