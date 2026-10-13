import { type JSX } from "react";
import { NavigationMenu } from "@/registry/ouro/components/ouro/navigation-menu/navigation-menu";

// The live demo at the top of docs/navigation-menu/: the component as an app would use it, with its props, nothing else.

export default function NavigationMenuDemo(): JSX.Element {
  return (
    <NavigationMenu
      label="Demo"
      items={[
        {
          label: "Recipes",
          links: [
            { label: "Browse", href: "#recipes", description: "Everything you have saved.", current: true },
            { label: "Drafts", href: "#drafts", description: "Recipes you have not finished." },
            { label: "Import", href: "#import", description: "Bring one in from a link." },
          ],
        },
        {
          label: "Cookbooks",
          links: [
            { label: "Yours", href: "#cookbooks" },
            { label: "Shared with you", href: "#shared" },
          ],
        },
        { label: "Pricing", href: "#pricing" },
      ]}
    />
  );
}
