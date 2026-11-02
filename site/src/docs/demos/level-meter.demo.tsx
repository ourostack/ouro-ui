import { useEffect, useState, type JSX } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { LevelMeter } from "@/registry/ouro/components/ouro/level-meter/level-meter";
import { Slider } from "@/registry/ouro/components/ouro/slider/slider";

// The live demo at the top of docs/level-meter/: the component as an app would use it, with its props, nothing else.
// A made-up voice stands in for a microphone, at 15 levels a second, as an app's analyser would feed it.

/** A voice-like level at a moment: syllables rising and falling, with short pauses. */
function voice(time: number): number {
  const syllables = Math.abs(Math.sin(time * 7.3)) * (0.55 + 0.45 * Math.sin(time * 1.7));
  return Math.max(0, Math.min(1, syllables * (Math.sin(time * 0.9) > -0.6 ? 1 : 0.05)));
}

export default function LevelMeterDemo(): JSX.Element {
  const [manual, setManual] = useState(40);
  const [talking, setTalking] = useState(false);
  const [spoken, setSpoken] = useState(0);
  useEffect(() => {
    if (!talking) return;
    const start = performance.now();
    const timer = setInterval(() => setSpoken(voice((performance.now() - start) / 1000)), 1000 / 15);
    return () => clearInterval(timer);
  }, [talking]);
  const level = talking ? spoken : manual / 100;
  return (
    <div className="grid w-full max-w-sm gap-6">
      <LevelMeter label="Microphone level" value={level} />
      <div className="flex items-center gap-3">
        <span className="text-sm">Menu row</span>
        <LevelMeter label="Microphone level in a menu" hideLabel size="sm" bars={5} value={level} />
      </div>
      <Slider label="Level" min={0} max={100} value={manual} onValueChange={setManual} showValue disabled={talking} />
      <div className="flex gap-3">
        <Button size="sm" variant="outline" tone="secondary" onClick={() => setTalking((current) => !current)}>
          {talking ? "Stop talking" : "Talk"}
        </Button>
      </div>
    </div>
  );
}
