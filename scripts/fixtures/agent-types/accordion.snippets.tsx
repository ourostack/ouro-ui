// What agents write with accordion: snippets whose cases are in accordion.cases.ts.
import { Accordion } from "@/registry/ouro/components/ouro/accordion/accordion";

const items = [{ value: "a", title: "A", content: "Panel A" }];

export const accordion01 = <Accordion type="multiple" items={items} />;
export const accordion02 = <Accordion collapsible items={items} />;
export const accordion03 = <Accordion items={items} headingLevel={7} />;
export const accordionOk01 = <Accordion multiple items={items} defaultValue={["a"]} headingLevel={2} onValueChange={() => {}} />;
