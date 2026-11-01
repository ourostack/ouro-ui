import { useState, type JSX } from "react";
import { Avatar } from "@/registry/ouro/components/ouro/avatar/avatar";
import { ConversationList, type ConversationListItem, type ConversationListSection } from "@/registry/ouro/components/ouro/conversation-list/conversation-list";

// The live demo at the top of docs/conversation-list/: the component as an app would use it, with its props, nothing else.

const sections: ConversationListSection[] = [
  { id: "pinned", title: "Pinned" },
  { id: "recent", title: "Recent" },
];

const conversations: ConversationListItem[] = [
  { id: "trail", title: "Trail crew", preview: "Meet at the north gate at eight.", time: "9:41", unread: true, section: "pinned" },
  {
    id: "standup",
    title: "Morning standup",
    preview: "Fen: Shipped the settings page.",
    time: "9:27",
    mark: "in 10 min",
    section: "recent",
  },
  { id: "design", title: "Design reviews", where: "Lantern Labs", preview: "Odile: Can you sign off on the mockups?", time: "9:12", section: "recent" },
  { id: "ada", title: "Ada Lovelace", preview: "The engine notes are attached.", time: "8:15", section: "recent" },
  { id: "halden", title: "Halden", nameTag: "AI agent", avatar: <Avatar name="Halden" alt="" size="sm" shape="hexagon" color="neutral" />, preview: "I'll post the summary by 4:00.", time: "8:02", section: "recent" },
];

export default function ConversationListDemo(): JSX.Element {
  const [openId, setOpenId] = useState<string | null>("ada");
  return <ConversationList label="Conversations" items={conversations} sections={sections} selectedId={openId} onSelect={setOpenId} className="max-w-sm" />;
}
