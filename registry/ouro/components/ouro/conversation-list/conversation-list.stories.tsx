import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type ReactNode } from "react";
import { Avatar } from "@/registry/ouro/components/ouro/avatar/avatar";
import { Badge } from "@/registry/ouro/components/ouro/badge/badge";
import {
  ConversationList,
  type ConversationListItem,
  type ConversationListSection,
} from "@/registry/ouro/components/ouro/conversation-list/conversation-list";
import { EmojiText, type EmojiCatalogue } from "@/registry/ouro/components/ouro/emoji/emoji";

// Layout here uses inline styles and the theme's CSS variables (shadcn's names).

/** A themed panel. It follows the page's scheme (the `.dark` class on the root). */
function Surface({ children, width = 380 }: { children: ReactNode; width?: number }) {
  return (
    <div
      style={{
        background: "var(--background)",
        color: "var(--foreground)",
        border: "1px solid var(--border)",
        borderRadius: "calc(var(--radius) + 4px)",
        padding: 8,
        maxWidth: width,
      }}
    >
      {children}
    </div>
  );
}

const conversations: ConversationListItem[] = [
  { id: "trail", title: "Trail crew", subtitle: "Weekend hikes", preview: "Meet at the north gate at eight.", time: "9:41", unread: true },
  { id: "ada", title: "Ada Lovelace", preview: "The engine notes are attached.", time: "8:15" },
  { id: "garden", title: "Garden club", preview: "Seed swap moved to Sunday.", time: "Tue", badges: <Badge variant="soft">Muted</Badge> },
  { id: "grace", title: "Grace Hopper", preview: "Found the bug: a moth in relay 70.", time: "Mon", unread: true },
];

function Controlled({ density }: { density?: "comfortable" | "compact" }) {
  const [openId, setOpenId] = useState<string | null>("ada");
  return (
    <Surface>
      <ConversationList label="Conversations" items={conversations} selectedId={openId} onSelect={setOpenId} density={density} />
    </Surface>
  );
}

const meta = {
  title: "Chat/ConversationList",
  component: ConversationList,
  parameters: { layout: "padded" },
  args: { label: "Conversations", items: conversations, selectedId: "ada", onSelect: () => {} },
  argTypes: {
    density: { control: "inline-radio", options: ["comfortable", "compact"] },
  },
} satisfies Meta<typeof ConversationList>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Try every prop. */
export const Playground: Story = {
  render: (args) => (
    <Surface>
      <ConversationList {...args} />
    </Surface>
  ),
};

/** Choose a conversation by click, tap, or the arrow keys and Enter: its row stays highlighted. */
export const Selectable: Story = {
  render: () => <Controlled />,
};

/** `density="compact"` drops the preview line for a narrow sidebar. */
export const Compact: Story = {
  render: () => <Controlled density="compact" />,
};

/** With no conversations, the `empty` message shows. */
export const Empty: Story = {
  render: () => (
    <Surface>
      <ConversationList label="Conversations" items={[]} empty="Start a conversation to see it here." onSelect={() => {}} />
    </Surface>
  ),
};

/** A pin, named for screen readers. */
const pinned = (
  <svg role="img" aria-label="Pinned" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 2.5h4M7 2.5v4L4.5 9h7L9 6.5v-4M8 9v4.5" />
  </svg>
);
/** A bell with a line through it: the conversation's notifications are off. */
const muted = (
  <svg role="img" aria-label="Muted" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4.5 11.5V7a3.5 3.5 0 0 1 6-2.45M11.5 7v4.5h-7M6.5 13.5h3M2.5 2.5l11 11" />
  </svg>
);
const mention = (
  <Badge tone="destructive" role="img" aria-label="Mentions you">
    @
  </Badge>
);

const chatSections: ConversationListSection[] = [
  { id: "pinned", title: "Pinned" },
  { id: "recent", title: "Recent", note: "you posted here lately" },
  { id: "quiet", title: "Quiet", defaultOpen: false },
];

const chats: ConversationListItem[] = [
  { id: "notes", title: "Notes to self", preview: "Bring the slides on Friday.", time: "Mon", icon: pinned, section: "pinned" },
  {
    id: "standup",
    title: "Morning standup",
    preview: "Fen: Shipped the settings page.",
    time: "9:27",
    mark: (
      <Badge tone="warning" variant="outline">
        in 10 min
      </Badge>
    ),
    section: "pinned",
  },
  {
    id: "design",
    title: "Design reviews",
    where: "Lantern Labs",
    preview: "Odile: Can you sign off on the mockups?",
    time: "9:12",
    unread: true,
    mark: mention,
    section: "recent",
  },
  {
    id: "mira",
    title: "Mira Okonkwo",
    avatar: <Avatar name="Mira Okonkwo" alt="" size="sm" />,
    preview: "Thanks, merged. The preview link is in the pull request.",
    time: "8:40",
    unread: true,
    section: "recent",
  },
  {
    id: "offsite",
    title: "Juno, Ravi and Tess",
    preview: "You: See you all at the offsite.",
    time: "Tue",
    section: "recent",
  },
  { id: "pricing", title: "Pricing page", where: "Lantern Labs", preview: "Tobias: Can we move our sync to after lunch?", time: "Mon", icon: muted, section: "quiet" },
  { id: "garden2", title: "Garden club", preview: "Seed swap moved to Sunday.", time: "Sep 30", unread: true, section: "quiet" },
];

function Chats({ filter }: { filter?: "unread" }) {
  const [openId, setOpenId] = useState<string | null>("mira");
  const rows = filter === "unread" ? chats.filter((chat) => chat.unread).map(({ section: _section, ...chat }) => chat) : chats;
  return (
    <Surface width={filter ? 300 : 380}>
      <ConversationList label={filter ? "Unread chats" : "Chats"} items={rows} sections={filter ? undefined : chatSections} selectedId={openId} onSelect={setOpenId} />
    </Surface>
  );
}

/**
 * A chat app's list: sections with headers that open and close (Quiet starts closed, with a dot for its unread
 * row), a channel's team after its title, a pin and a muted bell before titles, a mention and a meeting about to
 * start as each row's mark, and avatars the app passes in. Tab reaches the list once, on the open chat.
 */
export const Sections: Story = {
  render: () => <Chats />,
};

/** The same rows filtered to the unread ones, with no sections, in a narrower list: each row keeps its time and mark, and long previews end in an ellipsis. */
export const Filtered: Story = {
  render: () => <Chats filter="unread" />,
};

// Made-up image emoji, drawn here, for names and messages that hold emoji.
const svg = (body: string) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">${body}</svg>`)}`;
const emoji: EmojiCatalogue = {
  categories: [
    {
      id: "symbols",
      label: "Symbols",
      items: [
        { id: "rocket", name: "Rocket", text: "🚀", src: svg('<path d="M16 3c6 4 8 11 6 18h-12C8 14 10 7 16 3z" fill="#7c5cff"/><circle cx="16" cy="13" r="3" fill="#fff"/><path d="M12 22l-3 6 5-3zm8 0 3 6-5-3z" fill="#e8435a"/>') },
        { id: "party", name: "Party popper", text: "🎉", src: svg('<path d="M5 28 12 9l11 11z" fill="#ffb400"/><circle cx="22" cy="6" r="2" fill="#e8435a"/><circle cx="27" cy="12" r="2" fill="#2bb673"/>') },
        { id: "fern", name: "Fern", text: "🌿", src: svg('<path d="M16 29V5" stroke="#2f7d4f" stroke-width="2"/><path d="M16 10q-6-1-8-5q6 0 8 5zm0 0q6-1 8-5q-6 0-8 5zm0 7q-7-1-10-5q7 0 10 5zm0 0q7-1 10-5q-7 0-10 5z" fill="#4caf73"/>') },
      ],
    },
  ],
};
const drawn = (text: string) => <EmojiText text={text} catalogue={emoji} />;
/** A row whose title and where hold emoji: drawn as pictures, with the name as text beside them. */
const withEmoji = (id: string, name: string, where: string, preview: string, time: string): ConversationListItem => ({
  id,
  name,
  title: drawn(name),
  where: drawn(where),
  preview: drawn(preview),
  time,
  // The avatar's initials come from the name's words, without its emoji.
  avatar: <Avatar name={name.replace(/\s*\p{Extended_Pictographic}/gu, "")} alt="" size="sm" />,
});

/**
 * `title` and `where` take content, as `preview` does: here `EmojiText` draws their emoji as an
 * app's own pictures, while `name` gives the title as text for screen readers.
 */
export const EmojiInTitles: Story = {
  render: () => (
    <Surface>
      <ConversationList
        label="Conversations"
        items={[
          withEmoji("launch", "Launch team 🚀", "Fernwood 🌿", "Shipped the notes 🎉", "9:41"),
          withEmoji("wins", "Friday wins 🎉", "Fernwood", "Three demos today", "Tue"),
          { id: "ada", title: "Ada Lovelace", preview: "The engine notes are attached.", time: "Mon" },
        ]}
        onSelect={() => {}}
      />
    </Surface>
  ),
};
