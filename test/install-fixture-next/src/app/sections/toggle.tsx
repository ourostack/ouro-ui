import { Toggle } from "@/components/ouro/toggle/toggle";

// expect: Ouro toggle
// The pressed state is in the server HTML.
// expect: aria-pressed="true"
export default function ToggleSection() {
  return <Toggle label="Ouro toggle" defaultPressed />;
}
