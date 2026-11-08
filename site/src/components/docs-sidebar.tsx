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
    // What of the sidebar shows: its own box, cut off at the window's foot while the page's scene sits above it.
    const box = scroller.getBoundingClientRect();
    const shown = Math.min(box.bottom, innerHeight);
    const at = link.getBoundingClientRect();
    if (at.bottom <= shown) return;
    // Below that: scroll its group to the top, so the group's name shows above it, or further if the link still
    // would not show (a long group in a short view).
    const group = link.closest("ul")?.parentElement ?? link;
    const by = Math.max(group.getBoundingClientRect().top - box.top - 8, at.bottom - shown + 8);
    // The last groups (Platforms) cannot scroll that far in a box that runs below the window: room under the
    // list lets them, and is only ever blank space after its last link.
    const short = by - (scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop);
    if (short > 0) scroller.style.paddingBottom = `${short + 8}px`;
    scroller.scrollTop += by;
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
