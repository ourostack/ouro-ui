import { useEffect, useRef, useState, type JSX } from "react";
import { Sidebar, type SidebarSection } from "@/registry/ouro/components/ouro/sidebar/sidebar";
import { TextField } from "@/registry/ouro/components/ouro/text-field/text-field";
import { claim } from "@/registry/ouro/lib/ouro/claims";
import { siteGroups } from "../../../scripts/catalog-groups.mts";
import { docsItems } from "../docs/items";
import pageIndex from "../docs/page-index.json";
import { href } from "../routes";

// The docs sidebar. docs-shell.tsx loads it as an island, so its code stays out of the docs pages' first load.

/** The pages that get you started, first in the sidebar. */
const startPages = [
  { href: "/docs/", label: "Overview" },
  { href: "/docs/installing/", label: "Installing" },
  { href: "/docs/switching-from-shadcn/", label: "Switching from shadcn" },
  { href: "/docs/updating/", label: "Updating installed components" },
];

const guidePages = pageIndex.filter((page) => page.kind === "guide" && page.name !== "installing");
/** The skill comparisons fold under one item, so the guides stay short. */
const isComparison = (name: string) => name.startsWith("why-no-skill-");

/** A docs page title for matching: "TextField" is found by "text field" too. */
const searchable = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * The docs sidebar's sections: Start, then each catalog group's components under its own
 * label, then the guides. With a filter, only the components whose name matches remain.
 */
export function docsSections(filter = ""): SidebarSection[] {
  const wanted = searchable(filter);
  const link = (path: string, label: string) => ({ href: href(path), label });
  const groups = siteGroups
    .map((group) => ({
      label: group,
      items: docsItems
        .filter((item) => item.group === group && (wanted === "" || searchable(`${item.title} ${item.name}`).includes(wanted)))
        .map((item) => link(`/docs/${item.name}/`, item.title)),
    }))
    .filter((section) => section.items.length > 0);
  if (wanted !== "") return groups;
  return [
    { label: "Start", items: startPages.map((page) => link(page.href, page.label)) },
    ...groups,
    {
      label: "Guides",
      items: [
        ...guidePages.filter((page) => !isComparison(page.name)).map((page) => link(`/docs/${page.name}/`, page.title)),
        {
          label: "Skill comparisons",
          items: guidePages.filter((page) => isComparison(page.name)).map((page) => link(`/docs/${page.name}/`, page.title.replace("Comparison results: ", ""))),
        },
      ],
    },
  ];
}

/** The filter above the sidebar's links. It narrows the components as you type. */
function DocsFilter({ value, onChange, empty }: { value: string; onChange: (value: string) => void; empty: boolean }): JSX.Element {
  return (
    <div className="grid w-full gap-1 py-1">
      <TextField
        label="Filter components"
        hideLabel
        type="search"
        clearable
        placeholder="Filter components"
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
      {empty && (
        <p role="status" className="m-0 text-sm text-muted-foreground">
          {claim("No component is called that.", {
            source: { file: "site/src/components/docs-sidebar.tsx" },
            verify: { testExists: "site/src/site.test.tsx::docs > narrows the sidebar to the components a filter names, and says when none is called that" },
          })}
        </p>
      )}
    </div>
  );
}

/**
 * The docs sidebar: Ouro HX's Sidebar, in sections by catalog group, with a filter on top. It
 * scrolls on its own and opens scrolled to the current page; below 640px it is a menu button.
 */
export default function DocsSidebar({ current }: { current: string }): JSX.Element {
  const [filter, setFilter] = useState("");
  const sections = docsSections(filter);
  const holder = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const scroller = holder.current?.querySelector<HTMLElement>("[data-ouro-sidebar-scroll]");
    const link = scroller?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!scroller || !link) return;
    // Below the fold: scroll its group to the top, so the group's name shows above it.
    const box = scroller.getBoundingClientRect();
    if (link.getBoundingClientRect().bottom <= box.bottom) return;
    const group = link.closest("ul")?.parentElement ?? link;
    scroller.scrollTop += group.getBoundingClientRect().top - box.top - 8;
  }, []);
  return (
    <div ref={holder} className="sm:sticky sm:top-0 sm:h-dvh sm:py-4">
      <Sidebar
        label="Docs"
        menuLabel="Browse docs"
        collapsible={false}
        currentPath={href(current)}
        header={<DocsFilter value={filter} onChange={setFilter} empty={sections.length === 0} />}
        sections={sections.length > 0 ? sections : [{ items: [] }]}
      />
    </div>
  );
}
