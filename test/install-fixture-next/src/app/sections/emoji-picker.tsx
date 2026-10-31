import { Button } from "@/components/ouro/button/button";
import { EmojiPicker, type EmojiPickerSelection } from "@/components/ouro/emoji-picker/emoji-picker";

async function react(_selection: EmojiPickerSelection) {
  "use server";
}

// expect: Ouro reaction picker
// expect: aria-haspopup="dialog"
export default function EmojiPickerSection() {
  return (
    <EmojiPicker
      label="Add a reaction"
      trigger={<Button>Ouro reaction picker</Button>}
      categories={[{ label: "Smileys", emoji: [{ emoji: "😀", name: "grinning face", keywords: ["smile"] }] }]}
      quick={[{ emoji: "👍", name: "thumbs up", skinTones: true }]}
      onSelect={react}
    />
  );
}
