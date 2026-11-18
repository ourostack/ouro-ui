"use client";

import { type JSX, useEffect, useMemo } from "react";
import { Alert } from "@/registry/ouro/components/ouro/alert/alert";
import { ComposedTree, type ComposedSurfaceProps } from "@/registry/ouro/components/ouro/composed-surface/composed-surface";
import { actionMessage, applyMessages, resolveMessages, type LabelContext, type Problem } from "@/registry/ouro/lib/ouro/a2ui-core";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { useDevWarnings } from "@/registry/ouro/lib/ouro/use-dev-messages";

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
  /**
   * Names the ids in a confirm sheet's rows from the app's own data, such as a recipe's title for `rcp_lemon_orzo`.
   * It is asked only for an id field, one whose catalog input has `shownAs`; every other row shows exactly what will
   * be sent. Return undefined to keep the name the agent prepared, or the id. The name wins over what the agent prepared,
   * because the agent's text is the one thing the person can't check. Keep it stable, as `messages` is: a new function
   * on each render resolves the messages again.
   *
   * @claim "It is asked only for an id field" registry/ouro/components/ouro/a2ui-surface/a2ui-surface.test.tsx verify:testExists(registry/ouro/components/ouro/a2ui-surface/a2ui-surface.test.tsx::A2UISurface > lets the app's resolver name an id the agent prepared a name for, in a field the catalog says stands in for it) verify:fileLine(registry/ouro/lib/ouro/a2ui-core.ts, /f\.shownAs !== undefined \? \(options\.label/)
   * @claim "The name wins over what the agent prepared" registry/ouro/components/ouro/a2ui-surface/a2ui-surface.test.tsx verify:testExists(registry/ouro/components/ouro/a2ui-surface/a2ui-surface.test.tsx::A2UISurface > lets the app's resolver name an id the agent prepared a name for, in a field the catalog says stands in for it)
   * @example
   * label={({ field, value }) => (field === "recipe" ? titles[value] : undefined)}
   */
  label?: ((context: LabelContext) => string | undefined) | undefined;
  /** Layout only: margins, width (`max-w-md`). */
  className?: string | undefined;

  /** Not a prop. A pressed button calls `onAction`, or `onHandoff` for a person-only one: `<A2UISurface onAction={send} onHandoff={openApp}>`. */
  onPress?: { "Use onAction={send} onHandoff={openApp}": never };
}

/** When a button was pressed, for its action message. */
const now = () => new Date().toISOString();

/**
 * Shows the UI an agent composed in A2UI, with Ouro HX: it resolves the messages into core's composed tree, draws it
 * as ComposedSurface does, its fields starting from the surface's data model, and sends a press as A2UI's action
 * message, with what the person entered in a field a button's input is bound to. Every button is one of your app's declared
 * actions: read and write run, a consequential one asks the person to confirm what the agent prepared, and a
 * person-only one takes them to your app's own screen. Messages that fail core's validator show a short alert, and
 * `onProblems` gets the details for the agent.
 *
 * Use ComposedSurface instead for a tree that didn't come as A2UI, and HX's components directly when your own code,
 * not an agent, decides the layout.
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
  const { catalog, messages, surfaceId, onAction, onHandoff, onProblems, className, onPress, label } = props;
  const result = useMemo(() => resolveMessages(catalog, messages, label ? { label } : {}), [catalog, messages, label]);
  const problems = "problems" in result ? result.problems : null;
  const surfaces = "surfaces" in result ? result.surfaces : {};
  const ids = Object.keys(surfaces);
  const id = surfaceId ?? ids[0];
  // Stryker disable next-line ConditionalExpression: surfaces[undefined] is undefined too; the check is for the index type.
  const tree = id === undefined ? undefined : surfaces[id];
  // The surface's data model, as createSurface and updateDataModel leave it: what its fields start from. It depends on
  // the messages alone, so a new label function keeps what the person entered.
  const valid = problems === null;
  const data = useMemo(() => (valid ? applyMessages(messages).get(id!)?.data : undefined), [valid, messages, id]);
  // A press, as the A2UI action message it names: the button is its source component.
  const onComposedPress: ComposedSurfaceProps["onPress"] = (press, button) =>
    onAction(actionMessage({ surfaceId: id!, sourceComponentId: button.id, button, timestamp: now(), confirmed: press.confirmed === true }) as unknown as A2UIActionMessage);
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
        <ComposedTree tree={tree} data={data} origin={messages} onPress={onComposedPress} onHandoff={onHandoff} />
      ) : null}
    </div>
  );
}
