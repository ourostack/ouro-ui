/* global URL, setTimeout, window */
// The four ways an agent reaches Pantry, and the hook for a fifth. Each arm opens on one trial's store and returns the
// tools the model gets: `{ name, description, parameters, handler(args) -> string }`. The runner gives every arm the
// same model, system prompt and task words; only these tools differ. Each tool's text is all the model sees.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PantryError } from "../fixture/store.mjs";
import { startServer } from "../fixture/server.mjs";
import { BRIDGE_SOURCE } from "./bridge-page.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const generatedMcp = JSON.parse(fs.readFileSync(path.join(here, "..", "fixture", "generated", "mcp.json"), "utf8"));

const json = (value) => JSON.stringify(value);
const failure = (error) => {
  if (error instanceof PantryError) return json({ error: error.message });
  throw error;
};

/** Checks `args` against a tool's JSON Schema as an MCP server's validator would: types, required, enums, extras. */
export function validateArgs(schema, args) {
  const input = args ?? {};
  const problems = [];
  for (const name of schema.required ?? []) if (input[name] === undefined) problems.push(`${name} is required`);
  for (const [name, value] of Object.entries(input)) {
    const spec = schema.properties?.[name];
    if (!spec) {
      if (schema.additionalProperties === false) problems.push(`${name} is not an input of this tool`);
      continue;
    }
    if (value === undefined || value === null) continue;
    const type = spec.type === "integer" ? "number" : spec.type;
    if (typeof value !== type) problems.push(`${name} must be a ${spec.type}`);
    else if (spec.enum && !spec.enum.includes(value)) problems.push(`${name} must be one of ${spec.enum.join(", ")}`);
    else if (typeof spec.minimum === "number" && value < spec.minimum) problems.push(`${name} must be at least ${spec.minimum}`);
  }
  return problems;
}

// ---- 1. the action model: MCP tools generated from defineAction --------------------------------------------------

/** Ouro UI's action model: the MCP tools `ouro-actions generate` wrote from fixture/pantry.actions.mts, unchanged. */
export const actionModel = {
  id: "action-model",
  title: "Ouro UI action model (generated MCP tools)",
  async open({ store }) {
    const tools = generatedMcp.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
      annotations: tool.annotations,
      handler: (args) => {
        const problems = validateArgs(tool.inputSchema, args);
        if (problems.length) return json({ error: `${problems.join("; ")}.` });
        try {
          return json(store.handlers[tool.name](args ?? {}));
        } catch (error) {
          return failure(error);
        }
      },
    }));
    return { tools, refusals: Object.keys(generatedMcp.refusals ?? {}), close: async () => {} };
  },
};

// ---- 4. a plain, hand-written MCP server with no GUI parity ------------------------------------------------------

const plainTools = [
  {
    name: "list_items",
    description: "Get shopping list items.",
    parameters: { type: "object", properties: {}, required: [] },
    run: (handlers) => handlers.get_shopping_list({}),
  },
  {
    name: "add_item",
    description: "Add item to shopping list.",
    parameters: { type: "object", properties: { name: { type: "string" }, quantity: { type: "number" }, unit: { type: "string" } }, required: ["name"] },
    run: (handlers, args) => handlers.add_shopping_list_item(args),
  },
  {
    name: "update_item",
    description: "Update a shopping list item.",
    parameters: { type: "object", properties: { id: { type: "string" }, checked: { type: "boolean" } }, required: ["id"] },
    run: (handlers, args) => (args.checked === undefined ? {} : handlers.set_shopping_list_item_checked(args)),
  },
  {
    name: "delete_item",
    description: "Delete a shopping list item.",
    parameters: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    run: (handlers, args) => handlers.remove_shopping_list_item(args),
  },
  {
    name: "search_recipes",
    description: "Search recipes.",
    parameters: { type: "object", properties: { q: { type: "string" } }, required: ["q"] },
    run: (handlers, args) => handlers.search_recipes({ query: args.q }),
  },
  {
    name: "get_recipe",
    description: "Get a recipe with its ingredients.",
    parameters: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    run: (handlers, args) => handlers.get_recipe(args),
  },
  {
    name: "place_order",
    description: "Place a grocery order for the list.",
    parameters: { type: "object", properties: { store: { type: "string", enum: ["corner", "market"] } }, required: ["store"] },
    run: (handlers, args) => handlers.place_grocery_order(args),
  },
];

/**
 * A plain MCP server written by hand, apart from the screen: CRUD over the list and the recipes, terse descriptions,
 * no consent classes. It has no tool for the screen's "Add ingredients to list", and its order tool is a tool like any
 * other, as a server without a consent model has (Spoonjoy's hand-written server served `create_api_token` and
 * `delete_recipe` the same way).
 */
export const plainMcp = {
  id: "plain-mcp",
  title: "Plain hand-written MCP tools",
  async open({ store }) {
    const tools = plainTools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      handler: (args) => {
        const problems = validateArgs(tool.parameters, args);
        if (problems.length) return json({ error: `${problems.join("; ")}.` });
        try {
          return json(tool.run(store.handlers, args ?? {}));
        } catch (error) {
          return failure(error);
        }
      },
    }));
    return { tools, refusals: [], close: async () => {} };
  },
};

// ---- the web screen, for the two arms that use it ----------------------------------------------------------------

async function openScreen({ store, browser }) {
  if (!browser) throw new Error("This arm needs a browser: pass one from playwright's chromium.launch().");
  const server = await startServer(store);
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(5_000);
  await page.goto(server.url);
  const close = async () => {
    await context.close();
    await server.close();
  };
  return { server, page, close };
}

// ---- 2. browser driving: Playwright over the accessibility tree --------------------------------------------------

/** What Playwright MCP returns after each step: the page's address and title, then its accessibility snapshot with refs. */
async function describePage(page) {
  const snapshot = await page.ariaSnapshot({ mode: "ai" });
  return `- Page URL: ${new URL(page.url()).pathname}\n- Page Title: ${await page.title()}\n- Page Snapshot:\n\`\`\`yaml\n${snapshot}\n\`\`\``;
}

const settle = (page) => page.waitForLoadState("load").catch(() => {});

/** Browser driving in the shape of Playwright MCP: a snapshot with refs, then click, type and select by ref. */
export const browser = {
  id: "browser",
  title: "Browser driving (Playwright, accessibility tree)",
  async open(context) {
    const screen = await openScreen(context);
    const { page } = screen;
    const byRef = (ref) => page.locator(`aria-ref=${String(ref)}`);
    // Like Playwright MCP, an action that starts a navigation returns once the new page has loaded.
    const step = (fn) => async (args) => {
      let navigation = null;
      const onRequest = (request) => {
        if (!navigation && request.isNavigationRequest() && request.frame() === page.mainFrame()) {
          navigation = new Promise((resolve) => {
            const onNavigated = (frame) => {
              if (frame !== page.mainFrame()) return;
              page.off("framenavigated", onNavigated);
              resolve();
            };
            page.on("framenavigated", onNavigated);
            setTimeout(resolve, 10_000);
          });
        }
      };
      page.on("request", onRequest);
      try {
        await fn(args ?? {});
        if (navigation) await navigation;
        await settle(page);
        return await describePage(page);
      } catch (error) {
        return `Error: ${String(error.message).split("\n")[0]}\n\n${await describePage(page)}`;
      } finally {
        page.off("request", onRequest);
      }
    };
    const ref = { type: "string", description: "Exact target element reference from the page snapshot, such as e12." };
    const element = { type: "string", description: "Human-readable element description, used to say what you are acting on." };
    const tools = [
      {
        name: "browser_snapshot",
        description: "Capture an accessibility snapshot of the current page in the browser tab where the app is open. Better than a screenshot.",
        parameters: { type: "object", properties: {}, required: [] },
        handler: step(async () => {}),
      },
      {
        name: "browser_navigate",
        description: "Navigate the tab to a path in the app, such as /recipes.",
        parameters: { type: "object", properties: { url: { type: "string", description: "The path or URL to go to." } }, required: ["url"] },
        handler: step(async ({ url }) => {
          await page.goto(new URL(String(url), screen.server.url).href);
        }),
      },
      {
        name: "browser_click",
        description: "Click an element on the page.",
        parameters: { type: "object", properties: { element, ref }, required: ["ref"] },
        handler: step(async ({ ref: target }) => {
          await byRef(target).click();
        }),
      },
      {
        name: "browser_type",
        description: "Type text into an editable element.",
        parameters: { type: "object", properties: { element, ref, text: { type: "string", description: "Text to type into the element." }, submit: { type: "boolean", description: "Whether to press Enter after typing." } }, required: ["ref", "text"] },
        handler: step(async ({ ref: target, text, submit }) => {
          await byRef(target).fill(String(text));
          if (submit) await byRef(target).press("Enter");
        }),
      },
      {
        name: "browser_select_option",
        description: "Select an option in a dropdown.",
        parameters: { type: "object", properties: { element, ref, values: { type: "array", items: { type: "string" }, description: "The values or labels to select." } }, required: ["ref", "values"] },
        handler: step(async ({ ref: target, values }) => {
          await byRef(target).selectOption((Array.isArray(values) ? values : [values]).map(String));
        }),
      },
    ];
    return { tools, refusals: [], close: screen.close };
  },
};

// ---- 3. a UI-SDK-style bridge: the agent works the screen's controls, the person keeps what is theirs -----------

/**
 * A bridge in the shape of Vercel UI SDK's `createAgent` (`snapshot` and `act`), written here with no dependency on
 * it: a snapshot of the screen's controls by ref, label and row; steps that set a value, tick a box or press a button;
 * a label that fits more than one control refuses rather than guessing; and a control marked `data-agent-confirm`
 * needs the person: with no `allow` given, the UI SDK's default, the bridge refuses it and says so.
 */
export const bridge = {
  id: "bridge",
  title: "UI-SDK-style bridge (snapshot and act on the screen)",
  async open(context) {
    const screen = await openScreen(context);
    const { page } = screen;
    let refused = 0;
    const ensure = async () => {
      if (!(await page.evaluate(() => Boolean(window.__pantryBridge)))) await page.evaluate(BRIDGE_SOURCE);
    };
    const snapshot = async () => {
      await ensure();
      return page.evaluate(() => ({ text: window.__pantryBridge.text(), components: window.__pantryBridge.snapshot() }));
    };
    const tools = [
      {
        name: "snapshot",
        description: "Read the person's screen: its title, messages and plain list rows, and each component's ref, kind, label, the row it sits in, its value or state, and the actions it takes.",
        parameters: { type: "object", properties: {}, required: [] },
        handler: async () => json({ page: new URL(page.url()).pathname, ...(await snapshot()) }),
      },
      {
        name: "act",
        description: "Run steps on the screen's components, in order. A step is { target, action, value }: target is a ref from snapshot or a label; action is setValue (text or number fields), select (a choice by value or label), setChecked (true or false), or press (buttons and links). Stops at the first step that fails.",
        parameters: {
          type: "object",
          properties: {
            steps: {
              type: "array",
              items: {
                type: "object",
                properties: { target: { type: "string" }, action: { type: "string", enum: ["setValue", "select", "setChecked", "press"] }, value: { type: ["string", "number", "boolean"] } },
                required: ["target", "action"],
              },
            },
          },
          required: ["steps"],
        },
        handler: async ({ steps } = {}) => {
          const results = [];
          for (const [index, raw] of (Array.isArray(steps) ? steps : []).entries()) {
            await ensure();
            const plan = await page.evaluate((s) => window.__pantryBridge.plan(s), raw);
            if (!plan.ok) {
              if (plan.needsPerson) refused++;
              return json({ ok: false, error: { step: index, message: plan.message }, steps: results, page: new URL(page.url()).pathname, ...(await snapshot()) });
            }
            const navigation = plan.navigates ? page.waitForNavigation({ timeout: 10_000 }).catch(() => {}) : null;
            await page.evaluate((s) => window.__pantryBridge.run(s), raw);
            if (navigation) await navigation;
            await settle(page);
            results.push({ step: index, ref: plan.ref, result: "done" });
          }
          return json({ ok: true, steps: results, page: new URL(page.url()).pathname, ...(await snapshot()) });
        },
      },
    ];
    return { tools, refusals: [], close: screen.close, get personRefusals() { return refused; } };
  },
};

// ---- 5. the Apple arm, when it can run -------------------------------------------------------------------------

/**
 * The hook for App Intents. The generated `OuroActions.swift` (fixture/generated/) already declares this set's
 * intents; the arm waits until Spoonjoy's Apple app serves its own (spoonjoy/spoonjoy-apple#348) and a model can call
 * App Intents headlessly in CI. Selecting it fails with that reason.
 */
export const appleAppIntents = {
  id: "apple-app-intents",
  title: "App Intents (Apple)",
  pending: "waits for spoonjoy/spoonjoy-apple#348 and a headless way for a model to call App Intents",
  async open() {
    throw new Error(`The apple-app-intents arm is not runnable yet: it ${this.pending}.`);
  },
};

export const ARMS = [actionModel, browser, bridge, plainMcp];
export const ALL_ARMS = [...ARMS, appleAppIntents];

export const armById = (id) => {
  const arm = ALL_ARMS.find((candidate) => candidate.id === id);
  if (!arm) throw new Error(`No arm ${JSON.stringify(id)}. Arms: ${ALL_ARMS.map((a) => a.id).join(", ")}.`);
  return arm;
};
