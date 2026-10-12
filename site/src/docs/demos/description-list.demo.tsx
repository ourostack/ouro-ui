import { type JSX } from "react";
import { DescriptionList } from "@/registry/ouro/components/ouro/description-list/description-list";

// The live demo at the top of docs/description-list/: the component as an app would use it, with its props, nothing else.

export default function DescriptionListDemo(): JSX.Element {
  return (
    <div className="w-full max-w-xl">
      <DescriptionList
        items={[
          { term: "Prep time", details: "20 minutes" },
          { term: "Cook time", details: "4 hours, mostly hands-off" },
          { term: "Serves", details: "6" },
        ]}
      />
    </div>
  );
}
