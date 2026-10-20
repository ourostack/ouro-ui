import { Timer } from "@/components/ouro/timer/timer";

// expect: data-ouro="timer"
// expect: Ouro timer
// expect: 10:00
export default function TimerSection() {
  return <Timer label="Ouro timer" duration={600} id="ouro-timer-section" />;
}
