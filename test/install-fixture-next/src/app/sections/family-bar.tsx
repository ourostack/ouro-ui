import { FamilyBar } from "@/components/ouro/family-bar/family-bar";

// expect: data-ouro="family-bar"
// expect: aria-label="Ouro family bar"
// expect: href="https://example.com/family-docs/"
// The current site is marked in the server HTML.
// expect: aria-current="true"[^>]*>Ouro family docs<
export default function FamilyBarSection() {
  return (
    <FamilyBar
      label="Ouro family bar"
      links={[
        { id: "home", label: "Ouro family home", href: "https://example.com/family-home/" },
        { id: "docs", label: "Ouro family docs", href: "https://example.com/family-docs/" },
      ]}
      current="docs"
    />
  );
}
