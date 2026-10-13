import { useState, type JSX } from "react";
import { Switch } from "@/registry/ouro/components/ouro/switch/switch";

// The live demo at the top of docs/switch/: the component as an app would use it, with its props, nothing else.

export default function SwitchDemo(): JSX.Element {
  const [timers, setTimers] = useState(true);
  return (
    <div className="grid w-full max-w-sm gap-4">
      <Switch label="Cooking timers" description="Sound an alarm when a step is done." checked={timers} onCheckedChange={setTimers} />
      <Switch label="Keep screen awake" name="awake" />
    </div>
  );
}
