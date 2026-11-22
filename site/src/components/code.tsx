import { Fragment, useEffect, useState, type JSX, type ReactNode } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { announce } from "@/registry/ouro/lib/ouro/announce";
import { cn } from "@/registry/ouro/lib/ouro/cn";

/** Code inside running text. */
export function InlineCode({ children }: { children: ReactNode }): JSX.Element {
  return (
    <code className="rounded-[calc(var(--radius)*0.267)] bg-muted px-[0.3em] py-[0.1em] font-mono [font-size-adjust:0.46] text-foreground [overflow-wrap:anywhere]">
      {children}
    </code>
  );
}

/** A file path inside running text: it breaks after a slash, and inside a name only when the name alone is wider than the line. */
export function InlinePath({ path }: { path: string }): JSX.Element {
  return (
    <code data-site-path className="rounded-[calc(var(--radius)*0.267)] bg-muted px-[0.3em] py-[0.1em] font-mono [font-size-adjust:0.46] text-foreground [overflow-wrap:break-word]">
      {path.split("/").map((part, index, parts) => (
        <span key={index}>
          {part}
          {index < parts.length - 1 && <>/<wbr /></>}
        </span>
      ))}
    </code>
  );
}

/**
 * A block of code. It scrolls inside its own box on phones and is a tab stop so a keyboard can scroll it;
 * `wrap` wraps long lines instead, for a short snippet whose cut-off end would look broken.
 */
export function CodeBlock({ code, label, wrap, copy, className }: { code: string; label?: string; wrap?: boolean; copy?: boolean; className?: string }): JSX.Element {
  return (
    <figure className={cn("m-0 min-w-0", className)} style={copy && !label ? { position: "relative" } : undefined}>
      {/* With a label, Copy sits in the caption row, so code that scrolls sideways never passes under it. */}
      {label && copy ? (
        <figcaption className="mb-2 flex items-center justify-between gap-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          <span>{label}</span>
          <CopyButton text={code} label={`Copy ${label}`} />
        </figcaption>
      ) : label ? (
        <figcaption className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</figcaption>
      ) : null}
      {/* Without a label, a Copy button sits in the block's corner and takes the exact code. */}
      {copy && !label ? (
        <div style={{ position: "absolute", insetInlineEnd: "0.375rem", bottom: "0.375rem", zIndex: 1 }}>
          <CopyButton text={code} label={label ? `Copy ${label}` : "Copy the code"} />
        </div>
      ) : null}
      <div data-site-code-frame={wrap ? undefined : ""} className="relative overflow-hidden rounded-xl border border-transparent bg-(--site-code) outline-ring has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2">
        <pre
          style={{ ...(copy && !label ? { paddingInlineEnd: "5rem" } : null) }}
          data-site-code=""
          data-site-code-scroller={wrap ? undefined : ""}
          tabIndex={0}
          data-test-harness=""
          className={cn("m-0 overflow-x-auto bg-(--site-code) px-4 py-3.5 font-mono text-sm leading-6 text-foreground outline-none", wrap && "whitespace-pre-wrap [overflow-wrap:anywhere]")}
        >
          <code>{wrap ? atSlashes(code) : code}</code>
        </pre>
      </div>
    </figure>
  );
}

/**
 * Wrapped code may break after any "/" that ends a part of an address, as the home page's hand-off does, so a long
 * address on a phone breaks at "docs/", not inside "dialog.md". Copy takes the code itself.
 */
function atSlashes(code: string): ReactNode {
  return code.split(/(?<=\/)(?!\/)/).map((part, index) => (
    <Fragment key={index}>
      {index > 0 ? <wbr /> : null}
      {part}
    </Fragment>
  ));
}

/** Copies text, then says so for a moment, out loud too. */
function CopyButton({ text, label }: { text: string; label: string }): JSX.Element {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(timer);
  }, [copied]);
  return (
    <Button
      size="sm"
      variant="plain"
      tone="secondary"
      aria-label={copied ? "Copied" : label}
      className="w-16 shrink-0 tracking-normal"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setCopied(true);
          announce("Copied");
        });
      }}
    >
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}

/** One shell command with a copy button. */
export function Command({ command, className }: { command: string; className?: string }): JSX.Element {
  return (
    <div
      className={cn(
        "flex min-w-0 items-start gap-2 rounded-xl border border-transparent bg-(--site-code) py-1.5 ps-4 pe-1.5",
        className,
      )}
    >
      <span aria-hidden="true" className="py-1.5 font-mono text-sm leading-5 text-muted-foreground select-none">
        $
      </span>
      {/* Long commands wrap on phones instead of scrolling; Copy takes the exact text. */}
      <code className="min-w-0 flex-1 py-1.5 font-mono text-sm leading-5 text-foreground [overflow-wrap:anywhere]">
        {command}
      </code>
      <CopyButton text={command} label={`Copy: ${command}`} />
    </div>
  );
}
