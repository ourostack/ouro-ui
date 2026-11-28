"use client";

import { useState, type JSX, type ReactNode, type Ref } from "react";
import { Collapsible } from "@/registry/ouro/components/ouro/collapsible/collapsible";
import { Spinner } from "@/registry/ouro/components/ouro/spinner/spinner";
import { ToolCall, type ToolCallProps } from "@/registry/ouro/components/ouro/tool-call/tool-call";
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/ouro/class-name-check";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { useDevWarnings } from "@/registry/ouro/lib/ouro/use-dev-messages";
import { groupListClass, groupTitle } from "@/registry/ouro/components/ouro/tool-call/tool-call-styles";

/** One call in a {@link ToolCallGroup}: a ToolCall's props, with an `id` that stays put as the list changes. */
export type ToolCallGroupItem = Pick<ToolCallProps, "name" | "status" | "detail" | "duration" | "output" | "outputLanguage"> & {
  /** A stable key for the call, such as the tool call's id from the agent's events. */
  id: string;
};

/** Props for {@link ToolCallGroup}. */
export interface ToolCallGroupProps {
  /** The calls, in the order the agent made them. */
  calls: readonly ToolCallGroupItem[];
  /** The title in place of "Ran 3 tools", such as the agent's own summary: "Read the recipe and its notes". */
  summary?: ReactNode;
  /** Whether it is open, when you control it. Pair it with `onOpenChange`. */
  open?: boolean | undefined;
  /** Opens it first and keeps it open after the calls settle, until the person closes it. */
  defaultOpen?: boolean | undefined;
  /** Called with the new state when the person opens or closes it. */
  onOpenChange?: ((open: boolean) => void) | undefined;
  /** Layout only: margins, width (`mt-2`). Appearance classes warn in development. */
  className?: string | undefined;
  ref?: Ref<HTMLDivElement> | undefined;

  /** Not a prop. The calls are `calls`, as data: `<ToolCallGroup calls={[{ id, name, status }]} />`. */
  children?: { 'Use <ToolCallGroup calls={[{ id, name, status }]} />': never };
  /** Not a prop. The calls are `calls`: `<ToolCallGroup calls={[{ id, name, status }]} />`. */
  tools?: { 'Use <ToolCallGroup calls={[{ id, name, status }]} />': never };
  /** Not a prop. The title is `summary`: `<ToolCallGroup summary="Read the recipe">`. */
  title?: { 'Use <ToolCallGroup summary="Read the recipe">': never };
}

/**
 * Several tool calls an agent made in a row, under one line: "Ran 3 tools", with how many failed. It is open while any
 * call is running or waiting for the person, and closes to that line once they all settle; once the person opens or
 * closes it, or uses a call in it, their choice holds. Each call is a ToolCall, which opens to its own output.
 *
 * Use `ToolCall` instead for a single call, and `ThinkingBlock` instead for the agent's reasoning.
 *
 * @group Chat
 * @see https://ui.ouroboros.bot/docs/tool-call-group
 *
 * @example
 * <ToolCallGroup
 *   calls={[
 *     { id: "1", name: "Read file", detail: "recipes/roast.md", status: "done", duration: 0.4 },
 *     { id: "2", name: "Ran command", detail: "npm test", status: "running" },
 *   ]}
 * />
 * @claim "It is open while any call is running or waiting" registry/ouro/components/ouro/tool-call/tool-call-group.test.tsx verify:testExists(registry/ouro/components/ouro/tool-call/tool-call-group.test.tsx::ToolCallGroup > is open while a call runs or waits, and closes when they all settle)
 * @claim "Each call is a ToolCall, which opens to its own output" registry/ouro/components/ouro/tool-call/tool-call-group.test.tsx verify:testExists(registry/ouro/components/ouro/tool-call/tool-call-group.test.tsx::ToolCallGroup > lists its calls, each a ToolCall that opens to its own output)
 * @claim "once the person opens or closes it" registry/ouro/components/ouro/tool-call/tool-call-group.test.tsx verify:testExists(registry/ouro/components/ouro/tool-call/tool-call-group.test.tsx::ToolCallGroup > keeps the person's choice once they open or close it) verify:testExists(registry/ouro/components/ouro/tool-call/tool-call-group.test.tsx::ToolCallGroup > stays open once the person uses a call in it, so focus and an opened output stay put)
 */
export function ToolCallGroup(props: ToolCallGroupProps): JSX.Element {
  const {
    calls,
    summary,
    open,
    defaultOpen,
    onOpenChange,
    className,
    ref,
    // Guard props (hint types), dropped here so they never reach the DOM.
    children,
    tools,
    title,
  } = props;
  useAppearanceClassNameCheck(
    "ToolCallGroup",
    className,
    process.env.NODE_ENV !== "production"
      ? (token: string) => `remove "${token}"; ToolCallGroup sets its own look from the theme`
      : // Stryker disable next-line StringLiteral: production only; the check never runs there.
        /* istanbul ignore next @preserve -- production only */ "",
  );
  useDevWarnings(
    "ToolCallGroup",
    process.env.NODE_ENV !== "production"
      ? () => [
          children !== undefined && ["children is not a prop; the calls are calls, as data", "<ToolCallGroup calls={[{ id, name, status }]} />"],
          tools !== undefined && ["tools is not a prop; the calls are calls", "<ToolCallGroup calls={[{ id, name, status }]} />"],
          title !== undefined && [
            "title is not a prop; the title is summary",
            '<ToolCallGroup summary="Read the recipe">',
          ],
        ]
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );
  const { busy, running, words, failed } = groupTitle(calls.map((call) => call.status));
  // The person's own choice, once they make one; until then the group is open while a call runs or waits.
  const [chosen, setChosen] = useState<boolean | undefined>(defaultOpen === true ? true : undefined);
  const expanded = open ?? chosen ?? busy;
  const keepOpen = () => setChosen((current) => current ?? true);
  return (
    <div
      ref={ref}
      data-ouro="tool-call-group"
      data-slot="tool-call-group"
      // Stryker disable next-line StringLiteral: any value of a presence attribute styles the same.
      data-busy={busy ? "" : undefined}
      className={cn("box-border grid min-w-0", className)}
    >
      <Collapsible
        open={expanded}
        onOpenChange={(next) => {
          setChosen(next);
          onOpenChange?.(next);
        }}
        title={
          <span data-slot="tool-call-group-title" className="inline-flex min-w-0 items-center gap-2 font-normal text-muted-foreground">
            {running ? <Spinner size="sm" label="" aria-hidden="true" /> : null}
            {summary ?? words}
            {failed > 0 ? " " : null}
            {failed > 0 ? (
              <span data-slot="tool-call-group-failed" className="text-destructive">
                {`· ${failed} failed`}
              </span>
            ) : null}
          </span>
        }
      >
        {/* Using a call (focusing it, opening its output) keeps the group open, so it never closes under the person. */}
        <ul data-slot="tool-call-group-list" className={groupListClass} onFocus={keepOpen}>
          {calls.map(({ id, ...call }) => (
            <li key={id} data-slot="tool-call-group-item" className="m-0 min-w-0 p-0">
              <ToolCall {...call} onOpenChange={keepOpen} />
            </li>
          ))}
        </ul>
      </Collapsible>
    </div>
  );
}
