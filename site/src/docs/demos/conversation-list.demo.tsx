import { useState, type JSX } from "react";
import { Avatar } from "@/registry/ouro/components/ouro/avatar/avatar";
import { ConversationList, type ConversationListItem, type ConversationListSection } from "@/registry/ouro/components/ouro/conversation-list/conversation-list";

// The live demo at the top of docs/conversation-list/: the component as an app would use it, with its props, nothing else.

const sections: ConversationListSection[] = [
  { id: "pinned", title: "Pinned" },
  { id: "recent", title: "Recent" },
];

const conversations: ConversationListItem[] = [
  // A person gets their avatar, a group chat its members, and a channel the square.
  {
    id: "trail",
    title: "Trail crew",
    members: [{ name: "Fen Okafor" }, { name: "Odile Marsh" }, { name: "Ana Lind" }],
    preview: "Fen: Meet at the north gate at eight.",
    time: "9:41",
    unread: true,
    section: "pinned",
  },
  {
    id: "standup",
    title: "Morning standup",
    preview: "Fen: Shipped the settings page.",
    time: "9:27",
    mark: "in 10 min",
    section: "recent",
  },
  { id: "design", title: "Design reviews", where: "Lantern Labs", avatar: <Avatar name="Design reviews" alt="" size="sm" shape="square" />, preview: "Odile: Can you sign off on the mockups?", time: "9:12", section: "recent" },
  { id: "ana", title: "Ana Lind", preview: "The engine notes are attached.", time: "8:15", section: "recent" },
  { id: "halden", title: "Halden", nameTag: "AI agent", avatar: <Avatar name="Halden" alt="" size="sm" shape="agent" />, preview: "I'll post the summary by 4:00.", time: "8:02", section: "recent" },
];

export default function ConversationListDemo(): JSX.Element {
  const [openId, setOpenId] = useState<string | null>("ana");
  // Each row's own menu: right-click it, press it long, or Shift+F10 on it.
  const [read, setRead] = useState<Record<string, boolean>>({});
  const [pinned, setPinned] = useState<Record<string, boolean>>({});
  const items = conversations.map((chat) => {
    const unread = read[chat.id] === undefined ? chat.unread : !read[chat.id];
    const pin = pinned[chat.id] ?? chat.section === "pinned";
    return {
      ...chat,
      unread,
      section: pin ? "pinned" : "recent",
      menu: [
        { label: unread ? "Mark as read" : "Mark as unread", onClick: () => setRead((all) => ({ ...all, [chat.id]: !!unread })) },
        { label: pin ? "Unpin" : "Pin", onClick: () => setPinned((all) => ({ ...all, [chat.id]: !pin })) },
      ],
    };
  });
  return <ConversationList label="Conversations" items={items} sections={sections} selectedId={openId} onSelect={setOpenId} className="max-w-sm" />;
}
