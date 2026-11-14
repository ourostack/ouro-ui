export { MCP_APPS_PROTOCOL, windowHostLink, McpAppError, connectMcpApp };
export type { McpAppMessage, McpAppHostLink, McpAppHandlers, McpAppConnection };

// MCP Apps (https://github.com/modelcontextprotocol/ext-apps, SEP-1865): the view's side of its JSON-RPC 2.0
// connection to the host that framed it, over postMessage. The spec says a view needs no SDK for this, so the
// connection is these few functions and no dependency.

/** The MCP Apps protocol version this view speaks in `ui/initialize`. */
const MCP_APPS_PROTOCOL = "2026-01-26";

/** A JSON-RPC message: a request (`id` and `method`), a notification (`method` only) or a response (`id`). */
interface McpAppMessage {
  jsonrpc: "2.0";
  id?: string | number;
  method?: string;
  params?: object;
  result?: object;
  error?: { code: number; message: string; data?: unknown };
}

/** How a view reaches its host: post a message to it, and hear the host's. `listen` returns the function that stops. */
interface McpAppHostLink {
  post: (message: McpAppMessage) => void;
  listen: (onMessage: (message: unknown) => void) => () => void;
}

/**
 * The window that framed this one, as a host link. Messages from any other window are ignored.
 *
 * @example
 * const link = windowHostLink();
 */
function windowHostLink(host: Window = window.parent, self: Window = window): McpAppHostLink {
  return {
    post: (message) => host.postMessage(message, "*"),
    listen: (onMessage) => {
      const listener = (event: MessageEvent) => {
        if (event.source === host) onMessage(event.data);
      };
      self.addEventListener("message", listener);
      return () => self.removeEventListener("message", listener);
    },
  };
}

/** A JSON-RPC error, from the host's response or for the view to answer a host's request with. */
class McpAppError extends Error {
  readonly code: number;
  readonly data: unknown;
  constructor(code: number, message: string, data?: unknown) {
    super(message);
    this.name = "McpAppError";
    this.code = code;
    this.data = data;
  }
}

/** What the view does with the host's notifications and requests. A request's handler returns its result or throws an `McpAppError`. */
interface McpAppHandlers {
  onNotification: (method: string, params: Record<string, unknown>) => void;
  onRequest: (method: string, params: Record<string, unknown>) => object | undefined;
}

/** A view's open connection to its host. */
interface McpAppConnection {
  /** Sends a request and settles with the host's result, or rejects with its `McpAppError`. */
  request: (method: string, params?: object) => Promise<Record<string, unknown>>;
  /** Sends a notification. */
  notify: (method: string, params?: object) => void;
  /** Stops listening, and rejects the requests still waiting. */
  close: () => void;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Opens a view's JSON-RPC connection to its host: matches responses to requests, hands the host's notifications and
 * requests to `handlers`, and answers the host's requests with the handler's result or its error.
 *
 * @example
 * const host = connectMcpApp(windowHostLink(), { onNotification: (method, params) => {}, onRequest: () => ({}) });
 * await host.request("ui/initialize", { appInfo, appCapabilities: {}, protocolVersion: MCP_APPS_PROTOCOL });
 */
function connectMcpApp(link: McpAppHostLink, handlers: McpAppHandlers): McpAppConnection {
  let next = 1;
  const waiting = new Map<string | number, { resolve: (result: Record<string, unknown>) => void; reject: (error: McpAppError) => void }>();
  const answer = (id: string | number, method: string, params: Record<string, unknown>) => {
    try {
      link.post({ jsonrpc: "2.0", id, result: handlers.onRequest(method, params) ?? {} });
    } catch (e) {
      const error = e instanceof McpAppError ? e : new McpAppError(-32603, String((e as Error).message));
      link.post({ jsonrpc: "2.0", id, error: { code: error.code, message: error.message, ...(error.data === undefined ? {} : { data: error.data }) } });
    }
  };
  const stop = link.listen((message) => {
    if (!isRecord(message) || message.jsonrpc !== "2.0") return;
    const id = message.id as string | number | undefined;
    if (typeof message.method === "string") {
      const params = isRecord(message.params) ? message.params : {};
      if (id === undefined) handlers.onNotification(message.method, params);
      else answer(id, message.method, params);
      return;
    }
    const pending = waiting.get(id!);
    if (!pending) return;
    // Stryker disable next-line CallExpression: a settled promise ignores a second answer; deleting frees the entry.
    waiting.delete(id!);
    const error = message.error as McpAppMessage["error"];
    if (error) pending.reject(new McpAppError(error.code, error.message, error.data));
    else pending.resolve(isRecord(message.result) ? message.result : {});
  });
  return {
    request: (method, params = {}) =>
      new Promise((resolve, reject) => {
        const id = next++;
        waiting.set(id, { resolve, reject });
        link.post({ jsonrpc: "2.0", id, method, params });
      }),
    notify: (method, params = {}) => link.post({ jsonrpc: "2.0", method, params }),
    close: () => {
      stop();
      for (const pending of waiting.values()) pending.reject(new McpAppError(-32000, "The view closed its connection to the host."));
    },
  };
}
