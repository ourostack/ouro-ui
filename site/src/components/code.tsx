import { useEffect, useState, type JSX, type ReactNode } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { announce } from "@/registry/ouro/lib/ouro/announce";
import { cn } from "@/registry/ouro/lib/ouro/cn";

/** Code inside running text. */
export function InlineCode({ children }: { children: ReactNode }): JSX.Element {
  return (
    <code className="rounded-[0.3rem] bg-muted px-[0.3em] py-[0.1em] font-mono text-[0.86em] text-foreground [overflow-wrap:anywhere]">
      {children}
    </code>
  );
}

/** A block of code. It scrolls inside its own box on phones and is a tab stop so a keyboard can scroll it. */
export function CodeBlock({ code, label, className }: { code: string; label?: string; className?: string }): JSX.Element {
  return (
    <figure className={cn("m-0 min-w-0", className)}>
      {label && <figcaption className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</figcaption>}
      <pre
        tabIndex={0}
        className="m-0 overflow-x-auto rounded-xl border border-border bg-(--site-code) px-4 py-3.5 font-mono text-[0.8125rem] leading-6 text-foreground outline-ring focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <code>{code}</code>
      </pre>
    </figure>
  );
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
      className="w-16 shrink-0"
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
        "flex min-w-0 items-start gap-2 rounded-xl border border-border bg-(--site-code) py-1.5 ps-4 pe-1.5",
        className,
      )}
    >
      <span aria-hidden="true" className="py-1.5 font-mono text-[0.8125rem] leading-5 text-muted-foreground select-none">
        $
      </span>
      {/* Long commands wrap on phones instead of scrolling; Copy takes the exact text. */}
      <code className="min-w-0 flex-1 py-1.5 font-mono text-[0.8125rem] leading-5 text-foreground [overflow-wrap:anywhere]">
        {command}
      </code>
      <CopyButton text={command} label={`Copy: ${command}`} />
    </div>
  );
}
