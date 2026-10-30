import { useEffect, useRef, useState, type JSX, type ReactNode } from "react";
import { Sidebar, type SidebarSection } from "@/registry/ouro/components/ouro/sidebar/sidebar";
import { TextField } from "@/registry/ouro/components/ouro/text-field/text-field";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { siteGroups } from "../../../scripts/catalog-groups.mts";
import { docsItems, GITHUB } from "../docs/items";
import pageIndex from "../docs/page-index.json";
import { href } from "../routes";
import { HxLogo } from "./brand";
import { Popups, PopupsProvider } from "./popups";

export const STORYBOOK = "https://ui.ouro.bot/storybook/";

/** Page width and side gutters: 16px on phones, as the house layout rule says. */
export function Container({ children, className }: { children: ReactNode; className?: string }): JSX.Element {
  return <div className={cn("mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8", className)}>{children}</div>;
}

const navLink =
  "inline-flex min-h-11 items-center rounded-md px-2.5 text-sm text-muted-foreground no-underline transition-colors " +
  "hover:text-foreground outline-ring focus-visible:outline-2 focus-visible:outline-offset-2 sm:min-h-9";

export function SiteHeader(): JSX.Element {
  return (
    <header>
      <Container className="flex h-16 items-center justify-between gap-4">
        <a
          href={href("/")}
          className="-ms-1 inline-flex min-h-11 items-center gap-2 rounded-md px-1 font-semibold tracking-tight text-foreground no-underline outline-ring focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <HxLogo size={40} className="size-10" />
          Ouro HX
        </a>
        <nav aria-label="Site">
          <ul className="m-0 flex list-none items-center gap-0.5 p-0 sm:gap-1">
            <li>
              <a href={href("/docs/")} className={navLink}>
                Docs
              </a>
            </li>
            <li>
              <a href={STORYBOOK} className={navLink}>
                Storybook
              </a>
            </li>
            <li>
              <a href={GITHUB} className={navLink}>
                GitHub
              </a>
            </li>
          </ul>
        </nav>
      </Container>
    </header>
  );
}

export function SiteFooter(): JSX.Element {
  const links = [
    { label: "GitHub", url: GITHUB },
    { label: "Storybook", url: STORYBOOK },
    { label: "Docs", url: href("/docs/") },
    { label: "llms.txt", url: "https://ui.ouro.bot/llms.txt" },
    { label: "Ouro", url: "https://ouro.bot" },
  ];
  return (
    <footer className="mt-24 border-t border-border">
      <Container className="flex flex-col gap-6 py-10 sm:flex-row sm:items-center sm:justify-between">
        <p className="m-0 flex items-center gap-2 text-sm text-muted-foreground">
          <span>
            Ouro HX is part of Ouro UI, the interface family within{" "}
            <a href="https://ouro.bot" className="text-foreground underline underline-offset-4">Ouro</a>.
            {" "}MIT license.
          </span>
        </p>
        <nav aria-label="Footer">
          <ul className="m-0 -ms-2.5 flex list-none flex-wrap gap-x-1 gap-y-0 p-0 sm:ms-0 sm:-me-2.5">
            {links.map((link) => (
              <li key={link.label}>
                <a href={link.url} className={navLink}>
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </Container>
    </footer>
  );
}

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
          No component is called that.
        </p>
      )}
    </div>
  );
}

/**
 * The docs sidebar: Ouro HX's Sidebar, in sections by catalog group, with a filter on top. It
 * scrolls on its own and opens scrolled to the current page; below 640px it is a menu button.
 */
function DocsSidebar({ current }: { current: string }): JSX.Element {
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

/** Docs pages: the sidebar beside the page from 640px up; on smaller screens it opens as a drawer. */
export function DocsShell({ current, children }: { current: string; children: ReactNode }): JSX.Element {
  return (
    <PopupsProvider>
      <SiteHeader />
      <Container className="sm:grid sm:grid-cols-[16rem_minmax(0,1fr)] sm:gap-8 lg:gap-12">
        <aside className="max-sm:border-b max-sm:border-border max-sm:pb-2">
          <DocsSidebar current={current} />
        </aside>
        <div className="min-w-0">
          <main className="max-w-3xl pt-8 lg:pt-10">
            {children}
            <Popups />
          </main>
        </div>
      </Container>
      <SiteFooter />
    </PopupsProvider>
  );
}
