import { NavigationMenu } from "@/components/ouro/navigation-menu/navigation-menu";

// expect: data-ouro="navigation-menu"
// expect: aria-label="Ouro navigation menu"
// A panel's button, and a plain link marked as the current page from currentPath.
// expect: <button[^>]*>Ouro navigation menu panel
// expect: aria-current="page"[^>]*>Ouro navigation menu link<
export default function NavigationMenuSection() {
  return (
    <NavigationMenu
      label="Ouro navigation menu"
      items={[
        { label: "Ouro navigation menu panel", links: [{ label: "Browse", href: "/navigation-menu-browse", description: "Everything" }] },
        { label: "Ouro navigation menu link", href: "/navigation-menu-link" },
      ]}
      currentPath="/navigation-menu-link"
    />
  );
}
