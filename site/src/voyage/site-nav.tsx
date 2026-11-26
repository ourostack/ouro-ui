import { lazy, startTransition, Suspense, useId, useLayoutEffect, useRef, useState, type JSX, type ReactNode } from "react";
import { claim } from "@/registry/ouro/lib/ouro/claims";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { href } from "../paths";

/*
 * The site's navigation, by platform and by part (Compass): the bar's four panels (Platforms, Parts, Proof, Docs) and the
 * phone's menu, which shows the same two ways in behind a switch. Every platform has the same four pages in the same
 * order, so siblings look like siblings; the panels group with space and headings, never with rules.
 */

export interface NavPage {
  label: string;
  path: string;
  hint?: string;
}

export interface NavPlatform {
  id: "web" | "apple" | "windows" | "android";
  name: string;
  kit: string;
  pages: readonly [NavPage, NavPage, NavPage, NavPage];
}

const four = (name: string, paths: readonly [string, string, string, string]): NavPlatform["pages"] => [
  { label: "Overview", path: paths[0], hint: `Ouro UI for ${name}` },
  { label: "Ouro HX", path: paths[1], hint: `Ouro HX for ${name}` },
  { label: "Ouro AX", path: paths[2], hint: `Ouro AX for ${name}` },
  { label: "Get started", path: paths[3], hint: `Get started on ${name}` },
];

/** Web, Apple, Windows and Android, each with Overview, Ouro HX, Ouro AX and Get started. */
export const NAV_PLATFORMS: readonly NavPlatform[] = [
  { id: "web", name: "Web", kit: "React", pages: four("Web", ["/hx/#web", "/docs/", "/docs/ax/", "/docs/installing/"]) },
  { id: "apple", name: "Apple", kit: "SwiftUI", pages: four("Apple", ["/apple/", "/apple/hx/", "/apple/ax/", "/apple/start/"]) },
  { id: "windows", name: "Windows", kit: "WinUI", pages: four("Windows", ["/windows/", "/windows/hx/", "/windows/ax/", "/windows/start/"]) },
  { id: "android", name: "Android", kit: "Compose", pages: four("Android", ["/android/", "/android/hx/", "/android/ax/", "/android/start/"]) },
];

export interface NavPart extends NavPage {
  hint: string;
  pages: readonly NavPage[];
}

/** Ouro UI by part (AGENTS.md, Names), each with its own pages. */
export const NAV_PARTS: readonly NavPart[] = [
  { label: "Ouro HX", path: "/hx/", hint: "Components for people's screens: web, Apple, Windows, Android", pages: [{ label: "Platform coverage", path: "/hx/#coverage" }] },
  {
    label: "Ouro AX",
    path: "/ax/",
    hint: "Doors for agents: CLI, MCP, App Intents and more",
    pages: [
      { label: "Be the agent", path: "/ax/#be-the-agent" },
      { label: "The Ouro AX claims", path: "/docs/ax-standard/" },
    ],
  },
  { label: "Actions", path: "/actions/", hint: "One declaration, a button and a tool, with consent", pages: [{ label: "Consent", path: "/actions/#consent" }] },
  { label: "Composed UI", path: "/composed-ui/", hint: "Cards your agent sends, drawn natively", pages: [{ label: "MCP Apps and A2UI", path: "/composed-ui/#formats" }] },
  {
    label: "X-ray",
    path: "/xray/",
    hint: "See inside screens and doors",
    pages: [
      { label: "HX X-ray", path: "/xray/#hx" },
      { label: "AX X-ray", path: "/xray/#ax" },
      { label: "Ouro check", path: "/xray/#kit" },
      { label: "Ouro Feel", path: "/apple/feel/" },
      { label: "Ouro Reins", path: "/apple/reins/" },
      { label: "Hackamore", path: "/hackamore/" },
    ],
  },
];

export const NAV_PROOF = {
  label: "Proof",
  path: "/proof/",
  hint: "The benchmark, model reviews, adoption, Ouro UI at a company",
  groups: [
    {
      label: "Tested",
      pages: [
        { label: "The benchmark", path: "/proof/#benchmark", hint: "Agents building with and without it" },
        { label: "The Errand", path: "/proof/#errand", hint: "One job, done by screen and by agent" },
        { label: "Model reviews", path: "/proof/#reviews", hint: "What frontier models said" },
      ],
    },
    {
      label: "In use",
      pages: [
        { label: "Adoption", path: "/adoption/", hint: "The products built on Ouro UI" },
        { label: "Ouro Current", path: "/current/", hint: "Releases arrive in your repository as pull requests" },
        { label: "At a company", path: "/proof/#company", hint: "Your own registry, your own pace" },
      ],
    },
    { label: "Thanks", pages: [{ label: "What we borrowed", path: "/proof/#borrowed", hint: "The projects we learned from" }] },
  ],
} as const;

export const NAV_DOCS = { label: "Docs", path: "/docs/", hint: "The web components, and the guides" } as const;
export const SOURCE = { label: "Source code", path: "https://github.com/ourostack/ouro-ui" } as const;

/** The section of the site a page is in, for the bar's mark: platforms, parts, proof or docs. */
export function sectionOf(page: string): "platforms" | "parts" | "proof" | "docs" | undefined {
  const at = (path: string) => path.split("#")[0] === page;
  if (NAV_PLATFORMS.some((p) => p.pages.some((x) => at(x.path) && x.path !== "/docs/"))) return "platforms";
  if (NAV_PARTS.some((part) => at(part.path) || part.pages.some((x) => at(x.path) && !x.path.startsWith("/docs/")))) return "parts";
  // Ouro AX's guide and its parts are Ouro AX's, though their addresses are under the docs.
  if (page === "/hackamore/" || /^\/docs\/ax(-[a-z0-9-]+)?\/$/.test(page)) return "parts";
  if (at(NAV_PROOF.path) || page === "/adoption/" || page === "/current/") return "proof";
  if (page.startsWith("/docs/")) return "docs";
  return undefined;
}

/* ---------------------------------------------------------------- links */

const away = (path: string) => !path.startsWith("/");
const to = (path: string) => (away(path) ? path : href(path));

export const row =
  "relative flex min-h-11 items-center gap-3 rounded-ouro-lg px-3 no-underline outline-ring -outline-offset-2 touch-manipulation [-webkit-tap-highlight-color:transparent] pointer-fine:min-h-8 " +
  "transition-colors duration-(--ouro-duration-fast) ease-[ease] focus-visible:outline-2 focus-visible:outline-solid pointer-fine:hover:bg-accent active:bg-accent " +
  "aria-[current=page]:bg-[color-mix(in_oklab,var(--primary)_10%,transparent)]";

/** The lit porthole beside the page you are on. */
function Here(): JSX.Element {
  return (
    <span aria-hidden="true" className="relative ms-auto inline-flex size-2.5 shrink-0">
      <span className="absolute inset-0 animate-ping rounded-full bg-primary/50 [animation-iteration-count:2] [corner-shape:round] motion-reduce:hidden" />
      <span className="relative size-2.5 rounded-full border-2 border-solid border-primary bg-primary/30 [corner-shape:round]" />
    </span>
  );
}

/** A page link: its name, a line under it when there is one, and the mark when you are on it. */
export function NavLink({ page, current, size = "md", label, hint = true, mark = true }: { page: NavPage; current: string; size?: "sm" | "md" | "lg"; label?: ReactNode; hint?: boolean; mark?: boolean }): JSX.Element {
  const here = mark && page.path === current;
  const id = useId();
  const described = hint && !label && page.hint !== undefined;
  return (
    <a
      href={to(page.path)}
      aria-current={here ? "page" : undefined}
      // The line under the name is heard as the link's description, not part of its name.
      aria-describedby={described ? id : undefined}
      // Choosing the page you are on closes the menu and leaves the page where it is; with a modifier key it opens anew.
      onClick={here ? (event) => !(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) && event.preventDefault() : undefined} aria-label={label ? (page.hint ?? page.label) : undefined} className={cn(row, "py-1.5 pointer-fine:py-1")}>
      <span className="grid min-w-0 flex-1 gap-0.5 text-pretty lg:whitespace-nowrap">
        <span
          className={cn(
            "text-foreground",
            size === "lg" && "font-[family-name:var(--font-heading,inherit)] text-lg leading-6 font-semibold tracking-[-0.01em]",
            size === "md" && "text-[0.9375rem] leading-5 font-medium",
            size === "sm" && "text-sm leading-5 text-muted-foreground",
          )}
        >
          {label ?? page.label}
          {away(page.path) && (
            <span aria-hidden="true" className="ms-1 text-muted-foreground">
              ↗
            </span>
          )}
        </span>
        {described && (
          <span id={id} aria-hidden="true" className="text-[0.8125rem] leading-[1.125rem] text-muted-foreground">
            {page.hint}
          </span>
        )}
      </span>
      {here && <Here />}
    </a>
  );
}

export function Eyebrow({ children, id }: { children: ReactNode; id?: string }): JSX.Element {
  return (
    <p id={id} className="m-0 px-3 pt-1 pb-1 text-xs leading-4 font-semibold tracking-[0.08em] text-muted-foreground uppercase">
      {children}
    </p>
  );
}

export function Links({ label, pages, current, hint = true }: { label?: string; pages: readonly NavPage[]; current: string; hint?: boolean }): JSX.Element {
  const id = useId();
  return (
    <div className="grid content-start">
      {label && <Eyebrow id={id}>{label}</Eyebrow>}
      <ul aria-labelledby={label ? id : undefined} className="m-0 grid list-none gap-0.5 p-0">
        {pages.map((page) => (
          <li key={page.label + page.path}>
            <NavLink page={page} current={current} hint={hint} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A panel's first line: its section's page and the section's line, as open text. */
export function Head({ page, title, hint, current, end }: { page?: NavPage; title?: string; hint: string; current: string; end?: ReactNode }): JSX.Element {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-1">
      {page ? (
        <NavLink page={page} current={current} size="lg" hint={false} />
      ) : (
        <span className="px-3 py-1 font-[family-name:var(--font-heading,inherit)] text-lg leading-6 font-semibold tracking-[-0.01em] text-foreground">{title}</span>
      )}
      <span className="pe-4 text-sm leading-5 text-muted-foreground">{hint}</span>
      {end && <span className="ms-auto">{end}</span>}
    </div>
  );
}

/* ---------------------------------------------------------------- the bar's panels */

/** The bar's three heaviest panels, the real platform marks among them (nav-panels.tsx), load only once a pointer, a
 * finger or focus first reaches the header (header.tsx's wantPanels, which loads this module alongside the Docs panel's),
 * long before a person can open one: a page nobody ever points at the header on never pays for them. */
export const loadNavPanels = () => import("./nav-panels");
const LazyPlatformsPanel = lazy(() => loadNavPanels().then((module) => ({ default: module.PlatformsPanel })));
const LazyPartsPanel = lazy(() => loadNavPanels().then((module) => ({ default: module.PartsPanel })));
const LazyProofPanel = lazy(() => loadNavPanels().then((module) => ({ default: module.ProofPanel })));

/** The four platforms side by side, each with the same four pages: two columns on a phone, four from 640px. */
export function PlatformsPanel({ current, compact = false }: { current: string; compact?: boolean }): JSX.Element {
  return (
    <Suspense fallback={compact ? <Eyebrow>Pick a platform</Eyebrow> : <Head title="Platforms" hint="Web, Apple, Windows and Android" current={current} />}>
      <LazyPlatformsPanel current={current} compact={compact} />
    </Suspense>
  );
}

/** Every part on a line: the part and its line, then its pages across. Stacked on a phone. */
export function PartsPanel({ current, compact = false, more }: { current: string; compact?: boolean; more?: Readonly<Record<string, ReactNode>> | undefined }): JSX.Element {
  return (
    <Suspense fallback={compact ? <Eyebrow>Ouro UI, part by part</Eyebrow> : <Head title="Parts" hint="Ouro UI, part by part" current={current} />}>
      <LazyPartsPanel current={current} compact={compact} more={more} />
    </Suspense>
  );
}

export function ProofPanel({ current, compact = false }: { current: string; compact?: boolean }): JSX.Element {
  return (
    <Suspense fallback={compact ? null : <Head page={NAV_PROOF} hint={NAV_PROOF.hint} current={current} />}>
      <LazyProofPanel current={current} compact={compact} />
    </Suspense>
  );
}

/** The Docs panel's lists come from the docs' generated index, which the voyage pages never load up front: the panel's
 * own module loads as soon as the page is live (loadDocsPanel), long before a person can open it. */
export const loadDocsPanel = () => import("./docs-panel");
const LazyDocsPanel = lazy(() => loadDocsPanel().then((module) => ({ default: module.DocsPanel })));

/** Docs: the components by group and the guides (docs-panel.tsx), under the panel's head while they load. */
export function DocsPanel({ current, compact = false }: { current: string; compact?: boolean }): JSX.Element {
  return (
    <Suspense fallback={compact ? null : <Head page={NAV_DOCS} hint={NAV_DOCS.hint} current={current} />}>
      <LazyDocsPanel current={current} compact={compact} />
    </Suspense>
  );
}

/* ---------------------------------------------------------------- the phone's menu */

/**
 * Two ways in, as a segmented switch whose thumb slides the moment it is pressed (translate on --ouro-ease-out over
 * --ouro-duration-base), with the pressed label turning as the thumb lands. With reduced motion nothing slides: the
 * thumb fades from one side to the other. A radio group with arrow keys, as Ouro HX's SegmentedControl is.
 */
function WaySwitch<T extends string>({ label, items, value, onChange }: { label: string; items: readonly [{ value: T; label: string }, { value: T; label: string }]; value: T; onChange: (value: T) => void }): JSX.Element {
  const id = useId();
  // The thumb follows the press at once; the view under it follows as the next render allows.
  const [mine, setMine] = useState(value);
  const [given, setGiven] = useState(value);
  if (value !== given) {
    setGiven(value);
    setMine(value);
  }
  const at = items.findIndex((item) => item.value === mine);
  const choose = (next: T) => {
    setMine(next);
    startTransition(() => onChange(next));
  };
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const fill = "bg-background shadow-(--shadow-sm) dark:bg-[color-mix(in_oklab,var(--foreground)_16%,var(--muted))]";
  return (
    <div className="grid gap-2">
      <span id={id} className="text-sm leading-5 font-medium text-foreground">
        {label}
      </span>
      <div
        role="radiogroup"
        aria-labelledby={id}
        data-site-switch=""
        className="relative isolate grid h-12 grid-cols-2 rounded-ouro-control bg-muted p-0.5 pointer-fine:h-10"
        onKeyDown={(event) => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
          event.preventDefault();
          const next = event.key === "Home" ? 0 : event.key === "End" ? 1 : 1 - at;
          choose(items[next]!.value);
          refs.current[next]?.focus();
        }}
      >
        <span
          aria-hidden="true"
          data-site-thumb=""
          style={{ translate: `${at * 100}% 0` }}
          className={cn("pointer-events-none absolute start-0.5 top-0.5 bottom-0.5 -z-1 w-[calc(50%-0.125rem)] rounded-ouro-control-md motion-safe:transition-[translate] motion-safe:duration-(--ouro-duration-base) motion-safe:ease-(--ouro-ease-out) motion-reduce:hidden", fill)}
        />
        {items.map((item, index) => (
          <button
            key={item.value}
            ref={(el) => {
              refs.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={index === at}
            tabIndex={index === at ? 0 : -1}
            onClick={() => choose(item.value)}
            className={cn(
              "relative m-0 cursor-pointer rounded-ouro-control-md border-0 bg-transparent px-3 text-base font-medium whitespace-nowrap text-[color-mix(in_oklab,var(--muted-foreground)_80%,var(--foreground))] outline-ring outline-offset-1 select-none touch-manipulation [-webkit-tap-highlight-color:transparent] focus-visible:outline-2 focus-visible:outline-solid pointer-fine:text-sm aria-checked:text-foreground",
              "transition-colors duration-(--ouro-duration-fast) ease-[ease] motion-safe:aria-checked:delay-(--ouro-duration-fast)",
              "motion-reduce:before:absolute motion-reduce:before:inset-0 motion-reduce:before:-z-1 motion-reduce:before:rounded-[inherit] motion-reduce:before:opacity-0 motion-reduce:before:transition-opacity motion-reduce:before:duration-(--ouro-duration-base) motion-reduce:aria-checked:before:opacity-100",
              "motion-reduce:before:bg-background motion-reduce:before:shadow-(--shadow-sm) dark:motion-reduce:before:bg-[color-mix(in_oklab,var(--foreground)_16%,var(--muted))]",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Shows one of its panes and crossfades to another; the box's height follows the shown pane. */
function Crossfade({ shown, panes }: { shown: string; panes: ReadonlyArray<{ id: string; content: ReactNode }> }): JSX.Element {
  const box = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | undefined>(undefined);
  useLayoutEffect(() => {
    const pane = box.current?.querySelector<HTMLElement>(`[data-site-pane="${shown}"]`);
    if (!pane) return;
    const measure = () => setHeight(pane.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(pane);
    return () => observer.disconnect();
  }, [shown]);
  return (
    <div ref={box} style={{ height }} className="relative overflow-hidden motion-safe:transition-[height] motion-safe:duration-(--ouro-duration-base) motion-safe:ease-(--ouro-ease-out)">
      {panes.map((pane) => {
        const on = pane.id === shown;
        return (
          <div
            key={pane.id}
            data-site-pane={pane.id}
            inert={!on}
            aria-hidden={on ? undefined : true}
            style={on ? undefined : { maxHeight: height }}
            className={cn("absolute inset-x-0 top-0 transition-[opacity,visibility] duration-(--ouro-duration-base) ease-(--ouro-ease-out)", on ? "opacity-100" : "pointer-events-none invisible overflow-hidden opacity-0")}
          >
            {pane.content}
          </div>
        );
      })}
    </div>
  );
}

/** A section of the phone's menu: its name as a heading with its own page, then its pages. Space sets it apart. */
function PhoneSection({ page, current, children }: { page: NavPage; current: string; children: ReactNode }): JSX.Element {
  const id = useId();
  return (
    <section aria-labelledby={id} className="grid gap-1" data-site-menu-group="">
      <h2 id={id} className="m-0">
        <NavLink page={page} current={current} size="lg" hint={false} />
      </h2>
      {children}
    </section>
  );
}

/**
 * The phone's menu: by platform or by part behind a switch, then Proof and Docs. `more` adds to a part or to Docs by its
 * label (the docs pages add their folded guides). It opens on the way in the page you are on belongs to.
 */
export function PhoneNav({ current, more }: { current: string; more?: Readonly<Record<string, ReactNode>> | undefined }): JSX.Element {
  const [way, setWay] = useState<"platform" | "part">(sectionOf(current) === "parts" ? "part" : "platform");
  return (
    <div className="grid gap-6">
      <PhoneSection page={{ label: "Home", path: "/" }} current={current}>
        <Links pages={[{ label: "The Nautilus", path: "/nautilus/" }]} current={current} hint={false} />
      </PhoneSection>
      <WaySwitch
        label="Find your way"
        items={[
          { value: "platform", label: "By platform" },
          { value: "part", label: "By part" },
        ]}
        value={way}
        onChange={setWay}
      />
      <Crossfade
        shown={way}
        panes={[
          { id: "platform", content: <PlatformsPanel current={current} compact /> },
          { id: "part", content: <PartsPanel current={current} compact more={more} /> },
        ]}
      />
      <PhoneSection page={NAV_PROOF} current={current}>
        <ProofPanel current={current} compact />
      </PhoneSection>
      <PhoneSection page={NAV_DOCS} current={current}>
        {more?.["Docs"] ?? <DocsPanel current={current} compact />}
      </PhoneSection>
    </div>
  );
}

/** The credit the Android robot's licence asks for, wherever the marks show (the footer). */
export const MARKS_CREDIT = claim(
  "The Android robot is reproduced or modified from work created and shared by Google and used according to terms described in the Creative Commons 3.0 Attribution License.",
  { source: { spec: "https://developer.android.com/distribute/marketing-tools/brand-guidelines" }, verify: { urlOk: "https://developer.android.com/distribute/marketing-tools/brand-guidelines" } },
);
