import { FamilyFooter } from "@/components/ouro/family-bar/family-footer";

// expect: data-ouro="family-footer"
// expect: aria-label="Ouro family footer"
// expect: href="https://example.com/family-footer-home/"
// The current site is marked in the server HTML, and the site's own extras follow.
// expect: aria-current="true"[^>]*>Ouro family footer docs<
// expect: Ouro family footer extras
export default function FamilyFooterSection() {
  return (
    <FamilyFooter
      label="Ouro family footer"
      links={[
        { id: "home", label: "Ouro family footer home", href: "https://example.com/family-footer-home/" },
        { id: "docs", label: "Ouro family footer docs", href: "https://example.com/family-footer-docs/" },
      ]}
      current="docs"
    >
      <span>Ouro family footer extras</span>
    </FamilyFooter>
  );
}
