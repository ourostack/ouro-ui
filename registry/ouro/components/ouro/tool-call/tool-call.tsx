"use client";

import { useState, type JSX, type ReactNode, type Ref } from "react";
import { CodeBlock } from "@/registry/ouro/components/ouro/code-block/code-block";
import { Collapsible } from "@/registry/ouro/components/ouro/collapsible/collapsible";
import { Spinner } from "@/registry/ouro/components/ouro/spinner/spinner";
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/ouro/class-name-check";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { useDevWarnings } from "@/registry/ouro/lib/ouro/use-dev-messages";
import {
  detailClass,
  durationClass,
  formatDuration,
  iconClass,
  nameClass,
  rowClass,
  statusIconTone,
  statusLabels,
  statusWords,
  titleRowClass,
  toolCallStatuses,
  toolCallStatusFix,
  type ToolCallStatus,
} from "@/registry/ouro/components/ouro/tool-call/tool-call-styles";

/** Props for {@link ToolCall}. */
export interface ToolCallProps {
  /** What the agent did, as the person reads it: "Read file", "Ran command", "Searched the web". */
  name: ReactNode;
  /**
   * Where the call stands. `running` shows a spinner; `done` a tick; `failed` a cross and "Failed"; `waiting` (for the
   * person, such as for their permission) a clock and "Waiting for you".
   */
  status: ToolCallStatus | (string & { 'Use "running", "done", "failed" or "waiting"': never });
  /** A short summary of its arguments, in the code font, cut short on one line: `recipes/roast.md`, `npm test`. */
  detail?: ReactNode;
  /** How long it took, in seconds, shown short at the row's end: "1.2s", "2m 5s". */
  duration?: number | undefined;
  /** What the tool gave back, as plain text. With it the row opens to show it in a CodeBlock. */
  output?: string | undefined;
  /** The output's language, for CodeBlock: `"ansi"` reads terminal escape codes as colours. */
  outputLanguage?: string | undefined;
  /** Shows the output first, when the component keeps its own state. */
  defaultOpen?: boolean | undefined;
  /** Whether the output shows, when you control it. Pair it with `onOpenChange`. */
  open?: boolean | undefined;
  /** Called with the new state when the person shows or hides the output. */
  onOpenChange?: ((open: boolean) => void) | undefined;
  /** Layout only: margins, width (`mt-1`). Appearance classes warn in development. */
  className?: string | undefined;
  ref?: Ref<HTMLDivElement> | undefined;

  /** Not a prop. Where the call stands is `status`: `<ToolCall status="running">`. */
  state?: { 'Use <ToolCall status="running">': never };
  /** Not a prop. The tool's name is `name`: `<ToolCall name="Read file">`. */
  toolName?: { 'Use <ToolCall name="Read file">': never };
  /** Not a prop. A summary of the arguments is `detail`: `<ToolCall detail="recipes/roast.md">`. */
  args?: { 'Use <ToolCall detail="recipes/roast.md">': never };
  /** Not a prop. A summary of the arguments is `detail`: `<ToolCall detail="recipes/roast.md">`. */
  input?: { 'Use <ToolCall detail="recipes/roast.md">': never };
  /** Not a prop. What the tool gave back is `output`, a string: `<ToolCall output={text}>`. */
  result?: { 'Use <ToolCall output={text}>': never };
}

/**
 * One call an agent made to a tool, as a row in its conversation: a status icon, what it did, a summary of the
 * arguments and how long it took. A call with `output` is a Collapsible whose title is the row, and it opens to show
 * the output in a CodeBlock. A failed call says "Failed" and a waiting one "Waiting for you" in words, not only by
 * colour, and a screen reader hears the status after the row.
 *
 * Use `ToolCallGroup` instead for several calls in a row, under one "Ran 3 tools" line. Use `ThinkingBlock` instead
 * for the agent's reasoning, and `CodeBlock` alone for code that isn't a tool's output.
 *
 * @group Chat
 * @see https://ui.ouroboros.bot/docs/tool-call
 *
 * @example
 * <ToolCall name="Ran command" detail="npm test" status="done" duration={4.2} output={log} outputLanguage="ansi" />
 * @claim "it opens to show the output in a CodeBlock" registry/ouro/components/ouro/tool-call/tool-call.test.tsx verify:testExists(registry/ouro/components/ouro/tool-call/tool-call.test.tsx::ToolCall > opens to its output in a CodeBlock, and is a plain row without output)
 * @claim "A failed call says" registry/ouro/components/ouro/tool-call/tool-call.test.tsx verify:testExists(registry/ouro/components/ouro/tool-call/tool-call.test.tsx::ToolCall > says each status in words for a screen reader, and shows Failed and Waiting for you)
 */
export function ToolCall(props: ToolCallProps): JSX.Element {
  const {
    name,
    status: statusProp,
    detail,
    duration,
    output,
    outputLanguage,
    defaultOpen,
    open,
    onOpenChange,
    className,
    ref,
    // Guard props (hint types), dropped here so they never reach the DOM.
    state,
    toolName,
    args,
    input,
    result,
  } = props;
  // A status that is not one of ToolCall's (a type error) renders as done and names the fix in development.
  const status: ToolCallStatus = (toolCallStatuses as readonly string[]).includes(statusProp) ? (statusProp as ToolCallStatus) : "done";
  useAppearanceClassNameCheck(
    "ToolCall",
    className,
    process.env.NODE_ENV !== "production"
      ? (token: string) => `remove "${token}"; ToolCall sets its own look from the theme`
      : /* istanbul ignore next @preserve -- production only */ "",
  );
  useDevWarnings(
    "ToolCall",
    process.env.NODE_ENV !== "production"
      ? () => [
          status !== statusProp && [`status="${String(statusProp)}" is not a status; use "running", "done", "failed" or "waiting"`, toolCallStatusFix(String(statusProp))],
          state !== undefined && ["state is not a prop; where the call stands is status", toolCallStatusFix(String(state))],
          toolName !== undefined && ["toolName is not a prop", `<ToolCall name=${JSON.stringify(typeof toolName === "string" ? toolName : "Read file")}>`],
          args !== undefined && ["args is not a prop; a summary of the arguments is detail", '<ToolCall detail="recipes/roast.md">'],
          input !== undefined && ["input is not a prop; a summary of the arguments is detail", '<ToolCall detail="recipes/roast.md">'],
          result !== undefined && ["result is not a prop; what the tool gave back is output, a string", "<ToolCall output={text}>"],
        ]
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );
  const [own, setOwn] = useState(defaultOpen === true);
  const expanded = open ?? own;
  const took = formatDuration(duration);
  const words = statusWords[status];
  const row = (
    <>
      <StatusIcon status={status} />
      <span data-slot="tool-call-name" className={nameClass}>
        {name}
      </span>
      {detail != null ? (
        <>
          {" "}
          <span data-slot="tool-call-detail" className={detailClass}>
            {detail}
          </span>
        </>
      ) : null}
      {words !== undefined ? (
        <span data-slot="tool-call-status" aria-hidden="true" className={cn("shrink-0", statusIconTone[status])}>
          {words}
        </span>
      ) : null}
      {took !== undefined ? (
        <>
          {" "}
          <span data-slot="tool-call-duration" className={durationClass}>
            {took}
          </span>
        </>
      ) : null}
      <span data-slot="tool-call-status-label" className="sr-only">{`, ${statusLabels[status]}`}</span>
    </>
  );
  return (
    <div ref={ref} data-ouro="tool-call" data-slot="tool-call" data-status={status} className={cn("box-border grid min-w-0", className)}>
      {output !== undefined ? (
        <Collapsible
          open={expanded}
          onOpenChange={(next) => {
            setOwn(next);
            onOpenChange?.(next);
          }}
          title={
            <span data-slot="tool-call-row" className={titleRowClass}>
              {row}
            </span>
          }
        >
          <CodeBlock data-slot="tool-call-output" code={output} language={outputLanguage} copy={false} className="max-h-80" />
        </Collapsible>
      ) : (
        <div data-slot="tool-call-row" className={rowClass}>
          {row}
        </div>
      )}
    </div>
  );
}

/** The status icon: a spinner while running, then a tick, a cross or a clock, in the status's colour. */
function StatusIcon({ status }: { status: ToolCallStatus }): JSX.Element {
  if (status === "running") return <Spinner size="sm" label="" aria-hidden="true" />;
  return (
    <svg
      aria-hidden="true"
      data-slot="tool-call-icon"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn(iconClass, statusIconTone[status])}
    >
      {status === "done" ? <path d="m3.5 8.5 3 3 6-7" /> : null}
      {status === "failed" ? <path d="m4.5 4.5 7 7m0-7-7 7" /> : null}
      {status === "waiting" ? (
        <>
          <circle cx="8" cy="8" r="5.75" />
          <path d="M8 5v3l2 1.5" />
        </>
      ) : null}
    </svg>
  );
}
