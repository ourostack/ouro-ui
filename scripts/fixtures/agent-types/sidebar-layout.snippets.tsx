// What agents write with sidebar-layout: snippets whose cases are in sidebar-layout.cases.ts.
import { Sidebar } from "@/registry/ouro/components/ouro/sidebar/sidebar";
import { SidebarLayout } from "@/registry/ouro/components/ouro/sidebar/sidebar-layout";

const sidebar = <Sidebar label="Main" sections={[{ items: [{ label: "Recipes", href: "/recipes" }] }]} />;

export const sidebarLayout01 = <SidebarLayout sidebar={sidebar} navbar="Search">Page</SidebarLayout>;
export const sidebarLayoutOk01 = <SidebarLayout sidebar={sidebar} header="Search" bleed skipLabel="Skip to content">Page</SidebarLayout>;
