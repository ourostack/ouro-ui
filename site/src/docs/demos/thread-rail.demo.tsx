import { useState, type JSX } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Composer } from "@/registry/ouro/components/ouro/composer/composer";
import { Message } from "@/registry/ouro/components/ouro/message/message";
import { MessageList } from "@/registry/ouro/components/ouro/message/message-list";
import { ThreadRail } from "@/registry/ouro/components/ouro/thread-rail/thread-rail";

// The live demo at the top of docs/ThreadRail.md: the component as an app would use it, with its props, nothing else.

export default function ThreadRailDemo(): JSX.Element {
  const [open, setOpen] = useState(true);
  return (
    <div className="flex h-[420px] overflow-hidden rounded-lg border border-border bg-background">
      <div className="flex min-w-0 flex-1 flex-col gap-3 p-4">
        <p className="m-0 text-sm text-muted-foreground">Design reviews</p>
        {!open && (
          <Button variant="outline" onClick={() => setOpen(true)}>
            Show thread
          </Button>
        )}
      </div>
      {open && (
        <ThreadRail label="Thread" title="Replies" detail="Design reviews" meta="2 replies" onClose={() => setOpen(false)} className="w-80">
          <MessageList label="Replies" className="min-h-0 flex-1">
            <Message role="user" name="Ana Lind">
              The engine notes are attached.
            </Message>
            <Message role="user" name="Fen">
              Shipped the settings page this morning.
            </Message>
          </MessageList>
          <Composer label="Reply in thread" onSend={() => {}} />
        </ThreadRail>
      )}
    </div>
  );
}
