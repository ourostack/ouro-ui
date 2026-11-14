import { type ChildProcessWithoutNullStreams, execFileSync, spawn } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import type { Page } from "@playwright/test";
import { expect, test } from "../ouro-fixtures";

// The host harness: OuroMcpApp built into one HTML file with the recipe catalog (scripts/mcp-app.mts), served as a
// ui:// resource by the example MCP server (test/mcp-app/recipe-server.mts), and framed by a small MCP Apps host
// (test/mcp-app/host.html) that plays the host's side of the protocol and passes the view's tool calls to the server.
// Repository only. OURO_MCP_APP_SHOTS=<folder> also saves phone-width screenshots, light and dark.

const repo = process.cwd();
const out = join(repo, ".tmp/mcp-app-host");
const view = join(out, "recipe.html");
const HOST = "https://host.test/";
const PHOTO = "https://ui.ouroboros.bot/a2ui/v1/examples/charred-lemon-orzo.png";
const shots = process.env["OURO_MCP_APP_SHOTS"];

// One worker builds the view and starts the server once for the file's tests.
test.describe.configure({ mode: "serial" });

let server: ChildProcessWithoutNullStreams;
const waiting = new Map<number, (message: { result?: unknown; error?: { message: string } }) => void>();
let next = 0;

/** The harness's MCP client: one request to the example server over stdio. */
function mcp(method: string, params: unknown): Promise<unknown> {
  const id = ++next;
  return new Promise((resolve, reject) => {
    waiting.set(id, (m) => (m.error ? reject(new Error(m.error.message)) : resolve(m.result)));
    server.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  });
}

test.beforeAll(() => {
  mkdirSync(out, { recursive: true });
  execFileSync(process.execPath, ["scripts/mcp-app.mts", "build", "--catalog", "test/fixtures/a2ui/recipe.catalog.json", "--out", view, "--handoff-url", "https://kitchen.example.com/recipes/rcp_lemon_orzo?do={action}", "--name", "Recipes"], { cwd: repo, stdio: "pipe" });
  server = spawn(process.execPath, ["test/mcp-app/recipe-server.mts", "--view", view], { cwd: repo });
  createInterface({ input: server.stdout }).on("line", (line) => {
    const message = JSON.parse(line) as { id: number; result?: unknown; error?: { message: string } };
    waiting.get(message.id)?.(message);
    waiting.delete(message.id);
  });
});

test.afterAll(() => {
  server.kill();
});

/** Opens the host at a phone's width with the card the show_recipe tool returned, and waits for it to render. */
async function openHost(page: Page, theme: "light" | "dark" = "light") {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.exposeFunction("mcp", mcp);
  await page.route(HOST + "**", (route) => route.fulfill({ contentType: "text/html", body: readFileSync(join(repo, "test/mcp-app/host.html")) }));
  await page.route(PHOTO, (route) => route.fulfill({ contentType: "image/png", body: readFileSync(join(repo, "site/public/a2ui/v1/examples/charred-lemon-orzo.png")) }));
  await page.goto(`${HOST}?theme=${theme}`);
  const card = page.frameLocator("#view");
  await expect(card.getByRole("heading", { level: 1 })).toHaveText("Charred Lemon Orzo");
  await expect(card.getByRole("img", { name: "A shallow pan of golden orzo with peas and charred lemon halves" })).toHaveJSProperty("complete", true);
  return card;
}

/** The tools/call requests the view sent the host. */
const toolCalls = (page: Page) => page.evaluate(() => (window as unknown as { hostLog: { method?: string; params?: unknown }[] }).hostLog.filter((m) => m.method === "tools/call").map((m) => m.params));

test("the card the tool returned renders in the host, and the frame takes the card's height", async ({ page }) => {
  await openHost(page);
  const log = await page.evaluate(() => (window as unknown as { hostLog: { method?: string; params?: { appInfo?: unknown } }[] }).hostLog);
  expect(log[0]).toMatchObject({ method: "ui/initialize", params: { appInfo: { name: "Recipes" }, protocolVersion: "2026-01-26" } });
  expect(log[1]).toMatchObject({ method: "ui/notifications/initialized" });
  await expect.poll(async () => (await page.locator("#view").boundingBox())!.height).toBeGreaterThan(900);
  expect(await toolCalls(page)).toEqual([]);
  if (shots) {
    mkdirSync(shots, { recursive: true });
    await page.screenshot({ path: join(shots, "card-light.png"), fullPage: true });
  }
});

test("a write button calls its own tool with the prepared input, and shows what the tool said", async ({ page }) => {
  const card = await openHost(page);
  await card.getByRole("button", { name: "Add ingredients to list" }).click();
  await expect(card.locator('[data-ouro="alert"]')).toContainText("Added 6 ingredients for 4 servings to your shopping list.");
  expect(await toolCalls(page)).toEqual([{ name: "add_recipe_to_shopping_list", arguments: { recipe: "rcp_lemon_orzo", servings: 4 } }]);
});

test("a consequential button calls its tool only after the person confirms", async ({ page }) => {
  const card = await openHost(page);
  await card.getByRole("button", { name: "Share recipe" }).click();
  const confirm = card.getByRole("alertdialog", { name: "Share recipe?" });
  await expect(confirm).toContainText("sam@example.com");
  if (shots) {
    await confirm.scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(shots, "confirm-light.png") });
  }
  await confirm.getByRole("button", { name: "Cancel" }).click();
  await expect(confirm).toBeHidden();
  expect(await toolCalls(page)).toEqual([]);
  await card.getByRole("button", { name: "Share recipe" }).click();
  await confirm.getByRole("button", { name: "Share recipe" }).click();
  await expect(card.locator('[data-ouro="alert"]')).toContainText("Shared Charred Lemon Orzo with sam@example.com.");
  expect(await toolCalls(page)).toEqual([{ name: "share_recipe", arguments: { recipe: "rcp_lemon_orzo", with: "sam@example.com" } }]);
});

test("a person-only button opens the app's own screen and never calls a tool", async ({ page }) => {
  const card = await openHost(page);
  await card.getByRole("button", { name: "Order ingredients" }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { hostLog: { method?: string; params?: unknown }[] }).hostLog.filter((m) => m.method === "ui/open-link").map((m) => m.params))).toEqual([{ url: "https://kitchen.example.com/recipes/rcp_lemon_orzo?do=order_ingredients" }]);
  expect(await toolCalls(page)).toEqual([]);
});

test("an agent that tries to press a button through the screen is refused with INVALID_FUNCTION_CALL", async ({ page }) => {
  await openHost(page);
  const answer = await page.evaluate(() => (window as unknown as { hostRequest: (method: string, params: unknown) => Promise<unknown> }).hostRequest("tools/call", { name: "order_ingredients", arguments: {} }));
  expect(answer).toMatchObject({ error: { data: { code: "INVALID_FUNCTION_CALL", refusal: { state: "refused" } } } });
  expect(await toolCalls(page)).toEqual([]);
});

test("the card follows the host's dark theme", async ({ page }) => {
  const card = await openHost(page, "dark");
  await expect(card.locator("html")).toHaveClass(/\bdark\b/);
  if (shots) {
    await page.screenshot({ path: join(shots, "card-dark.png"), fullPage: true });
    await card.getByRole("button", { name: "Share recipe" }).click();
    const confirm = card.getByRole("alertdialog", { name: "Share recipe?" });
    await expect(confirm).toBeVisible();
    await confirm.scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(shots, "confirm-dark.png") });
  }
});
