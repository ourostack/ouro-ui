import { ThemePicker } from "@/components/ouro/theme-picker/theme-picker";
import { themePresetScript } from "@/lib/ouro/theme-preset-script";

// expect: data-ouro="theme-picker"
// expect: aria-label="Pearl"
// A Server Component calls themePresetScript and inlines it.
// expect: ouro-theme-preset-section
const presets = [
  { name: "pearl", label: "Pearl" },
  { name: "abyss", label: "Abyss" },
];

export default function ThemePickerSection() {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: themePresetScript(["pearl", "abyss"], { storageKey: "ouro-theme-preset-section" }) }} />
      <ThemePicker presets={presets} storageKey="ouro-theme-preset-section" />
    </>
  );
}
