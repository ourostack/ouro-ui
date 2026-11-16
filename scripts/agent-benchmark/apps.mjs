// The apps the benchmark runs tasks in. Each brings its synthetic store, its web screen, the MCP tools its action model
// generates, and the plain hand-written MCP tools of the fourth arm. Every arm reaches an app's state only through the
// store's handlers, so a task's check reads the same state whichever arm ran it.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createStore as createPantry } from "./fixture/store.mjs";
import { startServer as startPantry } from "./fixture/server.mjs";
import { createStore as createDocuments, ROOT, folderOf } from "./fixture/documents/store.mjs";
import { DocumentError } from "./fixture/documents/store.mjs";
import { startServer as startDocuments } from "./fixture/documents/server.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const readJson = (file) => JSON.parse(fs.readFileSync(path.join(here, file), "utf8"));

// ---- Pantry's plain server: CRUD with terse descriptions and no consent classes --------------------------------

const pantryPlainTools = [
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

// ---- Ouro MD's plain server: the file tools a general MCP filesystem server offers ------------------------------

/** The text of the document at `file`, by its path (absolute, or relative to the served folder). */
const readText = (handlers, file) => handlers.read_document({ document: String(file ?? "") }).markdown;

/**
 * The shape of the reference filesystem MCP server (modelcontextprotocol/servers, `src/filesystem`): list a folder,
 * read a file, write a file, and edit one by exact text replacement. It is the server an agent most often gets for
 * Markdown files, and the best plain setup here: it has no append, and its writes need no confirmation.
 */
const documentsPlainTools = [
  {
    name: "list_directory",
    description: "List the files and folders in a directory. Entries are marked [FILE] or [DIR].",
    parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
    run: (handlers, args, state) => {
      const dir = String(args.path).replace(/\/+$/, "") || ROOT;
      const relative = dir === ROOT ? "" : dir.startsWith(`${ROOT}/`) ? dir.slice(ROOT.length + 1) : dir.startsWith("/") ? null : dir;
      if (relative === null) throw new DocumentError(`Access denied: ${dir} is outside the allowed directory ${ROOT}.`);
      const entries = new Set();
      for (const doc of state.documents) {
        const folder = folderOf(doc.path);
        const inside = relative ? (folder === relative ? "" : folder.startsWith(`${relative}/`) ? folder.slice(relative.length + 1) : null) : folder;
        if (inside === null) continue;
        entries.add(inside ? `[DIR] ${inside.split("/")[0]}` : `[FILE] ${doc.path.split("/").at(-1)}`);
      }
      if (!entries.size) throw new DocumentError(`No such directory: ${dir}.`);
      return [...entries].sort().join("\n");
    },
  },
  {
    name: "read_text_file",
    description: "Read the complete contents of a file as text.",
    parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
    run: (handlers, args) => readText(handlers, args.path),
  },
  {
    name: "write_file",
    description: "Overwrite an existing file with new content.",
    parameters: { type: "object", properties: { path: { type: "string" }, content: { type: "string" } }, required: ["path", "content"] },
    run: (handlers, args) => {
      handlers.replace_document({ document: String(args.path), markdown: String(args.content), confirmed: true });
      return `Successfully wrote to ${args.path}`;
    },
  },
  {
    name: "edit_file",
    description: "Make line-based edits to a text file. Each edit replaces exact text with new text.",
    parameters: {
      type: "object",
      properties: { path: { type: "string" }, edits: { type: "array", items: { type: "object", properties: { oldText: { type: "string" }, newText: { type: "string" } }, required: ["oldText", "newText"] } } },
      required: ["path", "edits"],
    },
    run: (handlers, args) => {
      let text = readText(handlers, args.path);
      for (const edit of Array.isArray(args.edits) ? args.edits : []) {
        if (!text.includes(String(edit.oldText))) throw new DocumentError(`Could not find exact match for edit: ${edit.oldText}`);
        text = text.replace(String(edit.oldText), String(edit.newText));
      }
      handlers.replace_document({ document: String(args.path), markdown: text, confirmed: true });
      return `Successfully edited ${args.path}`;
    },
  },
];

/** Each app: what the system prompt calls it, its store and screen, its generated MCP tools and its plain ones. */
export const APPS = [
  {
    id: "pantry",
    name: "Pantry",
    kind: "cooking app",
    source: "A synthetic app shaped like Spoonjoy's shopping list and recipes, declared in fixture/pantry.actions.mts.",
    createStore: createPantry,
    startServer: startPantry,
    navigateExample: "/recipes",
    mcp: readJson("fixture/generated/mcp.json"),
    plainTools: pantryPlainTools,
  },
  {
    id: "ouro-md",
    name: "Ouro MD",
    kind: "Markdown editor",
    source: "Ouro MD's own document actions (fixture/documents/source.json), over a synthetic folder of documents.",
    createStore: createDocuments,
    startServer: startDocuments,
    navigateExample: "/",
    mcp: readJson("fixture/documents/generated/mcp.json"),
    plainTools: documentsPlainTools,
  },
];

export const appById = (id) => {
  const app = APPS.find((candidate) => candidate.id === id);
  if (!app) throw new Error(`No app ${JSON.stringify(id)}. Apps: ${APPS.map((a) => a.id).join(", ")}.`);
  return app;
};

/** The system prompt every arm and model gets for `app`, word for word. */
export const systemPromptFor = (app) =>
  [`You act for a person in ${app.name}, their ${app.kind}, using only the tools you have.`, "Do what they ask. When you have finished, or if you can't do it, reply to them in one or two sentences saying what you did."].join(" ");
