import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { Message } from "@/registry/ouro/components/ouro/message/message";
import { MessageList } from "@/registry/ouro/components/ouro/message/message-list";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

// Its own file, so Menu's code is not in the page until the first menu asks for it.
const roots: Root[] = [];
afterEach(async () => {
  await userEvent.unhover(document.body);
  for (const root of roots.splice(0)) await act(async () => root.unmount());
  document.body.replaceChildren();
});

async function render(node: ReactNode) {
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
  return host;
}

describe("MessageList's menu", () => {
  it("opens from a right-click before any bar has shown, waiting for Menu's code", async () => {
    const host = await render(
      <MessageList label="Launch channel" style={{ height: 240 }}>
        <Message id="first" variant="chat" role="assistant" name="Mara Quill" menu={[{ label: "Copy link", onClick: () => {} }]}>
          Morning!
        </Message>
      </MessageList>,
    );
    const text = host.querySelector("[data-ouro-message-content]")!;
    const rightClick = () => {
      const box = text.getBoundingClientRect();
      return act(async () => void text.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: box.x + 4, clientY: box.y + 4 })));
    };
    // The list's bar and menu code arrive a moment after its first message: a right-click before then is the browser's.
    await expect.poll(async () => (await rightClick(), page.getByRole("menu", { name: "Message actions for Mara Quill" }).query())).not.toBeNull();
    await expect.element(page.getByRole("menu", { name: "Message actions for Mara Quill" })).toBeVisible();
  });
});
