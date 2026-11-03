import { AttentionCard } from "@/components/ouro/attention-card/attention-card";

// expect: data-ouro="attention-card"
// expect: Ouro design review
export default function AttentionCardSection() {
  return (
    <AttentionCard reason="Asked you" tone="warning" title="Ouro design review" from="Ana Lind" time="9:41">
      Can you look at the second draft?
    </AttentionCard>
  );
}
