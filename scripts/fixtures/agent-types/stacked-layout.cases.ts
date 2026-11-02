import { type AgentCase, hint, notAssignable } from "./shared.ts";

const behaviors = `"sticky" | "static" | "auto-hide" | (string & { 'default is "sticky"; use "sticky", "static" or "auto-hide"': never; }) | undefined`;

/** The stacked-layout snippets in stacked-layout.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  {
    id: "stackedLayout01",
    habit: "Catalyst's sidebar slot on StackedLayout",
    tsc: [notAssignable("string", `{ "Use <StackedLayout navbar={<Navbar ... />}>, or <SidebarLayout sidebar={...}>": never; }`)],
    dev: "<StackedLayout navbar={<Navbar … />}>, or <SidebarLayout sidebar={<Sidebar … />}> for a sidebar",
    names: ["tsc", "dev"],
  },
  {
    id: "stackedLayout02",
    habit: "a header slot on StackedLayout",
    tsc: [notAssignable("string", `{ "Use <StackedLayout navbar={<Navbar ... />}>": never; }`)],
    dev: "<StackedLayout navbar={<Navbar … />}>",
    names: ["tsc", "dev"],
  },
  {
    id: "stackedLayout03",
    habit: "a hideOnScroll flag for a navbar that slides away",
    tsc: [hint("boolean", 'Use <StackedLayout navbarBehavior="auto-hide">')],
    dev: '<StackedLayout navbarBehavior="auto-hide">',
    names: ["tsc", "dev"],
  },
  {
    id: "stackedLayout04",
    habit: "sticky={false} for a navbar that scrolls away",
    tsc: [hint("boolean", 'Use <StackedLayout navbarBehavior="static"> to let the navbar scroll away')],
    dev: '<StackedLayout navbarBehavior="static"> to let it scroll away',
    names: ["tsc", "dev"],
  },
  {
    id: "stackedLayout05",
    habit: "CSS's position value fixed as the navbar's behavior",
    tsc: [notAssignable('"fixed"', behaviors)],
    dev: '<StackedLayout navbarBehavior="sticky">',
    names: ["tsc", "dev"],
  },
];

/** Valid stacked-layout snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["stackedLayoutOk01", "stackedLayoutOk02"];
