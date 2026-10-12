import { type JSX } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Row } from "@/registry/ouro/components/ouro/stack/row";
import { Heading } from "@/registry/ouro/components/ouro/text/heading";

// The live demo at the top of docs/row/: the component as an app would use it, with its props, nothing else.

export default function RowDemo(): JSX.Element {
  return (
    <Row justify="between" className="w-full max-w-md">
      <Heading level={2}>Recipes</Heading>
      <Button href="#new">New recipe</Button>
    </Row>
  );
}
