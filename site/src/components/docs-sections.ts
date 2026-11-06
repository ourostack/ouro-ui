import type { SidebarSection } from "@/registry/ouro/components/ouro/sidebar/sidebar";
import { siteGroups } from "../../../scripts/catalog-groups.mts";
import { docsItems } from "../docs/items";
import pageIndex from "../docs/page-index.json";
import { href } from "../paths";

// The docs' pages in sections, without the Sidebar: the sidebar island and the header's menu (voyage/site-menu.tsx) both read them.

/** The pages that get you started, first in the sidebar. */
export const startPages = [
  { href: "/docs/", label: "Components" },
  { href: "/docs/installing/", label: "Installing" },
  { href: "/docs/switching-from-shadcn/", label: "Switching from shadcn" },
  { href: "/docs/updating/", label: "Updating installed components" },
];

const guidePages = pageIndex.filter((page) => page.kind === "guide" && page.name !== "installing");
/** The skill comparisons fold under one item, so the guides stay short. */
const isComparison = (name: string) => name.startsWith("why-no-skill-");

/** A docs page title for matching: "TextField" is found by "text field" too. */
const searchable = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, "");

/** A docs page: its site path (no base) and its name. */
export interface DocsLink {
  path: string;
  label: string;
}

/** Each catalog group's components, by name. With a filter, only the components whose name matches remain. */
export function componentGroups(filter = ""): Array<{ label: string; links: DocsLink[] }> {
  const wanted = searchable(filter);
  return siteGroups
    .map((group) => ({
      label: group,
      links: docsItems
        .filter((item) => item.group === group && (wanted === "" || searchable(`${item.title} ${item.name}`).includes(wanted)))
        .map((item) => ({ path: `/docs/${item.name}/`, label: item.title })),
    }))
    .filter((group) => group.links.length > 0);
}

/** The guides, and the skill comparisons that fold under one heading after them. */
export const guides: DocsLink[] = guidePages.filter((page) => !isComparison(page.name)).map((page) => ({ path: `/docs/${page.name}/`, label: page.title }));
export const comparisons: DocsLink[] = guidePages
  .filter((page) => isComparison(page.name))
  .map((page) => ({ path: `/docs/${page.name}/`, label: page.title.replace("Comparison results: ", "") }));

/**
 * The docs sidebar's sections: Start, then each catalog group's components under its own
 * label, then the guides. With a filter, only the components whose name matches remain.
 */
export function docsSections(filter = ""): SidebarSection[] {
  const link = ({ path, label }: DocsLink) => ({ href: href(path), label });
  const groups = componentGroups(filter).map((group) => ({ label: group.label, items: group.links.map(link) }));
  if (searchable(filter) !== "") return groups;
  return [
    { label: "Start", items: startPages.map((page) => link({ path: page.href, label: page.label })) },
    ...groups,
    { label: "Guides", items: [...guides.map(link), { label: "Skill comparisons", items: comparisons.map(link) }] },
  ];
}
