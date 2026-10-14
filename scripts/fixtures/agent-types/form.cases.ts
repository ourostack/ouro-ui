import type { AgentCase } from "./shared.ts";

/** The form snippets in form.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  {
    id: "form01",
    habit: "React Aria's validationErrors",
    tsc: [
      `error TS2353: Object literal may only specify known properties, and 'email' does not exist in type '{ 'Use <Form errors={actionData?.errors}>': never; }'.`,
    ],
    dev: "<Form errors={actionData?.errors}>",
    names: ["tsc", "dev"],
  },
  {
    id: "form02",
    habit: "The unreleased separate Form result prop",
    tsc: [
      `error TS2353: Object literal may only specify known properties, and 'errors' does not exist in type '{ 'Use errors={formErrors(answer, messages)}': never; }'.`,
    ],
    dev: "errors={formErrors(answer, messages)}",
    names: ["tsc", "dev"],
  },
];

/** Valid form snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["okForm", "okFormAnswer"];
