import { Navbar } from "@/components/ouro/navbar/navbar";
import { StackedLayout } from "@/components/ouro/sidebar/stacked-layout";

// expect: data-ouro="stacked-layout"
// expect: Skip to Ouro stacked layout
// expect: Ouro stacked layout page
// expect: Ouro stacked layout footer
export default function StackedLayoutSection() {
  return (
    <StackedLayout
      navbar={<Navbar label="Ouro stacked layout" items={[{ label: "Ouro stacked layout link", href: "/stacked-layout" }]} />}
      footer="Ouro stacked layout footer"
      skipLabel="Skip to Ouro stacked layout"
    >
      Ouro stacked layout page
    </StackedLayout>
  );
}
