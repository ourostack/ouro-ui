import { LevelMeter } from "@/components/ouro/level-meter/level-meter";

// expect: Ouro level meter
// LevelMeter is a meter with its level's band as a value and a word in the server HTML.
// expect: role="meter"[^>]*aria-valuenow="50"[^>]*aria-valuetext="Speaking"
export default function LevelMeterSection() {
  return <LevelMeter label="Ouro level meter" value={0.0316} />;
}
