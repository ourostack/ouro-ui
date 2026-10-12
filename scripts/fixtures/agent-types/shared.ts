/**
 * What agents write, one pair of files per component: `<item>.snippets.tsx` exports the
 * snippets (every one except the valid ones is a mistake on purpose: a type error, or a
 * `className` habit only the hover and the development message can name), and
 * `<item>.cases.ts` exports `agentCases`, for each such snippet in file order the habit behind
 * it and every channel that names the fix, with the text that channel must contain, and
 * `validSnippets`, the valid ones. Snippet ids are unique across the files; name a new
 * component's snippets after it (`numberField01`). The tests find the files by name.
 *
 * - `tsc`: the compiler's errors for the snippet's line, exactly. A union target is
 *   compared as a set, because members print in the order the program created their
 *   types. `scripts/agent-types.test.mjs` checks these.
 * - `hover`: the editor's hover. That test also checks that every attribute of every
 *   snippet shows its JSDoc, except where `hoverLost` says why not.
 * - `dev`: the `Fix:` of the development message (a console warning, or the error a
 *   component throws). `test/agent-types.test.tsx` renders each snippet and checks it.
 *
 * `names` lists the channels whose text names the fix; every snippet has at least one.
 */
export type Channel = "tsc" | "hover" | "dev";

export interface AgentCase {
  id: string;
  habit: string;
  tsc: string[];
  /** Fix text in the JSDoc of this prop's hover. */
  hover?: { prop: string; doc: string };
  /** The development message's `Fix: …` code. */
  dev?: string;
  names: Channel[];
  /** Why hover shows no JSDoc on this snippet. */
  hoverLost?: string;
}

export const tones = `"primary" | "secondary" | "destructive" | "success" | "warning" | (string & { 'danger is "destructive"; accent is "primary"; neutral is "secondary"': never; }) | undefined`;
export const align = `(string & { 'Use "start", "center" or "end": left is "start", right is "end"': never; })`;
export const notAssignable = (value: string, target: string) => `error TS2322: Type '${value}' is not assignable to type '${target}'.`;
export const hint = (value: string, fix: string) => notAssignable(value, `{ '${fix}': never; }`);