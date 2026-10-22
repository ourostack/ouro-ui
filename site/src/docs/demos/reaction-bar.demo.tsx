import { useState, type JSX } from "react";
import { ReactionBar, type Reaction, type ReactionOption } from "@/registry/ouro/components/ouro/reaction-bar/reaction-bar";

// The live demo at the top of docs/reaction-bar/: the component as an app would use it, with its props, nothing else.

const quick: ReactionOption[] = [
  { key: "like", label: "Like", emoji: "👍" },
  { key: "heart", label: "Heart", emoji: "❤️" },
  { key: "laugh", label: "Laugh", emoji: "😄" },
];

export default function ReactionBarDemo(): JSX.Element {
  const [reactions, setReactions] = useState<Reaction[]>([{ key: "like", label: "Like", emoji: "👍", count: 2 }]);
  const react = (key: string) =>
    setReactions((current) => {
      const found = current.find((reaction) => reaction.key === key);
      if (!found) return [...current, { ...quick.find((option) => option.key === key)!, count: 1, mine: true }];
      return current
        .map((reaction) => (reaction.key === key ? { ...reaction, count: reaction.count + (reaction.mine ? -1 : 1), mine: !reaction.mine } : reaction))
        .filter((reaction) => reaction.count > 0);
    });
  return <ReactionBar reactions={reactions} quick={quick} onReact={react} />;
}
