import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { Message } from "@/registry/ouro/components/ouro/message/message";
import { MessageList } from "@/registry/ouro/components/ouro/message/message-list";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

// Its own file, so Menu's code is not in the page until a list's bar asks for it.
const roots: Root[] = [];
afterEach(async () => {
  await userEvent.unhover(document.body);
  for (const root of roots.splice(0)) await act(async () => root.unmount());
  document.body.replaceChildren();
});

/** Whether the page has fetched Menu's code since this began. */
function watchMenuRequests() {
  const urls: string[] = [];
  const observer = new PerformanceObserver((list) => urls.push(...list.getEntries().map((entry) => entry.name)));
  observer.observe({ type: "resource" });
  return { fetched: () => urls.some((url) => /\/components\/ouro\/menu\/menu\.tsx/.test(url)), stop: () => observer.disconnect() };
}

async function render(node: ReactNode) {
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
  return host;
}

describe("MessageList's menu code", () => {
  it("is fetched as the list's bar first shows, whatever its message holds, and not before", async () => {
    const requests = watchMenuRequests();
    const host = await render(
      <MessageList label="Launch channel" style={{ height: 240 }}>
        <Message id="plain" variant="chat" role="assistant" name="Mara Quill" actions={[{ key: "like", label: "Like", icon: "♥", onClick: () => {} }]}>
          Morning!
        </Message>
      </MessageList>,
    );
    await act(() => new Promise((resolve) => setTimeout(resolve, 100)));
    expect(requests.fetched()).toBe(false);
    const text = host.querySelector("[data-ouro-message-content]")!;
    await expect.poll(async () => (await userEvent.hover(text), host.querySelector('[role="toolbar"]'))).not.toBeNull();
    await expect.poll(requests.fetched).toBe(true);
    requests.stop();
  });
});
