import { type JSX } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Empty } from "@/registry/ouro/components/ouro/empty/empty";

// The live demo at the top of docs/empty/: the component as an app would use it, with its props, nothing else.

export default function EmptyDemo(): JSX.Element {
  return (
    <Empty
      className="w-full max-w-md"
      icon={
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
        </svg>
      }
      headingLevel={2}
      title="No recipes yet"
      description="Start by creating your first recipe for this pantry."
      action={<Button href="#new">Create recipe</Button>}
    />
  );
}
