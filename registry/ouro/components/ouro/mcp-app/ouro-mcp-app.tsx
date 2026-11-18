"use client";

import { type JSX, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { A2UISurface, type A2UIActionMessage, type A2UIHandoff, type A2UIProblem, type A2UISurfaceProps } from "@/registry/ouro/components/ouro/a2ui-surface/a2ui-surface";
import { Alert } from "@/registry/ouro/components/ouro/alert/alert";
import { ComposedSurface, type ComposedSurfaceProps } from "@/registry/ouro/components/ouro/composed-surface/composed-surface";
import { Spinner } from "@/registry/ouro/components/ouro/spinner/spinner";
import { applyTreeUpdate, functionCallProblem, loadCatalog, validateTree, type ComposedNode, type LoadedCatalog, type Obj, type TreeProblem } from "@/registry/ouro/lib/ouro/a2ui-core";
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
  /**
   * The app's own word for an id on a confirm sheet, from its own data, in place of the agent's name. It works for a
   * view you build in code, on an A2UI result; a composed tree's server names its ids when it builds the tree. See
   * A2UISurface's `label`.
   */
  label?: A2UISurfaceProps["label"];
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

/**
 * Ouro's composed tree with the data model its fields start from. `problems` holds why an update to it couldn't apply;
 * the tree and data stay the last ones that did, so a corrected update applies to them.
 */
type TreeCard = { tree: unknown; catalogId: unknown; data: Obj | undefined; problems?: TreeProblem[] };

/** The card a tool result carries: Ouro's composed tree, or A2UI messages. */
type CardContent = TreeCard | { messages: unknown[] };

/**
 * What a tool result carries: `structuredContent.ouro` with a tree, as core's `mcpAppTreeResult` puts it, or with an
 * update to the tree the view shows, as core's `mcpAppTreeUpdateResult` puts it, else `structuredContent.a2ui`, as
 * core's `mcpAppToolResult` puts it.
 */
function cardOf(result: Record<string, unknown>): CardContent | { update: unknown; catalogId: unknown } | undefined {
  const content = isRecord(result.structuredContent) ? result.structuredContent : {};
  const { ouro, a2ui } = content;
  if (isRecord(ouro) && "tree" in ouro) return { tree: ouro.tree, catalogId: ouro.catalogId, data: isRecord(ouro.data) ? (ouro.data as Obj) : undefined };
  if (isRecord(ouro) && "update" in ouro) return { update: ouro.update, catalogId: ouro.catalogId };
  return isRecord(a2ui) && Array.isArray(a2ui.messages) ? { messages: a2ui.messages } : undefined;
}

/** The catalog a tree or an update names, when it isn't this view's. */
const catalogProblems = (actions: LoadedCatalog, catalogId: unknown): TreeProblem[] =>
  catalogId === actions.catalogId ? [] : [{ path: "/catalogId", message: `The tree is for catalog ${JSON.stringify(catalogId)}; this view draws ${actions.catalogId}.` }];

/** What is wrong with a card's own tree for this view: core's `validateTree` against its catalog, and the catalog it names. */
const checkTree = (actions: LoadedCatalog, card: TreeCard): TreeProblem[] => [...catalogProblems(actions, card.catalogId), ...validateTree(actions, card.tree)];

/**
 * The card after a tool result: a tree or A2UI messages take the card's place, and an update applies to the tree the
 * view shows with core's `applyTreeUpdate`, or, when it can't, keeps that tree and says why.
 */
function nextCard(actions: LoadedCatalog, card: CardContent | undefined, found: NonNullable<ReturnType<typeof cardOf>>): CardContent {
  if (!("update" in found)) return found;
  if (!card || !("tree" in card) || card.tree === undefined) return { tree: undefined, catalogId: found.catalogId, data: undefined, problems: [{ path: "/update", message: "An update changes the composed tree the view shows, and it shows none yet; send the whole tree first, in structuredContent.ouro.tree." }] };
  const named = catalogProblems(actions, found.catalogId);
  // applyTreeUpdate checks the tree it is given too, so an update never makes a tree that failed the checks draw.
  const applied = named.length ? { problems: named } : applyTreeUpdate(actions, card.tree as ComposedNode, card.data, found.update);
  return "problems" in applied ? { ...card, problems: applied.problems } : { tree: applied.tree, catalogId: card.catalogId, data: applied.data as Obj | undefined };
}

/** What a press asks the action's own tool to do, from either format. */
interface ToolPress {
  name: string;
  input: Record<string, unknown>;
  /** The button's label, as the person read it. */
  label: string;
}

/** The text a tool result gives an agent and a text-only host. */
function resultText(result: Record<string, unknown>): string | undefined {
  if (!Array.isArray(result.content)) return undefined;
  const texts = (result.content as unknown[]).flatMap((block) => (isRecord(block) && block.type === "text" && typeof block.text === "string" ? [block.text] : []));
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
 * and it shows the latest tool result's card: Ouro's composed tree in `structuredContent.ouro` with ComposedSurface,
 * once it passes core's `validateTree` against the catalog, its fields starting from `structuredContent.ouro.data`, or A2UI messages in `structuredContent.a2ui` with
 * {@link A2UISurface}. A result whose `structuredContent.ouro` carries `update` (core's `mcpAppTreeUpdateResult`)
 * changes the tree it shows with core's `applyTreeUpdate`, and the person's answers stay except where the update
 * changed the value; an update that can't apply shows the same short alert as a tree that fails the checks, and the agent hears
 * why. Read and write buttons call
 * their action's own tool through the host, a consequential one only after the person confirms, and a person-only
 * one takes the person to your app's screen. It follows the host's light or dark theme and tells the host its size.
 *
 * Build it into one HTML file with your catalog embedded (`node scripts/mcp-app.mts build`), and serve that as the
 * `ui://` resource. Use A2UISurface instead when the card is in your own app's screen, not in an MCP host.
 *
 * @claim "a consequential one only after the person confirms" registry/ouro/components/ouro/mcp-app/ouro-mcp-app.test.tsx verify:testExists(registry/ouro/components/ouro/mcp-app/ouro-mcp-app.test.tsx::OuroMcpApp > calls a consequential action's tool only after the person confirms)
 * @claim "changes the tree it shows with core's `applyTreeUpdate`" registry/ouro/components/ouro/mcp-app/ouro-mcp-app.test.tsx verify:testExists(registry/ouro/components/ouro/mcp-app/ouro-mcp-app.test.tsx::OuroMcpApp > applies an update in structuredContent.ouro to the tree it shows, keeping what the person typed where the update left it)
 * @claim "an update that can't apply shows the same short alert as a tree that fails the checks, and the agent hears why" registry/ouro/components/ouro/mcp-app/ouro-mcp-app.test.tsx verify:testExists(registry/ouro/components/ouro/mcp-app/ouro-mcp-app.test.tsx::OuroMcpApp > tells the agent why an update can't apply, shows the person the short alert, and applies a corrected one to the last tree)
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
  const { catalog, handoffUrl, label, host, appInfo, className, onAction } = props;
  const actions = useMemo(() => loadCatalog(catalog), [catalog]);
  const [card, setCard] = useState<CardContent | undefined>(undefined);
  const [status, setStatus] = useState<Status | undefined>(undefined);
  const [connection, setConnection] = useState<McpAppConnection | undefined>(undefined);
  // Stryker disable next-line BooleanLiteral: read only after the handshake has set it.
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
          const found = cardOf(params);
          if (found) {
            setCard((card) => nextCard(actions, card, found));
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
      // Stryker disable next-line OptionalChaining,CallExpression: React has removed the root by now, and a detached element doesn't resize; disconnecting frees the observer.
      observer?.disconnect();
      c.close();
    };
  }, [host, actions, name, version]);

  const callTool = useCallback(
    async ({ name, input, label }: ToolPress) => {
      try {
        const result = await connection!.request("tools/call", { name, arguments: input });
        const found = cardOf(result);
        if (found) setCard((card) => nextCard(actions, card, found));
        const text = resultText(result);
        setStatus(result.isError === true ? { tone: "destructive", title: `${label} didn't go through`, ...(text ? { description: text } : {}) } : { tone: "success", title: text ?? `${label}: done.` });
      } catch (e) {
        setStatus({ tone: "destructive", title: `${label} didn't go through`, description: (e as Error).message });
      }
    },
    [connection, actions],
  );
  const runAction = useCallback(({ action }: A2UIActionMessage) => callTool({ name: action.name, input: action.context, label: action.userMessage }), [callTool]);
  const pressTree = useCallback<ComposedSurfaceProps["onPress"]>((press) => callTool({ name: press.action, input: press.input, label: press.label }), [callTool]);

  const handOff = useCallback(
    (handoff: A2UIHandoff) => {
      const yourself = () => setStatus({ tone: "primary", title: `${actions.actions[handoff.action]!.label} is yours to do`, description: `Do it ${handoff.how}.` });
      const url = handoffUrl?.(handoff);
      if (url === undefined || !openLinks.current) return yourself();
      connection!.request("ui/open-link", { url }).catch(yourself);
    },
    [connection, handoffUrl, actions],
  );

  const tellAgent = useCallback(
    (problems: readonly { path: string; message: string }[], structuredContent: object) => {
      // The agent composed the card, so it hears what to correct.
      void connection!
        .request("ui/update-model-context", {
          content: [{ type: "text", text: `The card didn't pass the checks for composed UI: ${problems.map((p) => `${p.path}: ${p.message}`).join(" ")}` }],
          structuredContent,
        })
        .catch(() => {});
    },
    [connection],
  );
  const reportProblems = useCallback((problems: readonly A2UIProblem[]) => tellAgent(problems, { a2uiProblems: problems }), [tellAgent]);

  const tree = card && "tree" in card ? card : undefined;
  // A tree that passes the checks stays drawn, hidden, while an update to it can't apply, so what the person typed
  // survives until a corrected update arrives.
  const own = useMemo(() => (tree ? checkTree(actions, tree) : []), [actions, tree]);
  const problems = tree?.problems ?? own;
  useEffect(() => {
    if (problems.length && connection) tellAgent(problems, { ouroProblems: problems });
  }, [problems, connection, tellAgent]);

  useDevWarnings(
    "OuroMcpApp",
    process.env.NODE_ENV !== "production" ? () => [onAction !== undefined && ["onAction is not a prop; a pressed button calls its action's own tool through the host", "<OuroMcpApp catalog={catalog} />"]] : /* istanbul ignore next @preserve -- production only */ undefined,
  );

  return (
    <div ref={root} data-ouro="ouro-mcp-app" className={cn(ROOT_CLASS, className)}>
      {card && connection ? (
        "messages" in card ? (
          <A2UISurface catalog={catalog} messages={card.messages} label={label} onAction={runAction} onHandoff={handOff} onProblems={reportProblems} />
        ) : (
          <>
            {problems.length ? <Alert tone="destructive" title="This card can't be shown" description="It didn't pass the checks for composed UI." /> : null}
            {own.length ? null : <ComposedSurface tree={card.tree as ComposedNode} data={card.data} onPress={pressTree} onHandoff={handOff} className={problems.length ? "hidden" : undefined} />}
          </>
        )
      ) : status ? null : (
        <Spinner label="Waiting for the card" />
      )}
      {status ? <Alert tone={status.tone} title={status.title} description={status.description} /> : null}
    </div>
  );
}
