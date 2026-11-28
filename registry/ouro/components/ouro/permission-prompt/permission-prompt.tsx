"use client";

import { useId, useLayoutEffect, useRef, useState, type JSX, type ReactNode, type Ref } from "react";
import { Badge } from "@/registry/ouro/components/ouro/badge/badge";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Card, type CardProps } from "@/registry/ouro/components/ouro/card/card";
import { CodeBlock } from "@/registry/ouro/components/ouro/code-block/code-block";
import { riskBadges, settledClass, type PermissionRisk } from "@/registry/ouro/components/ouro/permission-prompt/permission-prompt-styles";
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/ouro/class-name-check";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { useDevWarnings } from "@/registry/ouro/lib/ouro/use-dev-messages";

/** How the person answered a {@link PermissionPrompt}. */
export interface PermissionAnswer {
  /** What they chose. */
  decision: "allowed" | "denied";
  /** Who answered: "Ana", "you". */
  by: ReactNode;
  /** Where they answered from, such as "the desktop app" or "their phone": "Allowed by Ana from their phone". */
  app?: ReactNode;
  /** When, already formatted ("9:41", `<RelativeTime>`). */
  at?: ReactNode;
}

/** Props for {@link PermissionPrompt}. */
export interface PermissionPromptProps {
  /** What the agent wants to do, as a sentence: "Your agent wants to run a command". */
  title: ReactNode;
  /** Exactly what it would run or change, as plain text, shown in a CodeBlock: `npm install left-pad`. */
  detail?: string | undefined;
  /** Why it asks, in the agent's words: "To add the package the importer needs." */
  reason?: ReactNode;
  /** How much could go wrong if the person allows it, as a badge: low, medium or high. */
  risk?: PermissionRisk | (string & { 'Use "low", "medium" or "high"': never }) | undefined;
  /** Called when the person presses Allow once. */
  onAllow?: (() => void) | undefined;
  /** Called when the person presses Deny. */
  onDeny?: (() => void) | undefined;
  /** Which answer is on its way, while your app sends it: that button shows it is busy and neither presses again. */
  answering?: "allow" | "deny" | undefined;
  /** The person's answer, once they have given it, in this app or another: the buttons give way to who answered. */
  answer?: PermissionAnswer | undefined;
  /** The allow button's label. @default "Allow once" */
  allowLabel?: string | undefined;
  /** The deny button's label. @default "Deny" */
  denyLabel?: string | undefined;
  /** The title's heading level, one below the section's heading, as Card's. @default 3 */
  headingLevel?: CardProps["headingLevel"];
  /** Layout only: margins, width (`mt-2`, `max-w-xl`). Appearance classes warn in development. */
  className?: string | undefined;
  ref?: Ref<HTMLDivElement> | undefined;

  /** Not a prop. Ouro UI uses `onAllow`: `<PermissionPrompt onAllow={allow}>`. */
  onApprove?: { 'Use <PermissionPrompt onAllow={allow}>': never };
  /** Not a prop. Ouro UI uses `onDeny`: `<PermissionPrompt onDeny={deny}>`. */
  onReject?: { 'Use <PermissionPrompt onDeny={deny}>': never };
  /** Not a prop. What it would run is `detail`: `<PermissionPrompt detail="npm install">`. */
  command?: { 'Use <PermissionPrompt detail="npm install">': never };
  /** Not a prop. Why it asks is `reason`: `<PermissionPrompt reason="To add the package">`. */
  description?: { 'Use <PermissionPrompt reason="To add the package">': never };
  /** Not a prop. The person's answer is `answer`: `<PermissionPrompt answer={{ decision: "allowed", by: "Ana" }}>`. */
  status?: { 'Use <PermissionPrompt answer={{ decision: "allowed", by: "Ana" }}>': never };
}

/**
 * An agent asking the person's permission before it acts: what it wants to do, exactly what it would run, why, and how
 * risky it is, with Allow once and Deny. Once answered, here or in another app, the buttons give way to one line that
 * says who answered and from where, "Allowed by Ana from their phone", which a screen reader hears; if the person was
 * on a button, focus moves to that line. Allow and Deny are the person's alone: its agent side, `permissionPromptAx`,
 * declares them person-only, so no agent door offers them.
 *
 * Use `ConfirmDialog` instead to confirm the person's own action in your app, and `AttentionCard` instead to list a
 * request that waits elsewhere.
 *
 * @group Chat
 * @see https://ui.ouroboros.bot/docs/permission-prompt
 *
 * @example
 * <PermissionPrompt
 *   title="Your agent wants to run a command"
 *   detail="npm install left-pad"
 *   reason="To add the package the importer needs."
 *   risk="medium"
 *   onAllow={allow}
 *   onDeny={deny}
 *   answer={answer}
 * />
 * @claim "the buttons give way to one line" registry/ouro/components/ouro/permission-prompt/permission-prompt.test.tsx verify:testExists(registry/ouro/components/ouro/permission-prompt/permission-prompt.test.tsx::PermissionPrompt > gives way to who answered and from where, which a screen reader hears)
 * @claim "focus moves to that line" registry/ouro/components/ouro/permission-prompt/permission-prompt.test.tsx verify:testExists(registry/ouro/components/ouro/permission-prompt/permission-prompt.test.tsx::PermissionPrompt > moves focus from the pressed button to the answer, and leaves focus elsewhere alone)
 * @claim "declares them person-only" registry/ouro/components/ouro/permission-prompt/permission-prompt.test.tsx verify:testExists(registry/ouro/components/ouro/permission-prompt/permission-prompt.test.tsx::PermissionPrompt > declares allow and deny the person's, each on the button that does it)
 */
export function PermissionPrompt(props: PermissionPromptProps): JSX.Element {
  const {
    title,
    detail,
    reason,
    risk: riskProp,
    onAllow,
    onDeny,
    answering,
    answer,
    allowLabel = "Allow once",
    denyLabel = "Deny",
    headingLevel,
    className,
    ref,
    // Guard props (hint types), dropped here so they never reach the DOM.
    onApprove,
    onReject,
    command,
    description,
    status,
  } = props;
  // A risk that is not one of PermissionPrompt's (a type error) shows no badge and names the fix in development.
  const badge = Object.hasOwn(riskBadges, String(riskProp)) ? riskBadges[riskProp as PermissionRisk] : undefined;
  useAppearanceClassNameCheck(
    "PermissionPrompt",
    className,
    process.env.NODE_ENV !== "production"
      ? (token: string) => `remove "${token}"; PermissionPrompt sets its own look from the theme`
      : // Stryker disable next-line StringLiteral: production only; the check never runs there.
        /* istanbul ignore next @preserve -- production only */ "",
  );
  useDevWarnings(
    "PermissionPrompt",
    process.env.NODE_ENV !== "production"
      ? () => [
          riskProp !== undefined && badge === undefined && [`risk="${String(riskProp)}" is not a risk; use "low", "medium" or "high"`, '<PermissionPrompt risk="medium">'],
          onApprove !== undefined && ["onApprove is not a prop", "<PermissionPrompt onAllow={allow}>"],
          onReject !== undefined && ["onReject is not a prop", "<PermissionPrompt onDeny={deny}>"],
          command !== undefined && ["command is not a prop; what it would run is detail", '<PermissionPrompt detail="npm install">'],
          description !== undefined && ["description is not a prop; why it asks is reason", '<PermissionPrompt reason="To add the package">'],
          status !== undefined && ["status is not a prop; the person's answer is answer", '<PermissionPrompt answer={{ decision: "allowed", by: "Ana" }}>'],
        ]
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );
  const titleId = useId();
  const settledRef = useRef<HTMLParagraphElement>(null);
  // Whether focus was on a button as the answer removed them, read in the ref's cleanup, which React runs before it
  // takes the buttons out; then focus moves to the answer's line.
  const actionsHeldFocus = useRef(false);
  // One callback for the component's life, so React calls it once per mount of the buttons.
  const [actionsRef] = useState(() => (element: HTMLDivElement | null) => {
    // React 19 calls a ref that returns a cleanup with the element only; the cleanup replaces the call with null.
    // Stryker disable next-line ConditionalExpression: never called with null, as above.
    /* istanbul ignore if @preserve -- never called with null */
    if (element === null) return;
    return () => {
      actionsHeldFocus.current = element.contains(document.activeElement);
    };
  });
  const answered = answer !== undefined;
  useLayoutEffect(() => {
    if (!answered || !actionsHeldFocus.current) return;
    // Stryker disable next-line BooleanLiteral,AssignmentOperator: only a later answer with focus on no element could tell, and focus then belongs on the answer anyway.
    actionsHeldFocus.current = false;
    // The focused button is gone, so focus is on the page's body: the answer's line takes it.
    settledRef.current!.focus();
  }, [answered]);
  return (
    <div ref={ref} data-ouro="permission-prompt" data-slot="permission-prompt" data-decision={answer?.decision} className={cn("grid min-w-0", className)}>
      <Card
        as="article"
        size="sm"
        data-slot="permission-prompt-card"
        aria-labelledby={titleId}
        headingLevel={headingLevel}
        title={<span id={titleId}>{title}</span>}
        description={reason}
        action={
          badge !== undefined ? (
            <Badge data-slot="permission-prompt-risk" tone={badge.tone} variant="soft">
              {badge.words}
            </Badge>
          ) : undefined
        }
        footer={
          <div data-slot="permission-prompt-footer" className="flex min-w-0 flex-wrap items-center gap-2">
            {answered ? null : (
              <div
                data-slot="permission-prompt-actions"
                className="flex flex-wrap items-center gap-2"
                ref={actionsRef}
              >
                <Button
                  data-ouro-control="permission-prompt"
                  data-ouro-part="deny"
                  data-ax-action="deny"
                  variant="outline"
                  disabledReason={answering === "allow" ? "Your answer is on its way" : undefined}
                  loading={answering === "deny"}
                  onClick={onDeny}
                >
                  {denyLabel}
                </Button>
                <Button
                  data-ouro-control="permission-prompt"
                  data-ouro-part="allow"
                  data-ax-action="allow"
                  disabledReason={answering === "deny" ? "Your answer is on its way" : undefined}
                  loading={answering === "allow"}
                  onClick={onAllow}
                >
                  {allowLabel}
                </Button>
              </div>
            )}
            <p ref={settledRef} data-slot="permission-prompt-answer" role="status" tabIndex={answered ? -1 : undefined} className={settledClass}>
              {answered ? (
                <>
                  <svg
                    aria-hidden="true"
                    data-slot="permission-prompt-answer-icon"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={cn("size-ouro-4 shrink-0", answer.decision === "allowed" ? "text-success" : "text-destructive")}
                  >
                    {answer.decision === "allowed" ? <path d="m3.5 8.5 3 3 6-7" /> : <path d="m4.5 4.5 7 7m0-7-7 7" />}
                  </svg>
                  <span data-slot="permission-prompt-answer-text">
                    {answer.decision === "allowed" ? "Allowed" : "Denied"} by {answer.by}
                    {answer.app != null ? <> from {answer.app}</> : null}
                    {answer.at != null ? <> · {answer.at}</> : null}
                  </span>
                </>
              ) : null}
            </p>
          </div>
        }
      >
        {detail !== undefined ? <CodeBlock data-slot="permission-prompt-detail" code={detail} copy={false} wrap /> : null}
      </Card>
    </div>
  );
}
