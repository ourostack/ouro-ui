// What agents write with briefing-card: snippets whose cases are in briefing-card.cases.ts.
import { BriefingCard } from "@/registry/ouro/components/ouro/briefing-card/briefing-card";

export const briefingCard01 = <BriefingCard title="Weekly sync" items={[]} sections="chat" />;
export const briefingCardOk01 = <BriefingCard title="Weekly sync" detail="In 25 min" status="Needs you" statusTone="warning" items={[{ id: "chat", label: "Chat", content: "2 new" }]} note={null} actions={null} headingLevel={2} className="mt-2" />;
