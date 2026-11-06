import type { JSX } from "react";
import { Command, type CommandEntry } from "@/registry/ouro/components/ouro/command/command";
import { comparisons, componentGroups, guides } from "../components/docs-sections";
import { href } from "../paths";
import { choiceList } from "./presets";
import { sectionHref, SITE_SECTIONS } from "./site-menu";
import { useSiteTheme } from "./theme-store";
import { openXray } from "./xray-store";

// ⌘K's palette, and the phone menu's Search: every page the menu lists, every component and guide, the presets,
// light and dark, and X-ray. Its own module, which the header loads the first time the palette opens.

/** Words a section is also found by, which never show. */
const KEYWORDS: Readonly<Record<string, readonly string[]>> = {
  "/": ["start", "porthole"],
  "/nautilus/": ["story", "chapters", "ship"],
  "/ax/": ["agents", "agent experience", "cli", "x-ray"],
  "/apple/": ["swift", "swiftui", "iphone", "mac", "siri", "app intents"],
  "/docs/installing/": ["install", "guide"],
  "/docs/": ["catalog"],
};

const go = (url: string) => () => window.location.assign(url);

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
        group.links.map((link) => ({ label: link.label, description: group.label, onSelect: go(href(link.path)) })),
      ),
    },
    { label: "Guides", items: [...guides, ...comparisons].map((link) => ({ label: link.label, onSelect: go(href(link.path)) })) },
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
  ];
  return <Command title="Command palette" open={open} onOpenChange={onOpenChange} placeholder="Dive, repaint, or find a page…" items={items} />;
}
