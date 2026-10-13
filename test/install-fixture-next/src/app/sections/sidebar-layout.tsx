import { Sidebar } from "@/components/ouro/sidebar/sidebar";
import { SidebarLayout } from "@/components/ouro/sidebar/sidebar-layout";

// expect: data-ouro="sidebar-layout"
// expect: Skip to Ouro sidebar layout
// expect: Ouro sidebar layout page
// expect: Ouro sidebar layout header
export default function SidebarLayoutSection() {
  return (
    <SidebarLayout
      sidebar={<Sidebar label="Ouro sidebar layout" sections={[{ items: [{ label: "Ouro sidebar layout link", href: "/sidebar-layout" }] }]} />}
      header="Ouro sidebar layout header"
      skipLabel="Skip to Ouro sidebar layout"
    >
      Ouro sidebar layout page
    </SidebarLayout>
  );
}
