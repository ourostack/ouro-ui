import { type JSX } from "react";
import { Breadcrumb } from "@/registry/ouro/components/ouro/breadcrumb/breadcrumb";

// The live demo at the top of docs/breadcrumb/: the component as an app would use it, with its props, nothing else.

export default function BreadcrumbDemo(): JSX.Element {
  return (
    <div className="grid w-full max-w-md gap-6">
      <Breadcrumb
        items={[
          { label: "Home", href: "#home" },
          { label: "Recipes", href: "#recipes" },
          { label: "Short ribs" },
        ]}
      />
      <Breadcrumb
        label="A longer trail"
        items={[
          { label: "Home", href: "#home" },
          { label: "Cookbooks", href: "#cookbooks" },
          { label: "Winter", href: "#winter" },
          { label: "Braises", href: "#braises" },
          { label: "Short ribs", href: "#short-ribs" },
          { label: "Edit" },
        ]}
      />
    </div>
  );
}
