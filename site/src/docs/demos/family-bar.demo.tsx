import { type JSX } from "react";
import { FamilyBar } from "@/registry/ouro/components/ouro/family-bar/family-bar";

// The live demo at the top of docs/family-bar/: the component as an app would use it, with its props, nothing else.

const sites = [
  { id: "home", label: "Lantern", href: "#lantern" },
  { id: "docs", label: "Docs", href: "#docs" },
  { id: "guides", label: "Guides", href: "#guides" },
  { id: "blog", label: "Blog", href: "#blog" },
  { id: "status", label: "Status", href: "#status" },
  { id: "community", label: "Community", href: "#community" },
  { id: "source", label: "Source", href: "#source" },
];

export default function FamilyBarDemo(): JSX.Element {
  return <FamilyBar links={sites} current="docs" />;
}
