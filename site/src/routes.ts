import { claim } from "@/registry/ouro/lib/ouro/claims";
import { docsItems } from "./docs/items";
import pageIndex from "./docs/page-index.json";
import { VOYAGE_HERO } from "./copy";
import { latestRelease } from "./latest-release";
import { normalizePath } from "./paths";

export { href, pathFromLocation } from "./paths";

/** Every page the site builds. Paths are relative to the base (`/`) and end in `/`. */
export interface Route {
  path: string;
  title: string;
  description: string;
  /** A page that search engines must not index. */
  noindex?: boolean;
}

/**
 * Addresses agents guess, sent on to the page they meant. Each docs page also answers at its export's own name
 * (`/docs/A2UISurface/` for `/docs/a2ui-surface/`), except where the two differ only in letter case, which a
 * case-insensitive file system would write over. The aliases are the names agents tried in the model reviews.
 */
export const guessedAddresses: Array<{ from: string; to: string; note?: string }> = [
  ...[...docsItems.map(({ name, title }) => ({ name, title })), ...pageIndex.filter((page) => page.kind === "export")]
    .filter(({ name, title }) => /^[A-Za-z][A-Za-z0-9]*$/.test(title) && title.toLowerCase() !== name.toLowerCase())
    .map(({ name, title }) => ({ from: `/docs/${title}/`, to: `/docs/${name}/` })),
  { from: "/docs/ouro-ax/", to: "/docs/ax/" },
  { from: "/docs/ax-overview/", to: "/docs/ax/" },
  { from: "/docs/ouro-hx/", to: "/docs/" },
  { from: "/docs/composed/", to: "/docs/composed-ui/" },
  // The names agents type for a component they know from elsewhere, with a line that says so for one that reads the
  // page: shadcn/ui's own names (docs/switching-from-shadcn) and a few every kit uses. Any other kit's name gets the lost
  // page, which names the component (lost-at-sea.tsx); a redirect is only for a name that means one component.
  ...(
    [
      ["modal", "dialog", "A modal"],
      ["drawer", "sheet", "shadcn's Drawer"],
      ["bottom-sheet", "sheet", "A bottom sheet"],
      ["alert-dialog", "confirm-dialog", "shadcn's AlertDialog"],
      ["dropdown-menu", "menu", "shadcn's DropdownMenu"],
      ["context-menu", "menu", "shadcn's ContextMenu"],
      ["input", "text-field", "shadcn's Input"],
      ["input-otp", "otp-field", "shadcn's InputOTP"],
      ["label", "field", "shadcn's Label"],
      ["data-table", "table", "shadcn's data table"],
      ["sonner", "toaster", "shadcn's Sonner"],
      ["snackbar", "toaster", "A snackbar"],
      ["loader", "spinner", "A loader"],
      ["divider", "separator", "A divider"],
    ] as const
  ).map(([from, name, said]) => ({ from: `/docs/${from}/`, to: `/docs/${name}/`, note: `${said} is called ${docsItems.find((item) => item.name === name)!.title} in Ouro HX.` })),
];

/** Old and guessed addresses that send the reader on: a static page with a refresh, a canonical link and a plain link (head.ts). */
export const redirects: Array<{ from: string; to: string; note?: string }> = [{ from: "/voyage/", to: "/" }, { from: "/benchmark/", to: "/proof/" }, { from: "/web/", to: "/hx/#web" }, { from: "/composed/", to: "/composed-ui/" }, ...guessedAddresses];

// The words a person or an agent searches with: what it is (React components on Base UI and Tailwind, with SwiftUI, WinUI and Compose kits), who it is for (agents building A2UI and MCP Apps interfaces) and how it installs.
const DESCRIPTION = claim("Accessible React components on Base UI and Tailwind, with SwiftUI, WinUI and Compose kits, for agents building A2UI and MCP Apps. Installs with the shadcn CLI.", {
  source: [{ file: "test/stories.test.tsx" }, { file: "package.json" }, { file: "docs/platforms/windows.md" }, { file: "docs/platforms/android.md" }, { file: "docs/platforms/apple.md" }, { file: "scripts/install-test.sh" }],
  verify: [
    { testExists: "test/stories.test.tsx::at $width px > %s > $id has no axe violations, closed and with each overlay open" },
    { fileLine: "package.json", pattern: "\"@base-ui/react\"" },
    { fileLine: "docs/platforms/apple.md", pattern: "Swift" },
    { fileLine: "docs/platforms/windows.md", pattern: "WinUI" },
    { fileLine: "docs/platforms/android.md", pattern: "Compose" },
    { fileLine: "package.json", pattern: "\"tailwindcss\"" },
    { testExists: "registry/ouro/components/ouro/a2ui-surface/a2ui-surface.test.tsx::A2UISurface > renders the agent's card with HX components, its data bound and its template repeated" },
    { testExists: "registry/ouro/components/ouro/mcp-app/ouro-mcp-app.test.tsx::OuroMcpApp > draws a composed tree in structuredContent.ouro with ComposedSurface" },
    { fileLine: "scripts/install-test.sh", pattern: "shadcn@4\\.21\\.1" },
  ],
});
// NAUTILUS_PAGE.intro (voyage/copy.ts), written out so the docs, which import this file, do not load the voyage's words.
const NAUTILUS_DESCRIPTION = `Captain Nemo is building a submarine in secret, on a far-off island. Help him get her ready, then sail with him. A story told with Ouro HX components: build the Nautilus, plan her voyage, and meet a very friendly squid.`;

// The Ouro AX page's description, for its head tags (ax/ax-page.tsx says the same in its hero).
const AX_DESCRIPTION = "Ouro AX is for the tools agents use: a command line, an HTTP API, an MCP server. Spend a morning with a person and their agent, seen from both sides, then be the agent yourself.";

export const routes: Route[] = [
  // The home page's title is what a search result shows: the name and the six-word story.
  { path: "/", title: `Ouro UI: ${VOYAGE_HERO.title.join(" ")}`, description: DESCRIPTION },
  { path: "/nautilus/", title: "The Nautilus · Ouro UI", description: NAUTILUS_DESCRIPTION },
  { path: "/ax/", title: "A morning with an agent · Ouro AX", description: AX_DESCRIPTION },
  // The Ouro UI for Apple pages (paths.ts lists them; each page's hero says the same).
  { path: "/apple/", title: "Ouro UI for Apple", description: "Ouro HX and Ouro AX in Swift: the springs, haptics and colours people feel, and the App Intents Siri reads. One package for iPhone, iPad and Mac." },
  { path: "/apple/hx/", title: "Ouro HX for Apple", description: "The spring, the press, the named haptic moments and the themes, from the same tokens as the web. Watch them in SwiftUI, then poke their web twins." },
  { path: "/apple/feel/", title: "Ouro Feel · Ouro UI for Apple", description: "Jank comes in genres, and Ouro Feel checks them from a UI test: the way back, overlays, inside the window, tap landing and more. Double-tap a switch with a tap lock and see what Feel saw." },
  { path: "/apple/ax/", title: "Ouro AX for Apple", description: "The App Intents X-ray reads a built app from outside and checks it against Apple's side of the Ouro AX standard. Browse the real reports from Spoonjoy and Ouro MD, before and after." },
  { path: "/apple/reins/", title: "Ouro Reins · Ouro UI for Apple", description: "Agents drive an app's screens as state and actions with ls and do: headless, in milliseconds, with the network blocked. Drive a pretend kitchen in your browser and race the simulator." },
  { path: "/apple/start/", title: "Get started · Ouro UI for Apple", description: "Add one Swift package, set a theme, animate with the shared spring, play a named haptic, and X-ray your App Intents in CI." },
  { path: "/hx/", title: "Ouro HX · Ouro UI", description: "Components for people's screens, in React, SwiftUI, WinUI and Compose." },
  { path: "/windows/", title: "Ouro UI for Windows", description: "Ouro HX in WinUI, and App Actions and MCP for agents." },
  { path: "/windows/start/", title: "Get started · Ouro UI for Windows", description: "Add Ouro.UI.Windows and give your first OuroButton an action." },
  { path: "/android/", title: "Ouro UI for Android", description: "Ouro HX in Jetpack Compose, and AppFunctions for agents." },
  { path: "/android/start/", title: "Get started · Ouro UI for Android", description: "Add bot.ouro.ui:ouro-hx and give agents your actions as AppFunctions." },
  { path: "/adoption/", title: "Adoption · Ouro UI", description: "Who uses Ouro UI, and who gives back to it: our maintained products, measured from GitHub and CI hourly, furthest from confirmed first." },
  // The part pages (parts/); each description is its page's lede (copy deck 3.3).
  { path: "/actions/", title: "Actions · Ouro UI", description: "Write an action once. People press it, agents call it, and paying, sending and deleting wait for the person's yes." },
  {
    path: "/composed-ui/",
    title: "Composed UI · Ouro UI",
    description: "Your agent sends a card as data. Ouro checks its components and buttons against your app's list, then draws it natively. It sends cards to MCP Apps hosts and reads A2UI.",
  },
  {
    path: "/xray/",
    title: "X-ray · Ouro UI",
    description: "See inside. HX X-ray outlines and names the components on a screen. AX X-ray calls the doors the way an agent would. Ouro check, Feel and Reins live here too.",
  },
  {
    path: "/hackamore/",
    title: "Hackamore · Ouro UI",
    description: "Reins for Mac apps that were built without them. Ask for a button that isn't on the screen, and it says what to do instead before it touches the app.",
  },
  { path: "/current/", title: "Ouro Current · Ouro UI", description: "Our own Dependabot for Ouro UI: install the GitHub App, and Ouro UI releases arrive as one pull request with auto-merge on." },
  // Proof's lede (copy deck v7, 3.3; proof/copy.ts says the same on the page).
  {
    path: "/proof/",
    title: "Proof · Ouro UI",
    description: claim("The benchmark, what frontier models said when they compared toolkits, every product on the adoption board, how to run Ouro UI at a company, and the projects we borrowed from.", {
      source: [{ file: "docs/guides/agent-interfaces.md" }, { file: "docs/guides/company.md" }, { file: "site/src/adoption/ledger.json" }],
      verify: [{ fileLine: "docs/guides/agent-interfaces.md", pattern: "checked trials" }, { fileLine: "docs/guides/company.md", pattern: "# Ouro UI at a company" }, { testExists: "site/src/proof/proof.test.tsx::Proof's page > has a route, a forward from /benchmark/, and a section for each part of the proof" }],
    }),
  },
  {
    path: "/docs/",
    title: "Components · Ouro HX for web",
    description: claim("Every Ouro HX component, with install commands, props and live demos.", {
      source: { file: "site/src/site.test.tsx" },
      verify: { testExists: "site/src/site.test.tsx::docs > has a page for every registry item at docs/<name>" },
    }),
  },
  ...docsItems.map((item) => ({
    path: `/docs/${item.name}/`,
    title: `${item.title} · Ouro HX for web`,
    description: `${item.title}: install it with npx shadcn@latest add ourostack/ouro-ui/${item.name}#${latestRelease}.`,
  })),
  ...pageIndex.map((page) => ({
    path: `/docs/${page.name}/`,
    // An export is a web component's own page; a guide or a platform page is about the whole kit (AGENTS.md, Names).
    title: `${page.title} · ${page.kind === "export" ? "Ouro HX for web" : "Ouro UI"}`,
    description: page.summary.replace(/`/g, ""),
  })),
  {
    path: "/docs/switching-from-shadcn/",
    title: "Switching from shadcn · Ouro UI",
    description: "How shadcn/ui components and props map to Ouro HX, and how both live in one app.",
  },
  {
    path: "/docs/updating/",
    title: "Updating components · Ouro UI",
    description: "Review upstream changes with add --diff, then overwrite and reapply your edits.",
  },
  {
    path: "/docs/chat-demo/",
    title: "A chat app · Ouro HX for web",
    description: "A whole chat app from Ouro HX's chat components: conversations, messages, a thread, typing, read receipts and composers.",
  },
  {
    path: "/docs/call-demo/",
    title: "A call window · Ouro HX for web",
    description: "A whole call window from Ouro HX's call components: a tile grid, speaking and muted tiles, captions, the control bar and a picture-in-picture.",
  },
  // One component's live demo alone (components/phone-demo.tsx), which a component page shows in a phone's frame.
  { path: "/docs/demo/", title: "Live demo · Ouro HX for web", description: "One Ouro HX component's live demo, on its own.", noindex: true },
];

/** The route for a path, tolerating a missing trailing slash and `index.html`. */
export function routeFor(path: string): Route | undefined {
  const normalized = normalizePath(path);
  return routes.find((route) => route.path === normalized);
}
