// What agents write with breadcrumb: snippets whose cases are in breadcrumb.cases.ts.
import { Breadcrumb } from "@/registry/ouro/components/ouro/breadcrumb/breadcrumb";

const items = [{ label: "Home", href: "/" }, { label: "Ribs" }];

export const breadcrumb01 = <Breadcrumb items={items} separator="/" />;
export const breadcrumb02 = <Breadcrumb items={items} links={items} />;
export const breadcrumb03 = <Breadcrumb items={items}>Home</Breadcrumb>;
export const breadcrumbOk01 = <Breadcrumb items={items} maxItems={3} label="Breadcrumb" moreLabel="More" closeLabel="Close" />;
