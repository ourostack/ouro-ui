import { Tabs } from "@/components/ouro/tabs/tabs";

// expect: Ouro tabs first panel
// expect: role="tablist"
// The selected tab and its panel name each other in the server HTML.
// expect: aria-controls="[^"]*panel0"
// expect: aria-labelledby="[^"]*tab0"
export default function TabsSection() {
  return (
    <Tabs
      label="Ouro tabs"
      items={[
        { value: "one", label: "One", content: "Ouro tabs first panel" },
        { value: "two", label: "Two", content: "Ouro tabs second panel" },
      ]}
    />
  );
}
