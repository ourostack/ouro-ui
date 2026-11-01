import { startTransition, useEffect, useRef, useState, type JSX } from "react";
import { Avatar } from "@/registry/ouro/components/ouro/avatar/avatar";
import { Composer } from "@/registry/ouro/components/ouro/composer/composer";
import { ConversationList, type ConversationListItem } from "@/registry/ouro/components/ouro/conversation-list/conversation-list";
import { Message } from "@/registry/ouro/components/ouro/message/message";
import { MessageList } from "@/registry/ouro/components/ouro/message/message-list";
import { ReactionBar, type Reaction } from "@/registry/ouro/components/ouro/reaction-bar/reaction-bar";
import { RADIO, RADIO_START, REACTIONS, radioReply, type ChannelId, type RadioLine, type ReactionKey } from "./chapter-two-copy";
import { ROLES } from "./frame";

/** One line on the radio as it shows: who, what, the reactions on it, and whether it is still being written. */
interface Line {
  id: number;
  role: "user" | "assistant" | "system";
  name: string;
  text: string;
  reactions: Reaction[];
  streaming?: boolean;
}

/** How long the crew take to start writing back, and then to finish, in milliseconds. */
export const RADIO_DELAY = { typing: 500, reply: 1300 } as const;

/** The quick reactions under the crew's newest line: three, so the chat stays calm. */
const QUICK = REACTIONS.filter((reaction) => reaction.key === "like" || reaction.key === "love" || reaction.key === "funny");

const CREW_NAMES = Object.keys(RADIO.presence) as Array<keyof typeof RADIO.presence>;

let nextId = 0;
const reactionsOf = (start: RadioLine["reactions"]): Reaction[] =>
  (start ?? []).map(({ key, count }) => ({ ...REACTIONS.find((each) => each.key === key)!, count }));
const toLine = (line: RadioLine): Line => ({ id: nextId++, role: "assistant", name: line.name, text: line.text, reactions: reactionsOf(line.reactions) });

/** Adds `key` to a line's reactions as the visitor's own, or takes theirs back. */
function toggle(reactions: readonly Reaction[], key: string): Reaction[] {
  const found = reactions.find((reaction) => reaction.key === key);
  if (!found) return [...reactions, { ...REACTIONS.find((each) => each.key === key)!, count: 1, mine: true }];
  if (!found.mine) return reactions.map((reaction) => (reaction.key === key ? { ...reaction, count: reaction.count + 1, mine: true } : reaction));
  return reactions.flatMap((reaction) => (reaction.key !== key ? [reaction] : reaction.count > 1 ? [{ ...reaction, count: reaction.count - 1, mine: false }] : []));
}

/** The crew's reaction on the visitor's message, added once the reply lands. */
function crewReacts(reactions: readonly Reaction[], key: ReactionKey): Reaction[] {
  const found = reactions.find((reaction) => reaction.key === key);
  if (found) return reactions.map((reaction) => (reaction.key === key ? { ...reaction, count: reaction.count + 1 } : reaction));
  return [...reactions, { ...REACTIONS.find((each) => each.key === key)!, count: 1 }];
}

/**
 * The ship's radio: a little chat with the crew, built from Ouro HX's chat parts. ConversationList
 * picks who you talk to, MessageList and Message hold the chat, Composer sends your line, Avatar
 * shows who is on the radio and each crew member's presence beside their lines, and ReactionBar takes your emoji. The replies are scripted
 * (radioReply): no network and no AI. Once the plan is done, or you mention the squid, or you send
 * a few messages, someone new calls: the squid, who comes to say hi in Chapter III.
 */
export function Radio({ planned }: { planned: boolean }): JSX.Element {
  const [channel, setChannel] = useState<ChannelId>("crew");
  const [lines, setLines] = useState<Record<ChannelId, Line[]>>(() => ({ crew: RADIO_START.crew.map(toLine), captain: RADIO_START.captain.map(toLine), caller: RADIO_START.caller.map(toLine) }));
  const [sent, setSent] = useState<Record<ChannelId, number>>({ crew: 0, captain: 0, caller: 0 });
  const [calling, setCalling] = useState(false);
  const [unread, setUnread] = useState(false);
  const [awake, setAwake] = useState(false);
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((timer) => clearTimeout(timer)), []);

  const call = () => {
    if (calling) return;
    setCalling(true);
    setUnread(true);
    setLines((all) => ({ ...all, crew: [...all.crew, { id: nextId++, role: "system", name: RADIO.caller, text: RADIO.crackle, reactions: [] }] }));
  };
  // Finishing the plan is rewarded with the call (state set while rendering, once, as React allows for a prop that changed).
  if (planned && !calling) call();

  const update = (to: ChannelId, id: number, change: (line: Line) => Line) => setLines((all) => ({ ...all, [to]: all[to].map((line) => (line.id === id ? change(line) : line)) }));

  const send = (text: string) => {
    const to = channel;
    const reply = radioReply(text, to, sent[to]);
    const mine: Line = { id: nextId++, role: "user", name: RADIO.you, text, reactions: [] };
    const theirs: Line = { id: nextId++, role: "assistant", name: reply.line.name, text: "", reactions: [], streaming: true };
    setSent((counts) => ({ ...counts, [to]: counts[to] + 1 }));
    setLines((all) => ({ ...all, [to]: [...all[to], mine] }));
    timers.current.push(
      window.setTimeout(() => startTransition(() => setLines((all) => ({ ...all, [to]: [...all[to], theirs] }))), RADIO_DELAY.typing),
      window.setTimeout(() => {
        update(to, theirs.id, (line) => ({ ...line, text: reply.line.text, streaming: false }));
        update(to, mine.id, (line) => ({ ...line, reactions: crewReacts(line.reactions, reply.reaction) }));
        if (reply.line.name === "Ned Land") setAwake(true);
        if (reply.call) call();
      }, RADIO_DELAY.reply),
    );
  };

  const choose = (id: string) => {
    setChannel(id as ChannelId);
    if (id === "caller") setUnread(false);
  };

  const presenceOf = (name: (typeof CREW_NAMES)[number]) => (name === "Ned Land" && awake ? { presence: "available" as const, label: RADIO.awake } : RADIO.presence[name]);
  // A crew member's line shows their dot on its avatar, as the list of who is on the air does.
  const dotOf = (line: Line) => {
    if (line.role !== "assistant" || !Object.hasOwn(RADIO.presence, line.name)) return {};
    const { presence, label } = presenceOf(line.name as (typeof CREW_NAMES)[number]);
    return { presence, presenceLabel: label };
  };
  const captain = presenceOf("Captain Nemo");
  const channels: ConversationListItem[] = [
    { id: "crew", title: RADIO.crew, subtitle: RADIO.crewNote, avatar: <Avatar name={RADIO.crew} shape="square" alt="" /> },
    { id: "captain", title: RADIO.captain, subtitle: RADIO.captainNote, avatar: <Avatar name="Captain Nemo" alt="" presence={captain.presence} presenceLabel={captain.label} /> },
    ...(calling ? [{ id: "caller", title: RADIO.caller, preview: RADIO.callerNote, unread, avatar: <Avatar name="?" shape="square" alt="" /> }] : []),
  ];
  const title = channel === "crew" ? RADIO.crew : channel === "captain" ? RADIO.captain : RADIO.caller;

  return (
    <div className="grid gap-6 py-4 sm:py-6 md:grid-cols-[15rem_minmax(0,1fr)]" data-chapter-radio="" data-calling={calling ? "" : undefined}>
      <div className="grid content-start gap-5">
        <div data-chapter-control="channels">
          <ConversationList label={RADIO.channels} items={channels} selectedId={channel} onSelect={choose} density="compact" unreadLabel={RADIO.unread} />
        </div>
        <div className="grid gap-2">
          <p className="site-eyebrow">{RADIO.onAir}</p>
          <ul className="m-0 grid list-none gap-2 p-0" aria-label={RADIO.onAir}>
            {CREW_NAMES.map((name) => {
              const { presence, label } = presenceOf(name);
              return (
                <li key={name} className="flex items-center gap-2.5 text-sm" data-chapter-presence={presence}>
                  <Avatar name={name} alt="" size="sm" presence={presence} presenceLabel={label} />
                  <span className="min-w-0">
                    <span className="font-medium">{name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {ROLES[name]} · {label}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
      <div className="grid min-w-0 content-start gap-3">
        <div data-chapter-control="react">
        <MessageList key={channel} label={RADIO.list(title)} className="h-80" data-chapter-messages={channel}>
          {lines[channel].map((line, index, all) => (
            <Message
              key={line.id}
              role={line.role}
              name={line.name}
              {...dotOf(line)}
              streaming={line.streaming}
              streamingLabel={RADIO.writing}
              attachments={
                line.role === "system" ? undefined : (
                  <ReactionBar
                    reactions={line.reactions}
                    quick={line.role === "assistant" && !line.streaming && index === all.findLastIndex((each) => each.role === "assistant") ? QUICK : undefined}
                    onReact={line.role === "assistant" ? (key) => update(channel, line.id, (each) => ({ ...each, reactions: toggle(each.reactions, key) })) : undefined}
                  />
                )
              }
            >
              {line.text}
            </Message>
          ))}
        </MessageList>
        </div>
        <div data-chapter-control="compose">
          <Composer label={RADIO.compose} placeholder={channel === "caller" ? RADIO.callerNote : RADIO.placeholder} sendLabel={RADIO.send} sendOn="enter" onSend={send} />
        </div>
      </div>
    </div>
  );
}
