import { type JSX } from "react";
import { Link } from "@/registry/ouro/components/ouro/link/link";
import { SectionHeader } from "@/registry/ouro/components/ouro/section-header/section-header";

// The live demo at the top of docs/section-header/: the component as an app would use it, with its props, nothing else.

export default function SectionHeaderDemo(): JSX.Element {
  return <SectionHeader title="Your recipes" meta="2 recipes · 2 cookbooks" actions={<Link href="#recipes">See all</Link>} className="w-full max-w-xl" />;
}
