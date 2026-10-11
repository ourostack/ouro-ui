/**
 * What an agent with shadcn/ui habits types, for the landing page's "Agents read the
 * types" section. Plain data, so site/scripts/agent-messages.mts can type-check `code`
 * with the compiler and the browser test can render `devProps`.
 *
 * `devMessage` is quoted from the console; agents.test.tsx fails if Button logs
 * anything else for `devProps`.
 */
export interface AgentExample {
  id: string;
  /** The habit, in a few words. */
  habit: string;
  /** What the agent types: one Button element. */
  code: string;
  /** The attribute in `code` the compiler flags; its hover text is quoted. */
  prop: string;
  /** The same mistake as props, for rendering in the browser test. */
  devProps: Record<string, string | boolean>;
  /** Exactly what Button logs in development. */
  devMessage: string;
}

export const agentExamples: AgentExample[] = [
  {
    id: "variant",
    habit: "shadcn's destructive variant",
    code: '<Button variant="destructive">Delete</Button>',
    prop: "variant",
    devProps: { variant: "destructive" },
    devMessage: '[ouro-ui] Button: variant="destructive" is not a variant. Fix: <Button tone="destructive">.',
  },
  {
    id: "isLoading",
    habit: "A loading flag named the usual way",
    code: "<Button isLoading>Save</Button>",
    prop: "isLoading",
    devProps: { isLoading: true },
    devMessage: "[ouro-ui] Button: isLoading is not a prop. Fix: <Button loading>.",
  },
  {
    id: "asChild",
    habit: "Radix's asChild for a link",
    code: '<Button asChild>\n  <a href="/recipes">Recipes</a>\n</Button>',
    prop: "asChild",
    devProps: { asChild: true },
    devMessage: '[ouro-ui] Button: asChild is not a prop. Fix: <Button href="/path">.',
  },
];
