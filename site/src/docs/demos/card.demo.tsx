import { type JSX } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Card } from "@/registry/ouro/components/ouro/card/card";
import { Text } from "@/registry/ouro/components/ouro/text/text";

// The live demo at the top of docs/card/: the component as an app would use it, with its props, nothing else.

export default function CardDemo(): JSX.Element {
  return (
    <div className="grid w-full max-w-md gap-4">
      <Card headingLevel={2} title="Pantry" description="What you have on hand" action={<Button variant="outline" size="sm">Edit</Button>}>
        <Text>Flour, rice, black beans, two lemons.</Text>
      </Card>
      <Card headingLevel={2} href="#weeknight-dinners" title="Weeknight dinners" description="12 recipes" size="sm" />
    </div>
  );
}
