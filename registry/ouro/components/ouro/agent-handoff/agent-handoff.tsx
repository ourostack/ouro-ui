"use client";

import { Fragment, useId, type HTMLAttributes, type JSX, type ReactNode, type Ref } from "react";
import { CopyButton } from "@/registry/ouro/components/ouro/copy-button/copy-button";
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/ouro/class-name-check";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { useDevWarnings } from "@/registry/ouro/lib/ouro/use-dev-messages";

/** The props AgentHandoff adds to the `<div>` attributes it passes through. */
export interface AgentHandoffOwnProps {
  /**
   * What the person does with the line, above it, which also names the group: "Hand it to your agent".
   * @claim "which also names the group" registry/ouro/components/ouro/agent-handoff/agent-handoff.test.tsx verify:testExists(registry/ouro/components/ouro/agent-handoff/agent-handoff.test.tsx::AgentHandoff > shows the label, the line, the caption and the aside, as a group named by its label)
   */
  label: ReactNode;
  /**
   * The one line to paste into a coding agent's chat, in the page's own type. A web address in it can break after each
   * "/", between its parts, but not inside "//".
   * @claim "A web address in it can break after each" registry/ouro/components/ouro/agent-handoff/agent-handoff.test.tsx verify:testExists(registry/ouro/components/ouro/agent-handoff/agent-handoff.test.tsx::AgentHandoff > lets the line break after each slash of a web address, and never between the two of its scheme)
   */
  prompt: string;
  /** Under the line, such as "Paste it into your coding agent's chat." */
  caption?: ReactNode;
  /** At the end of the label's row, such as a Badge with the release the line brings in. */
  aside?: ReactNode;
  /** The Copy button's label. @default "Copy" */
  copyLabel?: string | undefined;
  /** What the Copy button says once the line is on the clipboard. @default "Copied" */
  copiedLabel?: string | undefined;
  /**
   * What screen readers hear, and the Copy button's tooltip says, when the browser refused to copy.
   * @default "The browser blocked copying. Select the line and copy it yourself."
   */
  failedMessage?: string | undefined;
  /** Layout only: margins, width (`mt-8`, `max-w-xl`). Appearance classes warn in development. */
  className?: string | undefined;
  ref?: Ref<HTMLDivElement> | undefined;

  /** Not a prop. The line to paste is `prompt`: `<AgentHandoff prompt="Read https://example.com/llms.txt" />`. */
  text?: { 'Use prompt="the line to paste"': never };
  /** Not a prop. The line to paste is `prompt`: `<AgentHandoff prompt="Read https://example.com/llms.txt" />`. */
  value?: { 'Use prompt="the line to paste"': never };
  /** Not a prop. AgentHandoff hands an agent a line to paste, `prompt`; for a command to run in a terminal, use CodeBlock. */
  command?: { 'Use prompt="the line to paste"; a terminal command is CodeBlock': never };
  /** Not a prop. The words above the line are `label`: `<AgentHandoff label="Hand it to your agent" />`. */
  title?: { 'Use label="Hand it to your agent"': never };
  /** Not a prop. The words under the line are `caption`: `<AgentHandoff caption="Paste it into your coding agent's chat." />`. */
  description?: { 'Use caption="Paste it into your coding agent chat."': never };
  /** Not a prop. The words under the line are `caption`: `<AgentHandoff caption="Paste it into your coding agent's chat." />`. */
  hint?: { 'Use caption="Paste it into your coding agent chat."': never };
}

/** Props for {@link AgentHandoff}: its own props and the `<div>` attributes it passes through. */
export type AgentHandoffProps = Omit<HTMLAttributes<HTMLDivElement>, keyof AgentHandoffOwnProps> & AgentHandoffOwnProps;

/** The prompt cut after a "/" where a web address may break: between its parts, but not inside "//". */
function promptParts(prompt: string): string[] {
  return prompt.split(/(?<=\/)(?!\/)/);
}

/**
 * What a person does once they have seen something built for agents: hand it to their coding agent, as one line to
 * paste, with Copy beside it. The line is in the page's own type, never a terminal's, and a web address in it can
 * break after each "/". Copy is CopyButton, which says it copied on itself, where the person is looking. In a narrow
 * column Copy goes under the line, so the line has the column's whole width. It takes its container's width.
 *
 * Use `CopyButton` instead for a value that isn't an instruction to an agent, and `CodeBlock` instead for a command
 * to run in a terminal.
 *
 * @group Actions
 * @see https://ui.ouroboros.bot/docs/agent-handoff
 *
 * @example
 * <AgentHandoff
 *   label="Hand it to your agent"
 *   prompt="Build this app's interface with Ouro UI. Read https://ui.ouroboros.bot/llms.txt first and follow it."
 *   caption="Paste it into your coding agent's chat."
 * />
 * @claim "The line is in the page's own type, never a terminal's" registry/ouro/components/ouro/agent-handoff/agent-handoff.test.tsx verify:testExists(registry/ouro/components/ouro/agent-handoff/agent-handoff.test.tsx::AgentHandoff > draws the line in the page's own type, on the card surface with a border in the theme's colors) verify:testExists(registry/ouro/components/ouro/agent-handoff/agent-handoff.test.tsx::AgentHandoff > lets the line break after each slash of a web address, and never between the two of its scheme)
 * @claim "Copy is CopyButton, which says it copied on itself" registry/ouro/components/ouro/agent-handoff/agent-handoff.test.tsx verify:testExists(registry/ouro/components/ouro/agent-handoff/agent-handoff.test.tsx::AgentHandoff > copies the line and says Copied on its own button, marked as the hand-off's copy part)
 * @claim "In a narrow column Copy goes under the line" registry/ouro/components/ouro/agent-handoff/agent-handoff.test.tsx verify:testExists(registry/ouro/components/ouro/agent-handoff/agent-handoff.test.tsx::AgentHandoff > puts Copy under the line in a narrow column, and beside it in a wide one)
 */
export function AgentHandoff(props: AgentHandoffProps): JSX.Element {
  const {
    label,
    prompt,
    caption,
    aside,
    copyLabel,
    copiedLabel,
    failedMessage = "The browser blocked copying. Select the line and copy it yourself.",
    className,
    // Guard props (hint types), dropped here so they never reach the DOM.
    text,
    value,
    command,
    title,
    description,
    hint,
    ...rest
  } = props;
  const labelId = useId();
  useAppearanceClassNameCheck(
    "AgentHandoff",
    className,
    process.env.NODE_ENV !== "production"
      ? (token: string) => `remove "${token}"; AgentHandoff sets its own look from the theme`
      : // Stryker disable next-line StringLiteral: production only; the check never runs there.
        /* istanbul ignore next @preserve -- production only */ "",
  );
  useDevWarnings(
    "AgentHandoff",
    process.env.NODE_ENV !== "production"
      ? () => {
          const line = (given: unknown) => `<AgentHandoff prompt=${JSON.stringify(typeof given === "string" ? given : "the line to paste")} />`;
          const words = (given: unknown, fallback: string) => JSON.stringify(typeof given === "string" ? given : fallback);
          return [
            text !== undefined && ["text is not a prop; the line to paste is prompt", line(text)],
            value !== undefined && ["value is not a prop; the line to paste is prompt", line(value)],
            command !== undefined && ["command is not a prop; the line to paste is prompt, and a command to run in a terminal is CodeBlock", line(command)],
            title !== undefined && ["title is not a prop; the words above the line are label", `<AgentHandoff label=${words(title, "Hand it to your agent")} />`],
            description !== undefined && ["description is not a prop; the words under the line are caption", `<AgentHandoff caption=${words(description, "Paste it into your coding agent's chat.")} />`],
            hint !== undefined && ["hint is not a prop; the words under the line are caption", `<AgentHandoff caption=${words(hint, "Paste it into your coding agent's chat.")} />`],
          ];
        }
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );
  return (
    <div {...rest} data-ouro="agent-handoff" role="group" aria-labelledby={labelId} className={cn("@container grid min-w-0 gap-2", className)}>
      <div data-slot="head" className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
        <p id={labelId} data-slot="label" className="m-0 text-(length:--text-sm) font-semibold text-foreground">
          {label}
        </p>
        {aside != null ? (
          <div data-slot="aside" className="flex items-center">
            {aside}
          </div>
        ) : null}
      </div>
      {/* No overflow clip on this rounded row: clipping to Ouro's squircle corner repaints everything in it on each change. */}
      <div
        data-slot="line"
        className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 rounded-ouro-xl border border-solid border-border/85 bg-card [--ouro-scroller-surface:var(--card)] [--ouro-message-list-bubble-default:var(--muted)] py-1.5 ps-4 pe-1.5 text-card-foreground shadow-(--shadow-xs) @max-md:grid-cols-[minmax(0,1fr)] @max-md:pb-3"
      >
        <p data-slot="prompt" className="col-start-1 row-start-1 m-0 min-w-0 py-2 leading-normal text-foreground wrap-break-word">
          {promptParts(prompt).map((part, index) => (
            <Fragment key={index}>
              {index > 0 ? <wbr /> : null}
              {part}
            </Fragment>
          ))}
        </p>
        <CopyButton
          data-ouro-control="agent-handoff"
          data-ouro-part="copy"
          value={prompt}
          label={copyLabel}
          copiedLabel={copiedLabel}
          failedMessage={failedMessage}
          variant="soft"
          className="col-start-2 row-start-1 self-center @max-md:col-start-1 @max-md:row-start-2 @max-md:justify-self-start"
        />
      </div>
      {caption != null ? (
        <p data-slot="caption" className="m-0 text-(length:--text-sm) text-muted-foreground">
          {caption}
        </p>
      ) : null}
    </div>
  );
}
