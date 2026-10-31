import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type ReactNode } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { NavigationRail, type NavigationRailEntry } from "@/registry/ouro/components/ouro/navigation-rail/navigation-rail";
import { Text } from "@/registry/ouro/components/ouro/text/text";
import { Tooltip } from "@/registry/ouro/components/ouro/tooltip/tooltip";

// Layout here uses inline styles and the theme's CSS variables (shadcn's names).

/** A 24px icon drawn with strokes, as lucide-react and Fluent's regular icons are. */
const line = (path: string) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d={path} />
  </svg>
);
/** The same shape filled, as Fluent's filled icons are, for the current item. */
const solid = (path: string) => (
  <svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d={path} />
  </svg>
);

const bell = "M6 9a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9ZM10 20a2.2 2.2 0 0 0 4 0";
const chat = "M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v9a1.5 1.5 0 0 1-1.5 1.5H9l-5 4Z";
const calendar = "M4 6.5A1.5 1.5 0 0 1 5.5 5h13A1.5 1.5 0 0 1 20 6.5v12a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5ZM4 10h16M8 3v4M16 3v4";
const people = "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM2.5 20a6.5 6.5 0 0 1 13 0ZM16 4.5a3.5 3.5 0 0 1 0 6.5M18 14a6.5 6.5 0 0 1 3.5 6";
const folder = "M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2.5h8.5A1.5 1.5 0 0 1 21 9v9.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5Z";
const book = "M4 19.5V4.5A1.5 1.5 0 0 1 5.5 3H20v16H5.5a1.5 1.5 0 0 0 0 3H20";
const grid = "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z";
const gear = "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 13.5l1.6 1.2-2 3.4-1.9-.7a7 7 0 0 1-2 1.2L14.8 21h-3.6l-.3-2.4a7 7 0 0 1-2-1.2l-1.9.7-2-3.4 1.6-1.2a7 7 0 0 1 0-3L5 9.3l2-3.4 1.9.7a7 7 0 0 1 2-1.2l.3-2.4h3.6l.3 2.4a7 7 0 0 1 2 1.2l1.9-.7 2 3.4-1.6 1.2a7 7 0 0 1 0 3Z";

const items: NavigationRailEntry[] = [
  { label: "Activity", href: "/activity", icon: line(bell), currentIcon: solid(bell), count: 5 },
  { label: "Chat", href: "/chat", icon: line(chat), currentIcon: solid(chat), paths: ["/people"], count: 128 },
  { label: "Calendar", href: "/calendar", icon: line(calendar), currentIcon: solid(calendar) },
  { label: "People", href: "/contacts", icon: line(people) },
  { type: "separator" },
  { label: "Files", href: "/files", icon: line(folder), currentIcon: solid(folder) },
  { label: "Recipe notebook", href: "/notebook", icon: line(book) },
];

/** The app's mark at the top of the rail. */
const mark = (
  <svg role="img" aria-label="Harbor" viewBox="0 0 32 32" style={{ width: 32, height: 32, color: "var(--primary)" }}>
    <rect width="32" height="32" rx="8" fill="currentColor" />
    <path d="M9 21c2.5-1.5 4.5-1.5 7 0s4.5 1.5 7 0M9 16c2.5-1.5 4.5-1.5 7 0s4.5 1.5 7 0M16 7v6" fill="none" stroke="var(--primary-foreground)" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const settings = (
  <Tooltip content="Settings" side="right">
    <Button variant="plain" tone="secondary" aria-label="Settings" className="w-11 px-0">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20 }}>
        <path d={gear} />
      </svg>
    </Button>
  </Tooltip>
);

/** An app's window: the rail on its frame, beside the page. */
function Frame({ children, height = 560, page = "The page for the current item." }: { children: ReactNode; height?: number; page?: ReactNode }) {
  return (
    <div style={{ display: "flex", height, background: "var(--muted)", color: "var(--foreground)", borderRadius: "calc(var(--radius) + 4px)", overflow: "hidden" }}>
      {children}
      <div style={{ flex: 1, margin: 8, marginInlineStart: 0, padding: 24, background: "var(--background)", borderRadius: "var(--radius)", border: "1px solid var(--border)" }}>
        <Text>{page}</Text>
      </div>
    </div>
  );
}

const meta = {
  title: "Navigation/NavigationRail",
  component: NavigationRail,
  parameters: { layout: "padded" },
  args: { label: "Main", items, currentPath: "/chat", header: mark, footer: settings },
  render: (args) => (
    <Frame>
      <NavigationRail {...args} />
    </Frame>
  ),
} satisfies Meta<typeof NavigationRail>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Try every prop. Chat is current, from the path: its icon fills and its bar shows on the rail's edge. */
export const Playground: Story = {};

/** The views of an app that switches them without a router. Elements made here, outside a render, keep Storybook's source panel quick in WebKit. */
const views = [
  { id: "activity", label: "Activity", icon: line(bell), currentIcon: solid(bell), count: 2 },
  { id: "chat", label: "Chat", icon: line(chat), currentIcon: solid(chat) },
  { id: "calendar", label: "Calendar", icon: line(calendar), currentIcon: solid(calendar) },
  { id: "files", label: "Files", icon: line(folder), currentIcon: solid(folder) },
];

/** Views switched without a router: each item is a button, and the shown view's item is `current`. */
export const Views: Story = {
  render: function Render(args) {
    const [view, setView] = useState("chat");
    return (
      <Frame page={`The ${view} view.`}>
        <NavigationRail {...args} currentPath={undefined} items={views.map(({ id, ...item }) => ({ ...item, current: view === id, onClick: () => setView(id) }))} />
      </Frame>
    );
  },
};

/** The icons alone, in a narrower rail. Each label names its item for screen readers and shows in a tooltip. */
export const IconsOnly: Story = { args: { hideLabels: true } };

/** A short window: the items that do not fit move into More, from the last; the current item stays on the rail. */
export const Overflow: Story = {
  args: { currentPath: "/notebook" },
  render: (args) => (
    <Frame height={360}>
      <NavigationRail {...args} />
    </Frame>
  ),
};

/** Longer labels wrap to two lines between words; one longer still ends in an ellipsis and shows whole in a tooltip. */
export const LongLabels: Story = {
  args: {
    currentPath: "/bots",
    items: [
      { label: "Bots and workflows", href: "/bots", icon: line(grid) },
      { label: "Shared calendars", href: "/calendars", icon: line(calendar) },
      { label: "Customer support escalations", href: "/support", icon: line(people) },
    ],
  },
};

