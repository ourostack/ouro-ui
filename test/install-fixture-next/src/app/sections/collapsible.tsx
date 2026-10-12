import { Collapsible } from "@/components/ouro/collapsible/collapsible";

// expect: Ouro collapsible title
// expect: Ouro collapsible content
// expect: aria-expanded="true"
export default function CollapsibleSection() {
  return (
    <Collapsible title="Ouro collapsible title" defaultOpen>
      Ouro collapsible content
    </Collapsible>
  );
}
