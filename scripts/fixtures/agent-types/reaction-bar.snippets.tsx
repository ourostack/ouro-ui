// What agents write with reaction-bar: snippets whose cases are in reaction-bar.cases.ts.
import { ReactionBar } from "@/registry/ouro/components/ouro/reaction-bar/reaction-bar";

export const reactionBar01 = <ReactionBar reactions={[]} onReactionClick={() => {}} />;
export const reactionBarOk01 = <ReactionBar reactions={[{ key: "like", label: "Like", emoji: "👍", count: 2, mine: true }]} quick={[{ key: "heart", label: "Heart", emoji: "❤️" }]} onReact={() => {}} disabled={false} label="Reactions" mineLabel="including you" className="mt-1" />;
