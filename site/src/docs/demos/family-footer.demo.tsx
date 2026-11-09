import { type JSX } from "react";
import { FamilyFooter } from "@/registry/ouro/components/ouro/family-bar/family-footer";
import { Link } from "@/registry/ouro/components/ouro/link/link";

// The live demo at the top of docs/family-footer/: the component as an app would use it, with its props, nothing else. It is
// named for Lantern, apart from this site's own family footer below it, which keeps the default name.

const sites = [
  { id: "home", label: "Lantern", href: "#lantern" },
  { id: "docs", label: "Docs", href: "#docs" },
  { id: "guides", label: "Guides", href: "#guides" },
  { id: "blog", label: "Blog", href: "#blog" },
  { id: "status", label: "Status", href: "#status" },
  { id: "community", label: "Community", href: "#community" },
  { id: "source", label: "Source", href: "#source" },
];

export default function FamilyFooterDemo(): JSX.Element {
  return (
    <FamilyFooter links={sites} current="docs" label="Lantern's sites">
      <Link href="#privacy" tone="secondary">
        Privacy
      </Link>
      <Link href="#terms" tone="secondary">
        Terms
      </Link>
    </FamilyFooter>
  );
}
