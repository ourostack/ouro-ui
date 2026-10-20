import { TimerTray } from "@/components/ouro/timer/timer-tray";

// expect: data-ouro="timer-tray"
// expect: aria-label="Ouro timers"
export default function TimerTraySection() {
  return <TimerTray label="Ouro timers" timers={[{ id: "ouro-timer-section", label: "Ouro timer", duration: 600 }]} />;
}
