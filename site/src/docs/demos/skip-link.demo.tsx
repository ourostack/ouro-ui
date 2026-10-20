import { type JSX } from "react";
import { Link } from "@/registry/ouro/components/ouro/link/link";
import { SkipLink } from "@/registry/ouro/components/ouro/skip-link/skip-link";
import { Text } from "@/registry/ouro/components/ouro/text/text";

// The live demo at the top of docs/skip-link/: the component as an app would use it, with its props, nothing else.

export default function SkipLinkDemo(): JSX.Element {
  return (
    <div className="grid max-w-md gap-3">
      <SkipLink target="skip-link-demo">Skip to the recipe</SkipLink>
      <nav aria-label="Demo" className="flex gap-4">
        <Link href="#recipes" tone="secondary">
          Recipes
        </Link>
        <Link href="#cookbooks" tone="secondary">
          Cookbooks
        </Link>
      </nav>
      <section id="skip-link-demo" aria-label="Recipe">
        <Text>Tab into this demo: the skip link shows first. Press Enter and focus lands here, past the links.</Text>
      </section>
    </div>
  );
}
