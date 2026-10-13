// What agents write with stacked-layout: snippets whose cases are in stacked-layout.cases.ts.
import { Navbar } from "@/registry/ouro/components/ouro/navbar/navbar";
import { StackedLayout } from "@/registry/ouro/components/ouro/sidebar/stacked-layout";

const navbar = <Navbar label="Main" items={[{ label: "Recipes", href: "/recipes" }]} />;

export const stackedLayout01 = <StackedLayout navbar={navbar} sidebar="Links">Page</StackedLayout>;
export const stackedLayout02 = <StackedLayout navbar={navbar} header="Bar">Page</StackedLayout>;
export const stackedLayoutOk01 = <StackedLayout navbar={navbar} footer="Made with Ouro" bleed skipLabel="Skip to content">Page</StackedLayout>;
