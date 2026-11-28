"use client";

import { useId, useLayoutEffect, useRef, useState, type JSX, type ReactNode, type Ref } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Card, type CardProps } from "@/registry/ouro/components/ouro/card/card";
import { TextArea } from "@/registry/ouro/components/ouro/text-field/text-area";
import { feedbackClass, settledClass } from "@/registry/ouro/components/ouro/plan-approval/plan-approval-styles";
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/ouro/class-name-check";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { useDevWarnings } from "@/registry/ouro/lib/ouro/use-dev-messages";

/** How the person answered a {@link PlanApproval}. */
export interface PlanAnswer {
  /** What they chose. */
  decision: "approved" | "changes-requested";
  /** Who answered: "Ana", "you". */
  by: ReactNode;
  /** Where they answered from, such as "the desktop app" or "their phone": "Approved by Ana from their phone". */
  app?: ReactNode;
  /** When, already formatted ("9:41", `<RelativeTime>`). */
  at?: ReactNode;
  /** What they asked to change, shown under the answer. */
  feedback?: ReactNode;
}

/** Props for {@link PlanApproval}. */
export interface PlanApprovalProps {
  /** What the plan is for, as its title: "Your agent's plan for dinner". */
  title: ReactNode;
  /** The plan, as your app renders it: steps, a list, Markdown. */
  children: ReactNode;
  /** Called when the person presses Approve. */
  onApprove?: (() => void) | undefined;
  /** Called with what the person wrote when they send a request for changes. */
  onRequestChanges?: ((feedback: string) => void) | undefined;
  /** Which answer is on its way, while your app sends it: that button shows it is busy and none presses again. */
  answering?: "approve" | "changes" | undefined;
  /** The person's answer, once they have given it, in this app or another: the buttons give way to who answered. */
  answer?: PlanAnswer | undefined;
  /** The approve button's label. @default "Approve" */
  approveLabel?: string | undefined;
  /** The button that opens the feedback field. @default "Request changes" */
  requestChangesLabel?: string | undefined;
  /** The feedback field's label. @default "What should change?" */
  feedbackLabel?: string | undefined;
  /** The button that sends the feedback. @default "Send" */
  sendLabel?: string | undefined;
  /** The button that closes the feedback field. @default "Cancel" */
  cancelLabel?: string | undefined;
  /** The title's heading level, one below the section's heading, as Card's. @default 3 */
  headingLevel?: CardProps["headingLevel"];
  /** Layout only: margins, width (`mt-2`, `max-w-xl`). Appearance classes warn in development. */
  className?: string | undefined;
  ref?: Ref<HTMLDivElement> | undefined;

  /** Not a prop. Ouro UI uses `onApprove`: `<PlanApproval onApprove={approve}>`. */
  onAccept?: { 'Use <PlanApproval onApprove={approve}>': never };
  /** Not a prop. Ouro UI uses `onRequestChanges`, which gets the person's feedback: `<PlanApproval onRequestChanges={revise}>`. */
  onReject?: { 'Use <PlanApproval onRequestChanges={revise}>': never };
  /** Not a prop. The plan is the children: `<PlanApproval title="Plan">{plan}</PlanApproval>`. */
  plan?: { 'Pass the plan as children: <PlanApproval title="Plan">{plan}</PlanApproval>': never };
  /** Not a prop. The person's answer is `answer`: `<PlanApproval answer={{ decision: "approved", by: "Ana" }}>`. */
  status?: { 'Use <PlanApproval answer={{ decision: "approved", by: "Ana" }}>': never };
}

/**
 * An agent's plan, waiting for the person before the agent starts on it: Approve, or Request changes, which opens a
 * field to say what should change. Once answered, here or in another app, the buttons give way to one line that says
 * who answered and from where, "Approved by Ana from their phone", which a screen reader hears, with any feedback under
 * it; if the person was on a button or in the field, focus moves to that line. Approve and Request changes are the
 * person's alone: its agent side, `planApprovalAx`, declares them person-only, so no agent door offers them.
 *
 * Use `PermissionPrompt` instead for one action the agent wants to take, and `ConfirmDialog` instead to confirm the
 * person's own action in your app.
 *
 * @group Chat
 * @see https://ui.ouroboros.bot/docs/plan-approval
 *
 * @example
 * <PlanApproval title="Your agent's plan for dinner" onApprove={approve} onRequestChanges={revise} answer={answer}>
 *   <Plan steps={steps} />
 * </PlanApproval>
 * @claim "Request changes, which opens a field" registry/ouro/components/ouro/plan-approval/plan-approval.test.tsx verify:testExists(registry/ouro/components/ouro/plan-approval/plan-approval.test.tsx::PlanApproval > opens a field for the person's feedback, sends what they wrote, and cancels back to the buttons)
 * @claim "the buttons give way to one line" registry/ouro/components/ouro/plan-approval/plan-approval.test.tsx verify:testExists(registry/ouro/components/ouro/plan-approval/plan-approval.test.tsx::PlanApproval > gives way to who answered and from where, which a screen reader hears, with the feedback under it)
 * @claim "focus moves to that line" registry/ouro/components/ouro/plan-approval/plan-approval.test.tsx verify:testExists(registry/ouro/components/ouro/plan-approval/plan-approval.test.tsx::PlanApproval > moves focus to the answer when it arrives while a button or the field holds focus, and not when nothing did)
 * @claim "declares them person-only" registry/ouro/components/ouro/plan-approval/plan-approval.test.tsx verify:testExists(registry/ouro/components/ouro/plan-approval/plan-approval.test.tsx::PlanApproval > declares approve and request-changes the person's, each on the button that does it)
 */
export function PlanApproval(props: PlanApprovalProps): JSX.Element {
  const {
    title,
    children,
    onApprove,
    onRequestChanges,
    answering,
    answer,
    approveLabel = "Approve",
    requestChangesLabel = "Request changes",
    feedbackLabel = "What should change?",
    sendLabel = "Send",
    cancelLabel = "Cancel",
    headingLevel,
    className,
    ref,
    // Guard props (hint types), dropped here so they never reach the DOM.
    onAccept,
    onReject,
    plan,
    status,
  } = props;
  useAppearanceClassNameCheck(
    "PlanApproval",
    className,
    process.env.NODE_ENV !== "production"
      ? (token: string) => `remove "${token}"; PlanApproval sets its own look from the theme`
      : // Stryker disable next-line StringLiteral: production only; the check never runs there.
        /* istanbul ignore next @preserve -- production only */ "",
  );
  useDevWarnings(
    "PlanApproval",
    process.env.NODE_ENV !== "production"
      ? () => [
          onAccept !== undefined && ["onAccept is not a prop", "<PlanApproval onApprove={approve}>"],
          onReject !== undefined && ["onReject is not a prop; a request for changes gets the person's feedback", "<PlanApproval onRequestChanges={revise}>"],
          plan !== undefined && ["plan is not a prop; the plan is the children", '<PlanApproval title="Plan">{plan}</PlanApproval>'],
          status !== undefined && ["status is not a prop; the person's answer is answer", '<PlanApproval answer={{ decision: "approved", by: "Ana" }}>'],
        ]
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );
  const titleId = useId();
  const settledRef = useRef<HTMLParagraphElement>(null);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const requestRef = useRef<HTMLButtonElement>(null);
  const [editing, setEditing] = useState(false);
  const [feedback, setFeedback] = useState("");
  // Where focus goes after the person opens or cancels the field: the field, or back to Request changes.
  const [focusAfter, setFocusAfter] = useState<"field" | "request" | undefined>(undefined);
  useLayoutEffect(() => {
    if (focusAfter === undefined) return;
    (focusAfter === "field" ? fieldRef : requestRef).current!.focus();
    setFocusAfter(undefined);
  }, [focusAfter]);
  // Whether focus was on a button or in the field as the answer removed them, read in the ref's cleanup, which React
  // runs before it takes them out; then focus moves to the answer's line.
  const actionsHeldFocus = useRef(false);
  // One callback for the component's life, so React calls it once per mount of the actions.
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
    // The focused control is gone, so focus is on the page's body: the answer's line takes it.
    settledRef.current!.focus();
  }, [answered]);
  const busy = answering !== undefined ? "Your answer is on its way" : undefined;
  const written = feedback.trim();
  return (
    <div ref={ref} data-ouro="plan-approval" data-slot="plan-approval" data-decision={answer?.decision} className={cn("grid min-w-0", className)}>
      <Card
        as="article"
        size="sm"
        data-slot="plan-approval-card"
        aria-labelledby={titleId}
        headingLevel={headingLevel}
        title={<span id={titleId}>{title}</span>}
        footer={
          <div data-slot="plan-approval-footer" className="grid min-w-0 flex-1 gap-2">
            {answered ? null : (
              <div ref={actionsRef} data-slot="plan-approval-actions" className="grid min-w-0 gap-3">
                {editing ? (
                  <>
                    <TextArea ref={fieldRef} label={feedbackLabel} value={feedback} onValueChange={setFeedback} autoGrow disabled={busy !== undefined && answering !== "changes"} />
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        data-ouro-control="plan-approval"
                        data-ouro-part="cancel"
                        variant="plain"
                        disabledReason={busy}
                        onClick={() => {
                          setEditing(false);
                          setFocusAfter("request");
                        }}
                      >
                        {cancelLabel}
                      </Button>
                      <Button
                        data-ouro-control="plan-approval"
                        data-ouro-part="send"
                        data-ax-action="request-changes"
                        loading={answering === "changes"}
                        disabledReason={answering === "approve" ? busy : written === "" ? "Say what should change first" : undefined}
                        onClick={() => onRequestChanges?.(written)}
                      >
                        {sendLabel}
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      ref={requestRef}
                      data-ouro-control="plan-approval"
                      data-ouro-part="request-changes"
                      data-ax-action="request-changes"
                      variant="outline"
                      loading={answering === "changes"}
                      disabledReason={answering === "approve" ? busy : undefined}
                      onClick={() => {
                        setEditing(true);
                        setFocusAfter("field");
                      }}
                    >
                      {requestChangesLabel}
                    </Button>
                    <Button
                      data-ouro-control="plan-approval"
                      data-ouro-part="approve"
                      data-ax-action="approve"
                      loading={answering === "approve"}
                      disabledReason={answering === "changes" ? busy : undefined}
                      onClick={onApprove}
                    >
                      {approveLabel}
                    </Button>
                  </div>
                )}
              </div>
            )}
            <p ref={settledRef} data-slot="plan-approval-answer" role="status" tabIndex={answered ? -1 : undefined} className={settledClass}>
              {answered ? (
                <>
                  <svg
                    aria-hidden="true"
                    data-slot="plan-approval-answer-icon"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={cn("size-ouro-4 shrink-0", answer.decision === "approved" ? "text-success" : "text-warning")}
                  >
                    {answer.decision === "approved" ? <path d="m3.5 8.5 3 3 6-7" /> : <path d="M3 13h2.5l7-7-2.5-2.5-7 7z" />}
                  </svg>
                  <span data-slot="plan-approval-answer-text">
                    {answer.decision === "approved" ? "Approved" : "Changes requested"} by {answer.by}
                    {answer.app != null ? <> from {answer.app}</> : null}
                    {answer.at != null ? <> · {answer.at}</> : null}
                  </span>
                </>
              ) : null}
            </p>
            {answer?.feedback != null ? (
              <p data-slot="plan-approval-feedback" className={feedbackClass}>
                {answer.feedback}
              </p>
            ) : null}
          </div>
        }
      >
        <div data-slot="plan-approval-plan" className="min-w-0">
          {children}
        </div>
      </Card>
    </div>
  );
}
