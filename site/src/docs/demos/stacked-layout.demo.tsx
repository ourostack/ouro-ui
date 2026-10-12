import { type JSX } from "react";
import { Navbar } from "@/registry/ouro/components/ouro/navbar/navbar";
import { StackedLayout } from "@/registry/ouro/components/ouro/sidebar/stacked-layout";
import { Heading } from "@/registry/ouro/components/ouro/text/heading";
import { Text } from "@/registry/ouro/components/ouro/text/text";

// The live demo at the top of docs/stacked-layout/: the component as an app would use it, with its props, nothing else.
// The layout fills the screen in an app; here a short frame holds it.

export default function StackedLayoutDemo(): JSX.Element {
  return (
    <div className="h-80 w-full overflow-auto">
      <StackedLayout
        className="min-h-80"
        navbar={
          <Navbar
            label="Demo"
            brand={
              <Text>
                <strong>Spoonjoy</strong>
              </Text>
            }
            items={[
              { label: "Recipes", href: "#recipes", current: true },
              { label: "Cookbooks", href: "#cookbooks" },
            ]}
          />
        }
        footer="Made in a small kitchen."
      >
        <div className="grid gap-3">
          <Heading level={2}>Recipes</Heading>
          <Text>Twelve saved recipes.</Text>
        </div>
      </StackedLayout>
    </div>
  );
}
