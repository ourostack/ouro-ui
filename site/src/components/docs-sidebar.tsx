import { useEffect, useRef, useState, type JSX } from "react";
import { Sidebar } from "@/registry/ouro/components/ouro/sidebar/sidebar";
import { href } from "../routes";
import { DocsFilter } from "./docs-filter";
import { componentGroups, docsSections, filterHint, searchable } from "./docs-sections";

// The docs sidebar. docs-shell.tsx loads it as an island, so its code stays out of the docs pages' first load.

/**
 * The docs sidebar: Ouro HX's Sidebar, in sections by catalog group, with a filter on top. It
 * scrolls on its own and opens scrolled to the current page. Below 640px it steps aside for the header's menu (docs-shell.tsx).
 */
export default function DocsSidebar({ current }: { current: string }): JSX.Element {
  const [filter, setFilter] = useState("");
  const sections = docsSections(filter);
  const holder = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => {
    // "/" jumps to the filter from anywhere on the page, as on GitHub and MDN; not while you type, in a dialog, or with
    // a modifier held, and not below 640px, where the sidebar steps aside for the header's menu.
    const onKeyDown = (event: KeyboardEvent) => {
      const input = field.current;
      if (event.key !== "/" || event.defaultPrevented || event.isComposing || event.metaKey || event.ctrlKey || event.altKey || !input) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target && (target.isContentEditable || target.closest("input, textarea, select, [role=dialog], [role=alertdialog]"))) return;
      if (input.getClientRects().length === 0) return;
      event.preventDefault();
      input.focus();
      input.select();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);
  // Enter opens the closest match: a component's own name first, whatever its group, then a slip, then another kit's name.
  const best = () => componentGroups(filter).flatMap((group) => group.links).sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))[0];
  useEffect(() => {
    const scroller = holder.current?.querySelector<HTMLElement>("[data-ouro-sidebar-scroll]");
    const link = scroller?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!scroller || !link) return;
    // What of the sidebar shows: its own box, cut off at the window's foot while the page's scene sits above it.
    const box = scroller.getBoundingClientRect();
    const shown = Math.min(box.bottom, innerHeight);
    const at = link.getBoundingClientRect();
    if (at.bottom <= shown) return;
    // Below that: scroll its group to the top, so the group's name shows above it. Where the window shows enough of
    // the box, go further if the link still would not show (a long group in a short view), never past the box's top.
    const group = link.closest("ul")?.parentElement ?? link;
    const toGroup = group.getBoundingClientRect().top - box.top - 8;
    const by = shown - box.top < at.height + 16 ? toGroup : Math.min(Math.max(toGroup, at.bottom - shown + 8), at.top - box.top - 8);
    // The last groups (Platforms) cannot scroll that far in a box that runs below the window: room under the
    // list lets them, and is only ever blank space after its last link, until a filter changes the list.
    const short = by - (scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop);
    if (short > 0) scroller.style.paddingBottom = `${short + 8}px`;
    scroller.scrollTop += by;
  }, []);
  useEffect(() => {
    // A filtered list starts at its first match, without the room the current page's group needed.
    const scroller = holder.current?.querySelector<HTMLElement>("[data-ouro-sidebar-scroll]");
    if (!scroller || filter === "") return;
    scroller.style.paddingBottom = "";
    scroller.scrollTop = 0;
  }, [filter]);
  return (
    <div ref={holder} className="sm:sticky sm:top-0 sm:h-dvh sm:py-4">
      <Sidebar
        label="Docs"
        collapsible={false}
        // Narrower from 640px to 768px, with the page's column (docs-shell.tsx): a tablet's page is no narrower than a phone's.
        className="[--ouro-sidebar-w:12rem] md:[--ouro-sidebar-w:16rem]"
        currentPath={href(current)}
        header={
          <DocsFilter
            value={filter}
            onChange={setFilter}
            empty={sections.length === 0}
            hint={filterHint(filter)}
            inputRef={field}
            onEnter={() => {
              // Its link in the list, pressed, as the header's search opens its first page.
              // A filter with no letters or digits ("/", "ボタン") filters nothing, so it opens nothing.
              const link = searchable(filter) === "" ? undefined : best();
              if (link) holder.current?.querySelector<HTMLAnchorElement>(`a[href="${href(link.path)}"]`)?.click();
            }}
          />
        }
        sections={sections.length > 0 ? sections : [{ items: [] }]}
      />
    </div>
  );
}
