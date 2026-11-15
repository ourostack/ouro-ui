"use client";

import { type JSX, type ReactNode, type SVGProps, useState } from "react";
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
import { personPress, type ComposedNode, type PersonPress } from "@/registry/ouro/lib/ouro/a2ui-core";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { useDevWarnings } from "@/registry/ouro/lib/ouro/use-dev-messages";
import { ALERT_TONES, ASPECTS, BADGE_TONES, FIELD_CLASS, FIELD_LABEL_CLASS, GAPS, LIST_CLASS, RAW_CLASS } from "@/registry/ouro/components/ouro/composed-surface/composed-surface-styles";

/** Where a person-only button takes the person: the action's id and the catalog's `how`. */
export interface ComposedHandoff {
  action: string;
  how: string;
}

/** Props for {@link ComposedSurface}. */
export interface ComposedSurfaceProps {
  /**
   * The composed tree to draw: core's `ComposedNode`, its values resolved. Check one you didn't resolve yourself
   * with core's `validateTree` against the app's catalog first; A2UI's resolver already has.
   */
  tree: ComposedNode;
  /**
   * Runs a pressed read or write button, and a consequential one once the person confirms. `press` is core's
   * `PersonPress` (the action, the prepared input, its consent, and that the person pressed it); `button` is the node,
   * for a format that names its source. Return a promise to show the button loading until it settles.
   */
  onPress: (press: PersonPress, button: ComposedNode) => void | Promise<void>;
  /**
   * A person-only button never runs from composed UI: take the person to your app's own screen for it.
   *
   * @claim "A person-only button never runs" registry/ouro/components/ouro/composed-surface/composed-surface.test.tsx verify:testExists(registry/ouro/components/ouro/composed-surface/composed-surface.test.tsx::ComposedSurface > hands a person-only action to the app's own screen and never presses it)
   */
  onHandoff: (handoff: ComposedHandoff) => void;
  /** Layout only: margins, width (`max-w-md`). */
  className?: string | undefined;

  /** Not a prop. A pressed button calls `onPress`, or `onHandoff` for a person-only one: `<ComposedSurface onPress={run} onHandoff={openApp}>`. */
  onAction?: { "Use onPress={run} onHandoff={openApp}": never };
}

interface Context {
  onPress: ComposedSurfaceProps["onPress"];
  onHandoff: ComposedSurfaceProps["onHandoff"];
}

/** A resolved prop the resolver gives as text (core's `asText`), typed as one. */
const text = (v: unknown): string => v as string;

/**
 * Draws Ouro's composed tree with Ouro HX, whatever format it came in: core's `ComposedNode`, from A2UI messages, an
 * MCP tool result's `structuredContent.ouro`, or your own code. Every button is one of your app's declared actions:
 * read and write run, a consequential one asks the person to confirm what the agent prepared, and a person-only one
 * takes them to your app's own screen.
 *
 * Use A2UISurface instead for A2UI messages, and HX's components directly when your own code, not an agent, decides
 * the layout.
 *
 * @claim "Every button is one" registry/ouro/components/ouro/composed-surface/composed-surface.test.tsx verify:testExists(registry/ouro/components/ouro/composed-surface/composed-surface.test.tsx::ComposedSurface > presses a write button with the prepared input, pressed by the person)
 * @claim "Every button is one" registry/ouro/components/ouro/composed-surface/composed-surface.test.tsx verify:testExists(registry/ouro/components/ouro/composed-surface/composed-surface.test.tsx::ComposedSurface > asks the person to confirm a consequential action with what the agent prepared, and presses it only on confirm)
 * @claim "Every button is one" registry/ouro/components/ouro/composed-surface/composed-surface.test.tsx verify:testExists(registry/ouro/components/ouro/composed-surface/composed-surface.test.tsx::ComposedSurface > hands a person-only action to the app's own screen and never presses it)
 *
 * @group Display
 * @see https://ui.ouroboros.bot/docs/composed-surface
 *
 * @example
 * <ComposedSurface
 *   tree={result.structuredContent.ouro.tree}
 *   onPress={(press) => callTool(press.action, press.input)}
 *   onHandoff={({ action }) => navigate(`/recipes/${id}?do=${action}`)}
 * />
 */
export function ComposedSurface(props: ComposedSurfaceProps): JSX.Element {
  const { tree, onPress, onHandoff, className, onAction } = props;
  useDevWarnings(
    "ComposedSurface",
    process.env.NODE_ENV !== "production"
      ? () => [onAction !== undefined && ["onAction is not a prop; a pressed button calls onPress, or onHandoff for a person-only one", "<ComposedSurface onPress={run} onHandoff={openApp} />"]]
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );
  return (
    <div data-ouro="composed-surface" className={cn("min-w-0", className)}>
      <ComposedTree tree={tree} onPress={onPress} onHandoff={onHandoff} />
    </div>
  );
}

/**
 * The tree's components, drawn straight into the parent: the body of ComposedSurface and of A2UISurface.
 *
 * @internal
 */
export function ComposedTree({ tree, onPress, onHandoff }: Pick<ComposedSurfaceProps, "tree" | "onPress" | "onHandoff">): ReactNode {
  // Stryker disable next-line StringLiteral: the root's key only prefixes its descendants' keys, which are unique under any prefix.
  return renderNode(tree, { onPress, onHandoff }, "root");
}

function renderNode(node: ComposedNode, ctx: Context, key: string): ReactNode {
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

function image(node: ComposedNode, key: string): JSX.Element {
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

function ActionButton({ node, ctx }: { node: ComposedNode; ctx: Context }): JSX.Element {
  const p = node.props as { label: string; press: "run" | "confirm" | "handoff"; action: string; emphasis?: string; handoff?: string; confirm?: { description: string; fields: { label: string; value: string; raw?: string }[] } };
  const [pending, setPending] = useState(false);
  const [open, setOpen] = useState(false);
  const primary = p.emphasis === "primary";
  const send = (confirmed?: true) => ctx.onPress(personPress(node, confirmed), node);
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
                  {f.raw !== undefined && (
                    <>
                      {" "}
                      <span className={RAW_CLASS}>{f.raw}</span>
                    </>
                  )}
                </span>
              ))}
            </>
          }
          confirmLabel={p.label}
          onConfirm={() => send(true)}
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
