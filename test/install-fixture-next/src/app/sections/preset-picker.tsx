import { PresetPicker } from "@/components/ouro/preset-picker/preset-picker";

async function applyLayout(_value: string) {
  "use server";
}

// expect: data-ouro="preset-picker"
// expect: aria-current="true"
// expect: Ouro chats first
export default function PresetPickerSection() {
  return (
    <PresetPicker
      label="Start from a layout"
      items={[
        { value: "chats", label: "Ouro chats first", tag: "Saved" },
        { value: "focus", label: "Focus" },
      ]}
      value="chats"
      onValueChange={applyLayout}
    />
  );
}
