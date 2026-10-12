// What agents write with navigation-menu: snippets whose cases are in navigation-menu.cases.ts.
import { NavigationMenu } from "@/registry/ouro/components/ouro/navigation-menu/navigation-menu";

const items = [{ label: "Pricing", href: "/pricing" }];

export const navigationMenu01 = <NavigationMenu label="Main" items={items} orientation="vertical" />;
export const navigationMenu02 = <NavigationMenu label="Main" items={items} pathname="/pricing" />;
export const navigationMenu03 = <NavigationMenu label="Main" items={items}>Pricing</NavigationMenu>;
export const navigationMenuOk01 = <NavigationMenu label="Main" items={items} currentPath="/pricing" />;
export const navigationMenuOk02 = <NavigationMenu label="Main" items={[{ label: "Recipes", columns: 2, content: <a href="/featured">Short ribs</a>, links: [{ label: "Browse", href: "/recipes" }] }, { label: "Help", content: "Write to us any time." }]} />;
