import { DescriptionList } from "@/components/ouro/description-list/description-list";

// expect: Ouro prep time
// expect: 20 minutes
export default function DescriptionListSection() {
  return (
    <DescriptionList
      items={[
        { term: "Ouro prep time", details: "20 minutes" },
        { term: "Serves", details: "6" },
      ]}
    />
  );
}
