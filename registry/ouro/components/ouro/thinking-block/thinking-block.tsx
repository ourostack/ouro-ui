"use client";

import { useState, type JSX, type ReactNode, type Ref } from "react";
import { Collapsible } from "@/registry/ouro/components/ouro/collapsible/collapsible";
import { Spinner } from "@/registry/ouro/components/ouro/spinner/spinner";
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/ouro/class-name-check";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { useDevWarnings } from "@/registry/ouro/lib/ouro/use-dev-messages";
import { reasoningClass, rootClass, thoughtFor, titleClass } from "@/registry/ouro/components/ouro/thinking-block/thinking-block-styles";

/** Props for {@link ThinkingBlock}. */
export interface ThinkingBlockProps {
  /** The agent's reasoning, as it streams in. A string keeps its line breaks. */
  children: ReactNode;
  /**
   * Whether the reasoning is still coming in. While it is, the block is open, its title says "Thinking" beside a
   * spinner, and the reasoning is marked busy; when it ends, the block closes to its finished title.
   */
  streaming?: boolean | undefined;
  /** How long the agent thought, in seconds, for the finished title: "Thought for 12 seconds". */
  duration?: number | undefined;
  /** The finished title in place of "Thought for 12 seconds", such as the agent's own summary: "Checked the ratios". */
  summary?: ReactNode;
  /** Whether it is open, when you control it. Pair it with `onOpenChange`. */
  open?: boolean | undefined;
  /** Opens it first and keeps it open after the reasoning ends, until the person closes it. */
  defaultOpen?: boolean | undefined;
  /** Called with the new state when the person opens or closes it. */
  onOpenChange?: ((open: boolean) => void) | undefined;
  /** Layout only: margins, width (`mt-2`). Appearance classes warn in development. */
  className?: string | undefined;
  ref?: Ref<HTMLDivElement> | undefined;

  /** Not a prop. Ouro UI uses `streaming`: `<ThinkingBlock streaming>`. */
  isStreaming?: { 'Use <ThinkingBlock streaming>': never };
  /** Not a prop. Ouro UI uses `streaming`: `<ThinkingBlock streaming>`. */
  loading?: { 'Use <ThinkingBlock streaming>': never };
  /** Not a prop. Ouro UI uses `open`: `<ThinkingBlock open>`. */
  isOpen?: { 'Use <ThinkingBlock open>': never };
  /** Not a prop. The finished title is `summary`: `<ThinkingBlock summary="Checked the ratios">`. */
  title?: { 'Use <ThinkingBlock summary="Checked the ratios">': never };
  /** Not a prop. The reasoning is the children: `<ThinkingBlock>{reasoning}</ThinkingBlock>`. */
  content?: { 'Pass the reasoning as children: <ThinkingBlock>{reasoning}</ThinkingBlock>': never };
}

/**
 * An agent's reasoning before its reply: open while it streams in, then closed to one quiet line, "Thought for 12
 * seconds", that the person can open again. Once the person opens or closes it, their choice holds. It is a
 * Collapsible, so the title is a 44px row on touch screens and the closed reasoning is found by the browser's page
 * search.
 *
 * Use `Collapsible` instead for a section that isn't an agent's reasoning, and `TypingIndicator` instead to say an
 * agent is writing before any reasoning arrives.
 *
 * @group Chat
 * @see https://ui.ouroboros.bot/docs/thinking-block
 *
 * @example
 * <ThinkingBlock streaming={!done} duration={seconds}>
 *   {reasoning}
 * </ThinkingBlock>
 * @claim "open while it streams in, then closed to one quiet line" registry/ouro/components/ouro/thinking-block/thinking-block.test.tsx verify:testExists(registry/ouro/components/ouro/thinking-block/thinking-block.test.tsx::ThinkingBlock > is open with a spinner while streaming, and closes to its duration when it finishes)
 * @claim "Once the person opens or closes it, their choice holds" registry/ouro/components/ouro/thinking-block/thinking-block.test.tsx verify:testExists(registry/ouro/components/ouro/thinking-block/thinking-block.test.tsx::ThinkingBlock > keeps the person's choice once they open or close it)
 * @claim "It is a Collapsible" registry/ouro/components/ouro/thinking-block/thinking-block.test.tsx verify:testExists(registry/ouro/components/ouro/thinking-block/thinking-block.test.tsx::ThinkingBlock > is a Collapsible, whose closed reasoning is in the server HTML)
 */
export function ThinkingBlock(props: ThinkingBlockProps): JSX.Element {
  const {
    children,
    streaming = false,
    duration,
    summary,
    open,
    defaultOpen,
    onOpenChange,
    className,
    ref,
    // Guard props (hint types), dropped here so they never reach the DOM.
    isStreaming,
    loading,
    isOpen,
    title,
    content,
  } = props;
  useAppearanceClassNameCheck(
    "ThinkingBlock",
    className,
    process.env.NODE_ENV !== "production"
      ? (token: string) => `remove "${token}"; ThinkingBlock sets its own look from the theme`
      : // Stryker disable next-line StringLiteral: production only; the check never runs there.
        /* istanbul ignore next @preserve -- production only */ "",
  );
  useDevWarnings(
    "ThinkingBlock",
    process.env.NODE_ENV !== "production"
      ? () => [
          isStreaming !== undefined && ["isStreaming is not a prop", "<ThinkingBlock streaming>"],
          loading !== undefined && ["loading is not a prop; the reasoning is streaming", "<ThinkingBlock streaming>"],
          isOpen !== undefined && ["isOpen is not a prop", "<ThinkingBlock open>"],
          title !== undefined && [
            "title is not a prop; the finished title is summary",
            `<ThinkingBlock summary=${JSON.stringify(typeof title === "string" ? title : "Checked the ratios")}>`,
          ],
          content !== undefined && ["content is not a prop; the reasoning is the children", "<ThinkingBlock>{reasoning}</ThinkingBlock>"],
        ]
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );
  // The person's own choice, once they make one; until then the block follows the stream.
  const [chosen, setChosen] = useState<boolean | undefined>(defaultOpen === true ? true : undefined);
  const expanded = open ?? chosen ?? streaming;
  const change = (next: boolean) => {
    setChosen(next);
    onOpenChange?.(next);
  };
  return (
    <div
      ref={ref}
      data-ouro="thinking-block"
      data-slot="thinking-block"
      // Stryker disable next-line StringLiteral: any value of a presence attribute styles the same.
      data-streaming={streaming ? "" : undefined}
      className={cn(rootClass, className)}
    >
      <Collapsible
        open={expanded}
        onOpenChange={change}
        title={
          <span data-slot="thinking-block-title" className={titleClass}>
            {streaming ? <Spinner size="sm" label="" aria-hidden="true" /> : null}
            {streaming ? "Thinking" : (summary ?? thoughtFor(duration))}
          </span>
        }
      >
        {/* Focus inside the reasoning (a link in it) keeps the block open, so it never closes under the person. */}
        <div
          data-slot="thinking-block-reasoning"
          aria-busy={streaming}
          onFocus={() => setChosen((current) => current ?? true)}
          className={cn(reasoningClass, typeof children === "string" && "whitespace-pre-wrap")}
        >
          {children}
        </div>
      </Collapsible>
    </div>
  );
}
