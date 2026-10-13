import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type CSSProperties } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Kbd } from "@/registry/ouro/components/ouro/kbd/kbd";
import { Command, type CommandEntry } from "@/registry/ouro/components/ouro/command/command";
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
