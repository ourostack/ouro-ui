import { type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { OuroMcpApp, type OuroMcpAppProps } from "@/registry/ouro/components/ouro/mcp-app/ouro-mcp-app";
import { A2UISurface } from "@/registry/ouro/components/ouro/a2ui-surface/a2ui-surface";
import { Alert } from "@/registry/ouro/components/ouro/alert/alert";
import { Spinner } from "@/registry/ouro/components/ouro/spinner/spinner";
import type { McpAppHostLink, McpAppMessage } from "@/registry/ouro/lib/ouro/mcp-app";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

// Runs in Chromium and WebKit. The host is the test: `testHost` plays its side of MCP Apps.

const field = (label: string, kind = "string", optional = false) => ({ label, kind, optional });
const refusal = { ax: "outcome/1", action: "recipe order", state: "refused", summary: "recipe order: only the person can order.", error: { code: "person-only" } };
const catalog = {
  catalogId: "https://example.com/a2ui/catalog.json",
  components: Object.fromEntries(["Card", "Stack", "Heading", "Text", "ActionButton"].map((n) => [n, {}])),
  metadata: {
    extensions: {
      bot_ouroboros_hx: {
        actions: {
          add_recipe_to_shopping_list: { consent: "write", press: "run", label: "Add ingredients to list", description: "Add this recipe's ingredients to your shopping list.", input: { recipe: field("Recipe"), servings: field("Servings", "integer", true) } },
          share_recipe: { consent: "consequential", press: "confirm", label: "Share recipe", description: "Send this recipe to someone.", input: { recipe: field("Recipe"), with: field("With") } },
          order_ingredients: { consent: "person-only", press: "handoff", label: "Order ingredients", description: "Order this recipe's ingredients.", input: { recipe: field("Recipe") }, personOnly: { how: "with Order ingredients on the recipe in the app", refusal } },
        },
      },
    },
  },
};

const card = (name: string) => [
  {
    version: "1.0",
    createSurface: {
      surfaceId: "card",
      catalogId: catalog.catalogId,
      dataModel: { id: "rcp_1", name, servings: 4 },
      components: [
        { id: "root", component: "Card", children: ["name", "shop", "share", "order"] },
        { id: "name", component: "Heading", text: { "@path": "/name" }, level: 1 },
        { id: "shop", component: "ActionButton", action: "add_recipe_to_shopping_list", input: { recipe: { "@path": "/id" }, servings: { "@path": "/servings" } } },
        { id: "share", component: "ActionButton", action: "share_recipe", input: { recipe: { "@path": "/id" }, with: "sam@example.com" } },
        { id: "order", component: "ActionButton", action: "order_ingredients" },
      ],
    },
  },
];

const toolResult = (messages: unknown[], text = "Here is the recipe.") => ({ content: [{ type: "text", text }], structuredContent: { a2ui: { version: "1.0", catalogId: catalog.catalogId, messages } } });

type Reply = { result: object } | { error: { code: number; message: string } } | "never";

/** The host: answers ui/initialize and whatever `replies` gives for a method, and keeps every message the view sent. */
function testHost(options: { init?: Reply; replies?: Record<string, (params: Record<string, unknown>) => Reply> } = {}) {
  const sent: McpAppMessage[] = [];
  let listener: ((message: unknown) => void) | undefined;
  const deliver = (message: object) => act(() => listener?.({ jsonrpc: "2.0", ...message }));
  const link: McpAppHostLink = {
    post: (message) => {
      sent.push(message);
      if (message.method === undefined || message.id === undefined) return;
      const reply = message.method === "ui/initialize" ? (options.init ?? { result: { hostCapabilities: { openLinks: {} }, hostContext: { theme: "light" } } }) : (options.replies?.[message.method]?.((message.params ?? {}) as Record<string, unknown>) ?? { result: {} });
      if (reply !== "never") queueMicrotask(() => void deliver({ id: message.id, ...reply }));
    },
    listen: (onMessage) => {
      listener = onMessage;
      return () => {
        listener = undefined;
      };
    },
  };
  const requests = (method: string) => sent.filter((m) => m.method === method && m.id !== undefined).map((m) => m.params);
  const notifications = (method: string) => sent.filter((m) => m.method === method && m.id === undefined).map((m) => m.params);
  const answer = (id: string) => sent.find((m) => m.id === id && m.method === undefined);
  return { link, sent, deliver, requests, notifications, answer };
}

const roots: Root[] = [];
let mounted: Element[] = [];

async function render(node: ReactNode) {
  const container = document.createElement("div");
  document.body.append(container);
  mounted.push(container);
  const root = createRoot(container);
  roots.push(root);
  await act(() => root.render(node));
  return { container, root };
}

/** Renders the view connected to `host`, and waits for the handshake. */
async function open(host: ReturnType<typeof testHost>, props: Partial<OuroMcpAppProps> = {}) {
  const view = await render(<OuroMcpApp catalog={catalog} host={host.link} {...props} />);
  await vi.waitFor(() => expect(host.notifications("ui/notifications/initialized")).toHaveLength(1));
  return view;
}

/** Opens the view and gives it the tool's result. */
async function openCard(host: ReturnType<typeof testHost>, props: Partial<OuroMcpAppProps> = {}) {
  const view = await open(host, props);
  await host.deliver({ method: "ui/notifications/tool-result", params: toolResult(card("Charred Lemon Orzo")) });
  await expect.element(page.getByRole("heading", { level: 1 })).toHaveTextContent("Charred Lemon Orzo");
  return view;
}

/** What HX itself renders for the same thing, to compare the view's output with. */
async function rendered(node: ReactNode) {
  const { container } = await render(node);
  return container;
}

afterEach(async () => {
  for (const root of roots.splice(0)) await act(() => root.unmount());
  for (const el of mounted) el.remove();
  mounted = [];
  document.documentElement.classList.remove("dark");
  document.documentElement.style.colorScheme = "";
});

describe("OuroMcpApp", () => {
  it("introduces itself to the host with ui/initialize, then says it is initialized", async () => {
    const host = testHost();
    await open(host);
    expect(host.requests("ui/initialize")).toEqual([{ appInfo: { name: "Ouro HX card", version: "1.0.0" }, appCapabilities: {}, protocolVersion: "2026-01-26" }]);
    expect(host.sent.slice(0, 2).map((m) => m.method)).toEqual(["ui/initialize", "ui/notifications/initialized"]);
  });

  it("names the app it is for when the app gives its name and version", async () => {
    const host = testHost();
    await open(host, { appInfo: { name: "Recipes", version: "2.1.0" } });
    expect(host.requests("ui/initialize")[0]).toMatchObject({ appInfo: { name: "Recipes", version: "2.1.0" } });
  });

  it("shows HX's spinner until the tool's result arrives, then the card", async () => {
    const host = testHost();
    const { container } = await open(host);
    const view = container.querySelector('[data-ouro="ouro-mcp-app"]')!;
    const spinner = await rendered(<Spinner label="Waiting for the card" />);
    expect(view.innerHTML).toBe(spinner.innerHTML);
    await host.deliver({ method: "ui/notifications/tool-input", params: { arguments: { recipe: "rcp_1" } } });
    expect(view.innerHTML).toBe(spinner.innerHTML);
    await host.deliver({ method: "ui/notifications/tool-result", params: toolResult(card("Charred Lemon Orzo")) });
    const surface = await rendered(<A2UISurface catalog={catalog} messages={card("Charred Lemon Orzo")} onAction={() => {}} onHandoff={() => {}} />);
    expect(view.innerHTML).toBe(surface.innerHTML);
  });

  it("shows a later tool result in place of the earlier one, and clears what the last press said", async () => {
    const host = testHost({ replies: { "tools/call": () => ({ result: { content: [{ type: "text", text: "Added." }] } }) } });
    await openCard(host);
    await userEvent.click(page.getByRole("button", { name: "Add ingredients to list" }));
    await expect.element(page.getByText("Added.")).toBeInTheDocument();
    await host.deliver({ method: "ui/notifications/tool-result", params: toolResult(card("Lemon Risotto")) });
    await expect.element(page.getByRole("heading", { level: 1 })).toHaveTextContent("Lemon Risotto");
    expect(document.querySelector('[data-ouro="alert"]')).toBeNull();
  });

  it("says the card can't be shown when the tool's result carries none", async () => {
    const host = testHost();
    const { container } = await open(host);
    for (const params of [{ content: [] }, { structuredContent: [] }, { structuredContent: { a2ui: [] } }, { structuredContent: { a2ui: { messages: {} } } }]) {
      await host.deliver({ method: "ui/notifications/tool-result", params });
      const alert = await rendered(<Alert tone="destructive" title="This card can't be shown" description="The tool's result had no card in it." />);
      expect(container.querySelector('[data-ouro="ouro-mcp-app"]')!.innerHTML).toBe(alert.innerHTML);
    }
  });

  it("says so when the agent stopped before the card was ready", async () => {
    const host = testHost();
    const { container } = await open(host);
    await host.deliver({ method: "ui/notifications/tool-cancelled", params: { reason: "stopped" } });
    const alert = await rendered(<Alert tone="primary" title="The agent stopped before the card was ready." />);
    expect(container.querySelector('[data-ouro="ouro-mcp-app"]')!.innerHTML).toBe(alert.innerHTML);
  });

  it("says the card can't be shown when the host refuses the handshake, and never says it is initialized", async () => {
    const host = testHost({ init: { error: { code: -32000, message: "No" } } });
    const { container } = await render(<OuroMcpApp catalog={catalog} host={host.link} />);
    const alert = await rendered(<Alert tone="destructive" title="This card can't be shown" description="The host didn't connect to it." />);
    await vi.waitFor(() => expect(container.querySelector('[data-ouro="ouro-mcp-app"]')!.innerHTML).toBe(alert.innerHTML));
    expect(host.notifications("ui/notifications/initialized")).toEqual([]);
  });

  it("follows the host's theme from the handshake and from each change", async () => {
    const root = document.documentElement;
    const host = testHost({ init: { result: { hostContext: { theme: "dark" } } } });
    await open(host);
    expect(root.classList.contains("dark")).toBe(true);
    expect(root.style.colorScheme).toBe("dark");
    await host.deliver({ method: "ui/notifications/host-context-changed", params: { theme: "light" } });
    expect(root.classList.contains("dark")).toBe(false);
    expect(root.style.colorScheme).toBe("light");
    // A change without a theme, or with one HX has no look for, leaves the theme as it is.
    await host.deliver({ method: "ui/notifications/host-context-changed", params: { displayMode: "fullscreen" } });
    await host.deliver({ method: "ui/notifications/host-context-changed", params: { theme: "sepia" } });
    // Only a context change carries the theme.
    await host.deliver({ method: "ui/notifications/tool-input", params: { theme: "dark" } });
    expect(root.style.colorScheme).toBe("light");
    await host.deliver({ method: "ui/notifications/host-context-changed", params: { theme: "dark" } });
    expect(root.classList.contains("dark")).toBe(true);
  });

  it("leaves the page's theme alone when the host gives no context", async () => {
    const host = testHost({ init: { result: {} } });
    await open(host);
    expect(document.documentElement.style.colorScheme).toBe("");
  });

  it("tells the host its size, in whole pixels, and again when it changes", async () => {
    const host = testHost();
    const { container } = await render(
      <div style={{ width: 300.4 }}>
        <OuroMcpApp catalog={catalog} host={host.link} className="h-[120.3px]" />
      </div>,
    );
    await vi.waitFor(() => expect(host.notifications("ui/notifications/size-changed")).toEqual([{ width: 301, height: 121 }]));
    expect(container.querySelector('[data-ouro="ouro-mcp-app"]')!.className).toBe("grid min-w-0 gap-4 h-[120.3px]");
    (container.firstElementChild as HTMLElement).style.width = "200px";
    await vi.waitFor(() => expect(host.notifications("ui/notifications/size-changed")).toEqual([{ width: 301, height: 121 }, { width: 200, height: 121 }]));
  });

  it("calls a write action's own tool with the prepared input, and shows what the tool said", async () => {
    const calls: unknown[] = [];
    const host = testHost({ replies: { "tools/call": (params) => (calls.push(params), { result: { content: [{ type: "text", text: "Added 6 ingredients." }, null, { type: "image", text: "A photo." }, { type: "text", text: 4 }, { type: "text", text: "For 4." }] } }) } });
    const { container } = await openCard(host);
    await userEvent.click(page.getByRole("button", { name: "Add ingredients to list" }));
    await expect.element(page.getByText(/Added 6 ingredients\./)).toBeInTheDocument();
    expect(calls).toEqual([{ name: "add_recipe_to_shopping_list", arguments: { recipe: "rcp_1", servings: 4 } }]);
    const alert = await rendered(<Alert tone="success" title={"Added 6 ingredients.\nFor 4."} />);
    expect(container.querySelector('[data-ouro="alert"]')!.outerHTML).toBe(alert.innerHTML);
  });

  it("says the action is done when its tool gives no text, and shows a card the tool returns", async () => {
    const host = testHost({ replies: { "tools/call": () => ({ result: { ...toolResult(card("Your list")), content: "none" } }) } });
    const { container } = await openCard(host);
    await userEvent.click(page.getByRole("button", { name: "Add ingredients to list" }));
    await expect.element(page.getByRole("heading", { level: 1 })).toHaveTextContent("Your list");
    const alert = await rendered(<Alert tone="success" title="Add ingredients to list: done." />);
    expect(container.querySelector('[data-ouro="alert"]')!.outerHTML).toBe(alert.innerHTML);
  });

  it("shows a tool's error result, and the host's error, as the action not going through", async () => {
    const replies = [{ result: { isError: true, content: [{ type: "text", text: "The list is full." }] } }, { result: { isError: true } }, { result: { isError: "yes", content: [{ type: "text", text: "Added." }] } }, { error: { code: -32000, message: "Denied by the person." } }];
    const host = testHost({ replies: { "tools/call": () => replies.shift()! } });
    const { container } = await openCard(host);
    const expected = [<Alert key={0} tone="destructive" title="Add ingredients to list didn't go through" description="The list is full." />, <Alert key={1} tone="destructive" title="Add ingredients to list didn't go through" />, <Alert key={2} tone="success" title="Added." />, <Alert key={3} tone="destructive" title="Add ingredients to list didn't go through" description="Denied by the person." />];
    for (const alert of expected) {
      const before = host.requests("tools/call").length;
      await userEvent.click(page.getByRole("button", { name: "Add ingredients to list" }));
      await vi.waitFor(() => expect(host.requests("tools/call")).toHaveLength(before + 1));
      const want = await rendered(alert);
      await vi.waitFor(() => expect(container.querySelector('[data-ouro="alert"]')!.outerHTML).toBe(want.innerHTML));
    }
  });

  it("calls a consequential action's tool only after the person confirms", async () => {
    const host = testHost({ replies: { "tools/call": () => ({ result: { content: [{ type: "text", text: "Shared." }] } }) } });
    await openCard(host);
    await userEvent.click(page.getByRole("button", { name: "Share recipe" }));
    const confirm = page.getByRole("alertdialog", { name: "Share recipe?" });
    await expect.element(confirm).toBeVisible();
    expect(host.requests("tools/call")).toEqual([]);
    await userEvent.click(confirm.getByRole("button", { name: "Share recipe" }));
    await expect.element(page.getByText("Shared.")).toBeInTheDocument();
    expect(host.requests("tools/call")).toEqual([{ name: "share_recipe", arguments: { recipe: "rcp_1", with: "sam@example.com" } }]);
  });

  it("opens the app's own screen for a person-only button and calls no tool", async () => {
    const handoffUrl = vi.fn(({ action }: { action: string }) => `https://kitchen.example.com/recipes/rcp_1?do=${action}`);
    const host = testHost();
    const { container } = await openCard(host, { handoffUrl });
    await userEvent.click(page.getByRole("button", { name: "Order ingredients" }));
    await vi.waitFor(() => expect(host.requests("ui/open-link")).toEqual([{ url: "https://kitchen.example.com/recipes/rcp_1?do=order_ingredients" }]));
    expect(handoffUrl).toHaveBeenCalledWith({ action: "order_ingredients", how: "with Order ingredients on the recipe in the app" });
    expect(host.requests("tools/call")).toEqual([]);
    expect(container.querySelector('[data-ouro="alert"]')).toBeNull();
  });

  it("tells the person where to do a person-only action when there is no address, the host can't open links, or it refuses", async () => {
    const yours = await rendered(<Alert tone="primary" title="Order ingredients is yours to do" description="Do it with Order ingredients on the recipe in the app." />);
    const cases: [Partial<OuroMcpAppProps>, ReturnType<typeof testHost>][] = [
      [{}, testHost()],
      [{ handoffUrl: () => undefined }, testHost()],
      [{ handoffUrl: () => "https://kitchen.example.com/" }, testHost({ init: { result: { hostCapabilities: {} } } })],
      [{ handoffUrl: () => "https://kitchen.example.com/" }, testHost({ init: { result: { hostCapabilities: { openLinks: true } } } })],
      [{ handoffUrl: () => "https://kitchen.example.com/" }, testHost({ init: { result: { hostCapabilities: [] } } })],
      [{ handoffUrl: () => "https://kitchen.example.com/" }, testHost({ replies: { "ui/open-link": () => ({ error: { code: -32000, message: "Denied" } }) } })],
    ];
    for (const [props, host] of cases) {
      const { container, root } = await openCard(host, props);
      await userEvent.click(page.getByRole("button", { name: "Order ingredients" }));
      await vi.waitFor(() => expect(container.querySelector('[data-ouro="alert"]')?.outerHTML).toBe(yours.innerHTML));
      expect(host.requests("tools/call")).toEqual([]);
      await act(() => root.unmount());
    }
  });

  it("refuses an agent's attempt to press a button through the screen with the catalog's INVALID_FUNCTION_CALL", async () => {
    const host = testHost();
    await openCard(host);
    await host.deliver({ id: "h1", method: "tools/call", params: { name: "order_ingredients", arguments: {} } });
    await host.deliver({ id: "h2", method: "tools/call", params: { name: "share_recipe" } });
    await host.deliver({ id: "h3", method: "tools/call", params: { name: "delete_everything" } });
    expect(host.answer("h1")).toEqual({ jsonrpc: "2.0", id: "h1", error: { code: -32602, message: refusal.summary, data: { code: "INVALID_FUNCTION_CALL", refusal } } });
    expect(host.answer("h2")).toEqual({ jsonrpc: "2.0", id: "h2", error: { code: -32602, message: "share_recipe is an action, and agents run actions through their own tool (MCP share_recipe), not through the person's screen.", data: { code: "INVALID_FUNCTION_CALL" } } });
    expect(host.answer("h3")!.error!.message).toBe("This catalog has no functions an agent may call, so delete_everything is not one.");
    expect(host.requests("tools/call")).toEqual([]);
  });

  it("answers ping and teardown, and no other request", async () => {
    const host = testHost();
    await open(host);
    await host.deliver({ id: "p", method: "ping" });
    await host.deliver({ id: "t", method: "ui/resource-teardown", params: { reason: "closed" } });
    await host.deliver({ id: "x", method: "ui/request-display-mode", params: { mode: "pip" } });
    expect(host.answer("p")).toEqual({ jsonrpc: "2.0", id: "p", result: {} });
    expect(host.answer("t")).toEqual({ jsonrpc: "2.0", id: "t", result: {} });
    expect(host.answer("x")).toEqual({ jsonrpc: "2.0", id: "x", error: { code: -32601, message: "ui/request-display-mode is not a request this view answers." } });
  });

  it("tells the agent what to correct when its card fails the checks, and shows the person a short alert", async () => {
    const host = testHost({ replies: { "ui/update-model-context": () => ({ error: { code: -32000, message: "Not now" } }) } });
    await open(host);
    const invalid = [{ version: "1.0", createSurface: { surfaceId: "card", catalogId: catalog.catalogId, components: [{ id: "root", component: "Button", label: "Buy now" }, { id: "clip", component: "Video", url: "https://example.com/a.mp4" }] } }];
    await host.deliver({ method: "ui/notifications/tool-result", params: toolResult(invalid) });
    await expect.element(page.getByText("This card can't be shown")).toBeInTheDocument();
    await vi.waitFor(() => expect(host.requests("ui/update-model-context")).toHaveLength(1));
    const [update] = host.requests("ui/update-model-context") as { content: { type: string; text: string }[]; structuredContent: { a2uiProblems: { path: string; message: string }[] } }[];
    const problems = update!.structuredContent.a2uiProblems;
    expect(problems.length).toBeGreaterThan(1);
    expect(update!.content).toEqual([{ type: "text", text: `The card didn't pass the checks for composed UI: ${problems.map((p) => `${p.path}: ${p.message}`).join(" ")}` }]);
  });

  it("tells the person where to do a person-only action when the host's openLinks isn't an object", async () => {
    const host = testHost({ init: { result: { hostCapabilities: { openLinks: [] } } } });
    await openCard(host, { handoffUrl: () => "https://kitchen.example.com/order" });
    await userEvent.click(page.getByRole("button", { name: "Order ingredients" }));
    await expect.element(page.getByText("Order ingredients is yours to do")).toBeInTheDocument();
    expect(host.requests("ui/open-link")).toEqual([]);
  });

  it("reconnects to a new host, and reads a new catalog's actions", async () => {
    const first = testHost();
    const { root } = await open(first);
    const actions = catalog.metadata.extensions.bot_ouroboros_hx.actions;
    const renamed = { ...catalog, metadata: { extensions: { bot_ouroboros_hx: { actions: { ...actions, order_ingredients: { ...actions.order_ingredients, label: "Order groceries" } } } } } };
    const second = testHost();
    await act(() => root.render(<OuroMcpApp catalog={renamed} host={second.link} />));
    await vi.waitFor(() => expect(second.notifications("ui/notifications/initialized")).toHaveLength(1));
    await second.deliver({ method: "ui/notifications/tool-result", params: toolResult(card("Charred Lemon Orzo")) });
    await userEvent.click(page.getByRole("button", { name: "Order groceries" }));
    await expect.element(page.getByText("Order groceries is yours to do")).toBeInTheDocument();
  });

  it("stops listening and sizing when it unmounts", async () => {
    const host = testHost({ replies: { "tools/call": () => "never" } });
    const { root, container } = await openCard(host);
    await userEvent.click(page.getByRole("button", { name: "Add ingredients to list" }));
    await act(() => root.unmount());
    const sizes = host.notifications("ui/notifications/size-changed").length;
    await host.deliver({ method: "ui/notifications/tool-result", params: toolResult(card("Later")) });
    container.style.width = "120px";
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(host.notifications("ui/notifications/size-changed")).toHaveLength(sizes);
  });

  it("warns in development about onAction, which the host's tools replace", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const host = testHost();
    // @ts-expect-error onAction is a hint type.
    await open(host, { onAction: () => {} });
    await vi.waitFor(() => expect(warn).toHaveBeenCalledWith("[ouro-ui] OuroMcpApp: onAction is not a prop; a pressed button calls its action's own tool through the host. Fix: <OuroMcpApp catalog={catalog} />."));
    warn.mockRestore();
  });

  it("connects to the window that framed it when given no host", async () => {
    const post = vi.spyOn(window.parent, "postMessage").mockImplementation(() => {});
    await render(<OuroMcpApp catalog={catalog} />);
    expect(post).toHaveBeenCalledWith({ jsonrpc: "2.0", id: 1, method: "ui/initialize", params: { appInfo: { name: "Ouro HX card", version: "1.0.0" }, appCapabilities: {}, protocolVersion: "2026-01-26" } }, "*");
    post.mockRestore();
  });
});
