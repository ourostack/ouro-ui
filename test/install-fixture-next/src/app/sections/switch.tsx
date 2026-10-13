import { Switch } from "@/components/ouro/switch/switch";

// expect: Ouro switch
// expect: role="switch"[^>]*aria-labelledby="[^"]*-label"
export default function SwitchSection() {
  return <Switch label="Ouro switch" name="wifi" defaultChecked />;
}
