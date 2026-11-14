"use client";

import { type JSX, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { A2UISurface, type A2UIActionMessage, type A2UIHandoff, type A2UIProblem } from "@/registry/ouro/components/ouro/a2ui-surface/a2ui-surface";
import { Alert } from "@/registry/ouro/components/ouro/alert/alert";
import { Spinner } from "@/registry/ouro/components/ouro/spinner/spinner";
import { functionCallProblem, loadCatalog } from "@/registry/ouro/lib/ouro/a2ui-core";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { connectMcpApp, MCP_APPS_PROTOCOL, McpAppError, windowHostLink, type McpAppConnection, type McpAppHostLink } from "@/registry/ouro/lib/ouro/mcp-app";
import { useDevWarnings } from "@/registry/ouro/lib/ouro/use-dev-messages";
import { DEFAULT_APP_INFO, INVALID_PARAMS, METHOD_NOT_FOUND, ROOT_CLASS } from "@/registry/ouro/components/ouro/mcp-app/ouro-mcp-app-styles";

/** Props for {@link OuroMcpApp}. */
export interface OuroMcpAppProps {
  /** The app's A2UI catalog, generated from its actions by core's `ouro-a2ui-catalog.mts catalog`. Tool results carry only its id. */
  catalog: unknown;
  /**
   * Where a person-only button takes the person: the address of your app's own screen for that action, which the
   * host opens with `ui/open-link`. Without one, or when the host can't open links, the view tells the person where
   * to do it.
   */
  handoffUrl?: ((handoff: A2UIHandoff) => string | undefined) | undefined;
  /** The connection to the host. @default the window that framed the view, through `windowHostLink()` */
  host?: McpAppHostLink | undefined;
  /** What the view calls itself in `ui/initialize`. @default { name: "Ouro HX card", version: "1.0.0" } */
  appInfo?: { name: string; version: string } | undefined;
  /** Layout only: margins, width (`max-w-md`). */
  className?: string | undefined;

  /** Not a prop. A pressed button calls that action's own MCP tool through the host: give the view only the catalog. */
  onAction?: { "OuroMcpApp calls each action's own tool through the host; pass catalog": never };
}

/** What the last press did, or why the card can't be shown. */
interface Status {
  tone: "success" | "destructive" | "primary";
  title: string;
  description?: string;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** The A2UI messages in a tool result's `structuredContent.a2ui`, as core's `mcpAppToolResult` puts them. */
function a2uiMessages(result: Record<string, unknown>): unknown[] | undefined {
  const content = result.structuredContent;
  const a2ui = isRecord(content) ? content.a2ui : undefined;
  return isRecord(a2ui) && Array.isArray(a2ui.messages) ? a2ui.messages : undefined;
}

/** The text a tool result gives an agent and a text-only host. */
function resultText(result: Record<string, unknown>): string | undefined {
  const content = Array.isArray(result.content) ? (result.content as unknown[]) : [];
  const texts = content.flatMap((block) => (isRecord(block) && block.type === "text" && typeof block.text === "string" ? [block.text] : []));
  return texts.length ? texts.join("\n") : undefined;
}

/** Follows the host's light or dark theme, the way HX's own apps switch: the `dark` class on the document. */
function applyTheme(context: unknown): void {
  const theme = isRecord(context) ? context.theme : undefined;
  if (theme !== "light" && theme !== "dark") return;
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
}

/**
 * The view an MCP server returns for agent-composed UI (MCP Apps): the host, such as Claude or ChatGPT, frames it,
 * and it shows the latest tool result's `structuredContent.a2ui` with {@link A2UISurface}. Read and write buttons call
 * their action's own tool through the host, a consequential one only after the person confirms, and a person-only
 * one takes the person to your app's screen. It follows the host's light or dark theme and tells the host its size.
 *
 * Build it into one HTML file with your catalog embedded (`node scripts/mcp-app.mts build`), and serve that as the
 * `ui://` resource. Use A2UISurface instead when the card is in your own app's screen, not in an MCP host.
 *
 * @claim "a consequential one only after the person confirms" registry/ouro/components/ouro/mcp-app/ouro-mcp-app.test.tsx verify:testExists(registry/ouro/components/ouro/mcp-app/ouro-mcp-app.test.tsx::OuroMcpApp > calls a consequential action's tool only after the person confirms)
 * @claim "a person-only one takes the person to your app's screen" registry/ouro/components/ouro/mcp-app/ouro-mcp-app.test.tsx verify:testExists(registry/ouro/components/ouro/mcp-app/ouro-mcp-app.test.tsx::OuroMcpApp > opens the app's own screen for a person-only button and calls no tool)
 *
 * @group Display
 * @see https://ui.ouroboros.bot/docs/ouro-mcp-app
 *
 * @example
 * createRoot(document.getElementById("root")!).render(
 *   <OuroMcpApp catalog={catalog} handoffUrl={({ action }) => `https://kitchen.example.com/recipes?do=${action}`} />,
 * );
 */
export function OuroMcpApp(props: OuroMcpAppProps): JSX.Element {
  const { catalog, handoffUrl, host, appInfo, className, onAction } = props;
  const actions = useMemo(() => loadCatalog(catalog), [catalog]);
  const [messages, setMessages] = useState<readonly unknown[] | undefined>(undefined);
  const [status, setStatus] = useState<Status | undefined>(undefined);
  const [connection, setConnection] = useState<McpAppConnection | undefined>(undefined);
  const openLinks = useRef(false);
  const root = useRef<HTMLDivElement>(null);
  const name = appInfo?.name ?? DEFAULT_APP_INFO.name;
  const version = appInfo?.version ?? DEFAULT_APP_INFO.version;

  useEffect(() => {
    const link = host ?? windowHostLink();
    let observer: ResizeObserver | undefined;
    const c = connectMcpApp(link, {
      onNotification: (method, params) => {
        if (method === "ui/notifications/tool-result") {
          const next = a2uiMessages(params);
          if (next) {
            setMessages(next);
            setStatus(undefined);
          } else setStatus({ tone: "destructive", title: "This card can't be shown", description: "The tool's result had no card in it." });
        } else if (method === "ui/notifications/tool-cancelled") setStatus({ tone: "primary", title: "The agent stopped before the card was ready." });
        else if (method === "ui/notifications/host-context-changed") applyTheme(params);
      },
      onRequest: (method, params) => {
        // An agent acts through the action's own tool, never through the person's screen.
        if (method === "tools/call") {
          const problem = functionCallProblem(actions, params.name);
          throw new McpAppError(INVALID_PARAMS, problem.message, { code: "INVALID_FUNCTION_CALL", ...(problem.refusal ? { refusal: problem.refusal } : {}) });
        }
        if (method === "ping" || method === "ui/resource-teardown") return {};
        throw new McpAppError(METHOD_NOT_FOUND, `${method} is not a request this view answers.`);
      },
    });
    void c.request("ui/initialize", { appInfo: { name, version }, appCapabilities: {}, protocolVersion: MCP_APPS_PROTOCOL }).then(
      (result) => {
        openLinks.current = isRecord(result.hostCapabilities) && isRecord(result.hostCapabilities.openLinks);
        applyTheme(result.hostContext);
        c.notify("ui/notifications/initialized");
        setConnection(c);
        // The host sizes the frame to the view (MCP Apps' flexible dimensions).
        observer = new ResizeObserver(() => {
          const box = root.current!.getBoundingClientRect();
          c.notify("ui/notifications/size-changed", { width: Math.ceil(box.width), height: Math.ceil(box.height) });
        });
        observer.observe(root.current!);
      },
      () => setStatus({ tone: "destructive", title: "This card can't be shown", description: "The host didn't connect to it." }),
    );
    return () => {
      observer?.disconnect();
      c.close();
    };
  }, [host, actions, name, version]);

  const runAction = useCallback(
    async ({ action }: A2UIActionMessage) => {
      try {
        const result = await connection!.request("tools/call", { name: action.name, arguments: action.context });
        const next = a2uiMessages(result);
        if (next) setMessages(next);
        const text = resultText(result);
        setStatus(result.isError === true ? { tone: "destructive", title: `${action.userMessage} didn't go through`, ...(text ? { description: text } : {}) } : { tone: "success", title: text ?? `${action.userMessage}: done.` });
      } catch (e) {
        setStatus({ tone: "destructive", title: `${action.userMessage} didn't go through`, description: (e as Error).message });
      }
    },
    [connection],
  );

  const handOff = useCallback(
    (handoff: A2UIHandoff) => {
      const yourself = () => setStatus({ tone: "primary", title: `${actions.actions[handoff.action]!.label} is yours to do`, description: `Do it ${handoff.how}.` });
      const url = handoffUrl?.(handoff);
      if (url === undefined || !openLinks.current) return yourself();
      connection!.request("ui/open-link", { url }).catch(yourself);
    },
    [connection, handoffUrl, actions],
  );

  const reportProblems = useCallback(
    (problems: readonly A2UIProblem[]) => {
      // The agent composed the card, so it hears what to correct.
      void connection
        ?.request("ui/update-model-context", {
          content: [{ type: "text", text: `The card didn't pass the checks for composed UI: ${problems.map((p) => `${p.path}: ${p.message}`).join(" ")}` }],
          structuredContent: { a2uiProblems: problems },
        })
        .catch(() => {});
    },
    [connection],
  );

  useDevWarnings(
    "OuroMcpApp",
    process.env.NODE_ENV !== "production" ? () => [onAction !== undefined && ["onAction is not a prop; a pressed button calls its action's own tool through the host", "<OuroMcpApp catalog={catalog} />"]] : /* istanbul ignore next @preserve -- production only */ undefined,
  );

  return (
    <div ref={root} data-ouro="ouro-mcp-app" className={cn(ROOT_CLASS, className)}>
      {messages && connection ? <A2UISurface catalog={catalog} messages={messages} onAction={runAction} onHandoff={handOff} onProblems={reportProblems} /> : status ? null : <Spinner label="Waiting for the card" />}
      {status ? <Alert tone={status.tone} title={status.title} description={status.description} /> : null}
    </div>
  );
}
