import { Tabs } from "@/components/ouro/tabs/tabs";

// expect: Ouro tabs first panel
// expect: role="tablist"
// The selected tab and its panel name each other in the server HTML.
// expect: aria-controls="[^"]*panel0"
// expect: aria-labelledby="[^"]*tab0"
// Tabs that are links: a nav whose current link is marked in the server HTML.
// expect: <nav aria-label="Ouro link tabs"
// expect: aria-current="page"[^>]*>.*Ouro link tab two
export default function TabsSection() {
  return (
    <>
      <Tabs
        label="Ouro tabs"
        items={[
          { value: "one", label: "One", content: "Ouro tabs first panel" },
          { value: "two", label: "Two", content: "Ouro tabs second panel" },
        ]}
      />
      <Tabs
        label="Ouro link tabs"
        currentPath="/tabs/two?view=all"
        items={[
          { value: "one", label: "Ouro link tab one", href: "/tabs/one" },
          { value: "two", label: "Ouro link tab two", href: "/tabs/two" },
        ]}
      />
    </>
  );
}
