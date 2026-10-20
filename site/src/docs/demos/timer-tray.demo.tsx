import { type JSX } from "react";
import { Timer } from "@/registry/ouro/components/ouro/timer/timer";
import { TimerTray } from "@/registry/ouro/components/ouro/timer/timer-tray";

// The live demo at the top of docs/timer-tray/: the component as an app would use it, with its props, nothing else.

export default function TimerTrayDemo(): JSX.Element {
  return (
    <div className="grid max-w-md gap-4">
      <TimerTray timers={[{ timerId: "docs-tray-break", label: "Break", duration: 5 * 60 }]} />
      <Timer label="Break" duration={5 * 60} timerId="docs-tray-break" />
    </div>
  );
}
