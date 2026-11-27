import { useEffect, useRef, useState, type JSX, type ReactNode } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Attachment } from "@/registry/ouro/components/ouro/message/attachment";
import { Autocomplete } from "@/registry/ouro/components/ouro/autocomplete/autocomplete";
import { ChatHeader, type ChatMember } from "@/registry/ouro/components/ouro/chat-header/chat-header";
import { Composer } from "@/registry/ouro/components/ouro/composer/composer";
import { ConversationList, type ConversationListItem } from "@/registry/ouro/components/ouro/conversation-list/conversation-list";
import { Message } from "@/registry/ouro/components/ouro/message/message";
import { MessageList } from "@/registry/ouro/components/ouro/message/message-list";
import { ThreadSummary } from "@/registry/ouro/components/ouro/message/thread-summary";
import { Moment } from "@/registry/ouro/components/ouro/moment/moment";
import { ReadReceipt } from "@/registry/ouro/components/ouro/read-receipt/read-receipt";
import { SegmentedControl } from "@/registry/ouro/components/ouro/segmented-control/segmented-control";
import { Text } from "@/registry/ouro/components/ouro/text/text";
import { SpotArt } from "./spot-art";
import { ThreadLayout } from "@/registry/ouro/components/ouro/thread-layout/thread-layout";
import { ThreadRail } from "@/registry/ouro/components/ouro/thread-rail/thread-rail";
import { TypingIndicator } from "@/registry/ouro/components/ouro/typing-indicator/typing-indicator";
import { DocsShell } from "../components/docs-shell";

// A whole chat app from Ouro's chat components with made-up people, as an app would assemble it: the conversation
// list, the messages with a thread, the typing line and read receipts, and a plain and a rich composer. It ships in no
// registry item; docs/chat-demo/ shows it. The default export is the whole page (the docs shell and lead included),
// so site/src/pages/docs.tsx can load it as one lazy chunk and no other docs page's first script carries its weight.

interface Chat {
  id: string;
  title: string;
  members: ChatMember[];
  preview: string;
  time: string;
  unread?: boolean;
  messages: Line[];
  replies: Line[];
}

interface Line {
  id: string;
  who: string;
  own?: boolean;
  time: string;
  text: ReactNode;
  attachments?: { name: string; size: number }[];
}

const ME = "Priya Okafor";
const names = ["Mara Quill", "Theo Brandt", "Ana Lind"];
const withMentions = (text: string): JSX.Element => (
  <>
    {text.split(new RegExp(`(@(?:${names.join("|")}))`)).map((part, at) => (at % 2 ? <span key={at} className="font-medium text-primary">{part}</span> : part))}
  </>
);
const mention = (name: string): JSX.Element => <span className="font-medium text-primary">@{name}</span>;

const people = {
  mara: { name: "Mara Quill", presence: "available", presenceLabel: "Available" },
  theo: { name: "Theo Brandt", presence: "away", presenceLabel: "Away" },
  ana: { name: "Ana Lind", presence: "busy", presenceLabel: "In a meeting" },
  grace: { name: "Grace Hopper" },
} satisfies Record<string, ChatMember>;

const seed = (): Chat[] => [
  {
    id: "launch",
    title: "Launch crew",
    members: [people.mara, people.theo, { name: ME }],
    preview: "Theo: I have one. I will bring it.",
    time: "9:43",
    messages: [
      { id: "l1", who: "Mara Quill", time: "9:41", text: <>Morning! The venue confirmed the long table for Friday.</> },
      {
        id: "l2",
        who: "Mara Quill",
        time: "9:41",
        text: <>Can someone bring the extension cord for the projector? {mention("Theo")}, you had a long one.</>,
        attachments: [{ name: "run-of-show.pdf", size: 218_000 }],
      },
      { id: "l3", who: "Theo Brandt", time: "9:43", text: <>I have one. I will bring it with the speakers.</> },
      { id: "l4", who: ME, own: true, time: "9:45", text: <>Perfect, thank you both.</> },
    ],
    replies: [
      { id: "lr1", who: "Theo Brandt", time: "9:50", text: <>A long one. It reaches the back wall.</> },
      { id: "lr2", who: "Mara Quill", time: "9:52", text: <>Great. I'll tape it down before doors.</> },
    ],
  },
  {
    id: "ana",
    title: "Ana Lind",
    members: [people.ana],
    preview: "The engine notes are attached.",
    time: "8:15",
    messages: [
      { id: "a1", who: "Ana Lind", time: "8:14", text: <>The engine notes are attached.</>, attachments: [{ name: "engine-notes.docx", size: 48_000 }] },
      { id: "a2", who: ME, own: true, time: "8:20", text: <>Thanks, reading them now.</> },
    ],
    replies: [],
  },
  {
    id: "garden",
    title: "Garden club",
    members: [people.grace, people.theo, people.mara, people.ana],
    preview: "Seed swap moved to Sunday.",
    time: "Tue",
    messages: [{ id: "g1", who: "Grace Hopper", time: "Tue", text: <>Seed swap moved to Sunday. Bring envelopes.</> }],
    replies: [],
  },
  { id: "grace", title: "Grace Hopper", members: [people.grace], preview: "Found the bug: a moth in the relay.", time: "Mon", unread: true, messages: [{ id: "h1", who: "Grace Hopper", time: "Mon", text: <>Found the bug: a moth in the relay.</> }], replies: [] },
];

const REPLY_DELAY = { sent: 400, typing: 700, answer: 1800 } as const;

const mentionable = [{ value: "mara", label: "Mara Quill" }, { value: "theo", label: "Theo Brandt" }, { value: "ana", label: "Ana Lind" }];
const triggers = [{ char: "@", label: "People", items: (query: string) => mentionable.filter((person) => person.label.toLowerCase().includes(query.toLowerCase())) }];

type Stage = "ready" | "loading" | "empty";

/** A chat app in one box: one pane on a phone, the list beside the conversation and its thread from a laptop's width. */
function ChatDemo(): JSX.Element {
  const [stage, setStage] = useState<Stage>("ready");
  const [chats, setChats] = useState<Chat[]>(seed);
  const [openId, setOpenId] = useState<string | null>(null);
  const [threadOpen, setThreadOpen] = useState(false);
  const [typing, setTyping] = useState<string | null>(null);
  const [pendingLine, setPendingLine] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [seen, setSeen] = useState<{ chat: string; line: string } | null>(null);
  const timers = useRef<number[]>([]);
  const paneRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const moved = useRef<"open" | "back" | null>(null);
  const started = useRef(false);
  const threadButton = useRef<HTMLElement | null>(null);
  const open = chats.find((chat) => chat.id === openId);

  const stopReplies = () => {
    timers.current.forEach((timer) => window.clearTimeout(timer));
    timers.current = [];
  };
  useEffect(() => stopReplies, []);
  // A laptop opens on a conversation and a phone on the list; the width is read after hydration.
  useEffect(() => {
    if (window.matchMedia("(min-width: 768px)").matches) queueMicrotask(() => setOpenId("launch"));
  }, []);

  // A phone shows one pane at a time, so hand focus to the pane that appears.
  useEffect(() => {
    if (moved.current === "open") paneRef.current?.focus();
    if (moved.current === "back") listRef.current?.querySelector<HTMLElement>('[data-ouro-part="row"][tabindex="0"]')?.focus();
    moved.current = null;
  }, [openId]);

  // Starting from the empty stage brings the list back, so focus goes to its first row rather than wherever the removed button was.
  useEffect(() => {
    if (stage === "ready" && started.current) listRef.current?.querySelector<HTMLElement>('[data-ouro-part="row"][tabindex="0"]')?.focus();
    started.current = false;
  }, [stage]);

  const items: ConversationListItem[] = chats.map((chat) => ({ id: chat.id, title: chat.title, preview: chat.preview, time: chat.time, unread: chat.unread, draft: drafts[chat.id] ? drafts[chat.id] : undefined }));

  const send = (chatId: string, text: string, thread: boolean) => {
    if (!thread) setDrafts((all) => ({ ...all, [chatId]: "" }));
    const line: Line = { id: `m${Date.now()}`, who: ME, own: true, time: "now", text: withMentions(text.replace(/ {2,}/g, " ").trim()) };
    setChats((all) => {
      const next = all.map((chat) => (chat.id !== chatId ? chat : thread ? { ...chat, replies: [...chat.replies, line] } : { ...chat, messages: [...chat.messages, line], preview: text, time: "now", unread: false }));
      const moved = next.find((chat) => chat.id === chatId);
      return thread || !moved ? next : [moved, ...next.filter((chat) => chat !== moved)];
    });
    if (thread) return;
    stopReplies();
    setSeen(null);
    setPendingLine(line.id);
    timers.current.push(
      window.setTimeout(() => setPendingLine(null), REPLY_DELAY.sent),
      window.setTimeout(() => setTyping(chatId), REPLY_DELAY.typing),
      window.setTimeout(() => {
        setTyping(null);
        setSeen({ chat: chatId, line: line.id });
      }, REPLY_DELAY.answer),
    );
  };

  const list = (
    <ConversationList
      label="Conversations"
      items={items}
      selectedId={openId}
      empty="Start a conversation"
      onSelect={(id) => {
        if (id !== openId) {
          stopReplies();
          setPendingLine(null);
          setTyping(null);
          setSeen(null);
        }
        moved.current = "open";
        setOpenId(id);
        setThreadOpen(false);
        setChats((all) => all.map((chat) => (chat.id === id ? { ...chat, unread: false } : chat)));
      }}
    />
  );

  const conversation = open ? (
    <div ref={paneRef} tabIndex={-1} className="flex h-full min-h-0 flex-col outline-none">
      <div className="border-b border-border px-4 py-2 md:[&_[data-ouro-part=back]]:hidden">
        <ChatHeader title={open.title} members={open.members} onBack={() => {
            moved.current = "back";
            setOpenId(null);
          }} />
      </div>
      <MessageList label={`Messages in ${open.title}`} conversation={open.id} className="min-h-0 flex-1">
        {open.messages.map((line, index) => {
          return (
            <Message
              key={line.id}
              id={line.id}
              variant="chat"
              role={line.own ? "user" : "assistant"}
              name={line.who}
              time={line.time}
              continued={open.messages[index - 1]?.who === line.who}
              attachments={line.attachments?.map((file) => <Attachment key={file.name} name={file.name} size={file.size} href="#" />)}
              pending={pendingLine === line.id}
              footer={line.own && index === open.messages.length - 1 ? <ReadReceipt readers={seen?.chat === open.id && seen.line === line.id ? open.members.filter((member) => member.name !== ME) : []} /> : undefined}
              thread={
                open.replies.length > 0 && index === 2 ? (
                  <ThreadSummary
                    count={open.replies.length}
                    repliers={open.replies.map((reply) => ({ name: reply.who }))}
                    lastReply={open.replies.at(-1)!.time}
                    onOpen={(event) => {
                      threadButton.current = event.currentTarget;
                      setThreadOpen(true);
                    }}
                  />
                ) : undefined
              }
            >
              {line.text}
            </Message>
          );
        })}
      </MessageList>
      <div className="min-h-6 px-4">
        {typing === open.id ? <TypingIndicator people={open.members.filter((member) => member.name !== ME).slice(0, 1)} /> : null}
      </div>
      <div className="border-t border-border p-2">
        <Autocomplete triggers={triggers}>
          <Composer conversation={open.id} label={`Message ${open.title}`} format="rich" placeholder="Write a message, @ to mention" onValueChange={(text) => setDrafts((all) => ({ ...all, [open.id]: text.trim() }))} onSend={(text) => send(open.id, text, false)} />
        </Autocomplete>
      </div>
    </div>
  ) : (
    <Moment kind="empty" title="Pick a conversation" description="Choose one from the list to read it." />
  );

  const thread =
    open && threadOpen ? (
      <ThreadRail label="Thread" title="Replies" detail={open.title} meta={`${open.replies.length} replies`} onClose={() => setThreadOpen(false)} returnFocus={threadButton}>
        <MessageList label="Replies" className="min-h-0 flex-1">
          {open.messages[2] ? (
            <Message id={`${open.messages[2].id}-parent`} variant="reply" context="Started the thread" role={open.messages[2].own ? "user" : "assistant"} name={open.messages[2].who} time={open.messages[2].time}>
              {open.messages[2].text}
            </Message>
          ) : null}
          {open.replies.map((line) => (
            <Message key={line.id} id={line.id} variant="reply" role={line.own ? "user" : "assistant"} name={line.who} time={line.time}>
              {line.text}
            </Message>
          ))}
        </MessageList>
        <div className="border-t border-border p-2">
          <Composer label="Reply in thread" placeholder="Reply to the thread" onSend={(text) => send(open.id, text, true)} />
        </div>
      </ThreadRail>
    ) : null;

  const body =
    stage === "loading" ? (
      <div className="grid h-full place-items-center">
        <Moment kind="loading" announce title="Loading your conversations" />
      </div>
    ) : stage === "empty" ? (
      <div className="grid h-full grid-cols-1 md:grid-cols-[18rem_1fr]">
        <div className="border-e border-border p-2 max-md:hidden">
          <ConversationList className="grid h-full place-items-center" label="Conversations" items={[]} empty="Conversations appear here" onSelect={() => {}} />
        </div>
        <div className="grid place-items-center">
          <Moment kind="empty" size="hero" art={<SpotArt name="empty-chat" />} title="Nothing here yet" description="Messages you send and receive show up here." action={<Button onClick={() => { started.current = true; setStage("ready"); }}>Start a conversation</Button>} />
        </div>
      </div>
    ) : (
      <div className="group/app grid h-full grid-cols-1 md:grid-cols-[18rem_1fr]" data-pane={open ? "chat" : "list"}>
        <div ref={listRef} className="min-h-0 overflow-auto border-e border-border p-2 max-md:group-data-[pane=chat]/app:hidden">{list}</div>
        <div className="min-h-0 min-w-0 max-md:group-data-[pane=list]/app:hidden">
          <ThreadLayout conversation={conversation} thread={thread} conversationLabel="Conversation" />
        </div>
      </div>
    );

  return (
    <div className="grid w-full gap-3" data-site-chat-demo="">
      <SegmentedControl
        label="State"
        value={stage}
        onValueChange={(value) => setStage(value as Stage)}
        items={[
          { value: "ready", label: "Busy" },
          { value: "loading", label: "Loading" },
          { value: "empty", label: "Empty" },
        ]}
      />
      <div className="h-[34rem] overflow-hidden rounded-lg border border-border bg-background">{body}</div>
    </div>
  );
}

/** The docs/chat-demo/ page: the demo behind its own lazy chunk, lead text and shell included. */
export default function ChatDemoPage(): JSX.Element {
  return (
    <DocsShell current="/docs/chat-demo/" opener={{ scene: "ouroboros-skills", eyebrow: "Guides", title: "A chat app" }}>
      <Text size="lg" tone="muted" className="mb-10 max-w-[40rem] text-pretty" data-ouro-measure="">
        The chat components together, with made-up people: a conversation list, messages with a thread, a typing line,
        read receipts, and a plain and a rich composer. Try the keyboard, a narrow window and dark mode.
      </Text>
      <ChatDemo />
    </DocsShell>
  );
}
