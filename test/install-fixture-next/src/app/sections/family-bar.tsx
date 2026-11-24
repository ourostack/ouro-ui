import { FamilyBar } from "@/components/ouro/family-bar/family-bar";

// expect: data-ouro="family-bar"
// expect: aria-label="Ouro family bar"
// expect: href="https://example.com/family-docs/"
// expect: aria-hidden="true" data-ouro-family-heading="">Ouro family</span>
// The current site is marked in the server HTML, its touch target before its name.
// expect: aria-current="true"[^>]*><span[^>]*></span>Ouro family docs<
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
