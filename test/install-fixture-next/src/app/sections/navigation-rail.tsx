import { NavigationRail } from "@/components/ouro/navigation-rail/navigation-rail";

// expect: data-ouro="navigation-rail"
// expect: aria-label="Ouro rail"
// The current item is marked in the server HTML, from currentPath, and every item is there.
// expect: aria-current="page"[^>]*>.*Ouro rail chat
// The count is part of the item's name, after its label: "Ouro rail activity, 3 new".
// expect: Ouro rail activity<span[^>]*>, \(<!-- -->\)*3 new</span>
// expect: href="/navigation-rail-files"
export default function NavigationRailSection() {
  return (
    <div style={{ display: "flex", height: 400 }}>
      <NavigationRail
        label="Ouro rail"
        currentPath="/navigation-rail-chat/12"
        items={[
          { label: "Ouro rail activity", href: "/navigation-rail-activity", icon: <svg viewBox="0 0 24 24" />, count: 3 },
          { label: "Ouro rail chat", href: "/navigation-rail-chat", icon: <svg viewBox="0 0 24 24" /> },
          { type: "separator" },
          { label: "Ouro rail files", href: "/navigation-rail-files", icon: <svg viewBox="0 0 24 24" /> },
        ]}
      />
    </div>
  );
}
