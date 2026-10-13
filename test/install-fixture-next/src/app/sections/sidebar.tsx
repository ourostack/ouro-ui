import { Sidebar } from "@/components/ouro/sidebar/sidebar";

// expect: data-ouro="sidebar"
// expect: <nav aria-label="Ouro sidebar"
// expect: Ouro sidebar library
// The current page is marked in the server HTML, from currentPath.
// expect: aria-current="page"
// expect: href="/sidebar-cookbooks"
// expect: Collapse sidebar
export default function SidebarSection() {
  return (
    <div style={{ height: 320 }}>
      <Sidebar
        label="Ouro sidebar"
        sections={[
          { items: [{ label: "Ouro sidebar recipes", href: "/sidebar-recipes" }] },
          { label: "Ouro sidebar library", items: [{ label: "Ouro sidebar cookbooks", href: "/sidebar-cookbooks" }] },
        ]}
        currentPath="/sidebar-recipes"
      />
    </div>
  );
}
