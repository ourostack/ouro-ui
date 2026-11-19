// What agents write with chat-header: snippets whose cases are in chat-header.cases.ts.
import { ChatHeader } from "@/registry/ouro/components/ouro/chat-header/chat-header";

export const chatHeader01 = <ChatHeader title="Crew" members={[]} participants={[{ name: "Ana Lind" }]} />;
export const chatHeader02 = <ChatHeader title="Crew" members={[{ name: "Ana Lind" }]} description="Planning the voyage" />;
export const chatHeader03 = <ChatHeader title="Crew" members={[{ name: "Ana Lind" }]} level={4} />;
export const chatHeader04 = <ChatHeader title="Crew" members={[]} />;
export const chatHeaderOk01 = <ChatHeader title="Launch crew" members={[{ name: "Ana Lind", src: "/ana.jpg", presence: "busy", presenceLabel: "In a meeting", note: "Design" }, { name: "Grace Hopper" }]} avatar="/crew.jpg" subtitle="Planning" actions={null} onBack={() => {}} backLabel="Chats" level={3} othersLabel={(names) => names.join(", ")} membersLabel={(count) => `${count} people`} membersTitle="People" className="px-4" />;
