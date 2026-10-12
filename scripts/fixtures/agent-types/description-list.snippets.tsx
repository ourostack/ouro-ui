// What agents write with description-list: snippets whose cases are in description-list.cases.ts.
import { DescriptionList } from "@/registry/ouro/components/ouro/description-list/description-list";

export const descriptionList01 = <DescriptionList items={[{ label: "Prep time", value: "20 minutes" }]} />;
export const descriptionList02 = <DescriptionList data={[{ term: "Prep time", details: "20 minutes" }]} />;
export const descriptionList03 = <DescriptionList items={[{ term: "Prep time", details: "20 minutes" }]} stackBelow="lg" />;
export const descriptionList04 = <DescriptionList items={[{ term: "Prep time", details: "20 minutes" }, { term: "Serves", details: "6" }]} stackBelow="md" />;
