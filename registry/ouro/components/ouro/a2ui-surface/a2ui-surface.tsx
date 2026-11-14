"use client";

import { type JSX, type ReactNode, type SVGProps, useEffect, useMemo, useState } from "react";
import { AspectRatio } from "@/registry/ouro/components/ouro/aspect-ratio/aspect-ratio";
import { Alert } from "@/registry/ouro/components/ouro/alert/alert";
import { Badge } from "@/registry/ouro/components/ouro/badge/badge";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Card } from "@/registry/ouro/components/ouro/card/card";
import { DescriptionList } from "@/registry/ouro/components/ouro/description-list/description-list";
import { ConfirmDialog } from "@/registry/ouro/components/ouro/dialog/confirm-dialog";
import { Separator } from "@/registry/ouro/components/ouro/separator/separator";
import { Row } from "@/registry/ouro/components/ouro/stack/row";
import { Stack } from "@/registry/ouro/components/ouro/stack/stack";
import { Heading } from "@/registry/ouro/components/ouro/text/heading";
import { Text } from "@/registry/ouro/components/ouro/text/text";
import { actionMessage, resolveMessages, type Problem, type Resolved } from "@/registry/ouro/lib/ouro/a2ui-core";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { useDevWarnings } from "@/registry/ouro/lib/ouro/use-dev-messages";
import { ALERT_TONES, ASPECTS, BADGE_TONES, FIELD_CLASS, FIELD_LABEL_CLASS, GAPS, LIST_CLASS } from "@/registry/ouro/components/ouro/a2ui-surface/a2ui-surface-styles";

/** A problem the validator found in the agent's messages, in A2UI's validation error format. */
export type A2UIProblem = Problem;

/** The A2UI `action` message a pressed button sends: named after the action's id, with the prepared input as its context. */
export interface A2UIActionMessage {
  version: string;
  action: {
    /** The action's id, which is also its MCP tool's name. */
    name: string;
    surfaceId: string;
    sourceComponentId: string;
    timestamp: string;
    /** The button's label, as the person read it. */
    userMessage: string;
    /** The input the agent prepared, by field name. */
    context: Record<string, unknown>;
    /** That the person pressed it, its consent class, and for a consequential action that the person confirmed. */
    metadata: { extensions: { bot_ouroboros_action: { consent: string; by: "person"; confirmed?: true } } };
  };
}

/** Where a person-only button takes the person: the action's id and the declaration's `how`. */
export interface A2UIHandoff {
  action: string;
  how: string;
}

/** Props for {@link A2UISurface}. */
export interface A2UISurfaceProps {
  /** The app's A2UI catalog, generated from its actions by core's `ouro-a2ui-catalog.mts catalog`. */
  catalog: unknown;
  /** The agent's A2UI messages, in order. The surface shows where they leave it. */
  messages: readonly unknown[];
  /** Which surface to show. @default the first one the messages create */
  surfaceId?: string | undefined;
  /**
   * Runs a pressed read or write button, and a consequential one once the person confirms. Send the message to
   * the agent, or call the action's own tool with `message.action.context`. Return a promise to show the button
   * loading until it settles.
   */
  onAction: (message: A2UIActionMessage) => void | Promise<void>;
  /**
   * A person-only button never runs from composed UI: take the person to your app's own screen for it.
   *
   * @claim "A person-only button never runs" registry/ouro/components/ouro/a2ui-surface/a2ui-surface.test.tsx verify:testExists(registry/ouro/components/ouro/a2ui-surface/a2ui-surface.test.tsx::A2UISurface > hands a person-only action to the app's own screen and never runs it)
   */
  onHandoff: (handoff: A2UIHandoff) => void;
  /** The validator's problems, when the messages fail it; the person sees a short alert instead. Hand them to the agent to correct. */
  onProblems?: ((problems: readonly A2UIProblem[]) => void) | undefined;
  /** Layout only: margins, width (`max-w-md`). */
  className?: string | undefined;

  /** Not a prop. A pressed button calls `onAction`, or `onHandoff` for a person-only one: `<A2UISurface onAction={send} onHandoff={openApp}>`. */
  onPress?: { "Use onAction={send} onHandoff={openApp}": never };
}

interface Context {
  surfaceId: string;
  onAction: A2UISurfaceProps["onAction"];
  onHandoff: A2UISurfaceProps["onHandoff"];
}

/** A resolved prop the reference resolver gives as text (core's `asText`), typed as one. */
const text = (v: unknown): string => v as string;

/** When a button was pressed, for its action message. */
const now = () => new Date().toISOString();

/**
 * Shows the UI an agent composed in A2UI, with Ouro HX. Every button is one of your app's declared actions:
 * read and write run, a consequential one asks the person to confirm what the agent prepared, and a person-only
 * one takes them to your app's own screen. Messages that fail core's validator show a short alert, and
 * `onProblems` gets the details for the agent.
 *
 * Use HX's components directly instead when your own code, not an agent, decides the layout.
 *
 * @claim "Every button is one" registry/ouro/components/ouro/a2ui-surface/a2ui-surface.test.tsx verify:testExists(registry/ouro/components/ouro/a2ui-surface/a2ui-surface.test.tsx::A2UISurface > runs a write button with the prepared input, named after its action, pressed by the person)
 * @claim "Every button is one" registry/ouro/components/ouro/a2ui-surface/a2ui-surface.test.tsx verify:testExists(registry/ouro/components/ouro/a2ui-surface/a2ui-surface.test.tsx::A2UISurface > asks the person to confirm a consequential action with what the agent prepared, and sends it only on confirm)
 * @claim "Every button is one" registry/ouro/components/ouro/a2ui-surface/a2ui-surface.test.tsx verify:testExists(registry/ouro/components/ouro/a2ui-surface/a2ui-surface.test.tsx::A2UISurface > hands a person-only action to the app's own screen and never runs it)
 *
 * @group Display
 * @see https://ui.ouroboros.bot/docs/a2ui-surface
 *
 * @example
 * <A2UISurface
 *   catalog={recipeCatalog}
 *   messages={messages}
 *   onAction={(message) => callTool(message.action.name, message.action.context)}
 *   onHandoff={({ action }) => navigate(`/recipes/${id}?do=${action}`)}
 * />
 */
export function A2UISurface(props: A2UISurfaceProps): JSX.Element {
  const { catalog, messages, surfaceId, onAction, onHandoff, onProblems, className, onPress } = props;
  const result = useMemo(() => resolveMessages(catalog, messages), [catalog, messages]);
  const problems = "problems" in result ? result.problems : null;
  const surfaces = "surfaces" in result ? result.surfaces : {};
  const ids = Object.keys(surfaces);
  const id = surfaceId ?? ids[0];
  // Stryker disable next-line ConditionalExpression: surfaces[undefined] is undefined too; the check is for the index type.
  const tree = id === undefined ? undefined : surfaces[id];
  useEffect(() => {
    if (problems) onProblems?.(problems);
  }, [problems, onProblems]);
  useDevWarnings(
    "A2UISurface",
    process.env.NODE_ENV !== "production"
      ? () => [
          onPress !== undefined && ["onPress is not a prop; a pressed button calls onAction, or onHandoff for a person-only one", "<A2UISurface onAction={send} onHandoff={openApp} />"],
          !problems && surfaceId !== undefined && tree === undefined && [`no surface "${surfaceId}" in the messages`, `<A2UISurface surfaceId="${String(ids[0])}" />`],
        ]
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );
  return (
    <div data-ouro="a2ui-surface" data-surface-id={id} className={cn("min-w-0", className)}>
      {problems ? (
        <Alert tone="destructive" title="This card can't be shown" description="It didn't pass the checks for composed UI." />
      ) : tree ? (
        // Stryker disable next-line StringLiteral: the root's key only prefixes its descendants' keys, which are unique under any prefix.
        renderNode(tree, { surfaceId: id!, onAction, onHandoff }, "root")
      ) : null}
    </div>
  );
}

function renderNode(node: Resolved, ctx: Context, key: string): ReactNode {
  const p = node.props;
  const kids = () => node.children.map((child, i) => renderNode(child, ctx, `${key}.${i}`));
  switch (node.component) {
    case "Card": {
      const [first, ...rest] = node.children;
      const media = first?.component === "Image" ? first : undefined;
      return (
        // Stryker disable next-line StringLiteral: the media slot holds one element, so its key matches no sibling's.
        <Card key={key} media={media ? image(media, "media") : undefined}>
          <Stack gap="md">{(media ? rest : node.children).map((child, i) => renderNode(child, ctx, `${key}.${i}`))}</Stack>
        </Card>
      );
    }
    case "Stack":
      return p.direction === "horizontal" ? (
        <Row key={key} wrap gap={GAPS[text(p.gap)]}>
          {kids()}
        </Row>
      ) : (
        <Stack key={key} gap={GAPS[text(p.gap)]}>
          {kids()}
        </Stack>
      );
    case "Heading":
      return (
        <Heading key={key} level={p.level as 1 | 2 | 3}>
          {text(p.text)}
        </Heading>
      );
    case "Text":
      return (
        <Text key={key} tone={p.tone === "muted" ? "muted" : "default"}>
          {text(p.text)}
        </Text>
      );
    case "Image":
      return image(node, key);
    case "Badge":
      return (
        <Badge key={key} tone={BADGE_TONES[text(p.tone)]}>
          {text(p.text)}
        </Badge>
      );
    case "List": {
      const items = (p.items as string[]).map((item, i) => <li key={i}>{item}</li>);
      return p.ordered === true ? (
        <ol key={key} className={cn(LIST_CLASS, "list-decimal")}>
          {items}
        </ol>
      ) : (
        <ul key={key} className={cn(LIST_CLASS, "list-disc")}>
          {items}
        </ul>
      );
    }
    case "DescriptionList":
      return <DescriptionList key={key} items={(p.items as { term: string; detail: string }[]).map((item) => ({ term: item.term, details: item.detail }))} />;
    case "Separator":
      return <Separator key={key} />;
    case "Alert":
      return <Alert key={key} tone={ALERT_TONES[text(p.tone)]} title={text(p.title)} description={p.text as string | undefined} />;
    default:
      return <ActionButton key={key} node={node} ctx={ctx} />;
  }
}

function image(node: Resolved, key: string): JSX.Element {
  return (
    <AspectRatio key={key} ratio={ASPECTS[text(node.props.aspect)]!}>
      <img src={text(node.props.url)} alt={text(node.props.description)} />
    </AspectRatio>
  );
}

/** An arrow out to the app's own screen, on a person-only action's button. */
function HandoffIcon(props: SVGProps<SVGSVGElement>): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M7 17 17 7M8 7h9v9" />
    </svg>
  );
}

/** How a button other than the agent's primary action looks: soft, in the secondary tone. */
const SECONDARY = { tone: "secondary", variant: "soft" } as const;

function ActionButton({ node, ctx }: { node: Resolved; ctx: Context }): JSX.Element {
  const p = node.props as { label: string; press: "run" | "confirm" | "handoff"; action: string; emphasis?: string; handoff?: string; confirm?: { description: string; fields: { label: string; value: string }[] } };
  const [pending, setPending] = useState(false);
  const [open, setOpen] = useState(false);
  const primary = p.emphasis === "primary";
  const send = (confirm: { confirmed?: true } = {}) => ctx.onAction(actionMessage({ surfaceId: ctx.surfaceId, sourceComponentId: node.id, button: node, timestamp: now(), ...confirm }) as unknown as A2UIActionMessage);
  const button = (onClick: () => void, end?: typeof HandoffIcon) => (
    // A primary button is Button's default, solid in the primary tone.
    <Button {...(primary ? {} : SECONDARY)} loading={pending} endIcon={end} onClick={onClick} data-action={p.action}>
      {p.label}
    </Button>
  );
  if (p.press === "handoff") return button(() => ctx.onHandoff({ action: p.action, how: p.handoff! }), HandoffIcon);
  if (p.press === "confirm")
    return (
      <>
        {button(() => setOpen(true))}
        <ConfirmDialog
          open={open}
          onOpenChange={setOpen}
          title={`${p.label}?`}
          description={
            // The confirmation's description is a <p>, so each prepared value is a line of its own inside it.
            <>
              {p.confirm!.description}
              {p.confirm!.fields.map((f) => (
                <span key={f.label} className={FIELD_CLASS}>
                  <span className={FIELD_LABEL_CLASS}>{f.label}:</span> {f.value}
                </span>
              ))}
            </>
          }
          confirmLabel={p.label}
          onConfirm={() => send({ confirmed: true })}
        />
      </>
    );
  return button(() => {
    const done = send();
    if (done) {
      setPending(true);
      void Promise.resolve(done).finally(() => setPending(false));
    }
  });
}
