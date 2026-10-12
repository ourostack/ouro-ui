import { type JSX } from "react";
import { Heading } from "@/registry/ouro/components/ouro/text/heading";

// The live demo at the top of docs/heading/: the component as an app would use it, with its props, nothing else.

export default function HeadingDemo(): JSX.Element {
  return (
    <div className="grid max-w-sm gap-3">
      <Heading level={2}>Recipes</Heading>
      <Heading level={3}>Ingredients</Heading>
      <Heading level={4}>For the sauce</Heading>
    </div>
  );
}
