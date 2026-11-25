import { useId, useState, type JSX } from "react";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { href } from "../paths";
import { componentGroups, guides, comparisons, isAxPart, startPages } from "../components/docs-sections";
import { Eyebrow, Head, NAV_DOCS, NavLink, row, SOURCE, type NavPage } from "./site-nav";

const FIRST = 3;

/** A group of guides: its first three, and the rest on request. */
function GuideList({ label, pages, current }: { label: string; pages: readonly NavPage[]; current: string }): JSX.Element {
  const [all, setAll] = useState(() => pages.slice(FIRST).some((page) => page.path === current));
  const id = useId();
  const rest = pages.length - FIRST;
  return (
    <div className="grid content-start">
      <Eyebrow id={id}>{label}</Eyebrow>
      <ul id={`${id}list`} aria-labelledby={id} className="m-0 grid list-none gap-0.5 p-0">
        {(all ? pages : pages.slice(0, FIRST)).map((page) => (
          <li key={page.path}>
            <NavLink page={page} current={current} hint={false} />
          </li>
        ))}
      </ul>
      {rest > 0 && (
        <button
          type="button"
          aria-expanded={all}
          aria-controls={`${id}list`}
          data-site-fold=""
          onClick={() => setAll(!all)}
          className={cn(row, "w-full cursor-pointer justify-start gap-1 border-0 bg-transparent text-start text-sm font-medium text-muted-foreground")}
        >
          {all ? "Fewer" : `${rest} more`}
          <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={cn("size-3 motion-safe:transition-[rotate] motion-safe:duration-(--ouro-duration-fast)", all && "rotate-180")}>
            <path d="m4 6 4 4 4-4" />
          </svg>
        </button>
      )}
    </div>
  );
}

/** The guides, in the groups a reader would look in, each from the docs' own list. */
function guideGroups(): Array<{ label: string; pages: NavPage[] }> {
  // A title's footnote marker ("[^range]") is the page's, not the menu's.
  const all = guides.filter((link) => !isAxPart(link)).map((link) => ({ path: link.path, label: link.label.replace(/\[\^[^\]]*\]/g, "").trim() }));
  const named = (...names: string[]) => names.map((name) => all.find((page) => page.path === `/docs/${name}/`)).filter((page): page is NavPage => page !== undefined);
  const start = [...startPages.slice(1).map((page) => ({ label: page.label, path: page.href })), ...named("agent-quickstart", "theming", "beside-an-incumbent")];
  const agents = named("ax", "ax-standard", "ax-conformance", "ax-eval", "ax-adopt", "ax-standalone", "native-apps", "agent-harness", "agent-interfaces");
  const building = named("forms", "density", "patterns", "design-craft", "composed-ui", "testing", "accessibility-evidence", "guardrails", "static-css", "part-names");
  const versus = named("why-no-skill", "agent-native");
  const listed = new Set([...start, ...agents, ...building, ...versus].map((page) => page.path));
  return [
    { label: "Start here", pages: start },
    { label: "Building", pages: [...building, ...all.filter((page) => !listed.has(page.path))] },
    { label: "Agents", pages: agents.map((page) => (page.path === "/docs/ax/" ? { ...page, label: "Ouro AX guide" } : page)) },
    { label: "Comparisons", pages: [...versus, ...comparisons.map((link) => ({ path: link.path, label: `Results: ${link.label.replace(/-/g, " ")}` }))] },
  ].filter((group) => group.pages.length > 0);
}

/** Docs: the components by group, then the guides, each group's first three and the rest on request, and the source once. */
export function DocsPanel({ current, compact = false }: { current: string; compact?: boolean }): JSX.Element {
  const id = useId();
  const groups = componentGroups("", false);
  return (
    <div className="grid gap-3">
      {!compact && <Head page={NAV_DOCS} hint={NAV_DOCS.hint} current={current} end={<NavLink page={SOURCE} current={current} size="sm" hint={false} />} />}
      <div className="grid content-start gap-1 [contain:inline-size]">
        <Eyebrow id={id}>Components, by group</Eyebrow>
        <ul aria-labelledby={id} className="m-0 flex list-none flex-wrap gap-2 p-0 px-3">
          {groups.map((group) => (
            <li key={group.label}>
              <a
                href={href(`/docs/#group-${group.label.toLowerCase().replace(/\s+/g, "-")}`)}
                className="inline-flex min-h-11 items-center rounded-ouro-xl border border-solid border-border px-3.5 text-sm font-medium whitespace-nowrap text-foreground no-underline outline-ring touch-manipulation transition-colors duration-(--ouro-duration-fast) ease-[ease] focus-visible:outline-2 focus-visible:outline-solid pointer-fine:min-h-8 pointer-fine:px-3 pointer-fine:hover:bg-accent active:bg-accent"
              >
                {group.label}
              </a>
            </li>
          ))}
        </ul>
      </div>
      <div className={cn("grid gap-x-6 gap-y-3", compact ? "grid-cols-1" : "grid-cols-2 lg:grid-cols-[repeat(4,max-content)]")}>
        {guideGroups().map((group) => (
          <GuideList key={group.label} label={`Guides: ${group.label}`} pages={group.pages} current={current} />
        ))}
      </div>
      {compact && <NavLink page={SOURCE} current={current} hint={false} />}
    </div>
  );
}
