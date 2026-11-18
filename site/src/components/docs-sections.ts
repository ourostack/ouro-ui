import { oneEditApart } from "@/registry/ouro/components/ouro/command/command-styles";
import type { SidebarSection } from "@/registry/ouro/components/ouro/sidebar/sidebar";
import { siteGroups } from "../../../scripts/catalog-groups.mts";
import { docsItems } from "../docs/items";
import pageIndex from "../docs/page-index.json";
import { href } from "../paths";
import { otherNameHint, otherNamesFor, otherNamesStarting } from "./other-names";

// The docs' pages in sections, without the Sidebar: the sidebar island and the header's menu (voyage/site-menu.tsx) both read them.

/** The pages that get you started, first in the sidebar. */
export const startPages = [
  { href: "/docs/", label: "Overview" },
  { href: "/docs/installing/", label: "Installing" },
  { href: "/docs/switching-from-shadcn/", label: "Switching from shadcn" },
  { href: "/docs/updating/", label: "Updating components" },
];

const exportPages = pageIndex.filter((page) => page.kind === "export");
const guidePages = pageIndex.filter((page) => page.kind === "guide" && page.name !== "installing");
/** The skill comparisons fold under one item, so the guides stay short. */
const isComparison = (name: string) => name.startsWith("why-no-skill-");

/** A docs page title for matching: "TextField" is found by "text field" too. */
const searchable = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, "");

/** A docs page: its site path (no base) and its name. */
export interface DocsLink {
  path: string;
  label: string;
  /** A found component's rank: 0, its name holds the filter; 1, one slip from it; 2, another kit's name for it. */
  rank?: 0 | 1 | 2;
}

/** A filter's rank for a page's names: 0, the name holds it; 1, one slip from the name; undefined, no match. */
function nameRank(filter: string, ...texts: string[]): 0 | 1 | undefined {
  const wanted = searchable(filter);
  const names = texts.map(searchable);
  if (names.some((name) => name.includes(wanted))) return 0;
  // A filter of five letters or more may be a slip of a name's start ("dialg" finds Dialog); a shorter one only of a whole name.
  const starts = (name: string) => (wanted.length >= 5 ? [name.slice(0, wanted.length - 1), name.slice(0, wanted.length), name.slice(0, wanted.length + 1)] : []);
  const near = (name: string) => [name, ...starts(name)].some((part) => oneEditApart(wanted, part));
  return wanted.length >= 4 && names.some(near) ? 1 : undefined;
}

/**
 * Each catalog group's components, by name. With a filter, only the components whose name matches remain: the names
 * that hold it, then the names one slip from it, then the components another kit calls by it ("modal" finds Dialog).
 * With `exports`, each group's helpers, hooks and parts follow its components (`Radio` after the forms, `useTimer` in Feedback).
 */
export function componentGroups(filter = "", exports = false): Array<{ label: string; links: DocsLink[] }> {
  const wanted = searchable(filter);
  const ranked = <T,>(pages: T[], name: (page: T) => [string, string], path: (page: T) => string, other: (page: T) => boolean = () => false): DocsLink[] =>
    pages
      .map((page) => ({ page, at: nameRank(filter, ...name(page)) ?? (other(page) ? 2 : undefined) }))
      .filter((entry) => entry.at !== undefined)
      .sort((a, b) => a.at! - b.at!)
      .map(({ page, at }) => ({ path: path(page), label: name(page)[0], rank: at! }));
  return siteGroups
    .map((group) => ({
      label: group,
      links: [
        ...ranked(
          docsItems.filter((item) => item.group === group),
          (item) => [item.title, item.name],
          (item) => `/docs/${item.name}/`,
          (item) => otherNamesFor(item.name, wanted).length > 0,
        ),
        ...(exports ? ranked(exportPages.filter((page) => page.group === group), (page) => [page.title, page.name], (page) => `/docs/${page.name}/`) : []),
      ],
    }))
    .filter((group) => group.links.length > 0);
}

/** Every component and export a filter finds, in one list: the names that hold it first, whatever their group, then slips, then other kits' names. */
export function rankedComponents(filter: string): DocsLink[] {
  return componentGroups(filter, true)
    .flatMap((group) => group.links)
    .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
}

/**
 * The line under the filter when it finds components only by another kit's name ("Looking for a modal? Here it's
 * Dialog."); undefined when any page's own name matches, so "select" never sends you past Select to another name.
 */
export function filterHint(filter: string): string | undefined {
  const wanted = searchable(filter);
  if (wanted === "" || [...docsItems, ...exportPages].some((page) => nameRank(filter, page.title, page.name) !== undefined)) return undefined;
  return otherNameHint(
    docsItems
      .map((item) => ({ title: item.title, names: otherNamesStarting(item.name, wanted) }))
      .filter((entry) => entry.names.length > 0),
  );
}

/** The pages for the helpers and hooks a component exports (`canShare`, `useTimer`), named as code names them. */
export const helpers: DocsLink[] = pageIndex.filter((page) => page.kind === "export").map((page) => ({ path: `/docs/${page.name}/`, label: page.title }));
/** The guides, and the skill comparisons that fold under one heading after them. */
export const guides: DocsLink[] = guidePages.filter((page) => !isComparison(page.name)).map((page) => ({ path: `/docs/${page.name}/`, label: page.title }));
/** The guides named as their code is (`ax-checks`, `ax-cli`): each part of the ax package, which the menu folds under one heading. */
export const isAxPart = ({ path, label }: DocsLink): boolean => path === `/docs/${label}/` && label.startsWith("ax-");
export const comparisons: DocsLink[] = guidePages
  .filter((page) => isComparison(page.name))
  .map((page) => ({ path: `/docs/${page.name}/`, label: page.title.replace("Comparison results: ", "") }));
/** A platform page's label: a product page's part from "for" ("For Apple"), so a platform's name only ever follows "for"; the section's index is its Overview, and the guide keeps its title. */
const platformLabel = (page: { name: string; title: string }) => {
  if (page.name === "platforms") return "Overview";
  const at = page.title.startsWith("Ouro ") ? page.title.indexOf(" for ") : -1;
  return at === -1 ? page.title : `For ${page.title.slice(at + " for ".length)}`;
};
/** The Platforms section's pages (docs/platforms), in the order `pnpm run docs` lists them. */
export const platforms: DocsLink[] = pageIndex.filter((page) => page.kind === "platform").map((page) => ({ path: `/docs/${page.name}/`, label: platformLabel(page) }));

/**
 * The docs sidebar's sections: Start, then each catalog group's components under its own
 * label, then the guides, then the platforms. With a filter, only the components whose name matches remain.
 */
export function docsSections(filter = ""): SidebarSection[] {
  const link = ({ path, label }: DocsLink) => ({ href: href(path), label });
  const groups = componentGroups(filter).map((group) => ({ label: group.label, items: group.links.map(link) }));
  if (searchable(filter) !== "") return groups;
  return [
    { label: "Start", items: startPages.map((page) => link({ path: page.href, label: page.label })) },
    ...groups,
    { label: "Guides", items: [...guides.map(link), { label: "Skill comparisons", items: comparisons.map(link) }] },
    { label: "Platforms", items: platforms.map(link) },
  ];
}
