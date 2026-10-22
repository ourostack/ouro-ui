import { useState, type JSX } from "react";
import { PresetPicker } from "@/registry/ouro/components/ouro/preset-picker/preset-picker";

// The live demo at the top of docs/preset-picker/: the component as an app would use it, with its props, nothing else.

const presets = [
  { value: "chats", label: "Chats first", description: "Conversations wide, the calendar narrow.", tag: "Saved" },
  { value: "calendar", label: "Calendar first", description: "Today's agenda beside the conversation." },
  { value: "focus", label: "Focus", description: "One conversation, nothing else." },
];

export default function PresetPickerDemo(): JSX.Element {
  const [layout, setLayout] = useState("chats");
  return <PresetPicker label="Start from a layout" items={presets} value={layout} onValueChange={setLayout} className="max-w-xl" />;
}
