import { type AgentCase, hint, notAssignable } from "./shared.ts";

/** The auth-layout snippets in auth-layout.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  { id: "authLayout01", habit: "a logo prop on AuthLayout", tsc: [notAssignable("string", `{ "Use <AuthLayout brand={<Logo />}>": never; }`)], dev: "<AuthLayout brand={<Logo />}>", names: ["tsc", "dev"] },
  { id: "authLayout02", habit: "a subtitle on AuthLayout", tsc: [hint("string", 'Use <AuthLayout description="Welcome back">')], dev: '<AuthLayout description="Welcome back">', names: ["tsc", "dev"] },
  { id: "authLayout03", habit: "a heading prop on AuthLayout", tsc: [hint("string", 'Use <AuthLayout title="Sign in">')], dev: '<AuthLayout title="Sign in">', names: ["tsc", "dev"] },
];

/** Valid auth-layout snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["authLayoutOk01"];
