import { useEffect, useState, type JSX } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { LevelMeter } from "@/registry/ouro/components/ouro/level-meter/level-meter";
import { Slider } from "@/registry/ouro/components/ouro/slider/slider";

// The live demo at the top of docs/level-meter/: the component as an app would use it, with its props, nothing else.
// A made-up voice stands in for a microphone: its amplitude, as an analyser's RMS, 15 times a second.

/** A voice-like amplitude at a moment: syllables between about -50 and -18 dBFS, with short pauses. */
function voice(time: number): number {
  const syllables = Math.abs(Math.sin(time * 7.3)) * (0.55 + 0.45 * Math.sin(time * 1.7));
  const speaking = Math.sin(time * 0.9) > -0.6;
  return 0.0005 + 0.12 * syllables * (speaking ? 1 : 0.005);
}

export default function LevelMeterDemo(): JSX.Element {
  const [decibels, setDecibels] = useState(-30);
  const [talking, setTalking] = useState(false);
  const [spoken, setSpoken] = useState(0);
  useEffect(() => {
    if (!talking) return;
    const start = performance.now();
    const timer = setInterval(() => setSpoken(voice((performance.now() - start) / 1000)), 1000 / 15);
    return () => clearInterval(timer);
  }, [talking]);
  const rms = talking ? spoken : 10 ** (decibels / 20);
  return (
    <div className="grid w-full max-w-sm gap-6">
      <LevelMeter label="Microphone level" value={rms} />
      <div className="flex items-center gap-3">
        <span className="text-sm">Menu row</span>
        <LevelMeter label="Microphone level in a menu" hideLabel size="sm" bars={5} value={rms} />
      </div>
      <Slider label="Input level (dBFS)" min={-60} max={0} value={decibels} onValueChange={setDecibels} showValue disabled={talking} />
      <div className="flex gap-3">
        <Button size="sm" variant="outline" tone="secondary" onClick={() => setTalking((current) => !current)}>
          {talking ? "Stop talking" : "Talk"}
        </Button>
      </div>
    </div>
  );
}
