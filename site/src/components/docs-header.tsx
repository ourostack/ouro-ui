import { lazy, Suspense, useEffect, useState, type JSX } from "react";
import { docsItems } from "../docs/items";
import { href } from "../paths";
import { VoyageHeader } from "../voyage/header";
import { MenuPages, SiteMenu } from "../voyage/site-menu";
import { TextField } from "@/registry/ouro/components/ouro/text-field/text-field";
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

/** The guides worth a row of their own: the rest, the Ouro AX reference pages titled by their names, the search finds. */
const titled = guides.filter((guide) => guide.label !== guide.path.slice("/docs/".length, -1));

/**
 * The docs' menu: the site's, with the section you are in unfolded (every guide under Docs on a guide's page, every
 * component under Components on a component's), and a search on top that finds any docs page by its name.
 */
function DocsMenu({ current }: { current: string }): JSX.Element {
  const [query, setQuery] = useState("");
  const under = headerPath(current);
  const listed = titled.some((guide) => guide.path === current) ? titled : [...titled, ...guides.filter((guide) => guide.path === current)];
  const found = findDocs(query);
  return (
    <>
      <div className="mb-3 px-1">
        <TextField
          label="Find a docs page"
          hideLabel
          type="search"
          clearable
          placeholder="Find a component or guide"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
      </div>
      {found ? (
        found.length > 0 ? (
          <MenuPages pages={found} current={current} />
        ) : (
          <p role="status" className="m-0 px-3 py-2 text-sm text-muted-foreground">
            Nothing aboard by that name. Try another?
          </p>
        )
      ) : (
        <SiteMenu
          page={current}
          more={
            under === "/docs/"
              ? { Components: <MenuPages pages={componentGroups().map((group) => ({ label: group.label, links: group.links.map(asPage) }))} current={current} /> }
              : {
                  Docs: (
                    <MenuPages
                      pages={[
                        { label: "Guides", links: listed.map(asPage) },
                        { label: "Skill comparisons", links: comparisons.map(asPage) },
                      ]}
                      current={current}
                    />
                  ),
                }
          }
        />
      )}
    </>
  );
}

/** The docs pages whose names hold `query`, components then guides; undefined while it is empty. */
function findDocs(query: string): Array<{ label: string; links: Array<{ label: string; href: string }> }> | undefined {
  const wanted = query.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (wanted === "") return undefined;
  const matches = (link: DocsLink) => `${link.label} ${link.path}`.toLowerCase().replace(/[^a-z0-9]/g, "").includes(wanted);
  return [
    { label: "Components", links: componentGroups(query).flatMap((group) => group.links).map(asPage) },
    { label: "Guides", links: [...guides, ...comparisons].filter(matches).map(asPage) },
  ].filter((group) => group.links.length > 0);
}

export default function DocsHeader({ current }: { current: string }): JSX.Element {
  // Leaving the page turns X-ray off, so the next page starts without it.
  useEffect(() => () => setXray(false), []);
  return (
    <>
      <VoyageHeader
        path={headerPath(current)}
        page={current}
        menu={<DocsMenu current={current} />}
        gutters="docs"
      />
      <DocsXray />
    </>
  );
}
