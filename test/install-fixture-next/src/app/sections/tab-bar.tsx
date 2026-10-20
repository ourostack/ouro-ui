import { TabBar } from "@/components/ouro/tab-bar/tab-bar";

// expect: data-ouro="tab-bar"
// expect: aria-label="Ouro tab bar"
// The current tab is marked in the server HTML, from currentPath.
// expect: aria-current="page"[^>]*>.*Ouro tab recipes
// expect: href="/tab-bar-search"
export default function TabBarSection() {
  return (
    <TabBar
      label="Ouro tab bar"
      currentPath="/tab-bar-recipes/12"
      items={[
        { label: "Ouro tab home", href: "/tab-bar-home", icon: <svg viewBox="0 0 24 24" /> },
        { label: "Ouro tab recipes", href: "/tab-bar-recipes", icon: <svg viewBox="0 0 24 24" /> },
      ]}
      accessory={{ label: "Ouro tab search", href: "/tab-bar-search", icon: <svg viewBox="0 0 24 24" /> }}
    />
  );
}
