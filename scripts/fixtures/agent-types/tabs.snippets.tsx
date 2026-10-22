// What agents write with tabs: snippets whose cases are in tabs.cases.ts.
import { Tabs } from "@/registry/ouro/components/ouro/tabs/tabs";

const items = [{ value: "a", label: "A", content: "Panel A" }];
const pages = [{ value: "all", label: "All", href: "/recipes" }];

export const tabs01 = <Tabs label="Recipe" items={items} onChange={() => {}} />;
export const tabs02 = <Tabs label="Recipe" items={items} activateOnFocus={false} />;
export const tabs03 = <Tabs label="Recipe" items={items} orientation="row" />;
export const tabs04 = <Tabs label="Recipes" items={pages} pathname="/recipes" />;
export const tabsOk01 = <Tabs label="Recipe" items={items} defaultValue="a" orientation="vertical" activation="manual" onValueChange={() => {}} />;
export const tabsOk02 = <Tabs label="Recipes" items={pages} currentPath="/recipes" orientation="vertical" />;
