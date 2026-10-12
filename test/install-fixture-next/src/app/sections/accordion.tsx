import { Accordion } from "@/components/ouro/accordion/accordion";

// expect: Ouro accordion title
// expect: Ouro accordion open content
// Closed content is in the server HTML too, for the browser's page search.
// expect: Ouro accordion closed content
export default function AccordionSection() {
  return (
    <Accordion
      defaultValue="open"
      items={[
        { value: "open", title: "Ouro accordion title", content: "Ouro accordion open content" },
        { value: "closed", title: "Ouro accordion second title", content: "Ouro accordion closed content" },
      ]}
    />
  );
}
