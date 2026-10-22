import { type JSX } from "react";
import { Timer } from "@/registry/ouro/components/ouro/timer/timer";

// The live demo at the top of docs/timer/: the component as an app would use it, with its props, nothing else.

export default function TimerDemo(): JSX.Element {
  return (
    <div className="grid max-w-md gap-4">
      <Timer label="Focus" duration={25 * 60} timerId="docs-timer-demo" />
      <Timer label="Tea" duration={3} alert="repeat" repeatFor={15} timerId="docs-timer-demo-tea" />
    </div>
  );
}
