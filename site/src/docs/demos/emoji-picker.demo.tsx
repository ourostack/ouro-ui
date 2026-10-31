import { useState, type JSX } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { EmojiPicker, type EmojiPickerCategory, type EmojiPickerEmoji, type EmojiSkinTone } from "@/registry/ouro/components/ouro/emoji-picker/emoji-picker";

// The live demo at the top of docs/emoji-picker/: the component as an app would use it, with its props, nothing else.
// The emoji are a small sample of Unicode's, with their names; an app passes its full set.

const e = (emoji: string, name: string, keywords: string[] = [], skinTones = false): EmojiPickerEmoji => ({ emoji, name, keywords, skinTones });

const categories: EmojiPickerCategory[] = [
  {
    label: "Smileys",
    emoji: [
      e("😀", "grinning face", ["smile"]),
      e("😂", "face with tears of joy", ["laugh"]),
      e("🙂", "slightly smiling face", ["smile"]),
      e("😍", "smiling face with heart-eyes", ["love"]),
      e("🤔", "thinking face", ["hmm"]),
      e("😮", "face with open mouth", ["wow"]),
      e("😎", "smiling face with sunglasses", ["cool"]),
      e("🥳", "partying face", ["party"]),
    ],
  },
  {
    label: "People",
    emoji: [
      e("👍", "thumbs up", ["like", "yes"], true),
      e("👏", "clapping hands", ["applause"], true),
      e("🙌", "raising hands", ["hooray"], true),
      e("👋", "waving hand", ["hello"], true),
      e("🙏", "folded hands", ["thanks"], true),
      e("💪", "flexed biceps", ["strong"], true),
      e("👀", "eyes", ["look"]),
    ],
  },
  {
    label: "Food and drink",
    emoji: [e("☕", "hot beverage", ["coffee"]), e("🍕", "pizza"), e("🌮", "taco"), e("🍰", "shortcake", ["cake"]), e("🥐", "croissant", ["café"])],
  },
  {
    label: "Symbols",
    emoji: [e("❤️", "red heart", ["love"]), e("🎉", "party popper", ["celebrate"]), e("🔥", "fire", ["hot"]), e("✅", "check mark button", ["done"]), e("🚀", "rocket", ["launch"]), e("💡", "light bulb", ["idea"])],
  },
];

const all = categories.flatMap((category) => category.emoji);
const pick = (...emoji: string[]) => emoji.map((glyph) => all.find((item) => item.emoji === glyph)!);

export default function EmojiPickerDemo(): JSX.Element {
  const [reaction, setReaction] = useState("👍");
  const [tone, setTone] = useState<EmojiSkinTone>("default");
  return (
    <div className="flex items-center gap-3">
      <EmojiPicker
        label="Add a reaction"
        trigger={<Button variant="soft" tone="secondary">React {reaction}</Button>}
        categories={categories}
        quick={pick("👍", "❤️", "😂", "😮", "🎉")}
        frequent={pick("🚀", "✅", "☕", "🙏")}
        skinTone={tone}
        onSkinToneChange={setTone}
        onSelect={(selection) => setReaction(selection.emoji)}
      />
    </div>
  );
}
