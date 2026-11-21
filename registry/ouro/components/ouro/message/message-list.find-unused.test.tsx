import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { Message } from "@/registry/ouro/components/ouro/message/message";
import { MessageList } from "@/registry/ouro/components/ouro/message/message-list";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

const requested = () => performance.getEntriesByType("resource").some((entry) => entry.name.includes("message-list-parts"));

it("never requests the find module for a list without a find", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () =>
    root.render(
      <MessageList label="Chat">
        <Message id="a" variant="chat" role="assistant" name="Ana">
          Lunch at noon
        </Message>
      </MessageList>,
    ),
  );
  await new Promise((resolve) => setTimeout(resolve, 300));
  expect(requested()).toBe(false);
  await act(async () => root.unmount());
  host.remove();
});
