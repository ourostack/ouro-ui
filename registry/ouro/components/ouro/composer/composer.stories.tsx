import type { Meta, StoryObj } from "@storybook/react-vite";
import { useRef, useState, type ReactNode, type SVGProps } from "react";
import { Autocomplete } from "@/registry/ouro/components/ouro/autocomplete/autocomplete";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Composer } from "@/registry/ouro/components/ouro/composer/composer";
import { EmojiText, type EmojiCatalogue, type EmojiItem } from "@/registry/ouro/components/ouro/emoji/emoji";
import { EmojiPicker, type EmojiSkinTone } from "@/registry/ouro/components/ouro/emoji-picker/emoji-picker";
import { Attachment } from "@/registry/ouro/components/ouro/message/attachment";
import type { TextAreaHighlight } from "@/registry/ouro/components/ouro/text-field/text-area";
import { Toggle } from "@/registry/ouro/components/ouro/toggle/toggle";

// Layout here uses inline styles and the theme's CSS variables (shadcn's names).

/** A themed panel, the width of a chat pane. It follows the page's scheme (the `.dark` class on the root). */
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
        gap: 16,
        maxWidth: 640,
      }}
    >
      {children}
    </div>
  );
}

/** The messages sent so far, so a story shows what Send did. */
function Sent({ messages }: { messages: string[] }) {
  if (messages.length === 0) return null;
  return (
    <ol aria-label="Sent" style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 8, justifyItems: "end" }}>
      {messages.map((message, index) => (
        <li key={index} style={{ background: "var(--muted)", borderRadius: "calc(var(--radius) + 4px)", padding: "6px 12px", whiteSpace: "pre-wrap", maxWidth: "80%" }}>
          {message}
        </li>
      ))}
    </ol>
  );
}

const icon = (path: ReactNode) =>
  function Icon(props: SVGProps<SVGSVGElement>) {
    return (
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="20" height="20" {...props}>
        {path}
      </svg>
    );
  };
const FormatIcon = icon(<path d="M3 15.5 7.5 4.5h1L13 15.5M4.6 11.5h6.8M14 15.5c0-2 .8-3 2.5-3s1.5 1 1.5 3" />);
const EmojiIcon = icon(
  <>
    <circle cx="10" cy="10" r="7" />
    <path d="M7 11.8c.7 1 1.7 1.5 3 1.5s2.3-.5 3-1.5" />
    <path d="M7.5 8h.01M12.5 8h.01" strokeWidth="2" />
  </>,
);
const AttachIcon = icon(<path d="m15.5 9.5-5.6 5.6a3.5 3.5 0 0 1-5-5l6-6a2.3 2.3 0 0 1 3.3 3.3l-6 6a1.2 1.2 0 0 1-1.7-1.7l5.5-5.5" />);
const BoldIcon = icon(<path d="M6 4h5a3 3 0 0 1 0 6H6zM6 10h6a3 3 0 0 1 0 6H6z" />);
const ItalicIcon = icon(<path d="M12 4H8.5M11.5 16H8M11 4 9 16" />);
const ListIcon = icon(<path d="M8 6h8M8 10h8M8 14h8M4.5 6h.01M4.5 10h.01M4.5 14h.01" strokeWidth="1.75" />);

// A made-up image catalogue for the emoji story: simple emoji drawn here as SVG, a few animated (SMIL), one with skin tones,
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
const emoji = (id: string, name: string, shortcodes: string[], keywords: string[], extra: Partial<EmojiItem> = {}): EmojiItem => ({ id, name, shortcodes, keywords, src: still(id), ...extra });
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
// A filmstrip: square frames stacked top to bottom, stepped through at its fps while it plays.
const eyes = {
  open: `<circle cx="11" cy="13" r="2" fill="${ink}"/><circle cx="21" cy="13" r="2" fill="${ink}"/>`,
  half: `<ellipse cx="11" cy="13.5" rx="2.2" ry="1" fill="${ink}"/><ellipse cx="21" cy="13.5" rx="2.2" ry="1" fill="${ink}"/>`,
  shut: `<path d="M8.8 13.5h4.4M18.8 13.5h4.4" stroke="${ink}" stroke-width="1.8" stroke-linecap="round"/>`,
};
const blinkFrame = (open: string, top: number) => `<g transform="translate(0 ${top})"><circle cx="16" cy="16" r="14" fill="#ffc83d"/>${open}${smile}</g>`;
const blinkFrames = [eyes.open, eyes.open, eyes.open, eyes.half, eyes.shut, eyes.half];
const blink: EmojiItem = {
  id: "blink",
  name: "Blinking face",
  shortcodes: ["blink"],
  keywords: ["sleepy"],
  width: 32,
  height: 32,
  src: svg(blinkFrame(eyes.open, 0)),
  filmstrip: {
    src: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="${32 * blinkFrames.length}" viewBox="0 0 32 ${32 * blinkFrames.length}">${blinkFrames.map((open, index) => blinkFrame(open, index * 32)).join("")}</svg>`)}`,
    fps: 8,
  },
};
const catalogue: EmojiCatalogue = {
  categories: [
    {
      id: "smileys",
      label: "Smileys",
      items: [
        emoji("smile", "Smiling face", ["smile"], ["happy"], { text: "🙂", animatedSrc: animated(drawings.smile!) }),
        emoji("laugh", "Laughing face", ["laugh", "lol"], ["funny"], { text: "😆", animatedSrc: animated(drawings.laugh!) }),
        emoji("wow", "Surprised face", ["wow"], ["amazed"], { text: "😮" }),
        emoji("sad", "Sad face", ["sad"], ["tear"], { text: "😢" }),
        wave,
        blink,
      ],
    },
    {
      id: "symbols",
      label: "Symbols",
      items: [
        emoji("heart", "Red heart", ["heart"], ["love"], { text: "❤️", animatedSrc: animated(drawings.heart!) }),
        emoji("star", "Star", ["star"], ["favorite"], { text: "⭐" }),
        emoji("party", "Party popper", ["party", "tada"], ["celebrate"], { text: "🎉", animatedSrc: animated(drawings.party!) }),
        emoji("check", "Check mark", ["check", "done"], ["yes"], { text: "✅" }),
      ],
    },
    {
      id: "custom",
      label: "Fernwood",
      items: [emoji("fern", "Fernwood fern", ["fern"], ["team", "logo"], { custom: true }), emoji("mug", "Team coffee", ["coffee_time"], ["break"], { custom: true })],
    },
  ],
};

/** A smiling face, the emoji button's icon. */
function SmileIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" width="20" height="20" {...props}>
      <circle cx="10" cy="10" r="7.25" />
      <path d="M7 11.5c.7 1 1.8 1.6 3 1.6s2.3-.6 3-1.6" />
      <path d="M7.5 8h.01M12.5 8h.01" strokeWidth="2" />
    </svg>
  );
}

function EmojiTokensStory() {
  const [text, setText] = useState("");
  const [sent, setSent] = useState(["Release notes are out :party: thanks all", ":heart: :fern:"]);
  const [open, setOpen] = useState(false);
  // The person's skin tone, kept in one place: the picker sets it, and both insert in it.
  const [tone, setTone] = useState<EmojiSkinTone>("default");
  const box = useRef<HTMLTextAreaElement>(null);
  const anchor = useRef<HTMLButtonElement>(null);
  return (
    <Surface>
      <ol aria-label="Sent" style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 8, justifyItems: "end" }}>
        {sent.map((message, index) => (
          <li key={index} style={{ background: "var(--muted)", borderRadius: "calc(var(--radius) + 4px)", padding: "6px 12px", whiteSpace: "pre-wrap", maxWidth: "80%" }}>
            <EmojiText text={message} catalogue={catalogue} enlarge />
          </li>
        ))}
      </ol>
      <Autocomplete triggers={[{ char: ":", label: "Emoji", minQueryLength: 2, catalogue, skinTone: tone }]}>
        <Composer
          ref={box}
          label="Message the release team"
          placeholder="Type : and two letters for emoji"
          value={text}
          onValueChange={setText}
          onSend={(message) => {
            setSent((list) => [...list, message]);
            setText("");
          }}
          actions={
            <Button ref={anchor} variant="plain" tone="secondary" aria-label="Insert emoji" aria-expanded={open} onClick={() => setOpen(!open)}>
              <SmileIcon />
            </Button>
          }
        />
      </Autocomplete>
      <EmojiPicker
        label="Insert emoji"
        catalogue={catalogue}
        skinTone={tone}
        onSkinToneChange={setTone}
        open={open}
        onOpenChange={setOpen}
        anchor={anchor}
        side="top"
        align="end"
        onSelect={(selection) => {
          const { selectionStart, selectionEnd } = box.current!;
          setText((current) => `${current.slice(0, selectionStart)}${selection.token}${current.slice(selectionEnd)}`);
        }}
      />
    </Surface>
  );
}

const meta = {
  title: "Chat/Composer",
  component: Composer,
  parameters: { layout: "padded" },
  args: { label: "Message Mia", placeholder: "Write a message", onSend: () => {} },
  argTypes: {
    sendOn: { control: "inline-radio", options: ["enter", "mod-enter"] },
    sending: { control: "boolean" },
    disabled: { control: "boolean" },
    sendDisabledReason: { control: "text" },
    description: { control: "text" },
  },
} satisfies Meta<typeof Composer>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Try every prop. */
export const Playground: Story = {
  render: (args) => (
    <Surface>
      <Composer {...args} />
    </Surface>
  ),
};

function Chat() {
  const [messages, setMessages] = useState<string[]>([]);
  return (
    <Surface>
      <Sent messages={messages} />
      <Composer label="Message Mia" placeholder="Write a message" onSend={(text) => setMessages([...messages, text])} />
    </Surface>
  );
}

/** One line that grows as you write. Enter sends and Shift+Enter starts a new line; after a send the box clears. */
export const Basic: Story = {
  render: () => <Chat />,
};

const draft = "Thanks for the notes. I can bring the sourdough starter on Saturday morning.";
const suggested: TextAreaHighlight[] = [{ start: 0, end: 21, label: "Suggested by your assistant", id: "thanks" }, { start: 34, end: 55, label: "Suggested by your assistant", id: "starter" }];

function Suggestions() {
  const [text, setText] = useState(draft);
  const [highlights, setHighlights] = useState(suggested);
  const [messages, setMessages] = useState<string[]>([]);
  return (
    <Surface>
      <Sent messages={messages} />
      <Composer
        label="Reply to Mia"
        value={text}
        onValueChange={setText}
        highlights={highlights}
        onHighlightsChange={setHighlights}
        description="Your assistant's suggestions are underlined. Edit them like any other words."
        onSend={(sent) => {
          setMessages([...messages, sent]);
          setText("");
          setHighlights([]);
        }}
      />
    </Surface>
  );
}

/**
 * Words an assistant suggested, marked in the person's draft. The marks follow their words
 * as the person edits; what the person types is never marked, and screen readers hear the
 * marks in the box's description.
 */
export const Suggested: Story = {
  render: () => <Suggestions />,
};

function Tools() {
  const [formatting, setFormatting] = useState(true);
  const [files, setFiles] = useState(["proofing-times.pdf", "crumb.jpg"]);
  return (
    <Surface>
      <Composer
        label="New post in Bakers"
        placeholder="Start a post"
        onSend={() => setFiles([])}
        toolbar={
          formatting && (
            <>
              <Toggle label="Bold" icon={BoldIcon} hideLabel size="sm" />
              <Toggle label="Italic" icon={ItalicIcon} hideLabel size="sm" />
              <Toggle label="Bulleted list" icon={ListIcon} hideLabel size="sm" />
            </>
          )
        }
        actions={
          <>
            <Toggle label="Formatting" icon={FormatIcon} hideLabel pressed={formatting} onPressedChange={setFormatting} />
            <Button variant="plain" tone="secondary" aria-label="Emoji" className="px-2">
              <EmojiIcon aria-hidden="true" />
            </Button>
            <Button variant="plain" tone="secondary" aria-label="Attach a file" className="px-2" onClick={() => setFiles([...files, `notes-${files.length + 1}.txt`])}>
              <AttachIcon aria-hidden="true" />
            </Button>
          </>
        }
        attachments={files.map((file) => (
          <Attachment key={file} name={file} contentType={file.endsWith(".jpg") ? "image/jpeg" : undefined} onRemove={() => setFiles(files.filter((other) => other !== file))} />
        ))}
      />
    </Surface>
  );
}

/**
 * The rest of a composer in the same frame: actions before Send, a formatting bar above the
 * text while Formatting is on, and the files waiting to go under it.
 */
export const WithTools: Story = {
  render: () => <Tools />,
};

/** Sending is off and says why; the person can still write. Enter says the reason again. */
export const SendingOff: Story = {
  render: () => (
    <Surface>
      <Composer label="Reply to Mia" defaultValue="See you Saturday" sendDisabledReason="Sending is off while you review your assistant's draft." onSend={() => {}} />
    </Surface>
  ),
};

/** On its way: the send button shows a spinner, and nothing more sends until it is done. */
export const Sending: Story = {
  render: () => (
    <Surface>
      <Composer label="Reply to Mia" defaultValue="See you Saturday" sending onSend={() => {}} />
    </Surface>
  ),
};

/** For long messages: Enter starts a new line and Ctrl+Enter (Command+Enter on a Mac) sends. */
export const ModEnter: Story = {
  render: () => (
    <Surface>
      <Composer label="Write an update" sendOn="mod-enter" rows={3} placeholder="Write an update" description="Ctrl+Enter to send" onSend={() => {}} />
    </Surface>
  ),
};

/** Disabled: neither the box nor Send takes input. */
export const Disabled: Story = {
  render: () => (
    <Surface>
      <Composer label="Message Mia" placeholder="You left this chat" disabled onSend={() => {}} />
    </Surface>
  ),
};

/**
 * Emoji from an image catalogue go into the text as `:shortcode:` tokens: type `:` and two
 * letters for suggestions, or pick one from the emoji button. The sent messages draw the
 * tokens as the catalogue's images with `EmojiText`. A skin tone chosen in the picker is the
 * one the suggestions insert too, since both take the same `skinTone`.
 */
export const EmojiTokens: Story = {
  parameters: { plainOpeners: ["Insert emoji"] },
  render: () => <EmojiTokensStory />,
};
