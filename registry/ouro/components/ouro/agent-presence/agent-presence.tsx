"use client";

import { useEffect, useRef, useState, type JSX, type Ref } from "react";
import { agentPresenceSizes, doingClass, unreadDotClass } from "@/registry/ouro/components/ouro/agent-presence/agent-presence-styles";
import { Avatar } from "@/registry/ouro/components/ouro/avatar/avatar";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Popover } from "@/registry/ouro/components/ouro/popover/popover";
import { announce } from "@/registry/ouro/lib/ouro/announce";
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/ouro/class-name-check";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { handOffFocus, useFocusHandoff } from "@/registry/ouro/lib/ouro/focus-handoff";
import { useMergedRef } from "@/registry/ouro/lib/ouro/refs";
import { useDevWarnings } from "@/registry/ouro/lib/ouro/use-dev-messages";

/** One agent listening for the person. */
export interface ListeningAgent {
  /** Stays the same while the agent listens; `onStop` gets it back. */
  id: string;
  /** What the person calls the agent, by its role: "inbox agent". */
  name: string;
  /** What it listens for, in a few words: "listening for your name, and anything about the empty state". */
  doing?: string | undefined;
}

/**
 * The words AgentPresence says, for apps in other languages.
 *
 * @claim "The words AgentPresence says, for apps" registry/ouro/components/ouro/agent-presence/agent-presence.test.tsx verify:testExists(registry/ouro/components/ouro/agent-presence/agent-presence.test.tsx::AgentPresence > takes its words in another language)
 */
export interface AgentPresenceLabels {
  /** The chip for one agent. @default (name) => `${name} listening` */
  one?: ((name: string) => string) | undefined;
  /** The chip for several. @default (count) => `${count} agents listening` */
  many?: ((count: number) => string) | undefined;
  /** Said once when an agent starts listening. @default (name) => `${name} is now listening` */
  started?: ((name: string) => string) | undefined;
  /** Said once when an agent stops, whoever stopped it. @default (name) => `${name} stopped` */
  stopped?: ((name: string) => string) | undefined;
  /**
   * Each agent's Stop button. Screen readers hear the agent's name after it. @default "Stop"
   * @claim "Each agent's Stop button." registry/ouro/components/ouro/agent-presence/agent-presence.test.tsx verify:testExists(registry/ouro/components/ouro/agent-presence/agent-presence.test.tsx::AgentPresence > opens a popover named by its label, with each agent, what it listens for and a Stop)
   */
  stop?: string | undefined;
  /**
   * The button that stops every agent. @default "Stop all"
   * @claim "The button that stops every agent." registry/ouro/components/ouro/agent-presence/agent-presence.test.tsx verify:testExists(registry/ouro/components/ouro/agent-presence/agent-presence.test.tsx::AgentPresence > stops every agent with Stop all, which shows only with two or more)
   */
  stopAll?: string | undefined;
  /** What screen readers hear for the unread dot. @default "Something new from your agents" */
  unread?: string | undefined;
  /** The popover's close button, which shows when it has keyboard focus. @default "Close" */
  close?: string | undefined;
}

/** Props for {@link AgentPresence}. */
export interface AgentPresenceProps {
  /**
   * The agents listening now. With none, AgentPresence renders nothing; keep it mounted, so it
   * can say when an agent stops or starts.
   * @claim "With none, AgentPresence renders nothing;" registry/ouro/components/ouro/agent-presence/agent-presence.test.tsx verify:testExists(registry/ouro/components/ouro/agent-presence/agent-presence.test.tsx::AgentPresence > renders nothing while no agent listens, and comes back when one does)
   */
  agents: readonly ListeningAgent[];
  /**
   * Names the list of agents: the popover's title, "Agents listening". It is always required.
   * @claim "It is always required." registry/ouro/components/ouro/agent-presence/agent-presence.test-d.ts verify:fileLine(registry/ouro/components/ouro/agent-presence/agent-presence.test-d.ts, /expectTypeOf<\{ agents: ListeningAgent\[\]; onStop: \(id: string\) => void \}>\(\)\.not\.toExtend<AgentPresenceProps>/)
   * @claim "Names the list of agents: the" registry/ouro/components/ouro/agent-presence/agent-presence.test.tsx verify:testExists(registry/ouro/components/ouro/agent-presence/agent-presence.test.tsx::AgentPresence > opens a popover named by its label, with each agent, what it listens for and a Stop)
   */
  label: string;
  /**
   * Called with an agent's `id` when the person presses its Stop. Stop the agent and drop it
   * from `agents`; AgentPresence says "inbox agent stopped" once it has gone.
   * @claim "Called with an agent's `id` when" registry/ouro/components/ouro/agent-presence/agent-presence.test.tsx verify:testExists(registry/ouro/components/ouro/agent-presence/agent-presence.test.tsx::AgentPresence > stops one agent, says so once it has gone, and keeps focus in the list)
   */
  onStop: (id: string) => void;
  /**
   * Called when the person presses Stop all, which shows with two agents or more. Without it,
   * Stop all calls `onStop` for each agent.
   * @claim "Called when the person presses Stop" registry/ouro/components/ouro/agent-presence/agent-presence.test.tsx verify:testExists(registry/ouro/components/ouro/agent-presence/agent-presence.test.tsx::AgentPresence > stops every agent with Stop all, which shows only with two or more)
   * @claim "Without it, Stop all calls `onStop`" registry/ouro/components/ouro/agent-presence/agent-presence.test.tsx verify:testExists(registry/ouro/components/ouro/agent-presence/agent-presence.test.tsx::AgentPresence > calls onStop for each agent from Stop all when there is no onStopAll)
   */
  onStopAll?: (() => void) | undefined;
  /**
   * The chip's size, Button's sizes. @default "sm"
   * @claim "The chip's size, Button's sizes." registry/ouro/components/ouro/agent-presence/agent-presence.test.tsx verify:testExists(registry/ouro/components/ouro/agent-presence/agent-presence.test.tsx::AgentPresence > is as tall as a Button of its size, sm by default)
   */
  size?: "sm" | "md" | "lg" | (string & { 'Use "sm", "md" or "lg"': never }) | undefined;
  /**
   * Only the sparkle and a count, for a tight bar or a floating mini-window. Its name still
   * says who is listening.
   * @claim "Only the sparkle and a count, for" registry/ouro/components/ouro/agent-presence/agent-presence.test.tsx verify:testExists(registry/ouro/components/ouro/agent-presence/agent-presence.test.tsx::AgentPresence > shows only the sparkle and the count when compact, and its name still says who)
   */
  compact?: boolean | undefined;
  /**
   * Shows a dot on the chip: an agent left something for the person. AgentPresence opens
   * nothing for it; the app shows what was left where it belongs.
   * @claim "Shows a dot on the chip: an" registry/ouro/components/ouro/agent-presence/agent-presence.test.tsx verify:testExists(registry/ouro/components/ouro/agent-presence/agent-presence.test.tsx::AgentPresence > shows a dot when an agent left something, and says so in the chip's name)
   */
  unread?: boolean | undefined;
  /** The words it says, for other languages. */
  labels?: AgentPresenceLabels | undefined;
  /** Layout only: margins, placement (`ms-auto`). Appearance classes warn in development; use `size`. */
  className?: string | undefined;
  ref?: Ref<HTMLSpanElement> | undefined;

  /** Not a prop. The agents are `agents`: `<AgentPresence agents={[{ id: "inbox", name: "inbox agent" }]}>`. */
  listeners?: { 'Use agents={[{ id, name, doing }]}': never };
  /** Not a prop. Ouro UI says `onStop`, called with the agent's id: `<AgentPresence onStop={(id) => stop(id)}>`. */
  onRemove?: { 'Use onStop={(id) => stop(id)}': never };
  /**
   * Not a prop. AgentPresence never hides while an agent listens; it renders nothing only when `agents` is empty.
   * @claim "AgentPresence never hides while an agent" registry/ouro/components/ouro/agent-presence/agent-presence.test.tsx verify:testExists(registry/ouro/components/ouro/agent-presence/agent-presence.test.tsx::AgentPresence > never hides itself while an agent listens: not in a narrow bar, not after its popover closes, not as time passes)
   * @claim "AgentPresence never hides while an agent" registry/ouro/components/ouro/agent-presence/agent-presence.test.tsx verify:testExists(registry/ouro/components/ouro/agent-presence/agent-presence.test.tsx::AgentPresence > renders nothing while no agent listens, and comes back when one does)
   */
  autoHide?: { 'AgentPresence never hides while an agent listens; pass agents={[]} when none does': never };
  /** Not a prop. The small form is `compact`: `<AgentPresence compact>`. */
  variant?: { 'Use compact for the sparkle and a count': never };
}

type Size = (typeof agentPresenceSizes)[number];
type Words = { [Key in keyof AgentPresenceLabels]-?: NonNullable<AgentPresenceLabels[Key]> };

const words: Words = {
  one: (name) => `${name} listening`,
  many: (count) => `${count} agents listening`,
  started: (name) => `${name} is now listening`,
  stopped: (name) => `${name} stopped`,
  stop: "Stop",
  stopAll: "Stop all",
  unread: "Something new from your agents",
  close: "Close",
};

/** The agent sparkle, in the chip's own colour. */
function Sparkle(): JSX.Element {
  return (
    <svg aria-hidden="true" viewBox="0 0 12 12" data-ouro-agent-presence-sparkle="" className="size-[1.1em] shrink-0">
      <path d="M6 0Q6.7 5.3 12 6 6.7 6.7 6 12 5.3 6.7 0 6 5.3 5.3 6 0Z" fill="currentColor" />
    </svg>
  );
}

/**
 * The person's always-visible sign of which of their agents are listening to something on their
 * behalf, such as a meeting, with Stop one click away. A chip with the agent sparkle says
 * "inbox agent listening", or "2 agents listening"; it opens a popover that lists each agent, what
 * it listens for and a Stop, plus Stop all with two or more. It never hides itself while an agent
 * listens (no fading, no collapsing), and renders nothing when none does. `compact` shows only the
 * sparkle and a count, and `unread` a dot when an agent left something for the person.
 *
 * The chip is a button named by the count and the names ("2 agents listening: inbox agent,
 * research agent"). When an agent starts or stops listening, screen readers hear it once,
 * politely ("inbox agent is now listening", "inbox agent stopped"). When a Stop goes with its
 * agent, focus moves to the next Stop, and when the last agent goes, to the control after the
 * chip.
 *
 * Its agent side, `agentPresenceAx` in `agent-presence-styles.ts`, lets agents read who is
 * listening and what for (consent `none`). Stop and Stop all are the person's only: an agent
 * stops its own listening through the app's own command, never through this component.
 *
 * Use `Avatar` or `Badge` instead to show who is present in a conversation, and `toast()` for
 * a one-off notice.
 *
 * @claim "The person's always-visible sign of which" registry/ouro/components/ouro/agent-presence/agent-presence.test.tsx verify:testExists(registry/ouro/components/ouro/agent-presence/agent-presence.test.tsx::AgentPresence > never hides itself while an agent listens: not in a narrow bar, not after its popover closes, not as time passes)
 * @claim "A chip with the agent sparkle says" registry/ouro/components/ouro/agent-presence/agent-presence.test.tsx verify:testExists(registry/ouro/components/ouro/agent-presence/agent-presence.test.tsx::AgentPresence > is a chip that names one agent, or counts several)
 * @claim "it opens a popover that lists each" registry/ouro/components/ouro/agent-presence/agent-presence.test.tsx verify:testExists(registry/ouro/components/ouro/agent-presence/agent-presence.test.tsx::AgentPresence > opens a popover named by its label, with each agent, what it listens for and a Stop)
 * @claim "It never hides itself while an agent" registry/ouro/components/ouro/agent-presence/agent-presence.test.tsx verify:testExists(registry/ouro/components/ouro/agent-presence/agent-presence.test.tsx::AgentPresence > never hides itself while an agent listens: not in a narrow bar, not after its popover closes, not as time passes)
 * @claim "It never hides itself while an agent" registry/ouro/components/ouro/agent-presence/agent-presence.test.tsx verify:testExists(registry/ouro/components/ouro/agent-presence/agent-presence.test.tsx::AgentPresence > renders nothing while no agent listens, and comes back when one does)
 * @claim "The chip is a button named by" registry/ouro/components/ouro/agent-presence/agent-presence.test.tsx verify:testExists(registry/ouro/components/ouro/agent-presence/agent-presence.test.tsx::AgentPresence > is a chip that names one agent, or counts several)
 * @claim "When an agent starts or stops listening," registry/ouro/components/ouro/agent-presence/agent-presence.test.tsx verify:testExists(registry/ouro/components/ouro/agent-presence/agent-presence.test.tsx::AgentPresence > says once, politely, when an agent starts or stops listening)
 * @claim "When a Stop goes with its agent," registry/ouro/components/ouro/agent-presence/agent-presence.test.tsx verify:testExists(registry/ouro/components/ouro/agent-presence/agent-presence.test.tsx::AgentPresence > stops one agent, says so once it has gone, and keeps focus in the list)
 * @claim "When a Stop goes with its agent," registry/ouro/components/ouro/agent-presence/agent-presence.test.tsx verify:testExists(registry/ouro/components/ouro/agent-presence/agent-presence.test.tsx::AgentPresence > moves focus to the control after the chip when the last agent goes)
 * @claim "Its agent side, `agentPresenceAx` in `agent-presence-styles.ts`," registry/ouro/components/ouro/agent-presence/agent-presence.test.tsx verify:testExists(registry/ouro/components/ouro/agent-presence/agent-presence.test.tsx::AgentPresence agent side > declares one read and two actions only the person takes, each on a control that names it)
 * @group Feedback
 * @see https://ui.ouro.bot/docs/agent-presence
 *
 * @example
 * <AgentPresence
 *   label="Agents listening"
 *   agents={[{ id: "inbox", name: "inbox agent", doing: "listening for your name" }]}
 *   onStop={(id) => stopListening(id)}
 * />
 * <AgentPresence label="Agents listening" agents={agents} onStop={stop} onStopAll={stopAll} compact unread />
 */
export function AgentPresence(props: AgentPresenceProps): JSX.Element | null {
  const {
    agents,
    label,
    onStop,
    onStopAll,
    size: sizeProp = "sm",
    compact = false,
    unread = false,
    labels,
    className,
    ref,
    // Guard props (hint types), dropped here so they never reach the DOM.
    listeners,
    onRemove,
    autoHide,
    variant,
  } = props;
  const size: Size = (agentPresenceSizes as readonly string[]).includes(sizeProp) ? (sizeProp as Size) : "sm";
  const text = { ...words, ...Object.fromEntries(Object.entries(labels ?? {}).filter(([, value]) => value !== undefined)) } as Words;

  useAppearanceClassNameCheck(
    "AgentPresence",
    className,
    process.env.NODE_ENV !== "production"
      ? (token: string) => `remove "${token}"; AgentPresence takes its look from the theme, and its height from size`
      : // Stryker disable next-line StringLiteral: production only; the check never runs there.
        /* istanbul ignore next @preserve -- production only */ "",
  );
  useDevWarnings(
    "AgentPresence",
    process.env.NODE_ENV !== "production"
      ? () => {
          const seen = new Set<string>();
          const twice = agents.find((agent) => seen.size === seen.add(agent.id).size);
          return [
            !label && ["label is required; it names the list of agents for screen readers", '<AgentPresence label="Agents listening">'],
            size !== sizeProp && [`size="${String(sizeProp)}" is not a size; use "sm", "md" or "lg"`, '<AgentPresence size="sm">'],
            twice !== undefined && [`two agents share the id "${twice.id}", so Stop cannot tell them apart`, `<AgentPresence agents={[{ id: "${twice.id}-2", name: "${twice.name}" }]}>`],
            listeners !== undefined && ["listeners is not a prop", '<AgentPresence agents={[{ id: "inbox", name: "inbox agent" }]}>'],
            onRemove !== undefined && ["onRemove is not a prop", "<AgentPresence onStop={(id) => stop(id)}>"],
            autoHide !== undefined && ["autoHide is not a prop; AgentPresence never hides while an agent listens", "<AgentPresence agents={listening}>"],
            variant !== undefined && ["variant is not a prop", "<AgentPresence compact>"],
          ];
        }
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );

  const [open, setOpen] = useState(false);
  // With no agent the popover closes, so it never reopens on its own when one comes back.
  if (agents.length === 0 && open) setOpen(false);

  // Said once when an agent starts or stops listening; the agents on first render are no news.
  const previous = useRef<ReadonlyMap<string, string> | null>(null);
  const who = JSON.stringify(agents.map((agent) => [agent.id, agent.name]));
  useEffect(() => {
    const now = new Map(agents.map((agent) => [agent.id, agent.name]));
    const before = previous.current;
    previous.current = now;
    if (before === null) return;
    const news = [
      ...[...before].filter(([id]) => !now.has(id)).map(([, name]) => text.stopped(name)),
      ...[...now].filter(([id]) => !before.has(id)).map(([, name]) => text.started(name)),
    ];
    if (news.length > 0) announce(news.join(". "));
    // Who listens is the news; new words for the same agents are not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [who]);

  const chip = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  // When the chip goes with the last agent, focus moves to the control after it, from the
  // popover too: React detaches the root's ref before its children's, while the chip is still
  // there and the popover still holds focus.
  const [leave] = useState(() => (element: HTMLSpanElement) => () => {
    if (list.current?.contains(element.ownerDocument.activeElement)) chip.current!.focus();
    handOffFocus(element);
  });
  const rootRef = useMergedRef(ref, leave);
  // A row or Stop all that goes while it holds focus hands it to the next Stop, else the one
  // before it. Every agent left has a Stop, so the search never leaves the popover; with no agent
  // left, the chip goes too and `leave` moves focus on.
  const handoff = useFocusHandoff<HTMLElement>();

  if (agents.length === 0) return null;

  const names = agents.map((agent) => agent.name);
  const several = agents.length > 1;
  const said = several ? text.many(agents.length) : text.one(names[0]!);
  const spoken = [several ? `${said}: ${names.join(", ")}` : said, unread && text.unread].filter(Boolean).join(". ");
  const stopAll = onStopAll ?? (() => agents.forEach((agent) => onStop(agent.id)));

  return (
    <span ref={rootRef} data-ouro="agent-presence" className={cn("inline-flex min-w-0", className)}>
      <Button
        ref={chip}
        data-ouro-control="agent-presence"
        data-ouro-part="trigger"
        variant="soft"
        tone="primary"
        size={size}
        aria-label={spoken}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((was) => !was)}
      >
        <Sparkle />
        {compact ? <span className="tabular-nums">{agents.length}</span> : <span>{said}</span>}
        {unread && <span aria-hidden="true" data-ouro-agent-presence-unread="" className={unreadDotClass} />}
      </Button>
      <Popover title={label} closeLabel={text.close} open={open} onOpenChange={setOpen} anchor={chip} align="start">
        <div ref={list} className="grid gap-3">
          <ul className="m-0 grid list-none gap-3 p-0">
            {agents.map((agent) => (
              <li key={agent.id} ref={handoff} className="flex items-center gap-3">
                <Avatar name={agent.name} alt="" shape="hexagon" size="sm" />
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <span className="text-sm font-medium text-foreground">{agent.name}</span>
                  {agent.doing ? <span className={doingClass}>{agent.doing}</span> : null}
                </span>
                <Button
                  data-ouro-control="agent-presence"
                  data-ouro-part="stop"
                  data-ax-action="stop"
                  size="sm"
                  variant="outline"
                  tone="secondary"
                  aria-label={`${text.stop} ${agent.name}`}
                  onClick={() => onStop(agent.id)}
                >
                  {text.stop}
                </Button>
              </li>
            ))}
          </ul>
          {several && (
            <div ref={handoff} className="grid">
              <Button data-ouro-control="agent-presence" data-ouro-part="stop-all" data-ax-action="stop-all" size="sm" variant="soft" tone="destructive" fullWidth onClick={stopAll}>
                {text.stopAll}
              </Button>
            </div>
          )}
        </div>
      </Popover>
    </span>
  );
}
