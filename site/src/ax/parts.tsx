import { Fragment, type JSX, type ReactNode } from "react";
import { InlineCode } from "../components/code";
import type { Seen, Step } from "./story";
import personSource from "./art/person-head.svg?raw";
import agentSource from "./art/agent-avatar.svg?raw";
import "./ax.css";

/** A drawing's markup without its title and notes, hidden from screen readers: the words beside it say who it is. */
export function artMarkup(source: string, attributes = ""): string {
  return source
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<title>[\s\S]*?<\/title>/, "")
    .replace("<svg ", `<svg aria-hidden="true" focusable="false" ${attributes}`);
}

const MARKS = { person: artMarkup(personSource), agent: artMarkup(agentSource) } as const;

/** Who says each line, for screen readers: on the story's pages the reader is the person; in the playground, the agent. */
export const SPEAKERS = { person: { person: "You: ", agent: "Your agent: " }, agent: { person: "The person: ", agent: "You: " } } as const;

/** One line of the person's chat with their agent: the speaker's mark beside the bubble, and their name for screen readers. */
export function ChatLine({ by, text, fresh, reader = "person" }: { by: "person" | "agent"; text: string; fresh?: boolean | undefined; reader?: "person" | "agent" }): JSX.Element {
  return (
    <div className={`ax-line ax-line-${by}${fresh ? " ax-new" : ""}`}>
      <span className={`ax-avatar ax-avatar-${by}`} aria-hidden="true" dangerouslySetInnerHTML={{ __html: MARKS[by] }} />
      <p className={`ax-bubble ax-bubble-${by}`}>
        <span className="sr-only">{SPEAKERS[reader][by]}</span>
        {text}
      </p>
    </div>
  );
}

/** The person's chat with their own agent, named in its header. */
export function Chat({ title, children, ...rest }: { title: ReactNode; children: ReactNode } & Omit<JSX.IntrinsicElements["div"], "children" | "title">): JSX.Element {
  return (
    <div {...rest} className={`ax-chat ${rest.className ?? ""}`.trim()}>
      <span className="ax-card-head" aria-hidden="true">
        {title}
      </span>
      {children}
    </div>
  );
}

/** The header of the person's chat with their agent. */
export const CHAT_TITLE = "Your chat with your agent";

/**
 * A terminal's text wraps even before ax.css has loaded: the home page's section is server-rendered far below the
 * first screen, and its stylesheet loads only with its island, so without this a long line would widen the page.
 */
export const WRAP = { whiteSpace: "pre-wrap", overflowWrap: "anywhere" } as const;

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
      <pre className="ax-term-body" style={WRAP}>
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

/** A measured figure, "5 → 10", read aloud as "from 5 to 10" rather than "right arrow". */
export function FigureValue({ value }: { value: string }): JSX.Element {
  const [from, to] = value.split("→").map((part) => part.trim());
  if (to === undefined) return <>{value}</>;
  return (
    <>
      <span aria-hidden="true">{value}</span>
      <span className="sr-only">
        from {from} to {to}
      </span>
    </>
  );
}

/** One thing the person sees: a line of their chat with their agent, a message in the room or a private note. */
export function SeenItem({ item, fresh }: { item: Seen; fresh?: boolean | undefined }): JSX.Element {
  const arrive = fresh ? " ax-new" : "";
  switch (item.kind) {
    case "quiet":
      return <p className={`m-0 text-sm text-muted-foreground italic${arrive}`}>{item.text}</p>;
    case "person":
    case "agent":
      return <ChatLine by={item.kind} text={item.text} fresh={fresh} />;
    case "room":
      return (
        <div className={`ax-card${arrive}`}>
          <span className="ax-card-head">Design sync</span>
          <span>
            <strong className="font-semibold">{item.by}</strong> {item.text}
          </span>
          {item.aside && <span className="text-sm text-muted-foreground">{item.aside}</span>}
        </div>
      );
    case "private":
      return (
        <div className={`ax-card${arrive}`}>
          <span className="ax-card-head">Your note, only you see it</span>
          <span>{item.text}</span>
        </div>
      );
  }
}

/** The person's side, in the theme's colours: their chat with their agent first, then the room and their notes as they now read. */
export function Screen({ label, seen }: { label: string; seen: readonly Seen[] }): JSX.Element {
  const said = seen.filter((item) => item.kind === "person" || item.kind === "agent");
  const rest = seen.filter((item) => item.kind !== "person" && item.kind !== "agent");
  return (
    <div className="ax-screen" role="group" aria-label={label}>
      <span className="ax-card-head" aria-hidden="true">
        {label}
      </span>
      {said.length > 0 && (
        <Chat title={CHAT_TITLE} role="group" aria-label={CHAT_TITLE}>
          {said.map((item, index) => (
            <SeenItem key={index} item={item} />
          ))}
        </Chat>
      )}
      {rest.map((item, index) => (
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
