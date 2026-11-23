import { type JSX } from "react";
import { ThemePicker } from "@/registry/ouro/components/ouro/theme-picker/theme-picker";

// The live demo at the top of docs/theme-picker/: the component as an app would use it, with its props, nothing else.

export default function ThemePickerDemo(): JSX.Element {
  return (
    <ThemePicker
      presets={[
        { name: "pearl", label: "Pearl" },
        { name: "abyss", label: "Abyss" },
      ]}
    />
  );
}
