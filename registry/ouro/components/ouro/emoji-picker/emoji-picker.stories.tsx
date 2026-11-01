import type { Meta, StoryObj } from "@storybook/react-vite";
import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import type { EmojiCatalogue, EmojiItem } from "@/registry/ouro/components/ouro/emoji/emoji";
import {
  EmojiPicker,
  type EmojiPickerCategory,
  type EmojiPickerEmoji,
  type EmojiPickerSelection,
  type EmojiPickerWithTriggerProps,
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

// A made-up image catalogue for the `catalogue` stories: simple emoji drawn here as SVG, a few animated (SMIL), one with skin tones,
// and a custom category an organization would add. An app passes its own set.
const svg = (body: string) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">${body}</svg>`)}`;
const wobble = '<animateTransform attributeName="transform" type="rotate" values="-10 16 16;10 16 16;-10 16 16" dur="0.9s" repeatCount="indefinite"/>';
const ink = "#5b3a1e";
const face = (mouth: string, extra = "") => `<circle cx="16" cy="16" r="14" fill="#ffc83d"/><circle cx="11" cy="13" r="2" fill="${ink}"/><circle cx="21" cy="13" r="2" fill="${ink}"/>${mouth}${extra}`;
const smile = `<path d="M10 19q6 6 12 0" stroke="${ink}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`;
const drawings: Record<string, string> = {
  smile: face(smile),
  laugh: face(`<path d="M9 18h14q-1 8-7 8t-7-8z" fill="${ink}"/>`),
  wow: face(`<ellipse cx="16" cy="22" rx="3" ry="3.6" fill="${ink}"/>`),
  sad: face(`<path d="M11 23q5-5 10 0" stroke="${ink}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`, '<path d="M22 16q2 4 0 5q-2-1 0-5z" fill="#4aa8ff"/>'),
  heart: '<path d="M16 28C6 20 3 15 3 10.5a6.5 6.5 0 0 1 13-2a6.5 6.5 0 0 1 13 2C29 15 26 20 16 28z" fill="#e8435a"/>',
  star: '<path d="m16 3 3.9 8.2 9 1.1-6.6 6.2 1.7 8.9L16 23l-8 4.4 1.7-8.9-6.6-6.2 9-1.1z" fill="#ffb400"/>',
  party: '<path d="M5 28 12 9l11 11z" fill="#7c5cff"/><circle cx="22" cy="6" r="2" fill="#e8435a"/><circle cx="27" cy="12" r="2" fill="#2bb673"/><circle cx="17" cy="4" r="1.6" fill="#ffb400"/>',
  check: '<rect x="3" y="3" width="26" height="26" rx="7" fill="#2bb673"/><path d="m9 16.5 4.5 4.5L23 11" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  fern: '<path d="M16 29V5" stroke="#2f7d4f" stroke-width="2" stroke-linecap="round"/><path d="M16 9q-6-1-8-5q6 0 8 5zm0 0q6-1 8-5q-6 0-8 5zm0 6q-7-1-10-5q7 0 10 5zm0 0q7-1 10-5q-7 0-10 5zm0 6q-7-1-10-5q7 0 10 5zm0 0q7-1 10-5q-7 0-10 5z" fill="#4caf73"/>',
  mug: '<path d="M6 10h16v12a5 5 0 0 1-5 5h-6a5 5 0 0 1-5-5z" fill="#b5651d"/><path d="M22 13h2a4 4 0 0 1 0 8h-2" stroke="#b5651d" stroke-width="2.4" fill="none"/><path d="M10 4q2 2 0 4m5-4q2 2 0 4" stroke="#9aa0a6" stroke-width="1.6" fill="none" stroke-linecap="round"/>',
};
const hand = (fill: string) =>
  `<g fill="${fill}" stroke="${ink}" stroke-width="0.8"><rect x="8.5" y="4" width="3.4" height="14" rx="1.7"/><rect x="12.4" y="2.5" width="3.4" height="15" rx="1.7"/><rect x="16.3" y="3" width="3.4" height="15" rx="1.7"/><rect x="20.2" y="5" width="3.2" height="13" rx="1.6"/><rect x="3.5" y="13" width="9" height="3.6" rx="1.8" transform="rotate(35 8 15)"/><rect x="8.5" y="12" width="15" height="17" rx="6"/></g>`;
const tones = ["#f7dece", "#e0bb95", "#bf8f68", "#9b643d", "#594539"];
const still = (name: string) => svg(drawings[name]!);
const animated = (body: string) => svg(`<g>${body}${wobble}</g>`);
const image = (id: string, name: string, shortcodes: string[], keywords: string[], extra: Partial<EmojiItem> = {}): EmojiItem => ({ id, name, shortcodes, keywords, src: still(id), ...extra });
const wave: EmojiItem = {
  id: "wave",
  name: "Waving hand",
  shortcodes: ["wave"],
  keywords: ["hello", "bye"],
  text: "👋",
  src: svg(hand("#ffc83d")),
  animatedSrc: animated(hand("#ffc83d")),
  skinTones: tones.map((fill, index) => ({ id: `wave-tone${index + 1}`, src: svg(hand(fill)), animatedSrc: animated(hand(fill)) })),
};
const imageCatalogue: EmojiCatalogue = {
  categories: [
    {
      id: "smileys",
      label: "Smileys",
      items: [
        image("smile", "Smiling face", ["smile"], ["happy"], { text: "🙂", animatedSrc: animated(drawings.smile!) }),
        image("laugh", "Laughing face", ["laugh", "lol"], ["funny"], { text: "😆", animatedSrc: animated(drawings.laugh!) }),
        image("wow", "Surprised face", ["wow"], ["amazed"], { text: "😮" }),
        image("sad", "Sad face", ["sad"], ["tear"], { text: "😢" }),
        wave,
      ],
    },
    {
      id: "symbols",
      label: "Symbols",
      items: [
        image("heart", "Red heart", ["heart"], ["love"], { text: "❤️", animatedSrc: animated(drawings.heart!) }),
        image("star", "Star", ["star"], ["favorite"], { text: "⭐" }),
        image("party", "Party popper", ["party", "tada"], ["celebrate"], { text: "🎉", animatedSrc: animated(drawings.party!) }),
        image("check", "Check mark", ["check", "done"], ["yes"], { text: "✅" }),
      ],
    },
    {
      id: "custom",
      label: "Fernwood",
      items: [image("fern", "Fernwood fern", ["fern"], ["team", "logo"], { custom: true }), image("mug", "Team coffee", ["coffee_time"], ["break"], { custom: true })],
    },
  ],
};

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
/** The meta's args, which offer the platform's emoji by category. */
type UnicodeArgs = EmojiPickerWithTriggerProps;

/** For reactions: the quick row and the frequently used emoji the app supplies, then every category. Choosing one closes the picker. */
export const Reactions: Story = {
  render: function Render(args) {
    const [chosen, setChosen] = useState("nothing yet");
    return (
      <div style={row}>
        <EmojiPicker {...(args as UnicodeArgs)} quick={quick} frequent={frequent} onSelect={(selection: EmojiPickerSelection) => setChosen(`${selection.emoji} ${selection.name}`)} />
        <Picked>Reacted with {chosen}</Picked>
      </div>
    );
  },
};

/** For text: a controlled picker on the app's own button that adds the chosen emoji to a draft. */
export const InsertIntoText: Story = {
  parameters: { plainOpeners: ["Insert emoji"] },
  render: function Render() {
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
          categories={categories}
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

/**
 * With `catalogue`: the app's own emoji as images (a standard set and an organization's custom
 * emoji in a category of its own), never the platform's emoji font. Frequently used and quick
 * emoji go by id, and `onSelect` gets the `:shortcode:` token to put into text.
 */
export const ImageCatalogue: Story = {
  render: function Render(args) {
    const [chosen, setChosen] = useState("nothing yet");
    const [recent, setRecent] = useState(["party", "fern", "heart"]);
    return (
      <div style={row}>
        <EmojiPicker
          label="Add a reaction"
          trigger={args.trigger!}
          presentation={args.presentation}
          catalogue={imageCatalogue}
          quick={["smile", "laugh", "heart", "party", "wow", "sad"]}
          frequent={recent}
          onSelect={(selection) => {
            setChosen(`${selection.name} (${selection.token})`);
            setRecent((ids) => [selection.id, ...ids.filter((id) => id !== selection.id)].slice(0, 8));
          }}
        />
        <Picked>Reacted with {chosen}</Picked>
      </div>
    );
  },
};

/** The image catalogue in its skin tone choice, open. */
export const ImageCatalogueSkinTone: Story = {
  render: (args) => <EmojiPicker label="Add a reaction" trigger={args.trigger!} catalogue={imageCatalogue} quick={["wave", "heart", "party"]} onSelect={() => {}} />,
  play: ChoosingSkinTone.play!,
};
