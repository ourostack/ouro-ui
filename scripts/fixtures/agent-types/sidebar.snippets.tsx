// What agents write with sidebar: snippets whose cases are in sidebar.cases.ts.
import { Sidebar } from "@/registry/ouro/components/ouro/sidebar/sidebar";

const links = [{ label: "Recipes", href: "/recipes" }];
const sections = [{ items: links }];

export const sidebar01 = <Sidebar label="Main" sections={sections} items={links} />;
export const sidebar02 = <Sidebar label="Main" sections={sections} isCollapsed />;
export const sidebar03 = <Sidebar label="Main" sections={sections} pathname="/recipes" />;
export const sidebarOk01 = <Sidebar label="Main" sections={sections} currentPath="/recipes" header="Spoonjoy" footer="Ari" defaultCollapsed collapseLabel="Collapse sidebar" menuLabel="Menu" closeLabel="Close" />;
export const sidebarOk02 = <Sidebar label="Main" sections={[{ items: [{ label: "Inbox", href: "/inbox", badge: 12 }, { label: "New chat", onClick: () => {} }, { label: "Settings", items: [{ label: "Profile", href: "/settings/profile" }] }] }]} />;
