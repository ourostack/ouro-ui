import { type JSX } from "react";
import { Sidebar } from "@/registry/ouro/components/ouro/sidebar/sidebar";
import { SidebarLayout } from "@/registry/ouro/components/ouro/sidebar/sidebar-layout";
import { Heading } from "@/registry/ouro/components/ouro/text/heading";
import { Text } from "@/registry/ouro/components/ouro/text/text";

// The live demo at the top of docs/sidebar-layout/: the component as an app would use it, with its props, nothing else.
// The layout fills the screen in an app; here a short frame holds it.

export default function SidebarLayoutDemo(): JSX.Element {
  return (
    <div className="h-96 w-full overflow-auto">
      <SidebarLayout
        className="min-h-96"
        sidebar={
          <div className="h-96">
            <Sidebar
              label="Demo"
              sections={[
                {
                  items: [
                    { label: "Recipes", href: "#recipes", current: true },
                    { label: "Cookbooks", href: "#cookbooks" },
                  ],
                },
              ]}
            />
          </div>
        }
        header={<Text tone="muted">Kitchen of Ari</Text>}
      >
        <div className="grid gap-3">
          <Heading level={2}>Recipes</Heading>
          <Text>Twelve saved recipes.</Text>
        </div>
      </SidebarLayout>
    </div>
  );
}
