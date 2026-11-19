import { useEffect, useRef, useState, type JSX } from "react";
import { Avatar } from "@/registry/ouro/components/ouro/avatar/avatar";
import { ChatHeader, type ChatMember } from "@/registry/ouro/components/ouro/chat-header/chat-header";
import { Composer } from "@/registry/ouro/components/ouro/composer/composer";
import { ConversationList, type ConversationListItem } from "@/registry/ouro/components/ouro/conversation-list/conversation-list";
import { Message } from "@/registry/ouro/components/ouro/message/message";
import { MessageList } from "@/registry/ouro/components/ouro/message/message-list";
import { ReactionBar, type Reaction } from "@/registry/ouro/components/ouro/reaction-bar/reaction-bar";
import { TypingIndicator } from "@/registry/ouro/components/ouro/typing-indicator/typing-indicator";
import { RADIO, RADIO_START, REACTIONS, radioReply, type ChannelId, type RadioLine, type RadioLive, type ReactionKey } from "./chapter-two-copy";
import { crewFace } from "./crew-faces";
import { ROLES, useLiveCode } from "./frame";
import { firstName, useLogbook } from "./logbook";

/** One line on the radio as it shows: who, what and the reactions on it. */
interface Line {
  id: number;
  role: "user" | "assistant" | "system";
  name: string;
  text: string;
  reactions: Reaction[];
  /** The captain's welcome, which greets you by name once you have signed on. */
  welcome?: boolean;
}

/** How long the crew take to start writing back, and then to finish, in milliseconds. */
export const RADIO_DELAY = { typing: 500, reply: 1300 } as const;

/** The quick reactions under the crew's newest line: three, so the chat stays calm. */
const QUICK = REACTIONS.filter((reaction) => reaction.key === "like" || reaction.key === "love" || reaction.key === "funny");

const CREW_NAMES = Object.keys(RADIO.presence) as Array<keyof typeof RADIO.presence>;
/** The whole crew's chat's members, with the faces cut for an avatar of the captain's size. */
const CREW = CREW_NAMES.map((name) => ({ name, src: crewFace(name, "md") }));

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
  useLiveCode<RadioLive>({ channel });
  const [lines, setLines] = useState<Record<ChannelId, Line[]>>(() => ({ crew: RADIO_START.crew.map((line, index) => ({ ...toLine(line), welcome: index === 0 })), captain: RADIO_START.captain.map(toLine), caller: RADIO_START.caller.map(toLine) }));
  const [sent, setSent] = useState<Record<ChannelId, number>>({ crew: 0, captain: 0, caller: 0 });
  const [calling, setCalling] = useState(false);
  const [unread, setUnread] = useState(false);
  const [awake, setAwake] = useState(false);
  // Who is writing back, one entry per message sent: the typing line under that chat shows them until that reply lands.
  const [writers, setWriters] = useState<{ id: number; to: ChannelId; name: string }[]>([]);
  const timers = useRef<number[]>([]);
  // Whoever signed on in Chapter I, by the name the crew call them.
  const you = useLogbook((log) => (log.you ? firstName(log.you.name) : null));
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
    const theirs: Line = { id: nextId++, role: "assistant", name: reply.line.name, text: reply.line.text, reactions: [] };
    setSent((counts) => ({ ...counts, [to]: counts[to] + 1 }));
    setLines((all) => ({ ...all, [to]: [...all[to], mine] }));
    timers.current.push(
      window.setTimeout(() => setWriters((all) => [...all, { id: mine.id, to, name: reply.line.name }]), RADIO_DELAY.typing),
      window.setTimeout(() => {
        setWriters((all) => all.filter((writer) => writer.id !== mine.id));
        setLines((all) => ({ ...all, [to]: [...all[to], theirs] }));
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
    // A group chat is drawn from its members' faces, at the captain's size beside it; the square is for a channel.
    { id: "crew", title: RADIO.crew, subtitle: RADIO.crewNote, members: CREW, avatar: <Avatar name={RADIO.crew} members={CREW} alt="" /> },
    { id: "captain", title: RADIO.captain, subtitle: RADIO.captainNote, avatar: <Avatar name="Captain Nemo" src={crewFace("Captain Nemo", "md")} alt="" presence={captain.presence} presenceLabel={captain.label} /> },
    ...(calling ? [{ id: "caller", title: RADIO.caller, preview: RADIO.callerNote, unread, avatar: <Avatar name="?" shape="square" alt="" /> }] : []),
  ];
  const title = channel === "crew" ? RADIO.crew : channel === "captain" ? RADIO.captain : RADIO.caller;
  // Who the open chat is with, as its header shows them: the whole crew with their roles, the captain alone, or the caller.
  const memberOf = (name: (typeof CREW_NAMES)[number], src?: string): ChatMember => {
    const { presence, label } = presenceOf(name);
    return { name, src: src ?? crewFace(name, "md"), presence, presenceLabel: label, note: ROLES[name] };
  };
  const members: ChatMember[] = channel === "crew" ? CREW_NAMES.map((name) => memberOf(name)) : channel === "captain" ? [memberOf("Captain Nemo")] : [{ name: RADIO.caller }];
  const writing = [...new Set(writers.filter((writer) => writer.to === channel).map((writer) => writer.name))].map((name) => ({ name, src: crewFace(name) }));

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 py-4 sm:py-6 md:grid-cols-[15rem_minmax(0,1fr)]" data-chapter-radio="" data-calling={calling ? "" : undefined}>
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
                  <Avatar name={name} src={crewFace(name)} alt="" size="sm" presence={presence} presenceLabel={label} />
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
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-3">
        <div data-chapter-control="members">
          <ChatHeader title={title} members={members} level={4} data-chapter-chat-header={channel} />
        </div>
        <div data-chapter-control="react">
        <MessageList key={channel} label={RADIO.list(title)} className="h-80" data-chapter-messages={channel}>
          {lines[channel].map((line, index, all) => (
            <Message
              key={line.id}
              role={line.role}
              name={line.name}
              avatar={line.role === "assistant" ? crewFace(line.name) : undefined}
              {...dotOf(line)}
              attachments={
                line.role === "system" ? undefined : (
                  <ReactionBar
                    reactions={line.reactions}
                    quick={line.role === "assistant" && index === all.findLastIndex((each) => each.role === "assistant") ? QUICK : undefined}
                    onReact={line.role === "assistant" ? (key) => update(channel, line.id, (each) => ({ ...each, reactions: toggle(each.reactions, key) })) : undefined}
                  />
                )
              }
            >
              {line.welcome && you ? RADIO.welcome(you) : line.text}
            </Message>
          ))}
        </MessageList>
        </div>
        <TypingIndicator people={writing} className="-my-1.5" data-chapter-writing="" />
        <div data-chapter-control="compose">
          <Composer label={RADIO.compose} placeholder={channel === "caller" ? RADIO.callerNote : RADIO.placeholder} sendLabel={RADIO.send} sendOn="enter" onSend={send} />
        </div>
      </div>
    </div>
  );
}
