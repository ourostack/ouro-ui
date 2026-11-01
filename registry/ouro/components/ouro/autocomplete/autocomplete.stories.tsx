import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type ReactNode } from "react";
import { Autocomplete, type AutocompleteItem, type AutocompleteTrigger } from "@/registry/ouro/components/ouro/autocomplete/autocomplete";
import { TextArea } from "@/registry/ouro/components/ouro/text-field/text-area";
import { TextField } from "@/registry/ouro/components/ouro/text-field/text-field";

// Layout here uses inline styles and the theme's CSS variables (shadcn's names).

/** A themed panel. It follows the page's scheme (the `.dark` class on the root). */
function Surface({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        background: "var(--background)",
        color: "var(--foreground)",
        border: "1px solid var(--border)",
        borderRadius: "calc(var(--radius) + 4px)",
        padding: 16,
        display: "grid",
        gap: 12,
        width: 520,
        maxWidth: "100%",
        boxSizing: "border-box",
      }}
    >
      {children}
    </div>
  );
}

const people: AutocompleteItem[] = [
  { value: "avery", label: "Avery Kim", description: "Design", avatar: {} },
  { value: "jordan", label: "Jordan Lee", description: "Engineering", avatar: {} },
  { value: "priya", label: "Priya Natarajan", description: "Research", avatar: {} },
  { value: "sasha", label: "Sasha Ortiz", description: "Product", avatar: {} },
  { value: "taylor", label: "Taylor Brooks", description: "Support", avatar: {} },
  { value: "riley", label: "Riley Chen", description: "Engineering", avatar: {} },
];

const emoji: AutocompleteItem[] = [
  { value: "tada", label: "Party popper", glyph: "🎉", insert: "🎉", description: ":tada:" },
  { value: "thumbsup", label: "Thumbs up", glyph: "👍", insert: "👍", description: ":thumbsup:" },
  { value: "thinking", label: "Thinking face", glyph: "🤔", insert: "🤔", description: ":thinking:" },
  { value: "heart", label: "Red heart", glyph: "❤️", insert: "❤️", description: ":heart:" },
  { value: "rocket", label: "Rocket", glyph: "🚀", insert: "🚀", description: ":rocket:" },
  { value: "eyes", label: "Eyes", glyph: "👀", insert: "👀", description: ":eyes:" },
  { value: "smile", label: "Smiling face", glyph: "😄", insert: "😄", description: ":smile:" },
  { value: "sparkles", label: "Sparkles", glyph: "✨", insert: "✨", description: ":sparkles:" },
];

const matches = (item: AutocompleteItem, query: string) => {
  const words = query.toLowerCase();
  return item.label.toLowerCase().split(" ").some((word) => word.startsWith(words)) || item.label.toLowerCase().startsWith(words);
};

const peopleTrigger: AutocompleteTrigger = {
  char: "@",
  label: "People",
  allowSpaces: true,
  items: (query) => people.filter((person) => matches(person, query)).slice(0, 5),
};
const emojiTrigger: AutocompleteTrigger = {
  char: ":",
  label: "Emoji",
  minQueryLength: 2,
  items: (query) => emoji.filter((item) => item.value.startsWith(query.toLowerCase()) || matches(item, query)).slice(0, 6),
};

const meta = {
  title: "Forms/Autocomplete",
  component: Autocomplete,
  parameters: { layout: "padded" },
  args: { triggers: [peopleTrigger, emojiTrigger], children: <TextArea label="Message" /> },
} satisfies Meta<typeof Autocomplete>;
export default meta;

type Story = StoryObj<typeof meta>;

/** A message box: `@` suggests people and `:` with two letters suggests emoji. Arrow keys move, Enter or Tab picks, Escape closes. */
export const Composer: Story = {
  render: function Render() {
    const [text, setText] = useState("");
    const [mentioned, setMentioned] = useState<string[]>([]);
    return (
      <Surface>
        <Autocomplete triggers={[{ ...peopleTrigger, onPick: (item) => setMentioned((list) => [...list, item.label]) }, emojiTrigger]}>
          <TextArea label="Message" hideLabel placeholder="Type @ to mention someone, or :ta for 🎉" autoGrow rows={2} maxRows={6} value={text} onValueChange={setText} />
        </Autocomplete>
        <output style={{ fontSize: 13, color: "var(--muted-foreground)" }}>{mentioned.length > 0 ? `Mentioned: ${mentioned.join(", ")}` : "No one mentioned yet"}</output>
      </Surface>
    );
  },
};

/** The list open on `@`, as the person sees it after typing the trigger. */
export const Open: Story = {
  render: () => (
    <Surface>
      <Autocomplete triggers={[peopleTrigger, emojiTrigger]}>
        <TextArea label="Message" hideLabel autoGrow rows={2} defaultValue="Thanks " />
      </Autocomplete>
    </Surface>
  ),
  play: async ({ canvasElement }) => {
    const textarea = canvasElement.querySelector("textarea")!;
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    document.execCommand("insertText", false, "@");
  },
};

/** On one line: `#` suggests channels in a `TextField`, from a list Autocomplete filters itself. */
export const SingleLine: Story = {
  render: () => (
    <Surface>
      <Autocomplete
        triggers={[
          {
            char: "#",
            label: "Channels",
            items: ["general", "design-reviews", "launch", "random", "support"].map((name) => ({ value: name, label: name, glyph: "#", insert: `#${name} ` })),
          },
        ]}
      >
        <TextField label="Search messages" placeholder="Try #des" />
      </Autocomplete>
    </Surface>
  ),
};
