import { ReactionBar } from "@/components/ouro/reaction-bar/reaction-bar";

// expect: data-ouro="reaction-bar"
// expect: Ouro like
export default function ReactionBarSection() {
  return <ReactionBar reactions={[{ key: "like", label: "Ouro like", emoji: "👍", count: 2, mine: true }]} />;
}
