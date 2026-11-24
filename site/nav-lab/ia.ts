// The whole public site as one map, for the nav mockups. Every list that holds siblings has the same shape for each
// sibling: every platform has the same four slots, every part a line and its own pages.

export interface Page {
  label: string;
  path: string;
  hint?: string;
}

export interface Platform {
  id: "web" | "apple" | "windows" | "android";
  name: string;
  /** The native toolkit, said once beside the name. */
  kit: string;
  /** The four slots every platform has, in this order. */
  overview: Page;
  hx: Page;
  ax: Page;
  start: Page;
}

const platform = (id: Platform["id"], name: string, kit: string, paths: [string, string, string, string]): Platform => ({
  id,
  name,
  kit,
  overview: { label: `Ouro UI for ${name}`, path: paths[0], hint: "Overview" },
  hx: { label: `Ouro HX for ${name}`, path: paths[1], hint: "Components" },
  ax: { label: `Ouro AX for ${name}`, path: paths[2], hint: "Doors for agents" },
  start: { label: "Get started", path: paths[3], hint: "Install and first screen" },
});

/** Web, Apple, Windows, Android: each with the same four pages. */
export const PLATFORMS: readonly Platform[] = [
  platform("web", "Web", "React", ["/hx/#web", "/docs/", "/docs/ax/", "/docs/installing/"]),
  platform("apple", "Apple", "SwiftUI", ["/apple/", "/apple/hx/", "/apple/ax/", "/apple/start/"]),
  platform("windows", "Windows", "WinUI", ["/windows/", "/windows/hx/", "/windows/ax/", "/windows/start/"]),
  platform("android", "Android", "Compose", ["/android/", "/android/hx/", "/android/ax/", "/android/start/"]),
];

export const SLOTS = ["overview", "hx", "ax", "start"] as const;
export type Slot = (typeof SLOTS)[number];
export const SLOT_NAMES: Record<Slot, string> = { overview: "Overview", hx: "Ouro HX", ax: "Ouro AX", start: "Get started" };

export interface Group {
  /** What the group holds, said over it; empty for a part with one group. */
  label: string;
  pages: readonly Page[];
}

export interface Section {
  id: string;
  label: string;
  path: string;
  hint: string;
  /** The pages under it in named groups, laid side by side in a panel. */
  groups: readonly Group[];
  /** Every page of `groups`, in order. */
  pages: readonly Page[];
  /** Whether the four platforms show under it, each in the same shape. */
  platformSlot?: "hx" | "ax";
}

const grouped = (groups: readonly Group[]) => ({ groups, pages: groups.flatMap((group) => group.pages) });
const one = (...pages: Page[]) => grouped([{ label: "", pages }]);

/** Ouro UI by part (AGENTS.md, Names). */
export const PARTS: readonly Section[] = [
  {
    id: "hx",
    label: "Ouro HX",
    path: "/hx/",
    hint: "Components for people's screens, on every platform",
    platformSlot: "hx",
    ...one({ label: "What each platform has", path: "/hx/#coverage", hint: "Component by component" }),
  },
  {
    id: "ax",
    label: "Ouro AX",
    path: "/ax/",
    hint: "Doors for agents: CLI, MCP, App Intents and more",
    platformSlot: "ax",
    ...one({ label: "Be the agent", path: "/ax/#be-the-agent", hint: "A morning on the other side" }, { label: "The Ouro AX claims", path: "/docs/ax-standard/", hint: "The standard, as checkable promises" }),
  },
  {
    id: "actions",
    label: "Actions",
    path: "/actions/",
    hint: "One declaration, a button and a tool, with consent",
    ...one({ label: "Consent", path: "/actions/#consent", hint: "Read, write, confirm first, person only" }),
  },
  {
    id: "composed",
    label: "Composed UI",
    path: "/composed-ui/",
    hint: "Cards your agent sends, drawn natively",
    ...one({ label: "MCP Apps and A2UI", path: "/composed-ui/#formats", hint: "The formats it speaks" }),
  },
  {
    id: "xray",
    label: "X-ray",
    path: "/xray/",
    hint: "See inside screens and doors",
    ...grouped([
      {
        label: "See inside",
        pages: [
          { label: "HX X-ray", path: "/xray/#hx", hint: "Names every component on a screen" },
          { label: "AX X-ray", path: "/xray/#ax", hint: "Calls every door like an agent" },
        ],
      },
      {
        label: "Check",
        pages: [
          { label: "Ouro check", path: "/xray/#check", hint: "Every page, every size, light and dark" },
          { label: "Ouro Feel", path: "/apple/feel/", hint: "How an app feels in use" },
        ],
      },
      {
        label: "Drive",
        pages: [
          { label: "Ouro Reins", path: "/apple/reins/", hint: "Drive your screens as state" },
          { label: "Hackamore", path: "/hackamore/", hint: "Reins for any Mac app" },
        ],
      },
    ]),
  },
];

export const PROOF: Section = {
  id: "proof",
  label: "Proof",
  path: "/proof/",
  hint: "The benchmark, model reviews, adoption, Ouro UI at a company",
  ...grouped([
    {
      label: "Tested",
      pages: [
        { label: "The benchmark", path: "/proof/#benchmark", hint: "Agents building with and without it" },
        { label: "The Errand", path: "/proof/#errand", hint: "One job, every way in" },
        { label: "Model reviews", path: "/proof/#reviews", hint: "What frontier models said" },
      ],
    },
    {
      label: "In use",
      pages: [
        { label: "Adoption", path: "/adoption/", hint: "Every product on it, checked hourly" },
        { label: "Ouro Current", path: "/current/", hint: "Each release arrives as one pull request" },
        { label: "At a company", path: "/docs/company/", hint: "Your own registry, your own pace" },
      ],
    },
    { label: "Thanks", pages: [{ label: "What we borrowed", path: "/proof/#borrowed", hint: "The projects we learned from" }] },
  ]),
};

export interface GuideGroup {
  label: string;
  pages: readonly Page[];
}

const g = (name: string, label: string): Page => ({ label, path: `/docs/${name}/` });

/** Every guide, in groups a reader would look in. */
export const GUIDES: readonly GuideGroup[] = [
  {
    label: "Start",
    pages: [g("installing", "Installing"), g("agent-quickstart", "Agent quickstart"), g("switching-from-shadcn", "Switching from shadcn"), g("updating", "Updating components"), g("theming", "Theming"), g("beside-an-incumbent", "Beside your design system")],
  },
  {
    label: "Build",
    pages: [g("forms", "Forms"), g("density", "Density"), g("patterns", "Page patterns"), g("design-craft", "Design craft"), g("composed-ui", "Composed UI guide"), g("testing", "Testing"), g("static-css", "Static CSS"), g("part-names", "Part names"), g("host-proxy", "Proxying a dev build"), g("status-dashboards", "Status dashboards"), g("porthole-snapshot", "The Porthole snapshot")],
  },
  {
    label: "Agents",
    pages: [g("ax", "Ouro AX guide"), g("ax-standard", "The Ouro AX claims"), g("ax-conformance", "The Ouro AX X-ray"), g("ax-eval", "The Ouro AX evaluation"), g("ax-adopt", "Make your CLI conformant"), g("ax-standalone", "Add Ouro AX to an app"), g("native-apps", "Beside React Native or Flutter"), g("agent-harness", "What a harness owes its model"), g("agent-interfaces", "Agent interfaces vs the screen")],
  },
  {
    label: "Quality",
    pages: [g("accessibility-evidence", "Accessibility evidence"), g("guardrails", "Guardrails"), g("conformance", "The conformance matrix"), g("native-conformance", "Shared cases across kits"), g("screen-reader-lane", "The screen-reader lane"), g("claims", "Claims"), g("real-use-counts", "Counts from real use")],
  },
  {
    label: "Teams",
    pages: [g("company", "Ouro UI at a company"), g("review-volume", "Make review worth the time"), g("ci-speed", "CI speed and the merge queue"), g("upkeep", "What the native kits cost")],
  },
  {
    label: "Comparisons",
    pages: [g("why-no-skill", "Why Ouro HX needs no skill"), g("agent-native", "Beside Agent-Native"), g("why-no-skill-app-shell", "Results: app shell"), g("why-no-skill-command-palette", "Results: command palette"), g("why-no-skill-confirm-delete", "Results: confirm delete"), g("why-no-skill-recipe-list", "Results: recipe list"), g("why-no-skill-settings-form", "Results: settings form")],
  },
  { label: "Demos", pages: [g("chat-demo", "A chat app"), g("call-demo", "A call window")] },
];

/** The component catalog's groups (scripts/catalog-groups.mts), each a place on the components page. */
export const COMPONENT_GROUPS: readonly Page[] = ["Actions", "Text", "Forms", "Overlays", "Menus", "Feedback", "Display", "Lists", "Layout", "Navigation", "Data", "Chat", "App setup"].map((label) => ({
  label,
  path: `/docs/#${label.toLowerCase().replace(/ /g, "-")}`,
}));

export const DOCS: Section = {
  id: "docs",
  label: "Docs",
  path: "/docs/",
  hint: "Every component for the web, and the guides",
  ...one({ label: "Components", path: "/docs/", hint: "Every Ouro HX for web component" }, ...GUIDES[0]!.pages.slice(0, 4)),
};

export const HOME: Section = { id: "home", label: "Home", path: "/", hint: "Peek through the porthole", ...one({ label: "The Nautilus", path: "/nautilus/", hint: "A story told in components" }) };

/**
 * A line for each of the family's sites, for the family switcher: each cut from that site's own meta description.
 * family.json has no such field yet; a switcher needs one added there, for every site.
 */
export const FAMILY_LINES: Record<string, string> = {
  ouro: "Ari's workshop of tools for working with agents",
  "ouro-ui": "For every interface you build",
  "ouro-md": "A Mac Markdown editor for your agent's plans",
  desk: "Your agent's work, in a Git repository you own",
  apps: "Download Ouro MD, Desk and the rest",
  ari: "Who builds all this",
  github: "Every Ouro repository",
};

/** The repository: in the Docs section, once. The family strip's GitHub is the organisation. */
export const SOURCE: Page = { label: "Source code", path: "https://github.com/ourostack/ouro-ui", hint: "The blueprints, on GitHub" };

/** Every page the mockups know, for search and for the page you land on. */
export function allPages(): Page[] {
  const pages: Page[] = [HOME, ...HOME.pages];
  for (const part of PARTS) pages.push(part, ...part.pages);
  for (const p of PLATFORMS) pages.push(p.overview, p.hx, p.ax, { ...p.start, label: `Get started on ${p.name}` });
  pages.push(PROOF, ...PROOF.pages, DOCS, ...COMPONENT_GROUPS.map((c) => ({ ...c, label: `${c.label} components` })));
  for (const group of GUIDES) pages.push(...group.pages);
  const seen = new Set<string>();
  return pages.filter((page) => {
    const key = page.label + page.path;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** The name of the page at a path, for the stub page. */
export function pageAt(path: string): Page {
  const all = allPages();
  return all.find((page) => page.path === path) ?? all.find((page) => page.path.split("#")[0] === path.split("#")[0]) ?? { label: "Not on the map", path };
}

/** The section a path belongs to, for the bar's "you are in" mark. */
export function sectionOf(path: string): string | undefined {
  const base = path.split("#")[0]!;
  if (path === "/" || base === "/nautilus/") return "home";
  if (base === "/apple/feel/" || base === "/apple/reins/" || base === "/hackamore/") return "xray";
  if (base.startsWith("/apple/") || base.startsWith("/windows/") || base.startsWith("/android/") || path === "/hx/#web") return "platforms";
  for (const part of PARTS) if (base === part.path) return part.id;
  if (base === "/proof/" || base === "/adoption/" || base === "/current/" || base === "/docs/company/") return "proof";
  if (base.startsWith("/docs/")) return "docs";
  return undefined;
}

/** The part a platform's page belongs to: Ouro HX for Apple is Ouro HX's. */
export function partOf(path: string): "hx" | "ax" | undefined {
  if (PLATFORMS.some((p) => p.hx.path === path && p.ax.path !== path)) return "hx";
  if (PLATFORMS.some((p) => p.ax.path === path && p.hx.path !== path)) return "ax";
  return undefined;
}

export const DESCRIPTIONS: Record<string, string> = {
  "/": "About to build any kind of interface at all? Pick Ouro UI and never think about it again.",
  "/hx/": "Components for people's screens, in React, SwiftUI, WinUI and Compose.",
  "/ax/": "Ouro AX is for the tools agents use: a command line, an HTTP API, an MCP server.",
  "/actions/": "Write an action once. People press it, agents call it, and paying, sending and deleting wait for the person's yes.",
  "/composed-ui/": "Your agent sends a card as data. Ouro checks it against your app's list, then draws it natively.",
  "/xray/": "See inside. HX X-ray outlines and names the components on a screen. AX X-ray calls the doors the way an agent would.",
  "/proof/": "The benchmark, what frontier models said, every product on the adoption board, and how to run Ouro UI at a company.",
  "/docs/": "Every Ouro HX component, with install commands, props and live demos.",
  "/apple/": "Ouro HX and Ouro AX in Swift: the springs, haptics and colours people feel, and the App Intents Siri reads.",
  "/windows/": "Ouro HX in WinUI, and App Actions and MCP for agents.",
  "/android/": "Ouro HX in Jetpack Compose, and AppFunctions for agents.",
};
