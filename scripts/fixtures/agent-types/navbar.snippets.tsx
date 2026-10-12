// What agents write with navbar: snippets whose cases are in navbar.cases.ts.
import { Navbar } from "@/registry/ouro/components/ouro/navbar/navbar";

const items = [{ label: "Recipes", href: "/recipes" }];

export const navbar01 = <Navbar label="Main" items={items} links={items} />;
export const navbar02 = <Navbar label="Main" items={items} logo="Spoonjoy" />;
export const navbar03 = <Navbar label="Main" items={items} pathname="/recipes" />;
export const navbarOk01 = <Navbar label="Main" items={items} currentPath="/recipes" brand="Spoonjoy" actions="Account" menuLabel="Menu" closeLabel="Close" />;
export const navbarOk02 = <Navbar label="Main" items={[{ label: "Recipes", links: [{ label: "Browse", href: "/recipes", description: "Everything you saved" }] }, { label: "Cookbooks", href: "/cookbooks" }]} />;
