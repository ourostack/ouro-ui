import { type AgentCase, notAssignable, hint } from "./shared.ts";

/** The card snippets in card.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  { id: "card01", habit: "a subtitle on Card", tsc: [hint("string", 'Use <Card description="12 recipes">')], dev: '<Card description="12 recipes">', names: ["tsc", "dev"] },
  {
    id: "card02",
    habit: "an image prop on Card",
    tsc: [notAssignable("string", `{ "Use <Card media={<AspectRatio ratio={4 / 3}>...</AspectRatio>}>": never; }`)],
    dev: '<Card media={<AspectRatio ratio={4 / 3}><img src=… alt="" /></AspectRatio>}>',
    names: ["tsc", "dev"],
  },
  {
    id: "card03",
    habit: "an elevated card variant",
    tsc: [notAssignable('"elevated"', `"outline" | "plain" | (string & { 'Use "outline" or "plain"; elevation comes from the theme': never; }) | undefined`)],
    dev: '<Card variant="outline">',
    names: ["tsc", "dev"],
  },
  { id: "card04", habit: "React Router's to on Card", tsc: [hint("string", 'Use <Card href="/recipes/1" title="...">')], dev: '<Card href="/cookbooks/1" title="…">', names: ["tsc", "dev"] },
  {
    id: "card06",
    habit: "shadcn's CardActions as a prop",
    tsc: [notAssignable("string", `{ "Use <Card action={<Button>...</Button>}> or footer={...}": never; }`)],
    dev: "<Card action={<Button>…</Button>}> beside the title, or footer={…} below",
    names: ["tsc", "dev"],
  },
];

/** Valid card snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["card07"];
