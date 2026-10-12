// What agents write with navigation-menu: snippets whose cases are in navigation-menu.cases.ts.
import { NavigationMenu } from "@/registry/ouro/components/ouro/navigation-menu/navigation-menu";

const items = [{ label: "Pricing", href: "/pricing" }];

export const navigationMenu01 = <NavigationMenu label="Main" items={items} orientation="vertical" />;
export const navigationMenu02 = <NavigationMenu label="Main" items={items} pathname="/pricing" />;
export const navigationMenu03 = <NavigationMenu label="Main" items={items}>Pricing</NavigationMenu>;
export const navigationMenuOk01 = <NavigationMenu label="Main" items={items} currentPath="/pricing" />;
