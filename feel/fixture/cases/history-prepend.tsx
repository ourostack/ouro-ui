import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { Message } from "@/registry/ouro/components/ouro/message/message";
import { MessageList } from "@/registry/ouro/components/ouro/message/message-list";
import { conversation, type FeelMessage } from "../../data/seed";
import type { FeelCase } from "../../probe/probe";

/** The seed every run uses, so every engine reads the same conversation. */
const SEED = 1;
/** Messages in view at the start, and how many older ones arrive above them in one page. */
const LOADED = 200;
const PAGE = 200;

interface Controls {
  setItems: (items: FeelMessage[]) => void;
  setLoadingOlder: (loading: boolean) => void;
}

function Conversation({ onControls }: { onControls: (controls: Controls) => void }) {
  const [items, setItems] = useState(() => conversation(SEED, LOADED, PAGE));
  const [loadingOlder, setLoadingOlder] = useState(false);
  useEffect(() => onControls({ setItems, setLoadingOlder }), [onControls]);
  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", padding: 16, boxSizing: "border-box" }}>
      <MessageList label="Conversation with inbox-agent" hasOlder loadingOlder={loadingOlder} maxWidth={960} style={{ flex: 1 }}>
        {items.map((message) => (
          <Message key={message.id} id={message.id} role={message.role} name={message.name} time={message.time}>
            {message.text}
          </Message>
        ))}
      </MessageList>
    </div>
  );
}

/**
 * MessageList's `history-prepend`: the reader is up in a long conversation when a page of older
 * messages arrives above them, as a chat app's history loads while the reader scrolls up. The list
 * promises to hold the reader's message in place in every frame.
 */
export const historyPrepend: FeelCase = async (feel) => {
  let controls: Controls | undefined;
  const host = document.getElementById("root")!;
  flushSync(() => createRoot(host).render(<Conversation onControls={(given) => (controls = given)} />));
  await feel.rest(10);
  const scroller = host.querySelector('[data-ouro="message-list"] [data-ouro-part="scroller"]')!;
  // The reader has scrolled up near the start of what is loaded, where the next page comes in.
  scroller.scrollTop = 600;
  await feel.rest(10);

  // The reader's message is the one in the middle of the view, which the probe follows frame by frame.
  feel.watch({ case: "history-prepend", scroller, rows: '[data-ouro="message"], [data-ouro-message-list-item]' });
  controls!.setLoadingOlder(true);
  await feel.painted();
  await feel.painted();
  const older = conversation(SEED, PAGE, 0);
  controls!.setItems([...older, ...conversation(SEED, LOADED, PAGE)]);
  controls!.setLoadingOlder(false);
  const settled = await feel.rest(30);
  return feel.stop(settled);
};
