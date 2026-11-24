import { useEffect, useId, useState, type JSX, type ReactNode } from "react";
import { Accordion } from "@/registry/ouro/components/ouro/accordion/accordion";
import { SegmentedControl } from "@/registry/ouro/components/ouro/segmented-control/segmented-control";
import { Sheet } from "@/registry/ouro/components/ouro/sheet/sheet";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { COMPONENT_GROUPS, DOCS, GUIDES, HOME, PARTS, PLATFORMS, PROOF, SLOTS, SLOT_NAMES, SOURCE, partOf, sectionOf, type Page, type Section } from "./ia";
import {
  Bar,
  Brand,
  Chevron,
  DisclosureBar,
  Eyebrow,
  FamilyFoot,
  FamilyStrip,
  Here,
  LinkList,
  MenuButton,
  PageLink,
  PhoneMenu,
  PlatformGrid,
  PlatformName,
  SearchButton,
  SearchGlyph,
  SearchIconButton,
  hrefOf,
  iconButton,
  row,
} from "./shared";

export interface MockupProps {
  here: string;
  search: () => void;
}

export interface Mockup {
  id: string;
  name: string;
  idea: string;
  Header: (props: MockupProps) => JSX.Element;
  /** A column beside the page, for the mockups that keep their map in view. */
  Aside?: (props: MockupProps) => JSX.Element;
}

/* ---------------------------------------------------------------- panels the mockups share */

/** A part's panel: the part itself with its line, its own pages, and the four platforms when it has them. */
function PartPanel({ section, here }: { section: Section; here: string }): JSX.Element {
  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
      <div className="grid content-start gap-1">
        <PageLink page={section} here={here} size="lg" />
        {section.pages.length > 0 && <LinkList pages={section.pages} here={here} />}
      </div>
      {section.platformSlot ? (
        <PlatformGrid slots={[section.platformSlot]} here={here} label={`${section.label} on every platform`} />
      ) : (
        <Doodle section={section} />
      )}
    </div>
  );
}

/** Where a part has no platforms of its own, a line of play instead of an empty half. */
function Doodle({ section }: { section: Section }): JSX.Element {
  const lines: Record<string, string> = {
    actions: "One action. A person presses it, an agent calls it, and paying waits for a yes.",
    composed: "Your agent sends a card as data. Every kit draws it in its own hand.",
    xray: "Hold the page up to the light and see every component and door inside.",
  };
  return (
    <p className="m-0 self-center rounded-ouro-2xl bg-[color-mix(in_oklab,var(--primary)_6%,transparent)] p-5 font-[family-name:var(--font-heading,inherit)] text-lg leading-7 text-foreground">
      {lines[section.id] ?? section.hint}
    </p>
  );
}

function ProofPanel({ here }: { here: string }): JSX.Element {
  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
      <PageLink page={PROOF} here={here} size="lg" />
      <LinkList pages={PROOF.pages} here={here} columns={2} />
    </div>
  );
}

/** Docs: the components by group, then every guide by group, and the source, once. */
function DocsPanel({ here, compact = false }: { here: string; compact?: boolean }): JSX.Element {
  return (
    <div className="grid gap-5">
      <div className="grid gap-4 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
        <div className="grid content-start gap-1">
          <PageLink page={DOCS} here={here} size="lg" />
          <PageLink page={SOURCE} here={here} />
        </div>
        <ChipList label="Components, by group" pages={COMPONENT_GROUPS} here={here} />
      </div>
      <div className={cn("grid gap-x-2 gap-y-4", compact ? "grid-cols-1" : "sm:grid-cols-2 lg:grid-cols-4")}>
        {GUIDES.slice(0, 3).map((group) => (
          <LinkList key={group.label} label={`Guides: ${group.label}`} pages={group.pages} here={here} hint={false} />
        ))}
        <div className="grid content-start gap-4">
          {GUIDES.slice(3).map((group) => (
            <LinkList key={group.label} label={group.label} pages={group.pages} here={here} hint={false} />
          ))}
        </div>
      </div>
    </div>
  );
}

/** Small squircle chips: for lists of equals that need no line each. */
function ChipList({ label, pages, here }: { label: string; pages: readonly Page[]; here: string }): JSX.Element {
  const id = useId();
  return (
    <div className="grid content-start gap-1">
      <Eyebrow id={id}>{label}</Eyebrow>
      <ul aria-labelledby={id} className="m-0 flex list-none flex-wrap gap-2 p-0 px-2">
        {pages.map((page) => (
          <li key={page.path}>
            <Chip page={page} here={here} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function Chip({ page, here, label }: { page: Page; here: string; label?: string }): JSX.Element {
  return (
    <a
      href={hrefOf(page.path)}
      aria-current={page.path === here ? "page" : undefined}
      className="inline-flex min-h-11 items-center rounded-ouro-xl border border-solid border-border px-3.5 text-sm font-medium whitespace-nowrap text-foreground no-underline outline-ring touch-manipulation transition-colors duration-(--ouro-duration-fast) ease-[ease] focus-visible:outline-2 focus-visible:outline-solid pointer-fine:hover:bg-accent active:bg-accent aria-[current=page]:border-primary aria-[current=page]:text-primary sm:min-h-9 pointer-coarse:min-h-11"
    >
      {label ?? page.label}
    </a>
  );
}

/** The site's own sections, as a phone's menu folds them: each a heading you open. */
function PhoneSections({ here, sections }: { here: string; sections: readonly Section[] }): JSX.Element {
  const open = sections.find((section) => sectionOf(here) === section.id || partOf(here) === section.id)?.id;
  return (
    <Accordion
      headingLevel={2}
      defaultValue={open ?? null}
      items={sections.map((section) => ({
        value: section.id,
        title: <span className="font-[family-name:var(--font-heading,inherit)] text-lg leading-6 font-semibold">{section.label}</span>,
        content: (
          <div className="grid gap-3 pb-2">
            <p className="m-0 px-3 text-sm leading-5 text-muted-foreground">{section.hint}</p>
            <LinkList pages={[{ label: `${section.label} overview`, path: section.path }, ...section.pages]} here={here} hint={false} />
            {section.platformSlot && <PlatformGrid compact slots={[section.platformSlot]} here={here} label="On every platform" />}
            {section.id === "docs" && <DocsPanel here={here} compact />}
          </div>
        ),
      }))}
    />
  );
}

function DesktopOnly({ children }: { children: ReactNode }): JSX.Element {
  return <div className="flex flex-1 items-center gap-2 max-lg:hidden">{children}</div>;
}
function PhoneOnly({ children }: { children: ReactNode }): JSX.Element {
  return <div className="ms-auto flex items-center gap-1 lg:hidden">{children}</div>;
}

/* ---------------------------------------------------------------- A. Atlas: a mega menu by part */

function AtlasHeader({ here, search }: MockupProps): JSX.Element {
  const [menu, setMenu] = useState(false);
  const sections = [...PARTS, PROOF, DOCS];
  return (
    <>
      <FamilyStrip />
      <Bar>
        <Brand />
        <DesktopOnly>
          <div className="ms-4">
            <DisclosureBar
              section={partOf(here) ?? sectionOf(here)}
              items={sections.map((section) => ({
                id: section.id,
                label: section.label,
                panel: section.id === "proof" ? <ProofPanel here={here} /> : section.id === "docs" ? <DocsPanel here={here} /> : <PartPanel section={section} here={here} />,
              }))}
            />
          </div>
          <div className="ms-auto">
            <SearchButton onOpen={search} />
          </div>
        </DesktopOnly>
        <PhoneOnly>
          <SearchIconButton onOpen={search} />
          <MenuButton onOpen={() => setMenu(true)} />
        </PhoneOnly>
      </Bar>
      <PhoneMenu open={menu} onOpenChange={setMenu}>
        <PhoneSections here={here} sections={[HOME, ...sections]} />
        <FamilyFoot />
      </PhoneMenu>
    </>
  );
}

/* ---------------------------------------------------------------- B. Compass: by platform, or by part */

function PlatformsPanel({ here }: { here: string }): JSX.Element {
  return <PlatformGrid slots={SLOTS} here={here} label="Every platform, the same four doors" />;
}

function PartsPanel({ here, compact = false }: { here: string; compact?: boolean }): JSX.Element {
  return (
    <div className={cn("grid gap-x-2 gap-y-4", compact ? "grid-cols-1" : "sm:grid-cols-2 lg:grid-cols-5")}>
      {PARTS.map((part) => (
        <div key={part.id} className="grid content-start gap-0.5">
          <PageLink page={part} here={here} />
          <ul className="m-0 grid list-none gap-0.5 p-0 ps-3">
            {part.pages.map((page) => (
              <li key={page.path}>
                <PageLink page={page} here={here} hint={false} size="sm" />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function CompassHeader({ here, search }: MockupProps): JSX.Element {
  const [menu, setMenu] = useState(false);
  const [way, setWay] = useState(sectionOf(here) === "platforms" || partOf(here) ? "platform" : "part");
  const section = sectionOf(here);
  return (
    <>
      <FamilyStrip />
      <Bar>
        <Brand />
        <DesktopOnly>
          <div className="ms-4">
            <DisclosureBar
              section={section === "platforms" ? "platforms" : PARTS.some((p) => p.id === section) ? "parts" : section}
              items={[
                { id: "platforms", label: "Platforms", panel: <PlatformsPanel here={here} /> },
                { id: "parts", label: "Parts", panel: <PartsPanel here={here} /> },
                { id: "proof", label: "Proof", panel: <ProofPanel here={here} /> },
                { id: "docs", label: "Docs", panel: <DocsPanel here={here} /> },
              ]}
            />
          </div>
          <div className="ms-auto">
            <SearchButton onOpen={search} />
          </div>
        </DesktopOnly>
        <PhoneOnly>
          <SearchIconButton onOpen={search} />
          <MenuButton onOpen={() => setMenu(true)} />
        </PhoneOnly>
      </Bar>
      <PhoneMenu open={menu} onOpenChange={setMenu}>
        <div className="grid gap-4">
          <SegmentedControl
            label="Find your way"
            fullWidth
            items={[
              { value: "platform", label: "By platform" },
              { value: "part", label: "By part" },
            ]}
            value={way}
            onValueChange={setWay}
          />
          {way === "platform" ? <PlatformGrid compact slots={SLOTS} here={here} label="Every platform, the same four doors" /> : <PartsPanel here={here} compact />}
          <PhoneSections here={here} sections={[PROOF, DOCS]} />
        </div>
        <FamilyFoot />
      </PhoneMenu>
    </>
  );
}

/* ---------------------------------------------------------------- C. Hull: the whole site as a tree beside the page */

interface TreeNode {
  id: string;
  label: ReactNode;
  page?: Page;
  children?: readonly TreeNode[];
}

function tree(): TreeNode[] {
  const leaf = (page: Page, label?: string): TreeNode => ({ id: page.label + page.path, label: label ?? page.label, page });
  return [
    leaf(HOME),
    leaf(HOME.pages[0]!),
    ...PARTS.map((part) => ({
      id: part.id,
      label: part.label,
      children: [
        leaf(part, "Overview"),
        ...part.pages.map((p) => leaf(p)),
        ...(part.platformSlot ? PLATFORMS.map((p) => leaf(p[part.platformSlot!], `For ${p.name}`)) : []),
      ],
    })),
    {
      id: "platforms",
      label: "Platforms",
      children: PLATFORMS.map((p) => ({
        id: p.id,
        label: <PlatformName id={p.id} name={p.name} kit={p.kit} />,
        children: SLOTS.map((slot) => leaf(p[slot], SLOT_NAMES[slot])),
      })),
    },
    { id: "proof", label: "Proof", children: [leaf(PROOF, "Overview"), ...PROOF.pages.map((p) => leaf(p))] },
    {
      id: "docs",
      label: "Docs",
      children: [
        leaf(DOCS, "Components"),
        { id: "components", label: "Components by group", children: COMPONENT_GROUPS.map((p) => leaf(p)) },
        ...GUIDES.map((group) => ({ id: `guides-${group.label}`, label: `Guides: ${group.label}`, children: group.pages.map((p) => leaf(p)) })),
        leaf(SOURCE),
      ],
    },
  ];
}

const contains = (node: TreeNode, here: string): boolean => node.page?.path === here || (node.children ?? []).some((child) => contains(child, here));

function Branch({ node, here, depth }: { node: TreeNode; here: string; depth: number }): JSX.Element {
  const [open, setOpen] = useState(() => contains(node, here));
  const id = useId();
  useEffect(() => {
    if (contains(node, here)) setOpen(true);
  }, [here, node]);
  if (!node.children) {
    const current = node.page!.path === here;
    return (
      <li>
        <a
          href={hrefOf(node.page!.path)}
          aria-current={current ? "page" : undefined}
          {...(node.page!.path.startsWith("http") ? { target: "_blank", rel: "noreferrer" } : {})}
          className={cn(row, "min-h-9 py-1 text-sm text-muted-foreground aria-[current=page]:bg-[color-mix(in_oklab,var(--primary)_10%,transparent)] aria-[current=page]:font-semibold aria-[current=page]:text-foreground pointer-coarse:min-h-11", depth === 0 && "text-[0.9375rem] font-medium text-foreground")}
        >
          {node.label}
          {node.page!.path.startsWith("http") && <span aria-hidden="true">↗</span>}
          {current && <Here />}
        </a>
      </li>
    );
  }
  return (
    <li>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
        className={cn(row, "min-h-9 w-full cursor-pointer border-0 bg-transparent py-1 text-start text-sm font-medium text-foreground pointer-coarse:min-h-11", depth === 0 && "text-[0.9375rem]")}
      >
        <Chevron open={open} className="-ms-1 shrink-0 text-muted-foreground [&:not(.rotate-180)]:-rotate-90" />
        {node.label}
      </button>
      <ul id={id} hidden={!open} className="m-0 ms-4 grid list-none gap-px border-0 border-s border-solid border-border p-0 ps-1">
        {node.children.map((child) => (
          <Branch key={child.id} node={child} here={here} depth={depth + 1} />
        ))}
      </ul>
    </li>
  );
}

function Tree({ here }: { here: string }): JSX.Element {
  return (
    <ul className="m-0 grid list-none gap-px p-0">
      {tree().map((node) => (
        <Branch key={node.id} node={node} here={here} depth={0} />
      ))}
    </ul>
  );
}

function HullHeader({ here, search }: MockupProps): JSX.Element {
  const [menu, setMenu] = useState(false);
  return (
    <>
      <FamilyStrip />
      <Bar>
        <Brand />
        <DesktopOnly>
          <div className="flex flex-1 justify-center">
            <SearchButton onOpen={search} wide />
          </div>
        </DesktopOnly>
        <PhoneOnly>
          <SearchIconButton onOpen={search} />
          <MenuButton onOpen={() => setMenu(true)} label="Browse" />
        </PhoneOnly>
      </Bar>
      <PhoneMenu open={menu} onOpenChange={setMenu} title="Browse" side="bottom">
        <Tree here={here} />
        <FamilyFoot />
      </PhoneMenu>
    </>
  );
}

function HullAside({ here }: MockupProps): JSX.Element {
  return (
    <nav aria-label="Site" className="sticky top-16 max-h-[calc(100dvh-4rem)] w-64 shrink-0 overflow-y-auto py-6 pe-2 max-lg:hidden">
      <Tree here={here} />
    </nav>
  );
}

/* ---------------------------------------------------------------- D. Sonar: search first, sections as a rail */

function SonarHeader({ here, search }: MockupProps): JSX.Element {
  const sections: readonly Section[] = [...PARTS, { id: "platforms", label: "Platforms", path: PLATFORMS[0]!.overview.path, hint: "", pages: [] }, PROOF, DOCS];
  const [open, setOpen] = useState<string | null>(null);
  const current = partOf(here) ?? sectionOf(here);
  const shown = sections.find((section) => section.id === open);
  const base = useId();
  return (
    <>
      <FamilyStrip />
      <div className="sticky top-0 z-40 border-0 border-b border-solid border-border bg-background">
        <div className="mx-auto flex min-h-16 max-w-7xl items-center gap-3 px-4 sm:px-6 lg:px-8">
          <Brand />
          <button
            type="button"
            onClick={search}
            aria-haspopup="dialog"
            className="flex min-h-11 flex-1 cursor-pointer items-center gap-2 rounded-ouro-2xl border border-solid border-input bg-[color-mix(in_oklab,var(--muted)_60%,var(--background))] px-4 text-start text-[0.9375rem] text-muted-foreground outline-ring touch-manipulation transition-colors duration-(--ouro-duration-fast) ease-[ease] focus-visible:outline-2 focus-visible:outline-solid pointer-fine:hover:border-ring sm:max-w-xl lg:mx-auto"
          >
            <SearchGlyph className="size-4 shrink-0" />
            <span className="flex-1 truncate">
              <span className="max-sm:hidden">Search components, guides and pages</span>
              <span className="sm:hidden">Search</span>
            </span>
            <kbd className="rounded-ouro-sm border border-solid border-border px-1.5 font-mono text-xs max-sm:hidden">⌘K</kbd>
          </button>
        </div>
        <nav aria-label="Sections" className="mx-auto max-w-7xl">
          <ul className="m-0 flex list-none gap-2 overflow-x-auto px-4 pb-2.5 [scrollbar-width:none] sm:px-6 lg:px-8">
            <li>
              <Chip page={HOME} here={here} />
            </li>
            {sections.map((section, index) => (
              <li key={section.id}>
                <button
                  type="button"
                  data-lab-open={index === 0 ? "" : undefined}
                  aria-expanded={open === section.id}
                  aria-controls={`${base}rail`}
                  aria-current={current === section.id ? "true" : undefined}
                  onClick={() => setOpen(open === section.id ? null : section.id)}
                  className="inline-flex min-h-11 cursor-pointer items-center gap-1 rounded-ouro-xl border border-solid border-border bg-transparent px-3.5 text-sm font-medium whitespace-nowrap text-foreground outline-ring touch-manipulation transition-colors duration-(--ouro-duration-fast) ease-[ease] focus-visible:outline-2 focus-visible:outline-solid pointer-fine:hover:bg-accent aria-expanded:border-foreground aria-expanded:bg-foreground aria-expanded:text-background aria-[current=true]:border-primary sm:min-h-9 pointer-coarse:min-h-11"
                >
                  {section.label}
                  <Chevron open={open === section.id} className="size-3" />
                </button>
              </li>
            ))}
          </ul>
          <div id={`${base}rail`} hidden={!shown} className="lab-panel border-0 border-t border-solid border-border px-4 py-3 sm:px-6 lg:px-8" onClick={(event) => (event.target as HTMLElement).closest("a") && setOpen(null)} onKeyDown={(event) => event.key === "Escape" && setOpen(null)}>
            {shown?.id === "platforms" ? (
              <PlatformGrid slots={SLOTS} here={here} label="Every platform, the same four doors" />
            ) : shown?.id === "docs" ? (
              <DocsPanel here={here} />
            ) : shown ? (
              <div className="grid gap-3">
                <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
                  {[{ ...shown, label: `${shown.label} overview` }, ...shown.pages].map((page) => (
                    <li key={page.path}>
                      <Chip page={page} here={here} />
                    </li>
                  ))}
                </ul>
                {shown.platformSlot && (
                  <ul className="m-0 flex list-none flex-wrap gap-2 p-0" aria-label={`${shown.label} on every platform`}>
                    {PLATFORMS.map((p) => (
                      <li key={p.id}>
                        <Chip page={p[shown.platformSlot!]} here={here} label={`For ${p.name}`} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}
          </div>
        </nav>
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- E. Chart: a slim bar and the whole map */

/** The matrix: four platforms down, the same four doors across. */
function Matrix({ here }: { here: string }): JSX.Element {
  const id = useId();
  return (
    <section aria-labelledby={id} className="grid gap-2">
      <Eyebrow id={id}>Every platform, the same four doors</Eyebrow>
      <div role="table" aria-labelledby={id} className="grid grid-cols-[auto_repeat(4,minmax(0,1fr))] gap-2 text-sm">
        <div role="row" className="contents">
          <span role="columnheader" />
          {SLOTS.map((slot) => (
            <span role="columnheader" key={slot} className="px-1 pb-1 text-center text-xs font-semibold text-muted-foreground">
              {SLOT_NAMES[slot].replace("Get started", "Start")}
            </span>
          ))}
        </div>
        {PLATFORMS.map((p) => (
          <div role="row" key={p.id} className="contents">
            <span role="rowheader" className="flex items-center pe-2">
              <PlatformName id={p.id} name={p.name} kit={p.kit} className="[&>span:last-child]:max-sm:hidden" />
            </span>
            {SLOTS.map((slot) => (
              <span role="cell" key={slot} className="grid">
                <a
                  href={hrefOf(p[slot].path)}
                  aria-current={p[slot].path === here ? "page" : undefined}
                  aria-label={slot === "start" ? `Get started on ${p.name}` : p[slot].label}
                  className="grid min-h-11 place-items-center rounded-ouro-xl bg-[color-mix(in_oklab,var(--primary)_7%,transparent)] font-medium text-primary no-underline outline-ring touch-manipulation transition-colors duration-(--ouro-duration-fast) ease-[ease] focus-visible:outline-2 focus-visible:outline-solid pointer-fine:hover:bg-[color-mix(in_oklab,var(--primary)_16%,transparent)] aria-[current=page]:bg-primary aria-[current=page]:text-primary-foreground"
                >
                  <span aria-hidden="true">{{ overview: "◎", hx: "HX", ax: "AX", start: "→" }[slot]}</span>
                </a>
              </span>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

function ChartMap({ here }: { here: string }): JSX.Element {
  return (
    <div className="grid gap-6">
      <div className="max-w-xl">
        <Matrix here={here} />
      </div>
      <PartsPanel here={here} />
      <ProofPanel here={here} />
      <DocsPanel here={here} />
    </div>
  );
}

function ChartHeader({ here, search }: MockupProps): JSX.Element {
  const [map, setMap] = useState(false);
  const section = sectionOf(here);
  const links = [...PARTS, PROOF, DOCS];
  return (
    <>
      <FamilyStrip />
      <Bar>
        <Brand />
        <DesktopOnly>
          <nav aria-label="Main" className="ms-4">
            <ul className="m-0 flex list-none items-center gap-0.5 p-0">
              {links.map((link) => (
                <li key={link.id}>
                  <a
                    href={hrefOf(link.path)}
                    aria-current={link.path === here ? "page" : section === link.id ? "true" : undefined}
                    className="relative inline-flex min-h-11 items-center rounded-ouro-lg px-3 text-[0.9375rem] font-medium text-muted-foreground no-underline outline-ring transition-colors duration-(--ouro-duration-fast) ease-[ease] focus-visible:outline-2 focus-visible:outline-solid pointer-fine:hover:bg-accent pointer-fine:hover:text-foreground aria-[current]:text-foreground after:absolute after:inset-x-3 after:bottom-1.5 after:h-0.5 after:rounded-full after:bg-primary after:opacity-0 aria-[current]:after:opacity-100"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <div className="ms-auto flex items-center gap-2">
            <SearchButton onOpen={search} />
          </div>
        </DesktopOnly>
        <PhoneOnly>
          <SearchIconButton onOpen={search} />
        </PhoneOnly>
        <MapButton onOpen={() => setMap(true)} />
      </Bar>
      <Sheet open={map} onOpenChange={setMap} title="The map" description="Every page on Ouro UI." side="bottom" snapPoints={[0.94]} className="max-w-6xl">
        <nav
          aria-label="Map"
          onClick={(event) => {
            const link = (event.target as HTMLElement).closest("a");
            if (link && !link.target) setMap(false);
          }}
        >
          <div className="lg:hidden">
            <PageLink page={HOME} here={here} size="lg" />
          </div>
          <ChartMap here={here} />
          <FamilyFoot />
        </nav>
      </Sheet>
    </>
  );
}

function MapButton({ onOpen }: { onOpen: () => void }): JSX.Element {
  return (
    <button type="button" onClick={onOpen} aria-haspopup="dialog" data-lab-open="" className={cn(iconButton, "group w-auto gap-1.5 px-3 text-[0.9375rem] font-medium max-lg:ms-0")}>
      <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" className="size-5 transition-transform duration-(--ouro-duration-normal,200ms) ease-(--ouro-ease-out) motion-safe:group-hover:rotate-45">
        <circle cx="10" cy="10" r="7.25" />
        <path d="m12.75 7.25-1.6 3.9-3.9 1.6 1.6-3.9 3.9-1.6Z" />
      </svg>
      Map
    </button>
  );
}

/* ---------------------------------------------------------------- the list */

export const MOCKUPS: readonly Mockup[] = [
  { id: "a", name: "Atlas", idea: "Every part opens a panel; Ouro HX and Ouro AX each show the four platforms in one row.", Header: AtlasHeader },
  { id: "b", name: "Compass", idea: "Two ways in: by platform (four identical columns) or by part, then Proof and Docs.", Header: CompassHeader },
  { id: "c", name: "Hull", idea: "The whole site as a tree beside every page, with a search bar in the middle of the header.", Header: HullHeader, Aside: HullAside },
  { id: "d", name: "Sonar", idea: "Search first, with every section as a chip; a chip opens its pages in a row under it.", Header: SonarHeader },
  { id: "e", name: "Chart", idea: "A slim bar of plain links, and a Map that unrolls every page, with platforms as a grid.", Header: ChartHeader },
];
