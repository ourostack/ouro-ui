import { useState, type JSX } from "react";
import { ConversationFind } from "@/registry/ouro/components/ouro/conversation-find/conversation-find";
import { Message } from "@/registry/ouro/components/ouro/message/message";
import { MessageList, type MessageListFindReport } from "@/registry/ouro/components/ouro/message/message-list";

// The live demo at the top of docs/conversation-find/: the component as an app would use it, with its props, nothing else.

const lines = ["Lunch at noon?", "Nothing to add.", "Café for lunch, or LUNCH out", "Back for lunch at one"];

export default function ConversationFindDemo(): JSX.Element {
  const [query, setQuery] = useState("lunch");
  const [current, setCurrent] = useState<number | null>(0);
  const [report, setReport] = useState<MessageListFindReport>({ count: 0, current: null, partial: false });
  return (
    <div className="grid w-full gap-3">
      <ConversationFind
        label="Find in conversation"
        query={query}
        onQueryChange={(next) => {
          setQuery(next);
          setCurrent(0);
        }}
        count={report.count}
        current={report.current}
        onCurrentChange={setCurrent}
        onClose={() => setQuery("")}
      />
      <MessageList label="Chat" className="h-60 rounded-lg border border-border" find={{ query, current: current ?? 0 }} onFindMatches={setReport}>
        {lines.map((text, index) => (
          <Message key={index} id={`m${index}`} variant="chat" role={index % 2 ? "user" : "assistant"} name={index % 2 ? "You" : "Ana"}>
            {text}
          </Message>
        ))}
      </MessageList>
    </div>
  );
}
