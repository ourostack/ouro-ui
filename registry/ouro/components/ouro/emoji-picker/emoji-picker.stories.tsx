import type { Meta, StoryObj } from "@storybook/react-vite";
import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import {
  EmojiPicker,
  type EmojiPickerCategory,
  type EmojiPickerEmoji,
  type EmojiSkinTone,
} from "@/registry/ouro/components/ouro/emoji-picker/emoji-picker";

// Layout here uses inline styles and the theme's CSS variables (shadcn's names). The emoji are a
// small sample of Unicode's, with their names; an app passes its full set.

const e = (emoji: string, name: string, keywords: string[] = [], skinTones?: boolean): EmojiPickerEmoji => ({ emoji, name, keywords, skinTones });

const categories: EmojiPickerCategory[] = [
  {
    label: "Smileys",
    emoji: [
      e("😀", "grinning face", ["smile", "happy"]),
      e("😄", "grinning face with smiling eyes", ["laugh", "happy"]),
      e("😂", "face with tears of joy", ["laugh", "lol"]),
      e("🙂", "slightly smiling face", ["smile"]),
      e("😉", "winking face", ["wink"]),
      e("😍", "smiling face with heart-eyes", ["love"]),
      e("🤔", "thinking face", ["hmm", "think"]),
      e("😮", "face with open mouth", ["surprised", "wow"]),
      e("😎", "smiling face with sunglasses", ["cool"]),
      e("🥳", "partying face", ["party", "celebrate"]),
      e("😴", "sleeping face", ["tired", "zzz"]),
      e("😢", "crying face", ["sad", "tear"]),
      e("😡", "enraged face", ["angry"]),
      e("🙃", "upside-down face", ["silly"]),
      e("😅", "grinning face with sweat", ["phew", "relief"]),
      e("🤩", "star-struck", ["wow", "amazing"]),
    ],
  },
  {
    label: "People",
    emoji: [
      e("👍", "thumbs up", ["like", "yes", "approve"], true),
      e("👎", "thumbs down", ["no", "dislike"], true),
      e("👏", "clapping hands", ["applause", "congrats"], true),
      e("🙌", "raising hands", ["hooray", "celebrate"], true),
      e("👋", "waving hand", ["hello", "bye", "wave"], true),
      e("🙏", "folded hands", ["please", "thanks"], true),
      e("💪", "flexed biceps", ["strong"], true),
      e("✌️", "victory hand", ["peace"], true),
      e("👀", "eyes", ["look", "see"]),
      e("🧑‍💻", "technologist", ["coder", "developer"], true),
      e("🧑‍🍳", "cook", ["chef"], true),
      e("🤝", "handshake", ["deal", "agreement"]),
    ],
  },
  {
    label: "Animals and nature",
    emoji: [
      e("🐶", "dog face", ["puppy", "pet"]),
      e("🐱", "cat face", ["kitten", "pet"]),
      e("🦊", "fox", []),
      e("🐼", "panda", []),
      e("🐢", "turtle", ["slow"]),
      e("🐙", "octopus", []),
      e("🌸", "cherry blossom", ["flower", "spring"]),
      e("🌻", "sunflower", ["flower"]),
      e("🌵", "cactus", ["desert"]),
      e("🍀", "four leaf clover", ["luck"]),
    ],
  },
  {
    label: "Food and drink",
    emoji: [
      e("☕", "hot beverage", ["coffee", "tea"]),
      e("🍕", "pizza", ["food"]),
      e("🌮", "taco", ["food"]),
      e("🍣", "sushi", ["food"]),
      e("🍰", "shortcake", ["cake", "dessert"]),
      e("🎂", "birthday cake", ["celebrate", "party"]),
      e("🍩", "doughnut", ["donut", "dessert"]),
      e("🥐", "croissant", ["breakfast", "café"]),
      e("🍎", "red apple", ["fruit"]),
      e("🍋", "lemon", ["fruit"]),
    ],
  },
  {
    label: "Activities",
    emoji: [
      e("🎉", "party popper", ["celebrate", "tada"]),
      e("🎈", "balloon", ["party"]),
      e("🏆", "trophy", ["win", "prize"]),
      e("⚽", "soccer ball", ["football"]),
      e("🎮", "video game", ["gaming"]),
      e("🎨", "artist palette", ["art", "paint"]),
      e("🎵", "musical note", ["music"]),
      e("🚀", "rocket", ["launch", "ship"]),
    ],
  },
  {
    label: "Symbols",
    emoji: [
      e("❤️", "red heart", ["love"]),
      e("💯", "hundred points", ["perfect", "score"]),
      e("✅", "check mark button", ["done", "yes"]),
      e("❌", "cross mark", ["no", "wrong"]),
      e("⭐", "star", ["favorite"]),
      e("🔥", "fire", ["hot", "lit"]),
      e("✨", "sparkles", ["shiny", "new"]),
      e("💡", "light bulb", ["idea"]),
      e("❓", "red question mark", ["question"]),
    ],
  },
];

const find = (emoji: string) => categories.flatMap((category) => category.emoji).find((item) => item.emoji === emoji)!;
const quick = ["👍", "❤️", "😂", "😮", "😢", "🎉"].map(find);
const frequent = ["🚀", "✅", "☕", "🙏", "🔥", "👀", "💡", "😄"].map(find);

const row: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" };
const caption: CSSProperties = { fontSize: "14px", lineHeight: "20px", color: "var(--muted-foreground)" };

/** A 16px smiling face, the trigger's icon. */
function SmileIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" width="16" height="16">
      <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5.5 9.5c.6.9 1.5 1.5 2.5 1.5s1.9-.6 2.5-1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="6" cy="6.5" r=".9" fill="currentColor" />
      <circle cx="10" cy="6.5" r=".9" fill="currentColor" />
    </svg>
  );
}

function Picked({ children }: { children: ReactNode }) {
  return <span style={caption}>{children}</span>;
}

const meta = {
  title: "Chat/EmojiPicker",
  component: EmojiPicker,
  parameters: { layout: "centered" },
  args: {
    label: "Add a reaction",
    categories,
    trigger: (
      <Button variant="soft" tone="secondary" aria-label="Add a reaction">
        <SmileIcon />
      </Button>
    ),
    onSelect: () => {},
  },
  argTypes: {
    presentation: { control: "inline-radio", options: ["auto", "popover", "sheet"] },
    side: { control: "inline-radio", options: ["top", "bottom", "left", "right"] },
    align: { control: "inline-radio", options: ["start", "center", "end"] },
    categories: { control: false },
    frequent: { control: false },
    quick: { control: false },
    trigger: { table: { disable: true } },
  },
} satisfies Meta<typeof EmojiPicker>;

export default meta;
type Story = StoryObj<typeof meta>;

/** For reactions: the quick row and the frequently used emoji the app supplies, then every category. Choosing one closes the picker. */
export const Reactions: Story = {
  render: function Render(args) {
    const [chosen, setChosen] = useState("nothing yet");
    return (
      <div style={row}>
        <EmojiPicker {...args} quick={quick} frequent={frequent} onSelect={(selection) => setChosen(`${selection.emoji} ${selection.name}`)} />
        <Picked>Reacted with {chosen}</Picked>
      </div>
    );
  },
};

/** For text: a controlled picker on the app's own button that adds the chosen emoji to a draft. */
export const InsertIntoText: Story = {
  parameters: { plainOpeners: ["Insert emoji"] },
  render: function Render(args) {
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState("Shipping the release notes today");
    const anchor = useRef<HTMLButtonElement>(null);
    return (
      <div style={row}>
        <Picked>{draft}</Picked>
        <Button ref={anchor} variant="soft" tone="secondary" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
          Insert emoji
        </Button>
        <EmojiPicker
          label="Insert emoji"
          categories={args.categories}
          frequent={frequent}
          side="top"
          open={open}
          onOpenChange={setOpen}
          anchor={anchor}
          onSelect={(selection) => setDraft((text) => `${text} ${selection.emoji}`)}
        />
      </div>
    );
  },
};

/** `skinTone` and `onSkinToneChange` let the app keep the person's skin tone, in its own settings. */
export const SkinTone: Story = {
  render: function Render(args) {
    const [tone, setTone] = useState<EmojiSkinTone>("medium");
    return (
      <div style={row}>
        <EmojiPicker {...args} skinTone={tone} onSkinToneChange={setTone} />
        <Picked>Kept skin tone: {tone}</Picked>
      </div>
    );
  },
};

/** `presentation="sheet"` is a bottom sheet at every width; `auto`, the default, is one only below 640px. */
export const Sheet: Story = {
  args: { presentation: "sheet", quick },
};

/** Resolves with what `find` returns once it returns something, checking once a frame (a play function's wait). */
async function frameUntil<T>(find: () => T | null | undefined): Promise<T> {
  for (let frame = 0; frame < 600; frame++) {
    const found = find();
    if (found) return found;
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
  throw new Error("the story never reached the state it shows");
}

/** The skin tone choice, open: the story opens the picker and presses the skin tone button. */
export const ChoosingSkinTone: Story = {
  args: { quick },
  play: async ({ canvasElement }) => {
    const page = canvasElement.ownerDocument;
    (await frameUntil(() => canvasElement.querySelector("button"))).click();
    (await frameUntil(() => page.querySelector<HTMLButtonElement>('[data-ouro-part="skin-tone"]'))).click();
    await frameUntil(() => page.querySelector('[role="radiogroup"]'));
  },
};
