import { useEffect, useRef, useState, type JSX } from "react";
import { Sidebar } from "@/registry/ouro/components/ouro/sidebar/sidebar";
import { href } from "../routes";
import { DocsFilter } from "./docs-filter";
import { docsSections } from "./docs-sections";

// The docs sidebar. docs-shell.tsx loads it as an island, so its code stays out of the docs pages' first load.

/**
 * The docs sidebar: Ouro HX's Sidebar, in sections by catalog group, with a filter on top. It
 * scrolls on its own and opens scrolled to the current page. Below 640px it steps aside for the header's menu (docs-shell.tsx).
 */
export default function DocsSidebar({ current }: { current: string }): JSX.Element {
  const [filter, setFilter] = useState("");
  const sections = docsSections(filter);
  const holder = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const scroller = holder.current?.querySelector<HTMLElement>("[data-ouro-sidebar-scroll]");
    const link = scroller?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!scroller || !link) return;
    // Below the fold (the sidebar's own, or the window's when the page's scene pushes it down): scroll its group
    // to the top, so the group's name shows above it.
    const box = scroller.getBoundingClientRect();
    if (link.getBoundingClientRect().bottom <= Math.min(box.bottom, innerHeight)) return;
    const group = link.closest("ul")?.parentElement ?? link;
    scroller.scrollTop += group.getBoundingClientRect().top - box.top - 8;
  }, []);
  return (
    <div ref={holder} className="sm:sticky sm:top-0 sm:h-dvh sm:py-4">
      <Sidebar
        label="Docs"
        collapsible={false}
        currentPath={href(current)}
        header={<DocsFilter value={filter} onChange={setFilter} empty={sections.length === 0} />}
        sections={sections.length > 0 ? sections : [{ items: [] }]}
      />
    </div>
  );
}
