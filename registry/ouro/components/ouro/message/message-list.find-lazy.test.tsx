import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { Message } from "@/registry/ouro/components/ouro/message/message";
import { MessageList, type MessageListFind } from "@/registry/ouro/components/ouro/message/message-list";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

const hosts: Element[] = [];
afterEach(() => {
  for (const host of hosts.splice(0)) host.remove();
});

const list = (find?: MessageListFind) => (
  <MessageList label="Chat" style={{ height: 200 }} find={find}>
    <Message id="a" variant="chat" role="assistant" name="Ana">
      Lunch at noon
    </Message>
  </MessageList>
);

describe("MessageList find, loaded on demand", () => {
  it("carries no find classes without a find, and loads the layer when a find arrives later", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    hosts.push(host);
    const root = createRoot(host);
    await act(async () => root.render(list()));
    const element = host.querySelector("[data-ouro=message-list]")!;
    expect(element.className).not.toContain("highlight(ouro-find");
    expect(CSS.highlights.get("ouro-find-current")).toBeUndefined();
    await act(async () => root.render(list({ query: "lunch" })));
    await expect.poll(() => [...(CSS.highlights.get("ouro-find-current") ?? [])].map((range) => range.toString())).toEqual(["Lunch"]);
    expect(host.querySelector("[data-ouro=message-list]")!.className).toContain("highlight(ouro-find-current)");
    await act(async () => root.unmount());
  });
});

describe("MessageList find, once the layer is loaded", () => {
  it("still carries no find classes for a list without a find", async () => {
    const warm = document.createElement("div");
    document.body.append(warm);
    hosts.push(warm);
    const first = createRoot(warm);
    await act(async () => first.render(list({ query: "lunch" })));
    await expect.poll(() => CSS.highlights.get("ouro-find-current")?.size).toBe(1);
    await act(async () => first.unmount());
    const host = document.createElement("div");
    document.body.append(host);
    hosts.push(host);
    const root = createRoot(host);
    await act(async () => root.render(list()));
    expect(host.querySelector("[data-ouro=message-list]")!.className).not.toContain("highlight(ouro-find");
    await act(async () => root.unmount());
  });
});
