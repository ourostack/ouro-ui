"use client";

import { useId, type HTMLAttributes, type JSX, type Ref } from "react";
import { CopyButton } from "@/registry/ouro/components/ouro/copy-button/copy-button";
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/ouro/class-name-check";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { useDevWarnings } from "@/registry/ouro/lib/ouro/use-dev-messages";

/** The props CopyPrompt adds to the `<div>` attributes it passes through. */
export interface CopyPromptOwnProps {
  /** The prompt, as plain text: what the person pastes into their agent. Line breaks show as written. */
  text: string;
  /** The copy button's label. Screen readers hear the prompt as its description. @default "Copy" */
  label?: string | undefined;
  /** What the button says, and screen readers hear, once the prompt is on the clipboard. @default "Copied" */
  copiedLabel?: string | undefined;
  /** What the button says, and screen readers hear, when the browser refused to copy. @default "Couldn't copy" */
  failedLabel?: string | undefined;
  /** Called with the prompt once it is on the clipboard. */
  onCopy?: ((text: string) => void) | undefined;
  /** Layout only: margins, width, grid placement (`mt-2`). Appearance classes warn in development. */
  className?: string | undefined;
  ref?: Ref<HTMLDivElement> | undefined;

  /** Not a prop. The prompt is `text`: `<CopyPrompt text="Suggest a layout for my mornings.">`. */
  value?: { 'Use text="Suggest a layout for my mornings."': never };
  /** Not a prop. The prompt is `text`: `<CopyPrompt text="Suggest a layout for my mornings.">`. */
  prompt?: { 'Use text="Suggest a layout for my mornings."': never };
}

/** Props for {@link CopyPrompt}: its own props and the `<div>` attributes it passes through. */
export type CopyPromptProps = Omit<HTMLAttributes<HTMLDivElement>, keyof CopyPromptOwnProps | "children"> & CopyPromptOwnProps;

/**
 * A ready-made prompt with a button that copies it. It shows in the page's own type, for the
 * person to hand to an agent of their own. The prompt wraps as prose, keeping its line breaks, and the
 * button is `CopyButton`: it copies through the Clipboard API or a text selection, says
 * "Copied" for two seconds, and screen readers hear it once. Screen readers hear the prompt as
 * the button's description, so several prompts on a page stay apart. With no `text`, the button
 * is disabled.
 *
 * Use `CodeBlock` instead for code or a command, in the monospace font, and `CopyButton` alone
 * to copy a value shown elsewhere.
 *
 * @group Chat
 * @see https://ourostack.github.io/ouro-ui/docs/copy-prompt
 *
 * @example
 * <CopyPrompt text="Suggest a layout for my mornings: customer chats first, then my calendar." />
 * @claim "Screen readers hear the prompt as" registry/ouro/components/ouro/copy-prompt/copy-prompt.test.tsx verify:testExists(registry/ouro/components/ouro/copy-prompt/copy-prompt.test.tsx::CopyPrompt > names the button by its label and describes it with the prompt)
 * @claim "The prompt wraps as prose, keeping" registry/ouro/components/ouro/copy-prompt/copy-prompt.test.tsx verify:testExists(registry/ouro/components/ouro/copy-prompt/copy-prompt.test.tsx::CopyPrompt > wraps the prompt in the page's type and keeps its line breaks)
 */
export function CopyPrompt(props: CopyPromptProps): JSX.Element {
  const {
    text,
    label = "Copy",
    copiedLabel,
    failedLabel,
    onCopy,
    className,
    // Guard props (hint types), dropped here so they never reach the DOM.
    value,
    prompt,
    ...rest
  } = props;
  const id = useId();
  useAppearanceClassNameCheck(
    "CopyPrompt",
    className,
    process.env.NODE_ENV !== "production"
      ? (token: string) => `remove "${token}"; CopyPrompt takes its colors from the theme`
      : // Stryker disable next-line StringLiteral: production only; the check never runs there.
        /* istanbul ignore next @preserve -- production only */ "",
  );
  useDevWarnings(
    "CopyPrompt",
    process.env.NODE_ENV !== "production"
      ? () => [
          text === undefined && ["text is missing, so there is nothing to copy", '<CopyPrompt text="Suggest a layout for my mornings.">'],
          (value !== undefined || prompt !== undefined) && [`${value !== undefined ? "value" : "prompt"} is not a prop`, '<CopyPrompt text="Suggest a layout for my mornings.">'],
        ]
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );

  return (
    <div {...rest} data-ouro="copy-prompt" className={cn("box-border flex min-w-0 items-start gap-2 rounded-lg border border-solid border-border bg-card p-2 ps-3 text-card-foreground", className)}>
      <p id={`${id}-text`} data-ouro-copy-prompt-text="" className="m-0 min-w-0 flex-1 py-1 text-sm break-words whitespace-pre-wrap">
        {text}
      </p>
      <CopyButton
        data-ouro-control="copy-prompt"
        data-ouro-part="copy"
        value={text ?? ""}
        disabled={!text}
        label={label}
        copiedLabel={copiedLabel}
        failedLabel={failedLabel}
        onCopy={onCopy}
        variant="soft"
        aria-describedby={`${id}-text`}
        className="shrink-0"
      />
    </div>
  );
}
