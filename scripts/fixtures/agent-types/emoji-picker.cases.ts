import { type AgentCase, hint } from "./shared.ts";

const selectFix = "<EmojiPicker onSelect={(selection) => insert(selection.emoji)}>";

/** The emoji picker snippets in emoji-picker.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  {
    id: "emojiPicker01",
    habit: "emoji-mart's onEmojiSelect",
    tsc: [hint("(emoji: string) => undefined", "Use onSelect={(selection) => insert(selection.emoji)}")],
    dev: selectFix,
    names: ["tsc", "dev"],
  },
  {
    id: "emojiPicker02",
    habit: "a picker with no name",
    tsc: [
      "error TS2322: Type '{ categories: EmojiPickerCategory[]; trigger: Element; onSelect: (selection: EmojiPickerSelection) => undefined; }' is not assignable to type 'IntrinsicAttributes & EmojiPickerProps'.\n" +
        "  Property 'label' is missing in type '{ categories: EmojiPickerCategory[]; trigger: Element; onSelect: (selection: EmojiPickerSelection) => undefined; }' but required in type 'EmojiPickerBaseProps'.",
    ],
    names: ["tsc"],
  },
  {
    id: "emojiPicker03",
    habit: "emoji-mart's data",
    tsc: [`error TS2741: Property ''Use categories={[{ label: "Smileys", emoji: [{ emoji, name }] }]}'' is missing in type 'EmojiPickerCategory[]' but required in type '{ 'Use categories={[{ label: "Smileys", emoji: [{ emoji, name }] }]}': never; }'.`],
    dev: '<EmojiPicker label="Add a reaction" categories={[{ label: "Smileys", emoji: [{ emoji: "😀", name: "grinning face" }] }]} onSelect={react}>',
    names: ["tsc", "dev"],
  },
];

/** Valid emoji picker snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["emojiPickerOk01", "emojiPickerOk02", "emojiPickerOk03"];
