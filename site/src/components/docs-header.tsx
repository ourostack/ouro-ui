import { lazy, Suspense, useEffect, useRef, useState, type JSX, type KeyboardEvent } from "react";
import { docsItems } from "../docs/items";
import { href } from "../paths";
import { VoyageHeader } from "../voyage/header";
import { guideLabel, MenuPages, PageLink, SITE_SECTIONS, SiteMenu } from "../voyage/site-menu";
import { Collapsible } from "@/registry/ouro/components/ouro/collapsible/collapsible";
import { TextField } from "@/registry/ouro/components/ouro/text-field/text-field";
import { comparisons, componentGroups, guides, helpers, isAxPart, startPages, type DocsLink } from "./docs-sections";
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

/** The header link a docs page is under: the catalog, each component's page and each helper's under Components, a guide under Docs. */
export function headerPath(current: string): string {
  return current === "/docs/" || docsItems.some((item) => current === `/docs/${item.name}/`) || helpers.some((page) => page.path === current)
    ? "/docs/"
    : "/docs/installing/";
}

const asPage = ({ path, label }: DocsLink) => ({ label, href: path });

/**
 * A section's long lists, each folded under its name and how many pages it holds, so the menu stays a few screens
 * long; the list with the page you are on opens.
 */
function Folds({ groups, current }: { groups: ReadonlyArray<{ label: string; links: readonly DocsLink[] }>; current: string }): JSX.Element {
  return (
    <ul className="m-0 ms-4 grid list-none gap-0.5 border-0 border-s border-solid border-border p-0 ps-2">
      {groups.map((group) => (
        <li key={group.label} data-site-menu-group="" className="ps-1">
          <Collapsible
            className="w-full"
            defaultOpen={group.links.some((link) => link.path === current)}
            title={
              <span>
                {group.label}{" "}
                <span className="ms-1 font-normal text-muted-foreground">
                  {group.links.length}
                  <span className="sr-only">{group.links.length === 1 ? " page" : " pages"}</span>
                </span>
              </span>
            }
          >
            <ul className="m-0 -ms-1 grid list-none gap-0.5 p-0">
              {group.links.map((link) => (
                <PageLink key={link.path} label={link.label} to={link.path} current={current} />
              ))}
            </ul>
          </Collapsible>
        </li>
      ))}
    </ul>
  );
}

/**
 * The search's keys: Enter (a phone's Go) opens the first page found and the down arrow steps into the list; in the
 * list the arrows walk the pages, and up from the first goes back to the search. Not while a word is being composed.
 */
function walk(event: KeyboardEvent, results: HTMLElement | null, field: HTMLElement | null): boolean {
  // Safari sends the Enter that ends a composition as keyCode 229, without isComposing.
  if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229 || !results) return false;
  const links = [...results.querySelectorAll<HTMLAnchorElement>("a[href]")];
  if (links.length === 0) return false;
  const at = links.indexOf(event.target as HTMLAnchorElement);
  if (event.key === "Enter" && at === -1) links[0]?.click();
  else if (event.key === "ArrowDown") links[Math.min(at + 1, links.length - 1)]?.focus();
  else if (event.key === "ArrowUp" && at !== -1) (at === 0 ? field : links[at - 1])?.focus();
  else return false;
  event.preventDefault();
  return true;
}

/**
 * The docs' menu: the site's, with the docs' own pages unfolded (every guide under Docs, every component under
 * Components), and a search on top that finds a page by its name: the site's, the docs' first pages, a component, a helper or a guide.
 */
function DocsMenu({ current }: { current: string }): JSX.Element {
  const [query, setQuery] = useState("");
  const found = findDocs(query);
  const results = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLDivElement>(null);
  const input = () => field.current?.querySelector("input") ?? null;
  return (
    <>
      {/* Stays at the top while the long lists scroll under it (-top-2: from the sheet body's edge, not its padding). */}
      <div
        ref={field}
        data-site-menu-pinned=""
        className="sticky -top-2 z-2 -mx-5 -mt-2 mb-2 bg-popover px-6 pt-2 pb-2"
        style={{ boxShadow: "0 0.75rem 0.75rem -0.25rem var(--popover)" }}
      >
        <TextField
          label="Find a page or component"
          hideLabel
          type="search"
          clearable
          placeholder="Find a page or component"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (found?.length && walk(event, results.current, input())) return;
            // Escape clears a search first; with nothing typed it closes the menu.
            // Not the Escape that cancels a word being composed.
            if (event.key === "Escape" && query !== "" && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229) {
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
        found.length > 0 && (
          <div ref={results} onKeyDown={(event) => walk(event, results.current, input())}>
            <MenuPages pages={found} current={current} />
          </div>
        )
      ) : (
        <SiteMenu
          page={current}
          // Both docs sections list their pages, as the sidebar does on a wide screen, each list folded under its name.
          more={{
            Docs: (
              <Folds
                groups={[
                  { label: "Guides", links: guides.filter((link) => !isAxPart(link)).map((link) => ({ ...link, label: guideLabel(link.label) })) },
                  { label: "Ouro AX, part by part", links: guides.filter(isAxPart) },
                  { label: "Skill comparisons", links: comparisons },
                ]}
                current={current}
              />
            ),
            Components: <Folds groups={componentGroups("", true)} current={current} />,
          }}
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
  // A docs page by its name and its slug, not "/docs/", which every one of them has; a page off the site by its name and line, not its address.
  const slug = (path: string) => (path.startsWith("/") ? path.replace(/^\/docs\//, "") : "");
  // The docs' first pages by their own names (the catalog by the bar's), each with its section's line, then the sections
  // and their pages; a page met twice keeps its first name.
  const hint = (href: string) => SITE_SECTIONS.find((section) => section.href === href)?.hint ?? "";
  const candidates = [
    ...startPages.map((page) => ({ label: page.href === "/docs/" ? "Components" : page.label, href: page.href, about: `${hint(page.href)} ${page.label}` })),
    ...SITE_SECTIONS.flatMap((section) => [
      { label: section.label, href: section.href, about: section.hint },
      ...(section.pages ?? []).flatMap((page) => ("links" in page ? page.links : [page])).map((page) => ({ ...page, about: "" })),
    ]),
  ];
  const site = candidates
    .filter((page) => holds(page.label, slug(page.href), page.about))
    .filter((page, index, all) => all.findIndex((other) => other.href === page.href) === index)
    .map(({ label, href }) => ({ label, href }));
  return [
    { label: "Around the site", links: site },
    { label: "Components", links: componentGroups(query, true).flatMap((group) => group.links).map(asPage) },
    {
      label: "Guides",
      links: [...guides.map((link) => ({ ...link, label: guideLabel(link.label) })), ...comparisons].filter((link) => holds(link.label, slug(link.path))).map(asPage),
    },
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
