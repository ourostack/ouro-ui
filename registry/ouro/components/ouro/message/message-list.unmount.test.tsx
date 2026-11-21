import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { Message } from "@/registry/ouro/components/ouro/message/message";
import { MessageList } from "@/registry/ouro/components/ouro/message/message-list";

it("leaves nothing to run when it unmounts in the task it opened in", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const errors: string[] = [];
  const onError = (event: ErrorEvent) => {
    event.preventDefault();
    errors.push(event.message);
  };
  window.addEventListener("error", onError);
  const root = createRoot(host);
  flushSync(() =>
    root.render(
      <MessageList label="Chat" className="h-40">
        {Array.from({ length: 12 }, (_, index) => (
          <Message key={index} id={`m${index}`} variant="chat" role="assistant" name="Ana">
            {`Message ${index} with enough words to take a line or two of the list`}
          </Message>
        ))}
      </MessageList>,
    ),
  );
  flushSync(() => root.unmount());
  await new Promise((resolve) => setTimeout(resolve, 50));
  window.removeEventListener("error", onError);
  host.remove();
  expect(errors).toEqual([]);
});
