import { type AgentCase, tones, notAssignable, hint } from "./shared.ts";

const sizes = `"sm" | "md" | "lg" | (string & { 'From shadcn? default is "md"; for icon, pass aria-label with the icon as children': never; }) | undefined`;
const variants =
  `(string & { 'From shadcn? Use tone="destructive" or tone="secondary". default is "solid"; ghost and link are "plain"': never; }) | "solid" | "soft" | "outline" | "plain" | undefined`;

/** The button snippets in button.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  { id: "s01", habit: "shadcn's ghost variant", tsc: [notAssignable('"ghost"', variants)], dev: '<Button variant="plain">', names: ["tsc", "dev"] },
  { id: "s02", habit: "shadcn's icon size", tsc: [notAssignable('"icon"', sizes)], dev: '<Button aria-label="Add"><PlusIcon /></Button>', names: ["tsc", "dev"] },
  { id: "s03", habit: "a danger tone", tsc: [notAssignable('"danger"', tones)], dev: '<Button tone="destructive">', names: ["tsc", "dev"] },
  { id: "s04", habit: "Radix's asChild", tsc: [hint("boolean", 'Use <Button href="/path">')], dev: '<Button href="/path">', names: ["tsc", "dev"] },
  { id: "s05", habit: "an xs size", tsc: [notAssignable('"xs"', sizes)], dev: '<Button size="md">', names: ["tsc", "dev"] },
  {
    id: "s29",
    habit: "a tone name as the button type",
    tsc: [notAssignable('"primary"', `"button" | "submit" | "reset" | (string & { 'Use "button", "submit" or "reset"; for looks use tone and variant': never; }) | undefined`)],
    dev: '<Button tone="primary">',
    names: ["tsc", "dev"],
  },
  { id: "v01", habit: "shadcn's destructive variant", tsc: [notAssignable('"destructive"', variants)], dev: '<Button tone="destructive">', names: ["tsc", "dev"] },
  { id: "v02", habit: "shadcn's default variant", tsc: [notAssignable('"default"', variants)], dev: "<Button>", names: ["tsc", "dev"] },
  { id: "v03", habit: "shadcn's secondary variant", tsc: [notAssignable('"secondary"', variants)], dev: '<Button tone="secondary">', names: ["tsc", "dev"] },
  { id: "v04", habit: "shadcn's link variant", tsc: [notAssignable('"link"', variants)], dev: '<Button variant="plain" href="/path">', names: ["tsc", "dev"] },
  { id: "v05", habit: "shadcn's default size", tsc: [notAssignable('"default"', sizes)], dev: '<Button size="md">', names: ["tsc", "dev"] },
];

/** Valid button snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["ok04"];
