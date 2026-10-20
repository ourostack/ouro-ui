// What agents write with tab-bar: snippets whose cases are in tab-bar.cases.ts.
import { TabBar } from "@/registry/ouro/components/ouro/tab-bar/tab-bar";

const items = [{ label: "Recipes", href: "/recipes", icon: <svg /> }];

export const tabBar01 = <TabBar label="Main" items={items} pathname="/recipes" />;
export const tabBar02 = <TabBar label="Main" items={items} hideFrom="desktop" />;
export const tabBarOk01 = <TabBar label="Main" items={items} currentPath="/recipes" hideFrom="lg" accessory={{ label: "Search", href: "/search", icon: <svg /> }} className="mt-4" />;
