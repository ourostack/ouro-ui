import { useRef, useState, type JSX } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Popover } from "@/registry/ouro/components/ouro/popover/popover";
import { ReactionBar, type Reaction, type ReactionOption } from "@/registry/ouro/components/ouro/reaction-bar/reaction-bar";

// The live demo at the top of docs/reaction-bar/: the component as an app would use it, with its props, nothing else.

const quick: ReactionOption[] = [
  { key: "like", label: "Like", emoji: "👍" },
  { key: "heart", label: "Heart", emoji: "❤️" },
  { key: "laugh", label: "Laugh", emoji: "😄" },
];
const more: ReactionOption[] = [...quick, { key: "party", label: "Party", emoji: "🎉" }, { key: "clap", label: "Clap", emoji: "👏" }, { key: "eyes", label: "Eyes", emoji: "👀" }];

export default function ReactionBarDemo(): JSX.Element {
  const [reactions, setReactions] = useState<Reaction[]>([{ key: "like", label: "Like", emoji: "👍", count: 2 }]);
  const [picking, setPicking] = useState(false);
  const anchor = useRef<HTMLElement | null>(null);
  const react = (key: string) =>
    setReactions((current) => {
      const found = current.find((reaction) => reaction.key === key);
      if (!found) return [...current, { ...more.find((option) => option.key === key)!, count: 1, mine: true }];
      return current
        .map((reaction) => (reaction.key === key ? { ...reaction, count: reaction.count + (reaction.mine ? -1 : 1), mine: !reaction.mine } : reaction))
        .filter((reaction) => reaction.count > 0);
    });
  return (
    <>
      <ReactionBar
        reactions={reactions}
        quick={quick}
        onReact={react}
        onMore={(event) => {
          anchor.current = event.currentTarget;
          setPicking(!picking);
        }}
        moreOpen={picking}
      />
      <Popover title="Add a reaction" hideTitle open={picking} onOpenChange={setPicking} anchor={anchor} side="top" className="w-auto">
        <div className="flex gap-1">
          {more.map((option) => (
            <Button
              key={option.key}
              variant="plain"
              aria-label={option.label}
              onClick={() => {
                if (!reactions.some((reaction) => reaction.key === option.key && reaction.mine)) react(option.key);
                setPicking(false);
              }}
            >
              {option.emoji}
            </Button>
          ))}
        </div>
      </Popover>
    </>
  );
}
