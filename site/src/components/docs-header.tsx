import { lazy, Suspense, useEffect, useState, type JSX } from "react";
import { docsItems } from "../docs/items";
import { href } from "../paths";
import { VoyageHeader } from "../voyage/header";
import { MenuPages } from "../voyage/site-menu";
import { DocsFilter } from "./docs-filter";
import { comparisons, componentGroups, guides, type DocsLink } from "./docs-sections";
import { setXray, useXray } from "../voyage/xray-store";

// The docs pages' header: the same one the home page and the Nautilus have. docs-shell.tsx loads
// this module as an island, so the header's controls stay out of the docs pages' first load.

// X-ray's code loads the first time it is turned on.
const Inspector = lazy(() => import("@/registry/ouro/components/ouro/inspector/inspector").then((module) => ({ default: module.Inspector })));

const docsHref = (item: string) => href(`/docs/${item}/`);

/** X-ray on a docs page: HX Inspector over the page's demos, once someone turns it on. */
function DocsXray(): JSX.Element | null {
  const on = useXray();
  const [wanted, setWanted] = useState(false);
  if (on && !wanted) setWanted(true);
  return wanted ? (
    <Suspense>
      <Inspector open={on} onOpenChange={setXray} docsHref={docsHref} />
    </Suspense>
  ) : null;
}

/** The header link a docs page is under: the catalog and each component's page under Components, a guide under Docs. */
export function headerPath(current: string): string {
  return current === "/docs/" || docsItems.some((item) => current === `/docs/${item.name}/`) ? "/docs/" : "/docs/installing/";
}

const asPage = ({ path, label }: DocsLink) => ({ label, href: path });

/**
 * The docs' own pages in the header's menu, where the sidebar hides (below 640px): the guides under Docs, and every
 * component, with the sidebar's filter, under Components.
 */
function DocsGuides({ current }: { current: string }): JSX.Element {
  return (
    <div className="sm:hidden">
      <MenuPages
        pages={[
          { label: "Guides", links: guides.map(asPage) },
          { label: "Skill comparisons", links: comparisons.map(asPage) },
        ]}
        current={current}
      />
    </div>
  );
}

function DocsComponents({ current }: { current: string }): JSX.Element {
  const [filter, setFilter] = useState("");
  const groups = componentGroups(filter);
  return (
    <div className="grid gap-1 sm:hidden">
      <div className="ms-4 ps-2">
        <DocsFilter value={filter} onChange={setFilter} empty={groups.length === 0} />
      </div>
      {groups.length > 0 && <MenuPages pages={groups.map((group) => ({ label: group.label, links: group.links.map(asPage) }))} current={current} />}
    </div>
  );
}

export default function DocsHeader({ current }: { current: string }): JSX.Element {
  // Leaving the page turns X-ray off, so the next page starts without it.
  useEffect(() => () => setXray(false), []);
  return (
    <>
      <VoyageHeader
        path={headerPath(current)}
        page={current}
        more={{ Docs: <DocsGuides current={current} />, Components: <DocsComponents current={current} /> }}
        gutters="docs"
      />
      <DocsXray />
    </>
  );
}
