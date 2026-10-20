// What agents write with timer-tray: snippets whose cases are in timer-tray.cases.ts.
import { TimerTray } from "@/registry/ouro/components/ouro/timer/timer-tray";

export const timerTray01 = <TimerTray timers={[]} items={[]} />;
export const timerTrayOk01 = <TimerTray timers={[{ id: "pasta", label: "Pasta", duration: 600, href: "/steps/2" }]} label="Timers" silent className="sticky top-0" />;
