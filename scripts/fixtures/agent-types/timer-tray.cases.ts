import { type AgentCase, hint } from "./shared.ts";

/** The timer-tray snippets in timer-tray.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  { id: "timerTray01", habit: "an items prop for the list", tsc: ["error TS2741: Property ''Use timers={[{ timerId, label, duration }]}'' is missing in type 'never[]' but required in type '{ 'Use timers={[{ timerId, label, duration }]}': never; }'."], dev: "<TimerTray timers={[{ timerId, label, duration }]} />", names: ["tsc", "dev"] },
  { id: "timerTray02", habit: "id for a timer's key", tsc: [hint("string", 'Use timerId: "pasta"')], dev: '<TimerTray timers={[{ timerId: "pasta", label, duration }]} />', names: ["tsc", "dev"] },
];

/** Valid timer-tray snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["timerTrayOk01"];
