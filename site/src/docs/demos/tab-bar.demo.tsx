import { useState, type JSX } from "react";
import { TabBar } from "@/registry/ouro/components/ouro/tab-bar/tab-bar";
import { Text } from "@/registry/ouro/components/ouro/text/text";

// The live demo at the top of docs/tab-bar/: the component as an app would use it, with its props, nothing else.

const icon = (path: string) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d={path} />
  </svg>
);

export default function TabBarDemo(): JSX.Element {
  // The demo's own "router": a tab click changes the current tab instead of leaving the page.
  const [path, setPath] = useState("#recipes");
  return (
    // The frame's transform makes it the bar's containing block, so the fixed bar sits at the frame's foot, not the page's.
    <div
      className="relative h-64 max-w-sm overflow-hidden rounded-xl border border-border p-4 [transform:translateZ(0)]"
      onClick={(event) => {
        const link = (event.target as Element).closest("a");
        if (!link) return;
        event.preventDefault();
        setPath(link.getAttribute("href")!);
      }}
    >
      <Text>On a phone the bar sits at the bottom of the screen. It hides from 640px by default; this demo keeps it at every width.</Text>
      <TabBar
        label="Demo tabs"
        hideFrom="never"
        items={[
          { label: "Home", href: "#home", current: path === "#home", icon: icon("M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z") },
          { label: "Recipes", href: "#recipes", current: path === "#recipes", icon: icon("M4 19.5V4.5A1.5 1.5 0 0 1 5.5 3H20v16H5.5a1.5 1.5 0 0 0 0 3H20") },
          { label: "Shopping", href: "#shopping", current: path === "#shopping", icon: icon("M6 7h12l-1 14H7zM9 7a3 3 0 0 1 6 0") },
        ]}
        accessory={{ label: "Search", href: "#search", icon: icon("M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-5-5") }}
      />
    </div>
  );
}
