// What agents write with tabs: snippets whose cases are in tabs.cases.ts.
import { Tabs } from "@/registry/ouro/components/ouro/tabs/tabs";

const items = [{ value: "a", label: "A", content: "Panel A" }];

export const tabs01 = <Tabs label="Recipe" items={items} onChange={() => {}} />;
export const tabs02 = <Tabs label="Recipe" items={items} activateOnFocus={false} />;
export const tabs03 = <Tabs label="Recipe" items={items} orientation="row" />;
export const tabsOk01 = <Tabs label="Recipe" items={items} defaultValue="a" orientation="vertical" activation="manual" onValueChange={() => {}} />;
