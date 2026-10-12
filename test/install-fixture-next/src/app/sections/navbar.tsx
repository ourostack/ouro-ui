import { Navbar } from "@/components/ouro/navbar/navbar";

// expect: data-ouro="navbar"
// expect: aria-label="Ouro navbar"
// The current page is marked in the server HTML, from currentPath.
// expect: aria-current="page"[^>]*>Ouro navbar recipes<
// expect: href="/navbar-cookbooks"
export default function NavbarSection() {
  return (
    <Navbar
      label="Ouro navbar"
      brand="Ouro navbar brand"
      items={[
        { label: "Ouro navbar recipes", href: "/navbar-recipes" },
        { label: "Ouro navbar cookbooks", href: "/navbar-cookbooks" },
      ]}
      currentPath="/navbar-recipes/12"
    />
  );
}
