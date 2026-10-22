import { BriefingCard } from "@/components/ouro/briefing-card/briefing-card";

// expect: data-ouro="briefing-card"
// expect: <dt[^>]*>Chat</dt>
// expect: Ouro briefing
export default function BriefingCardSection() {
  return <BriefingCard title="Ouro briefing" status="Needs you" statusTone="warning" items={[{ id: "chat", label: "Chat", content: "2 new" }]} />;
}
