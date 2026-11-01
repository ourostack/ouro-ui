import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type CSSProperties } from "react";
import { Avatar } from "@/registry/ouro/components/ouro/avatar/avatar";
import { Badge } from "@/registry/ouro/components/ouro/badge/badge";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Kbd } from "@/registry/ouro/components/ouro/kbd/kbd";
import { Command, type CommandEntry } from "@/registry/ouro/components/ouro/command/command";
import { EmojiText, type EmojiCatalogue } from "@/registry/ouro/components/ouro/emoji/emoji";
import { useCommandShortcut } from "@/registry/ouro/lib/ouro/use-command-shortcut";

// Layout here uses inline styles and the theme's CSS variables (shadcn's names).

const row: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", color: "var(--muted-foreground)", fontSize: 14 };

const noop = () => {};

const commands: CommandEntry[] = [
  {
    label: "Recipes",
    items: [
      { label: "New recipe", onSelect: noop, shortcut: ["mod", "n"] },
      { label: "Import from a link", onSelect: noop, keywords: ["url", "paste"] },
      { label: "Open shopping list", onSelect: noop, shortcut: ["mod", "l"] },
    ],
  },
  {
    label: "Cookbooks",
    items: [
      { label: "Weeknight dinners", onSelect: noop },
      { label: "Baking", onSelect: noop },
    ],
  },
  {
    label: "Settings",
    items: [
      { label: "Switch theme", onSelect: noop, keywords: ["dark mode", "light mode"] },
      { label: "Sign out", onSelect: noop, disabled: true },
    ],
  },
];

const meta = {
  title: "Menus/Command",
  component: Command,
  parameters: { layout: "centered" },
  args: { title: "Command palette", trigger: <Button variant="outline" tone="secondary">Search…</Button>, items: commands },
  argTypes: {
    trigger: { table: { disable: true } },
    items: { table: { disable: true } },
  },
} satisfies Meta<typeof Command>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Type to filter, the arrow keys to move, Enter to run. Below 640px it is a full-height sheet. */
export const Playground: Story = {
  parameters: { screenshot: { name: "command-open", open: true } },
};

/** `useCommandShortcut("mod+k")` opens it from anywhere on the page. */
export const Shortcut: Story = {
  parameters: { plainOpeners: ["Open palette"] },
  render: function Render(args) {
    const [open, setOpen] = useCommandShortcut("mod+k");
    return (
      <div style={row}>
        <Button variant="soft" onClick={() => setOpen(true)}>
          Open palette
        </Button>
        <span>
          or press <Kbd keys={["mod", "k"]} />
        </span>
        <Command title={args.title} items={args.items} open={open} onOpenChange={setOpen} />
      </div>
    );
  },
};

/** What shows when nothing matches: `emptyLabel`. */
export const Empty: Story = {
  args: { items: [], emptyLabel: "No commands yet" },
};

const recipes = ["Shakshuka", "Pasta al limone", "Paella", "Pad thai", "Lentil soup", "Banana bread", "Baklava", "Saag paneer"];

/** A stand-in for a server: answers after a delay, slower for shorter queries, and fails on "fail". */
function searchRecipes(query: string, signal: AbortSignal): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => (query === "fail" ? reject(new Error("offline")) : resolve(recipes.filter((name) => name.toLowerCase().includes(query.toLowerCase())))),
      900 - Math.min(query.length, 6) * 120,
    );
    signal.addEventListener("abort", () => clearTimeout(timer));
  });
}

/**
 * Results from a server: `onQueryChange` runs the search, and its `signal` aborts the one a
 * newer query replaces. `loading` clears when a search answers, fails ("fail") or aborts.
 */
export const ServerSearch: Story = {
  render: function Render(args) {
    const [results, setResults] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    return (
      <Command
        title={args.title}
        trigger={<Button variant="outline" tone="secondary">Search recipes…</Button>}
        placeholder="Search recipes…"
        loading={loading}
        items={results.map((name) => ({ label: name, onSelect: noop }))}
        onQueryChange={(query, { signal }) => {
          setLoading(true);
          signal.addEventListener("abort", () => setLoading(false));
          searchRecipes(query, signal).then(
            (next) => {
              if (signal.aborted) return;
              setResults(next);
              setLoading(false);
            },
            () => {
              if (!signal.aborted) setLoading(false);
            },
          );
        }}
      />
    );
  },
};

const person = (name: string, id: string) => <Avatar name={name} alt="" size="xs" idForColor={id} />;

const pencil = (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.5 2.5l3 3-8 8H2.5v-3z" />
  </svg>
);

const bell = (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 11V7a4 4 0 0 1 8 0v4l1 1.5H3zM6.5 14h3" />
  </svg>
);

const chats: CommandEntry[] = [
  {
    label: "Recent",
    items: [
      { label: "Mona Example", onSelect: noop, avatar: person("Mona Example", "person-0101"), unread: true },
      { label: "Launch team", onSelect: noop, avatar: <Avatar name="Launch team" alt="" size="xs" shape="square" idForColor="team-0102" />, unread: true, mark: <Badge>3</Badge> },
      { label: "Kai Sample", onSelect: noop, avatar: person("Kai Sample", "person-0103") },
      { label: "Priya Placeholder", onSelect: noop, avatar: person("Priya Placeholder", "person-0104"), mark: "Draft" },
    ],
  },
  {
    label: "Actions",
    items: [
      { label: "New chat", onSelect: noop, icon: pencil, shortcut: ["mod", "n"] },
      { label: "Mute notifications", onSelect: noop, icon: bell, keywords: ["quiet", "do not disturb"] },
    ],
  },
];

/**
 * A palette that jumps to any chat: each command leads with an `avatar` (or an `icon`) and
 * ends with an `unread` dot or a `mark`, such as an unread count's `Badge`.
 */
export const Media: Story = {
  args: { title: "Go to a chat", trigger: <Button variant="outline" tone="secondary">Go to…</Button>, items: chats, placeholder: "Search chats and actions…" },
  parameters: { screenshot: { name: "command-media", open: true } },
};

// Two made-up image emoji, drawn here, for chat names that hold emoji.
const svg = (body: string) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">${body}</svg>`)}`;
const emoji: EmojiCatalogue = {
  categories: [
    {
      id: "symbols",
      label: "Symbols",
      items: [
        { id: "rocket", name: "Rocket", text: "🚀", src: svg('<path d="M16 3c6 4 8 11 6 18h-12C8 14 10 7 16 3z" fill="#7c5cff"/><circle cx="16" cy="13" r="3" fill="#fff"/><path d="M12 22l-3 6 5-3zm8 0 3 6-5-3z" fill="#e8435a"/>') },
        { id: "party", name: "Party popper", text: "🎉", src: svg('<path d="M5 28 12 9l11 11z" fill="#ffb400"/><circle cx="22" cy="6" r="2" fill="#e8435a"/><circle cx="27" cy="12" r="2" fill="#2bb673"/>') },
      ],
    },
  ],
};
const chat = (name: string, id: string): CommandEntry => ({ label: name, labelContent: <EmojiText text={name} catalogue={emoji} />, onSelect: noop, avatar: person(name, id) });

/**
 * `labelContent` shows a chat's name with its emoji as an app's own pictures (here through
 * `EmojiText`), while `label` stays the text the search matches and screen readers hear.
 */
export const EmojiInLabels: Story = {
  args: {
    title: "Go to a chat",
    trigger: <Button variant="outline" tone="secondary">Go to…</Button>,
    items: [chat("Launch team 🚀", "team-0201"), chat("Friday wins 🎉", "team-0202"), chat("Kai Sample", "person-0203")],
    placeholder: "Search chats…",
  },
};
