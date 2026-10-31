import { useState, type JSX } from "react";
import { NavigationRail } from "@/registry/ouro/components/ouro/navigation-rail/navigation-rail";
import { Text } from "@/registry/ouro/components/ouro/text/text";

// The live demo at the top of docs/navigation-rail/: the component as an app would use it, with its props, nothing else.

const line = (path: string) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d={path} />
  </svg>
);
const solid = (path: string) => (
  <svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d={path} />
  </svg>
);

const pages = [
  { id: "activity", label: "Activity", path: "M6 9a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9ZM10 20a2.2 2.2 0 0 0 4 0", count: 3 },
  { id: "chat", label: "Chat", path: "M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v9a1.5 1.5 0 0 1-1.5 1.5H9l-5 4Z", count: 12 },
  { id: "calendar", label: "Calendar", path: "M4 6.5A1.5 1.5 0 0 1 5.5 5h13A1.5 1.5 0 0 1 20 6.5v12a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5ZM4 10h16M8 3v4M16 3v4" },
  { id: "files", label: "Shared files", path: "M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2.5h8.5A1.5 1.5 0 0 1 21 9v9.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5Z" },
];

export default function NavigationRailDemo(): JSX.Element {
  // The demo's own views: each item is a button that shows its view.
  const [view, setView] = useState("chat");
  return (
    <div className="flex h-80 w-full max-w-md overflow-hidden rounded-xl border border-border bg-muted">
      <NavigationRail
        label="Demo app"
        items={[
          ...pages.slice(0, 3).map(({ id, label, path, count }) => ({ label, icon: line(path), currentIcon: solid(path), count, current: view === id, onClick: () => setView(id) })),
          { type: "separator" as const },
          ...pages.slice(3).map(({ id, label, path }) => ({ label, icon: line(path), currentIcon: solid(path), current: view === id, onClick: () => setView(id) })),
        ]}
      />
      <div className="m-2 ms-0 flex-1 rounded-lg border border-border bg-background p-4">
        <Text>{pages.find((page) => page.id === view)!.label}</Text>
      </div>
    </div>
  );
}
