import { useState, type JSX } from "react";
import { ConversationList, type ConversationListItem } from "@/registry/ouro/components/ouro/conversation-list/conversation-list";

// The live demo at the top of docs/conversation-list/: the component as an app would use it, with its props, nothing else.

const conversations: ConversationListItem[] = [
  { id: "trail", title: "Trail crew", subtitle: "Weekend hikes", preview: "Meet at the north gate at eight.", time: "9:41", unread: true },
  { id: "ada", title: "Ada Lovelace", preview: "The engine notes are attached.", time: "8:15" },
  { id: "garden", title: "Garden club", preview: "Seed swap moved to Sunday.", time: "Tue" },
];

export default function ConversationListDemo(): JSX.Element {
  const [openId, setOpenId] = useState<string | null>("ada");
  return <ConversationList label="Conversations" items={conversations} selectedId={openId} onSelect={setOpenId} className="max-w-sm" />;
}
