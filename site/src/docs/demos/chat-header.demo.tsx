import { useState, type JSX } from "react";
import { ChatHeader, type ChatMember } from "@/registry/ouro/components/ouro/chat-header/chat-header";
import { SegmentedControl } from "@/registry/ouro/components/ouro/segmented-control/segmented-control";

// The live demo at the top of docs/chat-header/: the component as an app would use it, with its props, nothing else.

const crew: ChatMember[] = [
  { name: "Ana Lind", presence: "available", presenceLabel: "Available", note: "Design" },
  { name: "Grace Hopper", presence: "busy", presenceLabel: "In a meeting", note: "Engineering" },
  { name: "Alan Turing", presence: "away", presenceLabel: "Away", note: "Research" },
  { name: "Katherine Johnson", note: "Flight dynamics" },
];

export default function ChatHeaderDemo(): JSX.Element {
  const [chat, setChat] = useState("group");
  return (
    <div className="grid w-full gap-4">
      <SegmentedControl label="Chat" value={chat} onValueChange={setChat} items={[{ value: "group", label: "Group chat" }, { value: "one", label: "One-to-one" }]} />
      <div className="rounded-lg border border-border bg-background px-4 py-2">
        {chat === "group" ? <ChatHeader title="Launch crew" members={crew} /> : <ChatHeader title="Grace Hopper" members={[crew[1]!]} />}
      </div>
    </div>
  );
}
