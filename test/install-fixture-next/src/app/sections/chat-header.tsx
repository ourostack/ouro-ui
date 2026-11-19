import { ChatHeader } from "@/components/ouro/chat-header/chat-header";

// expect: data-ouro="chat-header"
// expect: Ouro crew
// expect: Ana Lind and Grace Hopper
export default function ChatHeaderSection() {
  return <ChatHeader title="Ouro crew" members={[{ name: "Ana Lind" }, { name: "Grace Hopper", presence: "busy", presenceLabel: "Busy" }]} />;
}
