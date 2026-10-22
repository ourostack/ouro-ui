// What agents write with attention-card: snippets whose cases are in attention-card.cases.ts.
import { AttentionCard } from "@/registry/ouro/components/ouro/attention-card/attention-card";

export const attentionCard01 = <AttentionCard reason="Asked you" title="Design review" from="Ada" text="Can you review?" />;
export const attentionCard02 = <AttentionCard reason="Asked you" title="Design review" from="Ada" onClick={() => {}}>Can you review?</AttentionCard>;
export const attentionCardOk01 = <AttentionCard reason="Asked you" tone="warning" title="Design review" from="Ada" time="9:41" onOpen={() => {}} actions={null} className="mt-2">Can you review?</AttentionCard>;
