/*
 * A pretend kitchen for the Ouro Reins page to drive: a few lines of TypeScript shaped like the tree Spoonjoy's
 * real app gives Reins (evidence/reins-cli-run.ndjson, from its `spoonjoy-reins` spike): the same node path
 * (spoonjoy › tabs › stack › kitchen, a cover for cook mode), the same action names, lending and schemas, and the
 * same refusals word for word (OuroReins' ReinsProblem). It is not Swift and not Spoonjoy; the page says so.
 */

import kitchen from "./reins-kitchen.json";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

interface Ingredient {
  id: string;
  title: string;
  quantity: string;
}
interface Step {
  title: string;
  timer?: string;
  ingredients: Ingredient[];
}
interface Recipe {
  id: string;
  title: string;
  servings: string;
  steps: Step[];
}

/** Lemon Pantry Pasta's first two steps are Spoonjoy's fixture, as its transcript shows them; the rest is pretend (reins-kitchen.json). */
export const RECIPES: Recipe[] = kitchen.recipes;

export const TABS = ["kitchen", "recipes", "cookbooks", "shopping", "search"] as const;

/** Where you are: a tab, a stack of pages on it, and maybe cook mode's cover over everything. */
export interface KitchenState {
  tab: string;
  stack: string[];
  cook: { recipe: string; step: number; checked: string[] } | null;
}

export const START: KitchenState = { tab: "kitchen", stack: [], cook: null };

export interface Action {
  name: string;
  title: string;
  from: string;
  input?: Json;
}

export interface Screen {
  focus: string;
  path: string[];
  state: Json;
  actions: Action[];
}

export interface Problem {
  code: "action-unavailable" | "input-invalid" | "input-unexpected" | "bad-request";
  exit: 2;
  thing: string;
  problem: string;
  fix: string;
  message: string;
}

export type Reply = { ok: true; screen: Screen } | { ok: false; error: Problem; screen: Screen } | { ok: true; help: string[]; screen: Screen };

const recipe = (id: string) => RECIPES.find((item) => item.id === id)!;
const oneOf = (values: readonly string[]) => ({ type: "string", enum: [...values] });
const object = (properties: Record<string, Json>, required: string[]): Json => ({ type: "object", properties, required, additionalProperties: false });
const recipeInput = () => object({ id: oneOf(RECIPES.map((item) => item.id)) }, ["id"]);

/** One action, with what it does to the kitchen. */
interface Live extends Action {
  run: (state: KitchenState, input: Record<string, Json>) => KitchenState;
}

function cookActions(state: KitchenState): Live[] {
  const cook = state.cook!;
  const steps = recipe(cook.recipe).steps;
  const actions: Live[] = [];
  if (cook.step < steps.length - 1) actions.push({ name: "nextStep", title: "Turn to the next step", from: "cook", run: (s) => ({ ...s, cook: { ...cook, step: cook.step + 1 } }) });
  if (cook.step > 0) actions.push({ name: "previousStep", title: "Turn back a step", from: "cook", run: (s) => ({ ...s, cook: { ...cook, step: cook.step - 1 } }) });
  actions.push({
    name: "checkIngredient",
    title: "Check or uncheck an ingredient on this step",
    from: "cook",
    input: object({ checked: { type: "boolean" }, id: oneOf(steps[cook.step]!.ingredients.map((item) => item.id)) }, ["checked", "id"]),
    run: (s, input) => {
      const others = cook.checked.filter((id) => id !== input.id);
      return { ...s, cook: { ...cook, checked: input.checked ? [...others, String(input.id)] : others } };
    },
  });
  // A full-screen cover replaces what it covers, so it lends its own goBack and no tab bar shows through.
  actions.push({ name: "goBack", title: "Close cook mode", from: "cover", run: (s) => ({ ...s, cook: null }) });
  return actions;
}

function pageActions(state: KitchenState, page: string): Live[] {
  const actions: Live[] = [];
  if (page === "kitchen") {
    actions.push({ name: "openRecipe", title: "Open a recipe", from: "kitchen", input: recipeInput(), run: (s, input) => ({ ...s, stack: [...s.stack, `recipe:${String(input.id)}`] }) });
    actions.push({ name: "startCooking", title: "Start cooking a recipe", from: "kitchen", input: recipeInput(), run: (s, input) => ({ ...s, cook: { recipe: String(input.id), step: 0, checked: [] } }) });
  } else if (page.startsWith("recipe:")) {
    const id = page.slice("recipe:".length);
    actions.push({ name: "startCooking", title: "Start cooking", from: "recipe", run: (s) => ({ ...s, cook: { recipe: id, step: 0, checked: [] } }) });
  }
  // The stack lends goBack once it is deeper than its root; the tab bar lends selectTab.
  if (state.stack.length > 0) actions.push({ name: "goBack", title: "Go back a page", from: "stack", run: (s) => ({ ...s, stack: s.stack.slice(0, -1) }) });
  actions.push({ name: "selectTab", title: "Switch to a tab", from: "tabs", input: object({ tab: oneOf(TABS) }, ["tab"]), run: (s, input) => ({ tab: String(input.tab), stack: [], cook: null }) });
  return actions;
}

function live(state: KitchenState): { screen: Omit<Screen, "actions">; actions: Live[] } {
  if (state.cook) {
    const cook = state.cook;
    const found = recipe(cook.recipe);
    const step = found.steps[cook.step]!;
    const checked = step.ingredients.filter((item) => cook.checked.includes(item.id)).length;
    return {
      screen: {
        focus: "cook",
        path: ["spoonjoy", "cover", "cook"],
        state: {
          title: found.title,
          step: `Step ${cook.step + 1} of ${found.steps.length}`,
          stepTitle: step.title,
          ...(step.timer ? { timer: step.timer } : {}),
          ingredients: step.ingredients.map((item) => ({ id: item.id, title: item.title, quantity: item.quantity, checked: cook.checked.includes(item.id) })),
          page: `${checked} of ${step.ingredients.length} checked`,
        },
      },
      actions: cookActions(state),
    };
  }
  const page = state.stack.at(-1) ?? state.tab;
  let pageState: Json;
  if (page === "kitchen") {
    pageState = { recipes: RECIPES.map((item) => ({ id: item.id, title: item.title, steps: item.steps.length })), lead: { id: RECIPES[0]!.id, title: RECIPES[0]!.title } };
  } else if (page.startsWith("recipe:")) {
    const found = recipe(page.slice("recipe:".length));
    pageState = { id: found.id, title: found.title, servings: found.servings, steps: found.steps.map((step, index) => ({ number: index + 1, title: step.title, ingredients: step.ingredients.map((item) => item.title) })) };
  } else {
    pageState = { note: kitchen.words.emptyDrawer };
  }
  const focus = page.startsWith("recipe:") ? "recipe" : page;
  return { screen: { focus, path: ["spoonjoy", "tabs", "stack", focus], state: pageState }, actions: pageActions(state, page) };
}

const strip = ({ run: _run, ...action }: Live): Action => action;

/** `ls`: the focus, its path, its state and every action you may run now. */
export function ls(state: KitchenState): Screen {
  const { screen, actions } = live(state);
  return { ...screen, actions: actions.map(strip) };
}

/** The problems with an input, as Reins' schema check words them. */
function problemsWith(schema: Json, value: Json, path = "$"): string[] {
  const shape = schema as { properties: Record<string, { type: string; enum?: string[] }>; required: string[] };
  if (typeof value !== "object" || value === null || Array.isArray(value)) return [`${path}: expected an object`];
  const found: string[] = [];
  for (const key of [...shape.required].sort()) if (value[key] === undefined || value[key] === null) found.push(`${path}.${key}: required, missing`);
  for (const [key, member] of Object.entries(value)) {
    const rule = shape.properties[key];
    if (!rule) found.push(`${path}.${key}: not allowed`);
    else if (rule.enum && !(typeof member === "string" && rule.enum.includes(member))) found.push(`${path}.${key}: ${JSON.stringify(member)} isn't one of ${rule.enum.map((item) => `"${item}"`).join(", ")}`);
    else if (rule.type === "boolean" && typeof member !== "boolean") found.push(`${path}.${key}: expected a boolean`);
  }
  return found;
}

/** Reins' wording with its {placeholders} filled in. */
const fill = (words: string, values: Record<string, string>) => words.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? "");

const refuse = (code: Problem["code"], thing: string, problem: string, fix: string): Problem => ({ code, exit: 2, thing, problem, fix, message: `${thing}: ${problem}. Fix: ${fix}.` });

export const HELP: string[] = kitchen.words.help;

/** Runs one line, as `ReinsCommandLine` would: `ls`, `help` or `do <action> [json]`. Never throws. */
export function run(state: KitchenState, line: string): { state: KitchenState; reply: Reply } {
  const text = line.trim();
  const screen = () => ls(state);
  if (text === "ls") return { state, reply: { ok: true, screen: screen() } };
  if (text === "help") return { state, reply: { ok: true, help: HELP, screen: screen() } };
  const match = /^do\s+([A-Za-z]\w*)\s*(.*)$/.exec(text);
  if (!match) return { state, reply: { ok: false, error: refuse("bad-request", "request", `"${text}" isn't ls, help or do <action> [json]`, "send `ls`, `do <action> [json]` or `help`"), screen: screen() } };
  const [, name, rest] = match as unknown as [string, string, string];
  const { actions } = live(state);
  const action = actions.find((item) => item.name === name);
  if (!action) {
    const names = actions.map((item) => item.name);
    return { state, reply: { ok: false, error: refuse("action-unavailable", `do ${name}`, `${name} isn't available on ${screen().focus}`, `use one of: ${names.join(", ")}`), screen: screen() } };
  }
  let input: Json = null;
  if (rest) {
    try {
      input = JSON.parse(rest) as Json;
    } catch {
      return { state, reply: { ok: false, error: refuse("bad-request", "request", `the input after do ${name} isn't JSON`, `send do ${name} {"key":"value"}`), screen: screen() } };
    }
  }
  if (!action.input && input !== null) return { state, reply: { ok: false, error: refuse("input-unexpected", `do ${name}`, fill(kitchen.words.unexpected, { action: name, input: JSON.stringify(input) }), fill(kitchen.words.unexpectedFix, { action: name })), screen: screen() } };
  if (action.input) {
    const problems = problemsWith(action.input, input ?? {});
    if (problems.length) return { state, reply: { ok: false, error: refuse("input-invalid", `do ${name}`, problems.join("; "), `send input matching ${JSON.stringify(action.input)}`), screen: screen() } };
  }
  const next = action.run(state, (input ?? {}) as Record<string, Json>);
  return { state: next, reply: { ok: true, screen: ls(next) } };
}

/** The journey Spoonjoy's spike timed: Kitchen → recipe → cook → next → previous → close → back. */
export const JOURNEY = [
  'do openRecipe {"id":"recipe_lemon_pantry_pasta"}',
  "do startCooking",
  "do nextStep",
  "do previousStep",
  "do goBack",
  "do goBack",
] as const;

/** A ready-to-run line for each action on screen now, with the first valid input filled in. */
export function suggestions(state: KitchenState): string[] {
  const lines = ["ls"];
  for (const action of ls(state).actions) {
    if (!action.input) {
      lines.push(`do ${action.name}`);
      continue;
    }
    const shape = action.input as { properties: Record<string, { type: string; enum?: string[] }> };
    const example: Record<string, Json> = {};
    for (const [key, rule] of Object.entries(shape.properties)) example[key] = rule.enum ? (action.name === "selectTab" ? (rule.enum.find((tab) => tab !== state.tab) ?? rule.enum[0]!) : rule.enum[0]!) : true;
    lines.push(`do ${action.name} ${JSON.stringify(example)}`);
  }
  return lines;
}
