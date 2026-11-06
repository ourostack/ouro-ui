import { lazy, Suspense, useEffect, useState, type JSX } from "react";
import { docsItems } from "../docs/items";
import { href } from "../paths";
import { VoyageHeader } from "../voyage/header";
import { MenuPages, SITE_SECTIONS, SiteMenu } from "../voyage/site-menu";
import { TextField } from "@/registry/ouro/components/ouro/text-field/text-field";
import { comparisons, componentGroups, guides, startPages, type DocsLink } from "./docs-sections";
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
 * component under Components on a component's), and a search on top that finds a page by its name: the site's, the docs' first pages, a component or a guide.
 */
function DocsMenu({ current }: { current: string }): JSX.Element {
  const [query, setQuery] = useState("");
  const under = headerPath(current);
  // An untitled reference page you are on joins the guides in its own place.
  const listed = guides.filter((guide) => titled.includes(guide) || guide.path === current);
  const found = findDocs(query);
  return (
    <>
      {/* Stays at the top while the long lists scroll under it (-top-2: from the sheet body's edge, not its padding). */}
      <div className="sticky -top-2 z-2 -mx-5 -mt-2 mb-2 bg-popover px-6 pt-2 pb-2" style={{ boxShadow: "0 0.75rem 0.75rem -0.25rem var(--popover)" }}>
        <TextField
          label="Find a docs page"
          hideLabel
          type="search"
          clearable
          placeholder="Find a component or guide"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          // Escape clears a search first; with nothing typed it closes the menu.
          onKeyDown={(event) => {
            if (event.key === "Escape" && query !== "") {
              event.stopPropagation();
              event.preventDefault();
              setQuery("");
            }
          }}
        />
      </div>
      {/* Always in the page, so a screen reader hears it change. */}
      <p role="status" className={found?.length === 0 ? "m-0 px-3 py-2 text-sm text-muted-foreground" : "sr-only"}>
        {found === undefined ? "" : found.length === 0 ? "Nothing aboard by that name. Try another?" : `${found.reduce((sum, group) => sum + group.links.length, 0)} found`}
      </p>
      {found ? (
        found.length > 0 && <MenuPages pages={found} current={current} />
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

/** The pages whose names hold `query`: the site's and the docs' first pages, then components, then guides; undefined while it is empty. */
function findDocs(query: string): Array<{ label: string; links: Array<{ label: string; href: string }> }> | undefined {
  const wanted = query.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (wanted === "") return undefined;
  const holds = (...texts: string[]) => texts.join(" ").toLowerCase().replace(/[^a-z0-9]/g, "").includes(wanted);
  // A docs page by its name and its slug, not "/docs/", which every one of them has.
  const slug = (path: string) => path.replace(/^\/docs\//, "");
  const candidates = [
    ...startPages.map((page) => ({ ...page, about: "" })),
    ...SITE_SECTIONS.flatMap((section) => [
      { label: section.label, href: section.href, about: section.hint },
      ...(section.pages ?? []).flatMap((page) => ("links" in page ? page.links : [page])).map((page) => ({ ...page, about: "" })),
    ]),
  ];
  const site = candidates
    .filter((page, index) => page.href.startsWith("/") && candidates.findIndex((other) => other.href === page.href) === index)
    .filter((page) => holds(page.label, slug(page.href), page.about))
    .map(({ label, href }) => ({ label, href }));
  return [
    { label: "Around the site", links: site },
    { label: "Components", links: componentGroups(query).flatMap((group) => group.links).map(asPage) },
    { label: "Guides", links: [...guides, ...comparisons].filter((link) => holds(link.label, slug(link.path))).map(asPage) },
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
