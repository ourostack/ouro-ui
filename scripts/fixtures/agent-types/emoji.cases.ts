import { type AgentCase, hint } from "./shared.ts";

/** The emoji snippets in emoji.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  { id: "emoji01", habit: "an img's src", tsc: [hint("string", "Use <Emoji item={{ id, name, src }} />")], dev: "<Emoji item={{ id, name, src }} />", names: ["tsc", "dev"] },
  { id: "emoji02", habit: "an emoji character", tsc: [hint("string", "Use <Emoji item={catalogueItem} />")], dev: "<Emoji item={catalogueItem} />", names: ["tsc", "dev"] },
  { id: "emoji03", habit: "an animate switch", tsc: [hint("boolean", "Use <Emoji item={item} play />")], dev: "<Emoji item={item} play />", names: ["tsc", "dev"] },
  {
    id: "emoji04",
    habit: "the text as children",
    tsc: [
      "error TS2747: 'EmojiText' components don't accept text as child elements. Text in JSX has the type 'string', but the expected type of 'children' is '{ 'Use <EmojiText text={message.body} catalogue={catalogue} />': never; } | undefined'.",
    ],
    dev: "<EmojiText text={message.body} catalogue={catalogue} />",
    names: ["tsc", "dev"],
  },
];

/** Valid emoji snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["emojiOk01", "emojiOk02"];
