import { type JSX } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Navbar } from "@/registry/ouro/components/ouro/navbar/navbar";
import { Text } from "@/registry/ouro/components/ouro/text/text";

// The live demo at the top of docs/navbar/: the component as an app would use it, with its props, nothing else.

export default function NavbarDemo(): JSX.Element {
  return (
    <Navbar
      label="Demo"
      className="w-full"
      brand={
        <Text>
          <strong>Spoonjoy</strong>
        </Text>
      }
      items={[
        { label: "Recipes", href: "#recipes", current: true },
        { label: "Cookbooks", href: "#cookbooks" },
        { label: "Shopping list", href: "#shopping-list" },
      ]}
      actions={
        <Button size="sm" href="#new-recipe">
          New recipe
        </Button>
      }
    />
  );
}
