import { type ReactNode } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { Attachment } from "@/registry/ouro/components/ouro/message/attachment";
import { Message } from "@/registry/ouro/components/ouro/message/message";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

const roots: Root[] = [];
let mounted: Element[] = [];

async function render(node: ReactNode) {
  const host = document.createElement("div");
  host.style.width = "600px";
  document.body.append(host);
  mounted.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
  return {
    host,
    rerender: (next: ReactNode) => act(async () => root.render(next)),
    get message() {
      return host.querySelector<HTMLElement>('[data-ouro="message"]')!;
    },
  };
}

const bubbleOf = (message: HTMLElement) => message.querySelector<HTMLElement>("[data-ouro-message-content]")!;

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(async () => {
  vi.restoreAllMocks();
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  for (const node of mounted) node.remove();
  mounted = [];
});

describe("Message", () => {
  it("is an article that says who wrote it, then what they wrote", async () => {
    const { message } = await render(
      <Message role="assistant" name="Ouro">
        Preheat the oven to 220°C.
      </Message>,
    );
    expect(message.tagName).toBe("ARTICLE");
    await expect.element(page.getByRole("article")).toBeVisible();
    const author = message.querySelector<HTMLElement>("[data-ouro-message-author]")!;
    expect(author.textContent).toBe("Ouro");
    expect(bubbleOf(message).textContent).toBe("Preheat the oven to 220°C.");
    // The name comes first in reading order, so it is heard before the message.
    expect(author.compareDocumentPosition(bubbleOf(message)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("puts the user's messages at the end in the primary color and others at the start", async () => {
    const { host } = await render(
      <>
        <Message role="user" name="Ada">
          How hot?
        </Message>
        <Message role="assistant" name="Ouro">
          220°C.
        </Message>
      </>,
    );
    const [user, assistant] = [...host.querySelectorAll<HTMLElement>('[data-ouro="message"]')];
    const hostBox = host.getBoundingClientRect();
    const userBubble = bubbleOf(user!).getBoundingClientRect();
    expect(userBubble.right).toBeGreaterThan(hostBox.right - 60);
    expect(userBubble.left).toBeGreaterThan(hostBox.left + hostBox.width / 2);
    // The user's avatar is at the far end, after the bubble.
    expect(user!.querySelector('[data-ouro="avatar"]')!.getBoundingClientRect().left).toBeGreaterThanOrEqual(userBubble.right);
    expect(bubbleOf(assistant!).getBoundingClientRect().left).toBeGreaterThan(hostBox.left);
    expect(bubbleOf(assistant!).getBoundingClientRect().left).toBeLessThan(hostBox.left + 60);
    const probe = document.createElement("span");
    probe.style.color = "var(--primary)";
    host.append(probe);
    expect(getComputedStyle(bubbleOf(user!)).backgroundColor).toBe(getComputedStyle(probe).color);
    probe.style.color = "var(--muted)";
    expect(getComputedStyle(bubbleOf(assistant!)).backgroundColor).toBe(getComputedStyle(probe).color);
    probe.remove();
  });

  it("hides the user's own name visually but keeps it for screen readers", async () => {
    const { message } = await render(
      <Message role="user" name="Ada">
        Hi
      </Message>,
    );
    const author = message.querySelector<HTMLElement>("[data-ouro-message-author]")!;
    expect(author.textContent).toBe("Ada");
    expect(author.getBoundingClientRect().width).toBeLessThanOrEqual(1);
  });

  it("shows the author's avatar from main's Avatar, silent because the name is written", async () => {
    const { host } = await render(
      <>
        <Message role="assistant" name="Ouro Agent">
          Hi
        </Message>
        <Message role="user" name="Ada" avatar={false}>
          Hi
        </Message>
      </>,
    );
    const avatars = host.querySelectorAll<HTMLElement>('[data-ouro="avatar"]');
    expect(avatars).toHaveLength(1);
    expect(avatars[0]!.textContent).toBe("OA");
    expect(avatars[0]!.getAttribute("aria-hidden")).toBe("true");
  });

  it("shows a system message centered and quiet, without avatar or bubble", async () => {
    const { host, message } = await render(
      <Message role="system" name="Ouro">
        Ada joined the conversation
      </Message>,
    );
    expect(message.querySelector('[data-ouro="avatar"]')).toBeNull();
    const content = bubbleOf(message);
    expect(getComputedStyle(content).backgroundColor).toBe("rgba(0, 0, 0, 0)");
    const box = content.getBoundingClientRect();
    const hostBox = host.getBoundingClientRect();
    expect(Math.abs(box.left - hostBox.left - (hostBox.right - box.right))).toBeLessThan(2);
  });

  it("lists attachments under the bubble", async () => {
    const { message } = await render(
      <Message role="user" name="Ada" attachments={<Attachment name="menu.pdf" />}>
        Here it is
      </Message>,
    );
    const attachment = message.querySelector<HTMLElement>('[data-ouro="attachment"]')!;
    expect(bubbleOf(message).contains(attachment)).toBe(false);
    expect(attachment.getBoundingClientRect().top).toBeGreaterThanOrEqual(bubbleOf(message).getBoundingClientRect().bottom);
  });

  it("is busy while streaming, with a typing indicator the app can name", async () => {
    const { message, rerender } = await render(<Message role="assistant" name="Ouro" streaming />);
    expect(message.getAttribute("aria-busy")).toBe("true");
    expect(bubbleOf(message).textContent).toBe("Writing");
    await rerender(<Message role="assistant" name="Ouro" streaming streamingLabel="Écrit" />);
    expect(bubbleOf(message).textContent).toBe("Écrit");
    await rerender(
      <Message role="assistant" name="Ouro">
        Done
      </Message>,
    );
    expect(message.hasAttribute("aria-busy")).toBe(false);
    expect(bubbleOf(message).textContent).toBe("Done");
  });

  it("keeps an aria-busy the app passes while it is not streaming", async () => {
    const { message } = await render(
      <Message role="assistant" name="Ouro" aria-busy>
        Done
      </Message>,
    );
    expect(message.getAttribute("aria-busy")).toBe("true");
  });

  it("shows partial text, not the indicator, while text streams in", async () => {
    const { message } = await render(
      <Message role="assistant" name="Ouro" streaming>
        Preheat
      </Message>,
    );
    expect(bubbleOf(message).textContent).toBe("Preheat");
    expect(message.getAttribute("aria-busy")).toBe("true");
  });

  it("wraps long words inside the bubble", async () => {
    const { host, message } = await render(
      <Message role="assistant" name="Ouro">
        {"x".repeat(400)}
      </Message>,
    );
    expect(bubbleOf(message).getBoundingClientRect().right).toBeLessThanOrEqual(host.getBoundingClientRect().right);
  });

  it("renders in server HTML and hydrates without a warning", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const node = (
      <Message role="assistant" name="Ouro" attachments={<Attachment name="menu.pdf" />}>
        Hello
      </Message>
    );
    const html = renderToString(node);
    expect(html).toContain("<article");
    expect(html).toContain("Hello");
    const host = document.createElement("div");
    host.innerHTML = html;
    document.body.append(host);
    mounted.push(host);
    const recoverable = vi.fn();
    let root!: Root;
    await act(async () => {
      root = hydrateRoot(host, node, { onRecoverableError: recoverable });
    });
    roots.push(root);
    expect(recoverable).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it("forwards a ref and lets app layout classes win", async () => {
    let element: HTMLElement | null = null;
    const { message } = await render(
      <Message role="user" name="Ada" className="mt-4" ref={(node) => void (element = node)}>
        Hi
      </Message>,
    );
    expect(element).toBe(message);
    expect(getComputedStyle(message).marginTop).toBe("16px");
  });
});

describe("Message development messages", () => {
  it.each([
    ["an unknown role", { role: "bot" }, 'role="bot" is not a role; use "user", "assistant" or "system"', '<Message role="assistant" name="Ouro">'],
    ["from", { from: "user" }, "from is not a prop", '<Message role="user" name="Ada">'],
    ["sender", { sender: "Ada" }, "sender is not a prop", '<Message role="user" name="Ada">'],
    ["author", { author: "Ada" }, "author is not a prop", '<Message role="user" name="Ada">'],
    ["content", { content: "Hi" }, "content is not a prop; the message is the children", '<Message role="user" name="Ada">Hi</Message>'],
  ])("warns for %s with the fix", async (_name, extra, problem, fix) => {
    const props = { role: "assistant", name: "Ouro", children: "Hi", ...extra } as unknown as Parameters<typeof Message>[0];
    const { message } = await render(<Message {...props} />);
    expect(warn).toHaveBeenCalledWith(`[ouro-ui] Message: ${problem}. Fix: ${fix}.`);
    expect(message.hasAttribute("from")).toBe(false);
    expect(message.hasAttribute("content")).toBe(false);
  });

  it("renders an unknown role as an assistant message", async () => {
    const props = { role: "bot", name: "Ouro", children: "Hi" } as unknown as Parameters<typeof Message>[0];
    const { message } = await render(<Message {...props} />);
    expect(message.getAttribute("data-role")).toBe("assistant");
  });

  it("warns when name is missing", async () => {
    const props = { role: "assistant", children: "Hi" } as unknown as Parameters<typeof Message>[0];
    await render(<Message {...props} />);
    expect(warn).toHaveBeenCalledWith(
      '[ouro-ui] Message: name is missing, so screen readers cannot say who wrote it. Fix: <Message role="assistant" name="Ouro">.',
    );
  });

  it("checks the className", async () => {
    await render(
      <Message role="user" name="Ada" className="bg-blue-500">
        Hi
      </Message>,
    );
    expect(warn).toHaveBeenCalledWith(
      '[ouro-ui] Message: "bg-blue-500" sets appearance, and className is for layout only. Fix: remove "bg-blue-500"; the bubble color follows role.',
    );
  });
});
