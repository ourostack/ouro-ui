import { Fragment, type JSX, type ReactNode } from "react";
import { InlineCode } from "../components/code";
import type { Seen, Step } from "./story";

/** A line of the tool's output, coloured by what it says: a refusal, a check that held, or plain output. */
export function OutputLine({ text, refused, fresh }: { text: string; refused?: boolean | undefined; fresh?: boolean | undefined }): JSX.Element {
  const tone = refused ? "ax-term-refused" : text.startsWith("Checked:") ? "ax-term-held" : "ax-term-out";
  return <span className={`ax-term-line ${tone}${fresh ? " ax-term-new" : ""}`}>{text}</span>;
}

/** A command as the agent typed it, after the prompt. */
export function CommandLine({ command, fresh }: { command: string; fresh?: boolean | undefined }): JSX.Element {
  return <span className={`ax-term-line ax-term-command${fresh ? " ax-term-new" : ""}`}>{command}</span>;
}

/** The agent's side: a night-dark terminal with a label, holding the commands and what the tool printed. */
export function Terminal({ label, children, ...rest }: { label: string; children: ReactNode } & Omit<JSX.IntrinsicElements["div"], "children">): JSX.Element {
  return (
    <div {...rest} className={`ax-term ${rest.className ?? ""}`.trim()}>
      <div className="ax-term-bar" aria-hidden="true">
        {label}
      </div>
      {children}
    </div>
  );
}

/** Commands and what the tool printed, as a transcript. */
/** `waiting` is shown under a command that waits for someone; `after`, under the last line, is what the agent does next. */
export function Transcript({ label, steps, waiting, after }: { label: string; steps: readonly Step[]; waiting?: string | undefined; after?: string | undefined }): JSX.Element {
  return (
    <Terminal label={label} role="group" aria-label={label}>
      <pre className="ax-term-body">
        {steps.map((step, index) => (
          <Fragment key={`${index}-${step.command}`}>
            {index > 0 && <span className="ax-term-gap" aria-hidden="true" />}
            <CommandLine command={step.command} />
            {waiting && step.meanwhile && <span className="ax-term-line ax-term-aside">{waiting}</span>}
            {step.output.split("\n").map((line, at) => (
              <OutputLine key={at} text={line} refused={step.refused} />
            ))}
          </Fragment>
        ))}
        {after && (
          <>
            <span className="ax-term-gap" aria-hidden="true" />
            <span className="ax-term-line ax-term-aside">{after}</span>
          </>
        )}
      </pre>
    </Terminal>
  );
}

/** One thing the person sees: a line of their chat with the agent, a message in the room, a notification or a private note. */
function SeenItem({ item }: { item: Seen }): JSX.Element {
  switch (item.kind) {
    case "person":
      return <p className="ax-bubble ax-bubble-sam">{item.text}</p>;
    case "agent":
      return <p className="ax-bubble">{item.text}</p>;
    case "room":
      return (
        <div className="ax-card">
          <span className="ax-card-head">Design sync</span>
          <span>
            <strong className="font-semibold">{item.by}</strong> {item.text}
          </span>
          {item.aside && <span className="text-sm text-muted-foreground">{item.aside}</span>}
        </div>
      );
    case "ping":
      return (
        <div className="ax-card">
          <span className="ax-card-head">
            Notification{item.time && <span className="site-mono normal-case"> · {item.time}</span>}
          </span>
          <span>{item.text}</span>
        </div>
      );
    case "private":
      return (
        <div className="ax-card">
          <span className="ax-card-head">Your note, only you see it</span>
          <span>{item.text}</span>
        </div>
      );
  }
}

/** The person's side: their app, in the theme's colours. */
export function Screen({ label, seen }: { label: string; seen: readonly Seen[] }): JSX.Element {
  return (
    <div className="ax-screen" role="group" aria-label={label}>
      <span className="ax-card-head" aria-hidden="true">
        {label}
      </span>
      {seen.map((item, index) => (
        <SeenItem key={index} item={item} />
      ))}
    </div>
  );
}

/** A claim's rule, with its backticked words set as code. */
export function RuleText({ text }: { text: string }): JSX.Element {
  return (
    <>
      {text.split(/(`[^`]+`)/).map((part, index) =>
        part.startsWith("`") && part.endsWith("`") && part.length > 1 ? <InlineCode key={index}>{part.slice(1, -1)}</InlineCode> : <Fragment key={index}>{part}</Fragment>,
      )}
    </>
  );
}

/** The X-ray's verdict on a claim, as a mark with its name for screen readers. */
export function Mark({ state }: { state: "holds" | "fails" | "skipped" }): JSX.Element {
  const glyph = state === "holds" ? "✓" : state === "fails" ? "✗" : "–";
  const name = state === "holds" ? "holds" : state === "fails" ? "fails" : "not checked";
  return (
    <span className={`ax-mark ax-mark-${state}`} role="img" aria-label={name}>
      {glyph}
    </span>
  );
}
