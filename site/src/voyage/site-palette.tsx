import type { JSX } from "react";
import { Command, type CommandEntry } from "@/registry/ouro/components/ouro/command/command";
import { comparisons, componentGroups, guides, platforms } from "../components/docs-sections";
import { askForUrl } from "../components/ask-for";
import { bare, otherNames } from "../components/other-names";
import { href } from "../paths";
import { choiceList } from "./presets";
import { guideLabel, sectionHref, SITE_SECTIONS } from "./site-menu";
import { useSiteTheme } from "./theme-store";
import { openXray } from "./xray-store";

// ⌘K's palette, and the phone menu's Search: every page the menu lists, every component and guide, the presets,
// light and dark, and X-ray. Its own module, which the header loads the first time the palette opens.

/** Words a section is also found by, which never show. */
const KEYWORDS: Readonly<Record<string, readonly string[]>> = {
  "/": ["start", "porthole"],
  "/hx/": ["components", "swiftui", "winui", "compose", "apple", "windows", "android", "coverage"],
  "/ax/": ["agents", "agent experience", "cli", "mcp"],
  "/actions/": ["consent", "tools", "buttons"],
  "/composed-ui/": ["cards", "mcp apps", "a2ui"],
  "/xray/": ["inspector", "ouro check", "feel", "reins"],
  "/proof/": ["benchmark", "model reviews", "adoption"],
  "/docs/": ["catalog", "overview", "install", "guides"],
};

const go = (url: string) => () => window.location.assign(url);

/**
 * The open palette's search as it stands. A command runs within the press that picks it, while the field still holds the
 * words; a palette that is closed (a docs demo's) draws no box, so it is passed over.
 */
const searched = () =>
  [...document.querySelectorAll<HTMLInputElement>('input[data-ouro-control="command"][data-ouro-part="input"]')].find((input) => input.getClientRects().length > 0)?.value ?? "";

export default function SitePalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }): JSX.Element {
  const { setPreset, setMode } = useSiteTheme();
  const items: CommandEntry[] = [
    {
      label: "Pages",
      items: SITE_SECTIONS.flatMap((section) => [
        { label: section.label, description: section.hint, onSelect: go(sectionHref(section.href)), keywords: KEYWORDS[section.href] ?? ["source", "repository"] },
        ...(section.pages ?? [])
          .flatMap((page) => ("links" in page ? page.links : [page]))
          .map((page) => ({ label: page.label, description: section.label, onSelect: go(href(page.href)) })),
      ]),
    },
    {
      label: "Components",
      items: componentGroups("", true).flatMap((group) =>
        group.links.map((link) => ({
          label: link.label,
          description: group.label,
          onSelect: go(href(link.path)),
          // "modal" finds Dialog. The palette matches inside words too, as it does for every label.
          keywords: (otherNames[link.path.replace(/^\/docs\/|\/$/g, "")] ?? []).map(bare),
        })),
      ),
    },
    {
      label: "Guides",
      items: [
        ...guides.map((link) => ({ label: guideLabel(link.label), onSelect: go(href(link.path)) })),
        ...comparisons.map((link) => ({ label: link.label, description: "Skill comparison", onSelect: go(href(link.path)) })),
      ],
    },
    { label: "Platforms", items: platforms.map((link) => ({ label: link.label, description: "Platforms", onSelect: go(href(link.path)) })) },
    {
      label: "Repaint",
      items: [
        ...choiceList.map((item) => ({ label: `${item.label} theme`, onSelect: () => setPreset(item.name), keywords: [item.mood] })),
        { label: "Surface (light)", onSelect: () => setMode("light"), keywords: ["light mode", "surfaced"] },
        { label: "Submerge (dark)", onSelect: () => setMode("dark"), keywords: ["dark mode", "submerged"] },
        { label: "Follow my device (auto)", onSelect: () => setMode("system"), keywords: ["auto", "system"] },
      ],
    },
    { label: "Tools", items: [{ label: "X-ray", onSelect: openXray, keywords: ["inspector", "outline", "components"] }] },
    // Last whatever the search is: what the search was for, asked for on GitHub, in a new tab.
    { label: "Ask for a component", description: "On GitHub", onSelect: () => void window.open(askForUrl(searched()), "_blank", "noopener"), alwaysShown: true },
  ];
  return <Command title="Command palette" open={open} onOpenChange={onOpenChange} placeholder="Dive, repaint, or find a page…" emptyLabel="Nothing aboard by that name. Want one?" items={items} />;
}
