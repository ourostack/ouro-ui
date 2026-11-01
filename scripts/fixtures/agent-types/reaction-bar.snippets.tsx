// What agents write with reaction-bar: snippets whose cases are in reaction-bar.cases.ts.
import { ReactionBar, type Reaction } from "@/registry/ouro/components/ouro/reaction-bar/reaction-bar";
import type { EmojiCatalogue } from "@/registry/ouro/components/ouro/emoji/emoji";

const reactions: Reaction[] = [{ key: "like", label: "Like", emoji: "👍", count: 2 }];
const catalogue: EmojiCatalogue = { categories: [{ id: "symbols", label: "Symbols", items: [{ id: "party", name: "Party popper", src: "/emoji/party.png" }] }] };

export const reactionBar01 = <ReactionBar reactions={reactions} onReactionClick={() => {}} />;
export const reactionBar02 = <ReactionBar reactions={reactions} onAddReaction={() => {}} />;
export const reactionBarOk01 = <ReactionBar reactions={[{ key: "like", label: "Like", emoji: "👍", count: 2, mine: true }]} quick={[{ key: "heart", label: "Heart", emoji: "❤️" }]} onReact={() => {}} onMore={() => {}} moreOpen={false} moreLabel="Add reaction" disabled={false} label="Reactions" mineLabel="including you" className="mt-1" />;
export const reactionBarOk02 = <ReactionBar catalogue={catalogue} reactions={[{ key: "party", count: 2, mine: true, label: "Party", tooltip: "You and Riley Example" }]} quick={["party"]} onReact={(key) => void key} />;
