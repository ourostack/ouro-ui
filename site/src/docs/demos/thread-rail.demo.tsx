import { useState, type JSX } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Composer } from "@/registry/ouro/components/ouro/composer/composer";
import { Message } from "@/registry/ouro/components/ouro/message/message";
import { MessageList } from "@/registry/ouro/components/ouro/message/message-list";
import { ThreadLayout } from "@/registry/ouro/components/ouro/thread-layout/thread-layout";
import { ThreadRail } from "@/registry/ouro/components/ouro/thread-rail/thread-rail";

// The live demo at the top of docs/ThreadRail.md: the component as an app would use it, with its props, nothing else.

export default function ThreadRailDemo(): JSX.Element {
  const [open, setOpen] = useState(true);
  return (
    <div className="h-[420px] w-full overflow-hidden rounded-lg border border-border bg-background">
      <ThreadLayout
        conversation={
          <div className="flex flex-col gap-3 p-4">
            <p className="m-0 text-sm text-muted-foreground">Design reviews</p>
            {!open && (
              <Button variant="outline" onClick={() => setOpen(true)}>
                Show thread
              </Button>
            )}
          </div>
        }
        thread={
          open ? (
            <ThreadRail label="Thread" title="Replies" detail="Design reviews" meta="2 replies" onClose={() => setOpen(false)}>
              <MessageList label="Replies" className="min-h-0 flex-1">
                <Message role="user" name="Ana Lind">
                  The engine notes are attached.
                </Message>
                <Message role="user" name="Fen">
                  Shipped the settings page this morning.
                </Message>
              </MessageList>
              <div className="border-t border-border p-2">
                <Composer label="Reply in thread" onSend={() => {}} />
              </div>
            </ThreadRail>
          ) : null
        }
      />
    </div>
  );
}
