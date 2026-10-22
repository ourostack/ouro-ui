import { type AgentCase, hint } from "./shared.ts";

/** The timer snippets in timer.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  { id: "timer01", habit: "the length in minutes", tsc: [hint("number", "Use duration={10 * 60} (seconds)")], dev: "<Timer duration={10 * 60} />", names: ["tsc", "dev"] },
  { id: "timer02", habit: "onComplete for the end", tsc: [hint("() => void", "Use onDone={() => ...}")], dev: "<Timer onDone={() => {}} />", names: ["tsc", "dev"] },
  { id: "timer03", habit: "Resizable's autoSaveId to keep it", tsc: [hint("string", 'Use timerId="pasta"')], dev: '<Timer timerId="pasta" />', names: ["tsc", "dev"] },
];

/** Valid timer snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["timerOk01", "timerOk02"];
