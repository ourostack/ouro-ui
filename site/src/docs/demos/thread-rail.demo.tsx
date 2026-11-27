import { useState, type JSX } from "react";
import { Composer } from "@/registry/ouro/components/ouro/composer/composer";
import { Message } from "@/registry/ouro/components/ouro/message/message";
import { MessageList } from "@/registry/ouro/components/ouro/message/message-list";
import { ThreadSummary } from "@/registry/ouro/components/ouro/message/thread-summary";
import { ThreadLayout } from "@/registry/ouro/components/ouro/thread-layout/thread-layout";
import { ThreadRail } from "@/registry/ouro/components/ouro/thread-rail/thread-rail";

// The live demo at the top of docs/ThreadRail.md: the component as an app would use it, with its props, nothing else.

export default function ThreadRailDemo(): JSX.Element {
  const [open, setOpen] = useState(true);
  const [draft, setDraft] = useState("");
  const [replies, setReplies] = useState<string[]>([]);
  return (
    <div className="h-[420px] w-full overflow-hidden rounded-ouro-lg border border-border bg-background">
      <ThreadLayout
        conversation={
          <div className="p-4">
            <Message
              role="assistant"
              name="Ana Lind"
              variant="post"
              subject="Room for the little things"
              time="9:41 AM"
              thread={<ThreadSummary count={2 + replies.length} repliers={[{ name: "Fen" }, { name: "You" }]} onOpen={() => setOpen(true)} />}
            >
              A quieter header leaves more room for the conversation. What do you think?
            </Message>
          </div>
        }
        thread={
          open ? (
            <ThreadRail label="Thread" title="Replies" detail="Room for the little things" meta={`${2 + replies.length} replies`} autoFocus={false} onClose={() => setOpen(false)}>
              <MessageList label="Replies" className="min-h-0 flex-1">
                <Message role="assistant" name="Fen" variant="reply" time="9:42 AM">
                  Yes. Let the words do the talking.
                </Message>
                <Message role="user" name="You" variant="reply" time="9:43 AM">
                  And keep the reply box close at hand.
                </Message>
                {replies.map((reply, index) => <Message key={index} role="user" name="You" variant="reply">{reply}</Message>)}
              </MessageList>
              <div className="border-t border-border p-2">
                <Composer label="Reply in thread" placeholder="Add your thought…" value={draft} onValueChange={setDraft} onSend={(text) => { setReplies([...replies, text]); setDraft(""); }} />
              </div>
            </ThreadRail>
          ) : null
        }
      />
    </div>
  );
}
