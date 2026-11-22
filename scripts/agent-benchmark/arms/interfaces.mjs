/* global URL, setTimeout, window */
// The four ways an agent reaches an app (apps.mjs), and a fifth that runs on macOS only. Each arm opens on one trial's app and
// store (`open({ app, store, browser })`, the app Pantry when none is given) and returns the
// tools the model gets: `{ name, description, parameters, handler(args) -> string }`. The runner gives every arm the
// same model, system prompt and task words; only these tools differ. Each tool's text is all the model sees.
import { spawn } from "node:child_process";
import fs from "node:fs";
import readline from "node:readline";
import { AppError } from "../fixture/app-error.mjs";
import { appById } from "../apps.mjs";
import { BRIDGE_SOURCE } from "./bridge-page.mjs";

const json = (value) => JSON.stringify(value);

/** A failure of the machine (the browser, the page), not of the model: such a trial is retried once, never scored. */
export class InfrastructureError extends Error {}
const failure = (error) => {
  if (error instanceof AppError) return json({ error: error.message });
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
    if (type === "array" ? !Array.isArray(value) : typeof value !== type) problems.push(`${name} must be a${/^[aeiou]/.test(spec.type) ? "n" : ""} ${spec.type}`);
    else if (spec.enum && !spec.enum.includes(value)) problems.push(`${name} must be one of ${spec.enum.join(", ")}`);
    else if (typeof spec.minimum === "number" && value < spec.minimum) problems.push(`${name} must be at least ${spec.minimum}`);
  }
  return problems;
}

// ---- 1. the action model: MCP tools generated from defineAction --------------------------------------------------

/** Ouro UI's action model: the MCP tools `ouro-actions generate` wrote from the app's declarations, unchanged. */
export const actionModel = {
  id: "action-model",
  title: "Ouro UI action model (generated MCP tools)",
  async open({ app = appById("pantry"), store }) {
    const generatedMcp = app.mcp;
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

/**
 * A plain MCP server written by hand, apart from the screen: CRUD over the list and the recipes, terse descriptions,
 * no consent classes. It has no tool for the screen's "Add ingredients to list", and its order tool is a tool like any
 * other, as a server without a consent model has (Spoonjoy's hand-written server served `create_api_token` and
 * `delete_recipe` the same way).
 */
export const plainMcp = {
  id: "plain-mcp",
  title: "Plain hand-written MCP tools",
  async open({ app = appById("pantry"), store }) {
    const tools = app.plainTools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      handler: (args) => {
        const problems = validateArgs(tool.parameters, args);
        if (problems.length) return json({ error: `${problems.join("; ")}.` });
        try {
          const result = tool.run(store.handlers, args ?? {}, store.state);
          return typeof result === "string" ? result : json(result);
        } catch (error) {
          return failure(error);
        }
      },
    }));
    return { tools, refusals: [], close: async () => {} };
  },
};

// ---- the web screen, for the two arms that use it ----------------------------------------------------------------

/**
 * `tools` with their handlers queued, so calls a model sends in one turn run one after another on the one tab, as
 * Playwright MCP runs them. Run at once, two `fill`s race for focus and type into the wrong field.
 */
export function oneAtATime(tools) {
  let queue = Promise.resolve();
  return tools.map((tool) => ({
    ...tool,
    handler: (args) => {
      const run = queue.then(() => tool.handler(args));
      queue = run.catch(() => {});
      return run;
    },
  }));
}

async function openScreen({ app = appById("pantry"), store, browser }) {
  if (!browser) throw new Error("This arm needs a browser: pass one from playwright's chromium.launch().");
  if (!browser.isConnected()) throw new InfrastructureError("The browser is not connected.");
  const server = await app.startServer(store);
  let context = null;
  let infraError = null;
  const onDisconnected = () => {
    infraError = infraError ?? "The browser disconnected during the trial.";
  };
  browser.on("disconnected", onDisconnected);
  const close = async () => {
    browser.off("disconnected", onDisconnected);
    await context?.close().catch(() => {});
    await server.close();
  };
  try {
    context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    page.on("crash", () => {
      infraError = infraError ?? "The page crashed during the trial.";
    });
    page.setDefaultTimeout(5_000);
    await page.goto(server.url);
    return { app, server, page, close, infraError: () => infraError };
  } catch (error) {
    await close();
    throw new InfrastructureError(`The screen did not open: ${String(error.message).split("\n")[0]}`);
  }
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
        description: `Navigate the tab to a path in the app, such as ${screen.app.navigateExample}.`,
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
    return { tools: oneAtATime(tools), refusals: [], close: screen.close, get infraError() { return screen.infraError(); } };
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
    return { tools: oneAtATime(tools), refusals: [], close: screen.close, get infraError() { return screen.infraError(); }, get personRefusals() { return refused; } };
  },
};

// ---- 5. the Apple arm, when it can run -------------------------------------------------------------------------

/** Where `swift build -c release` leaves the host (apple/), unless OURO_APPLE_HOST names another. */
export const APPLE_HOST = new URL("../apple/.build/release/pantry-host", import.meta.url).pathname;

/**
 * App Intents on Apple. A small macOS command (apple/, built only in CI on a hosted macOS runner) links the generated
 * `OuroActions.swift` and binds its handlers to a seeded in-memory kitchen. This bridge lists the generated tools whose
 * App Intent the host has, and runs one by sending the host a line of JSON: the host constructs the intent, sets its
 * parameters and calls `perform()` in process, which is not Siri or Shortcuts, and returns the handler's result. The
 * host's kitchen is the state, so after each call its items replace the runner's copy for the task's check. The
 * person-only action has no App Intent, so no tool names it; if one did, the host would answer with the generated
 * typed refusal and it would count as a refusal.
 */
export const appleAppIntents = {
  id: "apple-app-intents",
  title: "App Intents (Apple)",
  async open({ app = appById("pantry"), store, host = process.env.OURO_APPLE_HOST ?? APPLE_HOST }) {
    if (app.id !== "pantry") throw new Error("The apple-app-intents arm serves Pantry only: the generated OuroActions.swift declares that set.");
    if (!fs.existsSync(host)) throw new InfrastructureError(`The App Intents host is not built (${host}): run swift build -c release in scripts/agent-benchmark/apple on macOS.`);
    const child = spawn(host, [], { stdio: ["pipe", "pipe", "inherit"] });
    const lines = readline.createInterface({ input: child.stdout })[Symbol.asyncIterator]();
    let infraError = null;
    child.stdin.on("error", () => {});
    child.on("error", (error) => {
      infraError = infraError ?? `The App Intents host did not start: ${error.message}`;
    });
    child.on("exit", (code) => {
      infraError = infraError ?? `The App Intents host exited with ${code}.`;
    });
    let queue = Promise.resolve();
    const ask = (request) => {
      const run = queue.then(async () => {
        if (infraError) throw new InfrastructureError(infraError);
        child.stdin.write(`${json(request)}\n`);
        const { value, done } = await lines.next();
        if (done) throw new InfrastructureError(infraError ?? "The App Intents host closed its output.");
        return JSON.parse(value);
      });
      queue = run.catch(() => {});
      return run;
    };
    let refused = 0;
    const close = async () => {
      child.stdin.end();
      child.kill();
    };
    try {
      const { intents } = await ask({ list: true });
      const tools = app.mcp.tools
        .filter((tool) => intents.includes(tool.name))
        .map((tool) => ({
          name: tool.name,
          description: tool.description,
          parameters: tool.inputSchema,
          annotations: tool.annotations,
          handler: async (args) => {
            const problems = validateArgs(tool.inputSchema, args);
            if (problems.length) return json({ error: `${problems.join("; ")}.` });
            const reply = await ask({ action: tool.name, args: args ?? {} });
            if (reply.items) store.state.items.splice(0, store.state.items.length, ...reply.items);
            if (reply.refused) {
              refused++;
              return json({ error: reply.refused.message, code: reply.refused.code });
            }
            return json(reply.error === undefined ? reply.result : { error: reply.error });
          },
        }));
      return { tools, refusals: [], close, get infraError() { return infraError; }, get personRefusals() { return refused; } };
    } catch (error) {
      await close();
      throw error;
    }
  },
};

export const ARMS = [actionModel, browser, bridge, plainMcp];
export const ALL_ARMS = [...ARMS, appleAppIntents];

export const armById = (id) => {
  const arm = ALL_ARMS.find((candidate) => candidate.id === id);
  if (!arm) throw new Error(`No arm ${JSON.stringify(id)}. Arms: ${ALL_ARMS.map((a) => a.id).join(", ")}.`);
  return arm;
};
