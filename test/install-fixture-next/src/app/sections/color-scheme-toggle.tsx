import { ColorSchemeToggle } from "@/components/ouro/color-scheme-toggle/color-scheme-toggle";
import { colorSchemeScript } from "@/lib/ouro/color-scheme-script";

// expect: data-ouro="color-scheme-toggle"
// expect: aria-label="Ouro color scheme"
// A Server Component calls colorSchemeScript and inlines it.
// expect: ouro-color-scheme-section
export default function ColorSchemeToggleSection() {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: colorSchemeScript({ storageKey: "ouro-color-scheme-section" }) }} />
      <ColorSchemeToggle label="Ouro color scheme" />
    </>
  );
}
