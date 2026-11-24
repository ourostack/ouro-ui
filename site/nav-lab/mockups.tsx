import { Fragment, useEffect, useId, useRef, useState, type JSX, type ReactNode } from "react";
import { NavigationMenu as Nav } from "@base-ui/react/navigation-menu";
import { Accordion } from "@/registry/ouro/components/ouro/accordion/accordion";
import { SegmentedControl } from "@/registry/ouro/components/ouro/segmented-control/segmented-control";
import { Sheet } from "@/registry/ouro/components/ouro/sheet/sheet";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { COMPONENT_GROUPS, DOCS, GUIDES, HOME, PARTS, PLATFORMS, PROOF, SLOTS, SLOT_NAMES, SOURCE, partOf, sectionOf, type Group, type Page, type Section } from "./ia";
import {
  Bar,
  BrandArea,
  Chevron,
  DisclosureBar,
  Eyebrow,
  HOVER_CLOSE_MS,
  HOVER_OPEN_MS,
  Here,
  LinkList,
  Masthead,
  MenuButton,
  PageLink,
  PhoneMenu,
  PlatformGrid,
  PlatformName,
  PlatformRow,
  SearchButton,
  SearchGlyph,
  SearchIconButton,
  barItem,
  hrefOf,
  iconButton,
  row,
  useFitToScreen,
  Crossfade,
  WaySwitch,
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

/** A panel's first line: the section's own page and its line, as open text, and anything for its end. */
function PanelHead({ section, here, end }: { section: Section; here: string; end?: ReactNode }): JSX.Element {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-1">
      <PageLink page={section} here={here} hint={false} size="lg" />
      <span className="pe-4 text-sm leading-5 text-muted-foreground">{section.hint}</span>
      {end && <span className="ms-auto">{end}</span>}
    </div>
  );
}

/** Groups side by side, each as wide as its longest line, so no line wraps. Stacked on a phone. */
function Columns({ groups, here, first }: { groups: readonly Group[]; here: string; first?: string }): JSX.Element {
  return (
    <>
      {groups.map((group, index) => (
        <LinkList key={group.label || index} label={group.label || (index === 0 ? first : undefined)} pages={group.pages} here={here} />
      ))}
    </>
  );
}

const side = "grid gap-x-8 gap-y-3 sm:grid-flow-col sm:auto-cols-max";

/** A part's panel: its head, its groups, and the four platforms when it has them, all in one row. */
function PartPanel({ section, here }: { section: Section; here: string }): JSX.Element {
  return (
    <div>
      <PanelHead section={section} here={here} />
      <div className={side}>
        <Columns groups={section.groups} here={here} first={section.platformSlot ? "Start here" : undefined} />
        {section.platformSlot && <PlatformRow slot={section.platformSlot} here={here} label="On every platform" />}
      </div>
    </div>
  );
}

function ProofPanel({ here }: { here: string }): JSX.Element {
  return (
    <div>
      <PanelHead section={PROOF} here={here} />
      <div className={side}>
        <Columns groups={PROOF.groups} here={here} />
      </div>
    </div>
  );
}

const FIRST_GUIDES = 3;

/** A group of guides: its first three, and the rest on request. */
function GuideList({ group, here }: { group: Group; here: string }): JSX.Element {
  const [all, setAll] = useState(() => group.pages.slice(FIRST_GUIDES).some((page) => page.path === here));
  const id = useId();
  const rest = group.pages.length - FIRST_GUIDES;
  return (
    <div className="grid content-start">
      <Eyebrow id={id}>{group.label}</Eyebrow>
      <ul id={`${id}list`} aria-labelledby={id} className="m-0 grid list-none gap-0.5 p-0">
        {(all ? group.pages : group.pages.slice(0, FIRST_GUIDES)).map((page) => (
          <li key={page.path}>
            <PageLink page={page} here={here} hint={false} />
          </li>
        ))}
      </ul>
      {rest > 0 && (
        <button
          type="button"
          aria-expanded={all}
          aria-controls={`${id}list`}
          onClick={() => setAll(!all)}
          className={cn(row, "w-full cursor-pointer border-0 bg-transparent text-start text-sm font-medium text-primary")}
        >
          {all ? "Fewer" : `${rest} more`}
          <Chevron open={all} className="size-3" />
        </button>
      )}
    </div>
  );
}

/**
 * Docs: the components by group, then the guides, each group's first three and the rest on request, and the source
 * once. `fill` spreads it across a full-width rail; `compact` stacks it for a phone and leaves off its head.
 */
function DocsPanel({ here, fill = false, compact = false }: { here: string; fill?: boolean; compact?: boolean }): JSX.Element {
  return (
    <div className="grid gap-3">
      {!compact && <PanelHead section={DOCS} here={here} end={<PageLink page={SOURCE} here={here} hint={false} size="sm" />} />}
      <ChipList label="Components, by group" pages={COMPONENT_GROUPS} here={here} />
      <div className={cn("grid gap-x-6 gap-y-3", compact ? "grid-cols-1" : fill ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4" : "grid-cols-2 lg:grid-cols-[repeat(4,max-content)]")}>
        {GUIDES.map((group) => (
          <GuideList key={group.label} group={{ ...group, label: `Guides: ${group.label}` }} here={here} />
        ))}
      </div>
      {compact && <PageLink page={SOURCE} here={here} hint={false} />}
    </div>
  );
}

/** Small squircle chips for a list of equals. Adds nothing to the panel's width: it wraps to whatever the rest needs. */
function ChipList({ label, pages, here }: { label: string; pages: readonly Page[]; here: string }): JSX.Element {
  const id = useId();
  return (
    <div className="grid content-start gap-1 [contain:inline-size]">
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

function Chip({ page, here, label }: { page: Page; here: string; label?: ReactNode }): JSX.Element {
  return (
    <a
      href={hrefOf(page.path)}
      aria-label={label ? page.label : undefined}
      aria-current={page.path === here ? "page" : undefined}
      className="inline-flex min-h-11 items-center gap-2 rounded-ouro-xl border border-solid border-border px-3.5 text-sm font-medium whitespace-nowrap text-foreground no-underline outline-ring touch-manipulation transition-colors duration-(--ouro-duration-fast) ease-[ease] focus-visible:outline-2 focus-visible:outline-solid pointer-fine:min-h-8 pointer-fine:px-3 pointer-fine:hover:bg-accent active:bg-accent aria-[current=page]:border-primary aria-[current=page]:text-primary"
    >
      {label ?? page.label}
    </a>
  );
}

/** Every part on a line: the part and its line, then its pages across. Stacked on a phone. */
function PartRows({ here, compact = false }: { here: string; compact?: boolean }): JSX.Element {
  return (
    <div className={cn("grid gap-y-1", !compact && "sm:grid-cols-[max-content_minmax(0,max-content)] sm:items-center sm:gap-x-6")}>
      {PARTS.map((part) => (
        <Fragment key={part.id}>
          <PageLink page={part} here={here} />
          <ul aria-label={`In ${part.label}`} className={cn("m-0 flex list-none flex-wrap items-center gap-0.5 p-0", compact && "ps-4 pb-2")}>
            {part.pages.map((page) => (
              <li key={page.path}>
                <PageLink page={page} here={here} hint={false} size="sm" />
              </li>
            ))}
          </ul>
        </Fragment>
      ))}
    </div>
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
            <LinkList pages={[{ label: `${section.label} overview`, path: section.path }]} here={here} hint={false} />
            {section.id === "docs" ? (
              <DocsPanel here={here} compact />
            ) : (
              <>
                <Columns groups={section.groups} here={here} />
                {section.platformSlot && <PlatformRow compact slot={section.platformSlot} here={here} label="On every platform" />}
              </>
            )}
          </div>
        ),
      }))}
    />
  );
}

/** A section of the phone's menu: its name as a heading with its own page, its line, then its pages. Space sets it apart, not a rule. */
function PhoneSection({ section, here, children }: { section: Section; here: string; children: ReactNode }): JSX.Element {
  const id = useId();
  return (
    <section aria-labelledby={id} className="grid gap-1">
      <h2 id={id} className="m-0">
        <PageLink page={section} here={here} size="lg" />
      </h2>
      {children}
    </section>
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
      <Masthead>
        <Bar>
          <BrandArea />
          <DesktopOnly>
            <div className="ms-4">
              <DisclosureBar
                section={partOf(here) ?? sectionOf(here)}
                items={sections.map((section) => ({
                  id: section.id,
                  label: section.label,
                  wide: section.id === "docs",
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
      </Masthead>
      <PhoneMenu open={menu} onOpenChange={setMenu}>
        <PhoneSections here={here} sections={[HOME, ...sections]} />
      </PhoneMenu>
    </>
  );
}

/* ---------------------------------------------------------------- B. Compass: by platform, or by part */

function PlatformsPanel({ here }: { here: string }): JSX.Element {
  return <PlatformGrid slots={SLOTS} here={here} label="Every platform, the same four doors" />;
}

function PartsPanel({ here }: { here: string }): JSX.Element {
  const id = useId();
  return (
    <section aria-labelledby={id}>
      <Eyebrow id={id}>Ouro UI, part by part</Eyebrow>
      <PartRows here={here} />
    </section>
  );
}

// One popup for every panel (Base UI's Navigation Menu): moving from one menu to the next, it resizes to the new
// panel and the content slides across in the direction you moved, rather than closing and opening again. The first
// open rises 4px and fades in, and the last close fades out, as A's panels do. With reduced motion nothing moves or
// changes size in between: the new panel's content crossfades over --ouro-duration-fast.
const positioner =
  "box-border h-(--positioner-height) w-(--positioner-width) max-w-(--available-width) " +
  "motion-safe:[transition:top_var(--ouro-duration-slow)_var(--ouro-ease-out),left_var(--ouro-duration-slow)_var(--ouro-ease-out)] data-instant:transition-none";
const popup =
  "relative box-border h-(--popup-height) w-(--popup-width) origin-(--transform-origin) rounded-ouro-3xl bg-popover text-popover-foreground ring-1 ring-border/60 shadow-(--shadow-lg) outline-none " +
  "[transition:opacity_var(--ouro-duration-fast)_var(--ouro-ease-out)] " +
  "motion-safe:[transition:opacity_var(--ouro-duration-fast)_var(--ouro-ease-out),translate_var(--ouro-duration-fast)_var(--ouro-ease-out),width_var(--ouro-duration-slow)_var(--ouro-ease-out),height_var(--ouro-duration-slow)_var(--ouro-ease-out)] " +
  "data-starting-style:opacity-0 data-ending-style:opacity-0 motion-safe:data-starting-style:-translate-y-1 data-instant:transition-none";
const content =
  "box-border w-max max-w-[calc(100vw-2rem)] max-h-[calc(var(--available-height,80vh)-4px)] overflow-y-auto overscroll-contain p-4 sm:p-5 " +
  "[transition:opacity_var(--ouro-duration-fast)_var(--ouro-ease-out)] " +
  "motion-safe:[transition:opacity_var(--ouro-duration-base)_var(--ouro-ease-out),translate_var(--ouro-duration-slow)_var(--ouro-ease-out)] " +
  "data-starting-style:opacity-0 data-ending-style:opacity-0 " +
  // The incoming panel slides in with a keyframe animation, which states where it starts: a transition from a starting
  // style began from the outgoing side for one frame in Chromium, so the panel appeared to come from the wrong way.
  "motion-safe:data-open:data-[activation-direction=left]:animate-[ouro-lab-from-left_var(--ouro-duration-slow)_var(--ouro-ease-out)] motion-safe:data-open:data-[activation-direction=right]:animate-[ouro-lab-from-right_var(--ouro-duration-slow)_var(--ouro-ease-out)] " +
  "motion-safe:data-ending-style:data-[activation-direction=left]:[translate:30%_0] motion-safe:data-ending-style:data-[activation-direction=right]:[translate:-30%_0]";

function CompassBar({ here }: { here: string }): JSX.Element {
  const [value, setValue] = useState<string | null>(null);
  const section = sectionOf(here);
  const items = [
    { id: "platforms", label: "Platforms", current: section === "platforms" || partOf(here) !== undefined, panel: <PlatformsPanel here={here} /> },
    { id: "parts", label: "Parts", current: PARTS.some((p) => p.id === section), panel: <PartsPanel here={here} /> },
    { id: "proof", label: "Proof", current: section === "proof", panel: <ProofPanel here={here} /> },
    { id: "docs", label: "Docs", current: section === "docs", panel: <DocsPanel here={here} /> },
  ];
  return (
    <Nav.Root aria-label="Main" value={value} onValueChange={(next) => setValue(next as string | null)} delay={HOVER_OPEN_MS} closeDelay={HOVER_CLOSE_MS}>
      <Nav.List className="m-0 flex list-none items-center gap-0.5 p-0">
        {items.map((item, index) => (
          <Nav.Item key={item.id} value={item.id}>
            <Nav.Trigger
              data-lab-open={index === 0 ? "" : undefined}
              aria-current={item.current ? "true" : undefined}
              className={cn(barItem, "cursor-pointer border-0 bg-transparent data-popup-open:bg-accent data-popup-open:text-foreground")}
              // Once a panel is open, the next one opens as the pointer reaches its button, as A's do.
              onPointerEnter={(event) => {
                if (event.pointerType === "mouse" && value !== null && value !== item.id) setValue(item.id);
              }}
            >
              {item.label}
              <Nav.Icon className="inline-flex motion-safe:transition-[rotate] motion-safe:duration-(--ouro-duration-fast) motion-safe:ease-(--ouro-ease-out) data-popup-open:rotate-180">
                <Chevron open={false} />
              </Nav.Icon>
            </Nav.Trigger>
            <Nav.Content
              className={content}
              onClick={(event) => {
                if ((event.target as HTMLElement).closest("a")) setValue(null);
              }}
            >
              {item.panel}
            </Nav.Content>
          </Nav.Item>
        ))}
      </Nav.List>
      <Nav.Portal>
        <Nav.Positioner sideOffset={12} align="start" collisionPadding={16} collisionAvoidance={{ side: "none" }} className={cn(positioner, "z-50")}>
          <Nav.Popup data-lab-panel="" className={popup}>
            <Nav.Viewport className="relative h-full w-full overflow-hidden rounded-[inherit]" />
          </Nav.Popup>
        </Nav.Positioner>
      </Nav.Portal>
    </Nav.Root>
  );
}

function CompassHeader({ here, search }: MockupProps): JSX.Element {
  const [menu, setMenu] = useState(false);
  const [way, setWay] = useState(sectionOf(here) === "platforms" || partOf(here) ? "platform" : "part");
  return (
    <>
      <Masthead>
        <Bar>
          <BrandArea />
          <DesktopOnly>
            <div className="ms-4">
              <CompassBar here={here} />
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
      </Masthead>
      <PhoneMenu open={menu} onOpenChange={setMenu}>
        <div className="grid gap-6">
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
              { id: "platform", content: <PlatformGrid compact slots={SLOTS} here={here} label="Every platform, the same four doors" /> },
              { id: "part", content: <PartRows here={here} compact /> },
            ]}
          />
          <PhoneSection section={PROOF} here={here}>
            <Columns groups={PROOF.groups} here={here} />
          </PhoneSection>
          <PhoneSection section={DOCS} here={here}>
            <DocsPanel here={here} compact />
          </PhoneSection>
        </div>
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
      <ul id={id} hidden={!open} className="lab-tree m-0 ms-4 grid list-none gap-px border-0 border-s border-solid border-border p-0 ps-1">
        {node.children.map((child) => (
          <Branch key={child.id} node={child} here={here} depth={depth + 1} />
        ))}
      </ul>
    </li>
  );
}

function Tree({ here }: { here: string }): JSX.Element {
  return (
    <ul className="lab-tree m-0 grid list-none gap-px p-0">
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
      <Masthead>
        <Bar>
          <BrandArea />
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
      </Masthead>
      <PhoneMenu open={menu} onOpenChange={setMenu} title="Browse" side="bottom">
        <Tree here={here} />
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
  const sections: readonly Section[] = [...PARTS, { id: "platforms", label: "Platforms", path: PLATFORMS[0]!.overview.path, hint: "", groups: [], pages: [] }, PROOF, DOCS];
  const [open, setOpen] = useState<string | null>(null);
  const current = partOf(here) ?? sectionOf(here);
  const shown = sections.find((section) => section.id === open);
  const rail = useRef<HTMLDivElement>(null);
  useFitToScreen(rail, open);
  const base = useId();
  return (
    <Masthead>
      <div className="sticky top-0 z-40 border-0 border-b border-solid border-border bg-background">
        <div className="mx-auto flex min-h-16 max-w-7xl items-center gap-3 px-4 sm:px-6 lg:px-8">
          <BrandArea />
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
                  className="inline-flex min-h-11 cursor-pointer items-center gap-1 rounded-ouro-xl border border-solid border-border bg-transparent px-3.5 text-sm font-medium whitespace-nowrap text-foreground outline-ring touch-manipulation transition-colors duration-(--ouro-duration-fast) ease-[ease] focus-visible:outline-2 focus-visible:outline-solid pointer-fine:min-h-8 pointer-fine:px-3 pointer-fine:hover:bg-accent aria-expanded:border-foreground aria-expanded:bg-foreground aria-expanded:text-background aria-[current=true]:border-primary"
                >
                  {section.label}
                  <Chevron open={open === section.id} className="size-3" />
                </button>
              </li>
            ))}
          </ul>
          <div
            ref={rail}
            id={`${base}rail`}
            data-lab-panel=""
            hidden={!shown}
            className="lab-panel overflow-y-auto overscroll-contain border-0 border-t border-solid border-border px-4 py-3 sm:px-6 lg:px-8"
            onClick={(event) => (event.target as HTMLElement).closest("a") && setOpen(null)}
            onKeyDown={(event) => event.key === "Escape" && setOpen(null)}
          >
            {shown?.id === "platforms" ? (
              <div className="grid gap-x-8 gap-y-2 lg:grid-cols-2">
                {PLATFORMS.map((p) => (
                  <div key={p.id} className="flex flex-wrap items-center gap-2">
                    <span className="w-36 shrink-0">
                      <PlatformName id={p.id} name={p.name} kit={p.kit} />
                    </span>
                    <ul aria-label={p.name} className="m-0 flex list-none flex-wrap gap-2 p-0">
                      {SLOTS.map((slot) => (
                        <li key={slot}>
                          <Chip page={{ ...p[slot], label: slot === "start" ? `Get started on ${p.name}` : p[slot].label }} here={here} label={SLOT_NAMES[slot]} />
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ) : shown?.id === "docs" ? (
              <DocsPanel here={here} fill />
            ) : shown ? (
              <ul className="m-0 flex list-none flex-wrap items-center gap-2 p-0">
                {[{ ...shown, label: `${shown.label} overview` }, ...shown.pages].map((page) => (
                  <li key={page.path}>
                    <Chip page={page} here={here} />
                  </li>
                ))}
                {shown.platformSlot && (
                  <>
                    <li aria-hidden="true" className="mx-1 h-5 w-px bg-border" />
                    {PLATFORMS.map((p) => (
                      <li key={p.id}>
                        <Chip page={p[shown.platformSlot!]} here={here} label={`For ${p.name}`} />
                      </li>
                    ))}
                  </>
                )}
              </ul>
            ) : null}
          </div>
        </nav>
      </div>
    </Masthead>
  );
}

/* ---------------------------------------------------------------- E. Chart: a slim bar and the whole map */

/** The matrix: four platforms down, the same four doors across. */
function Matrix({ here }: { here: string }): JSX.Element {
  const id = useId();
  return (
    <section aria-labelledby={id} className="grid content-start gap-2">
      <Eyebrow id={id}>Every platform, the same four doors</Eyebrow>
      <div role="table" aria-labelledby={id} className="grid grid-cols-[auto_repeat(4,4.5rem)] gap-2 text-sm">
        <div role="row" className="contents">
          <span role="columnheader" />
          {SLOTS.map((slot) => (
            <span role="columnheader" key={slot} className="px-1 text-center text-xs font-semibold whitespace-nowrap text-muted-foreground">
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
                  className="grid min-h-11 place-items-center rounded-ouro-xl bg-[color-mix(in_oklab,var(--primary)_7%,transparent)] font-medium text-primary no-underline outline-ring touch-manipulation transition-colors duration-(--ouro-duration-fast) ease-[ease] focus-visible:outline-2 focus-visible:outline-solid pointer-fine:min-h-9 pointer-fine:hover:bg-[color-mix(in_oklab,var(--primary)_16%,transparent)] aria-[current=page]:bg-primary aria-[current=page]:text-primary-foreground"
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
  const id = useId();
  return (
    <div className="grid gap-5">
      <div className="lg:hidden">
        <PageLink page={HOME} here={here} size="lg" />
      </div>
      <div className="grid gap-x-10 gap-y-5 lg:grid-cols-[max-content_minmax(0,1fr)]">
        <Matrix here={here} />
        <section aria-labelledby={id}>
          <Eyebrow id={id}>Ouro UI, part by part</Eyebrow>
          <PartRows here={here} />
        </section>
      </div>
      <ProofPanel here={here} />
      <DocsPanel here={here} fill />
    </div>
  );
}

function ChartHeader({ here, search }: MockupProps): JSX.Element {
  const [map, setMap] = useState(false);
  const section = partOf(here) ?? sectionOf(here);
  const links = [...PARTS, PROOF, DOCS];
  return (
    <>
      <Masthead>
        <Bar>
          <BrandArea />
          <DesktopOnly>
            <nav aria-label="Main" className="ms-4">
              <ul className="m-0 flex list-none items-center gap-0.5 p-0">
                {links.map((link) => (
                  <li key={link.id}>
                    <a href={hrefOf(link.path)} aria-current={link.path === here ? "page" : section === link.id ? "true" : undefined} className={barItem}>
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
      </Masthead>
      <Sheet open={map} onOpenChange={setMap} title="The map" description="Every page on Ouro UI." side="bottom" snapPoints={[0.94]} className="max-w-6xl">
        <nav
          aria-label="Map"
          data-lab-panel=""
          onClick={(event) => {
            const link = (event.target as HTMLElement).closest("a");
            if (link && !link.target) setMap(false);
          }}
        >
          <ChartMap here={here} />

        </nav>
      </Sheet>
    </>
  );
}

function MapButton({ onOpen }: { onOpen: () => void }): JSX.Element {
  return (
    <button type="button" onClick={onOpen} aria-haspopup="dialog" data-lab-open="" className={cn(iconButton, "group w-auto gap-1.5 px-3 text-[0.9375rem] font-medium")}>
      <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" className="size-5 transition-transform duration-(--ouro-duration-base) ease-(--ouro-ease-out) motion-safe:group-hover:rotate-45">
        <circle cx="10" cy="10" r="7.25" />
        <path d="m12.75 7.25-1.6 3.9-3.9 1.6 1.6-3.9 3.9-1.6Z" />
      </svg>
      Map
    </button>
  );
}

/* ---------------------------------------------------------------- the list */

export const MOCKUPS: readonly Mockup[] = [{ id: "b", name: "Compass", idea: "Two ways in, by platform or by part, in one panel that reshapes as you move.", Header: CompassHeader }];

// The other four mockups stay in this file's history (round 2), unused, for reference.
void [AtlasHeader, HullHeader, HullAside, SonarHeader, ChartHeader];
