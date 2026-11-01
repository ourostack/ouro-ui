import { createRef, useState, type ReactNode } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { Avatar } from "@/registry/ouro/components/ouro/avatar/avatar";
import { Attachment } from "@/registry/ouro/components/ouro/message/attachment";
import { Message, type MessageAction, type MessageProps } from "@/registry/ouro/components/ouro/message/message";
import { pressTab } from "@/registry/ouro/lib/ouro/testing/tab";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

const roots: Root[] = [];

/** Lets a message's action bar, whose code Message loads in the browser, arrive. */
async function barCode() {
  await act(async () => {
    await import("@/registry/ouro/components/ouro/message/message-parts");
    await new Promise((resolve) => setTimeout(resolve));
  });
}
let mounted: Element[] = [];

async function render(node: ReactNode) {
  const host = document.createElement("div");
  host.style.width = "600px";
  document.body.append(host);
  mounted.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
  await barCode();
  return {
    host,
    rerender: async (next: ReactNode) => {
      await act(async () => root.render(next));
      await barCode();
    },
    get message() {
      return host.querySelector<HTMLElement>('[data-ouro="message"]')!;
    },
  };
}

// An inline picture: a path such as "/priya.png" would ask an app's dev server for its index page.
const picture = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR4AWP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==";
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
    expect(author.getBoundingClientRect().width).toBeGreaterThan(1);
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
  it("warns of nothing when the props are right", async () => {
    await render(
      <>
        <Message variant="chat" role="assistant" name="Mara Quill" time="9:41 AM" actions={actionsFor([])} menu={menu} footer={<span>Seen</span>}>
          Hi
        </Message>
        <Message variant="post" role="assistant" name="Jonah Vale" subject="Agenda" actions={actionsFor([])}>
          Hi
        </Message>
        <Message variant="reply" role="user" name="Priya Okafor" continued>
          Hi
        </Message>
        <Message role="assistant" name="Ouro">
          Hi
        </Message>
        <Message variant="chat" role="assistant" name="Theo Brandt" presence="away" presenceLabel="Away">
          Hi
        </Message>
        <Message variant="chat" role="assistant" name="Theo Brandt" avatar={<Avatar name="Theo Brandt" alt="" size="sm" presence="away" presenceLabel="Away" />}>
          Hi
        </Message>
      </>,
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it.each([
    ["an unknown role", { role: "bot" }, 'role="bot" is not a role; use "user", "assistant" or "system"', '<Message role="assistant" name="Ouro">'],
    ["from", { from: "user" }, "from is not a prop", '<Message role="user" name="Ada">'],
    ["sender", { sender: "Ada" }, "sender is not a prop", '<Message role="user" name="Ada">'],
    ["author", { author: "Ada" }, "author is not a prop", '<Message role="user" name="Ada">'],
    ["content", { content: "Hi" }, "content is not a prop; the message is the children", '<Message role="user" name="Ada">Hi</Message>'],
    ["an unknown variant", { variant: "bubble" }, 'variant="bubble" is not a variant; use "default", "chat", "post" or "reply"', '<Message variant="chat" role="assistant" name="Grace">'],
    ["own", { own: true }, 'own is not a prop; the user\'s own messages are role="user"', '<Message role="user" variant="chat">'],
    ["timestamp", { timestamp: "9:41" }, "timestamp is not a prop", '<Message time="9:41 AM" dateTime={iso}>'],
    ["a continued post", { variant: "post", continued: true }, "a post is never continued: every post shows its author", '<Message variant="reply" continued>'],
    ["a subject off a post", { variant: "chat", subject: "Hi" }, "subject shows only on a post", '<Message variant="post" subject="Launch plan">'],
    [
      "a presence beside an Avatar element",
      { presence: "busy", presenceLabel: "In a meeting", avatar: <Avatar name="Ouro" alt="" size="sm" /> },
      "presence does not reach an Avatar element passed as avatar; give that Avatar the presence",
      'avatar={<Avatar name="Ouro" alt="" size="sm" presence="busy" presenceLabel="In a meeting" />}',
    ],
    [
      "a presence without words beside an Avatar element",
      { presence: "out-of-office", avatar: <Avatar name="Ouro" alt="" size="sm" /> },
      "presence does not reach an Avatar element passed as avatar; give that Avatar the presence",
      'avatar={<Avatar name="Ouro" alt="" size="sm" presence="out-of-office" presenceLabel="Out of office" />}',
    ],
  ])("warns for %s with the fix", async (_name, extra, problem, fix) => {
    const props = { role: "assistant", name: "Ouro", children: "Hi", ...extra } as unknown as Parameters<typeof Message>[0];
    const { message } = await render(<Message {...props} />);
    expect(warn).toHaveBeenCalledWith(`[ouro-ui] Message: ${problem}. Fix: ${fix}.`);
    expect(message.hasAttribute("from")).toBe(false);
    expect(message.hasAttribute("content")).toBe(false);
  });

  it("shows no subject off a post", async () => {
    const { message } = await render(
      <Message variant="chat" role="assistant" name="Ouro" subject="Agenda">
        Hi
      </Message>,
    );
    expect(message.querySelector("[data-ouro-message-subject]")).toBeNull();
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

const probeColor = (host: HTMLElement, value: string) => {
  const probe = document.createElement("span");
  probe.style.color = value;
  host.append(probe);
  const color = getComputedStyle(probe).color;
  probe.remove();
  return color;
};
const headerOf = (message: HTMLElement) => message.querySelector<HTMLElement>("[data-ouro-message-header]")!;
const visible = (element: Element) => element.getBoundingClientRect().width > 1;

describe("Message chat", () => {
  it("puts others' messages at the start on a raised bubble under their name and time, and the user's own at the end in a tint", async () => {
    const { host } = await render(
      <>
        <Message variant="chat" role="assistant" name="Mara Quill" time="9:41 AM" dateTime="2026-05-04T09:41">
          Morning!
        </Message>
        <Message variant="chat" role="user" name="Priya Okafor" time="9:45 AM">
          Hi Mara
        </Message>
      </>,
    );
    const [other, mine] = [...host.querySelectorAll<HTMLElement>('[data-ouro="message"]')];
    expect(other!.dataset.variant).toBe("chat");
    const hostBox = host.getBoundingClientRect();
    // Others: avatar, then the name and time over a card-colored bubble at the start.
    const author = other!.querySelector<HTMLElement>("[data-ouro-message-author]")!;
    expect(visible(author)).toBe(true);
    expect(author.textContent).toBe("Mara Quill");
    const time = headerOf(other!).querySelector("time")!;
    expect(time.textContent).toBe("9:41 AM");
    expect(time.getAttribute("dateTime")).toBe("2026-05-04T09:41");
    expect(time.getBoundingClientRect().top).toBeLessThan(bubbleOf(other!).getBoundingClientRect().top);
    expect(other!.querySelector('[data-ouro="avatar"]')!.getBoundingClientRect().left).toBeLessThan(bubbleOf(other!).getBoundingClientRect().left);
    expect(getComputedStyle(bubbleOf(other!)).backgroundColor).toBe(probeColor(host, "var(--card)"));
    expect(bubbleOf(other!).getBoundingClientRect().left).toBeLessThan(hostBox.left + 60);
    // Screen readers hear the name, then the time, then the message.
    expect(headerOf(other!).textContent).toBe("Mara Quill, 9:41 AM");
    expect(headerOf(other!).compareDocumentPosition(bubbleOf(other!)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Own: at the end, no avatar, the name hidden but read, the time shown.
    expect(mine!.querySelector('[data-ouro="avatar"]')).toBeNull();
    expect(bubbleOf(mine!).getBoundingClientRect().right).toBeGreaterThan(hostBox.right - 2);
    expect(visible(mine!.querySelector("[data-ouro-message-author]")!)).toBe(false);
    expect(visible(headerOf(mine!).querySelector("time")!)).toBe(true);
    const tint = getComputedStyle(bubbleOf(mine!)).backgroundColor;
    expect(tint).not.toBe(probeColor(host, "var(--card)"));
    expect(tint).not.toBe(probeColor(host, "var(--primary)"));
    expect(tint).not.toBe("rgba(0, 0, 0, 0)");
    expect(getComputedStyle(bubbleOf(mine!)).color).toBe(probeColor(host, "var(--foreground)"));
  });

  it("groups a continued message under the one before, without avatar or name, its time on hover", async () => {
    const { host } = await render(
      <>
        <Message variant="chat" role="assistant" name="Mara Quill" time="9:41 AM">
          Morning!
        </Message>
        <Message variant="chat" role="assistant" name="Mara Quill" time="9:42 AM" dateTime="2026-05-04T09:42" continued>
          The venue confirmed.
        </Message>
        <Message variant="chat" role="assistant" name="Mara Quill" continued>
          No time on this one.
        </Message>
      </>,
    );
    const [first, second, third] = [...host.querySelectorAll<HTMLElement>('[data-ouro="message"]')];
    expect(second!.getAttribute("data-continued")).toBe("");
    expect(first!.hasAttribute("data-continued")).toBe(false);
    expect(second!.querySelector('[data-ouro="avatar"]')).toBeNull();
    // The bubbles line up in one column.
    expect(bubbleOf(second!).getBoundingClientRect().left).toBeCloseTo(bubbleOf(first!).getBoundingClientRect().left, 0);
    // The name and time are read, not shown.
    expect(visible(headerOf(second!))).toBe(false);
    expect(headerOf(second!).textContent).toBe("Mara Quill, 9:42 AM");
    // The time in the gutter shows on hover, and is not read twice.
    const gutterTime = second!.querySelector<HTMLElement>("[data-ouro-message-gutter] time")!;
    expect(gutterTime.getAttribute("aria-hidden")).toBe("true");
    expect(gutterTime.getAttribute("dateTime")).toBe("2026-05-04T09:42");
    expect(getComputedStyle(gutterTime).opacity).toBe("0");
    await userEvent.hover(bubbleOf(second!));
    await expect.poll(() => getComputedStyle(gutterTime).opacity).toBe("1");
    expect(third!.querySelector("[data-ouro-message-gutter]")!.childElementCount).toBe(0);
  });

  it("shows an Avatar element the app passes, and no avatar on the user's own chat messages", async () => {
    const { host } = await render(
      <>
        <Message variant="chat" role="assistant" name="Theo Brandt" avatar={<Avatar name="Theo Brandt" initials="TB!" alt="" size="lg" />}>
          Hi
        </Message>
        <Message variant="chat" role="user" name="Priya Okafor" avatar={picture}>
          Hi
        </Message>
        <Message variant="reply" role="assistant" name="Mara Quill" avatar={false}>
          Hi
        </Message>
      </>,
    );
    const [theo, priya, mara] = [...host.querySelectorAll<HTMLElement>('[data-ouro="message"]')];
    expect(theo!.querySelector('[data-ouro="avatar"]')!.textContent).toBe("TB!");
    // Without a time, the header is the name alone.
    expect(headerOf(theo!).textContent).toBe("Theo Brandt");
    expect(headerOf(theo!).querySelector("time")).toBeNull();
    expect(priya!.querySelector('[data-ouro="avatar"]')).toBeNull();
    expect(mara!.querySelector("[data-ouro-message-gutter]")).toBeNull();
  });

  it("shows the footer under the bubble on the message's side, and attachments above it", async () => {
    const { host } = await render(
      <>
        <Message variant="chat" role="user" name="Priya Okafor" attachments={<Attachment name="plan.pdf" />} footer={<span>Seen</span>}>
          Here
        </Message>
        <Message variant="chat" role="assistant" name="Mara Quill" footer={null} thread={false}>
          No footer
        </Message>
      </>,
    );
    const [mine, other] = [...host.querySelectorAll<HTMLElement>('[data-ouro="message"]')];
    const footer = mine!.querySelector<HTMLElement>("[data-ouro-message-footer]")!;
    const attachment = mine!.querySelector<HTMLElement>('[data-ouro="attachment"]')!;
    expect(footer.textContent).toBe("Seen");
    expect(bubbleOf(mine!).contains(footer)).toBe(false);
    expect(footer.getBoundingClientRect().top).toBeGreaterThanOrEqual(attachment.getBoundingClientRect().bottom);
    expect(footer.getBoundingClientRect().right).toBeCloseTo(bubbleOf(mine!).getBoundingClientRect().right, 0);
    expect(other!.querySelector("[data-ouro-message-footer]")).toBeNull();
    expect(other!.querySelector("[data-ouro-message-thread]")).toBeNull();
  });

  it("adds time, continued runs, a footer and a thread to the default layout too", async () => {
    const { host } = await render(
      <>
        <Message role="assistant" name="Ouro" time="9:41 AM" dateTime="2026-05-04T09:41" footer={<span>Edited</span>} thread={<span>2 replies</span>}>
          First
        </Message>
        <Message role="assistant" name="Ouro" continued>
          Second
        </Message>
        <Message role="user" name="Ada" continued>
          Mine
        </Message>
        <Message role="system" name="Ouro" continued>
          Ada joined
        </Message>
      </>,
    );
    const [first, second, mine, system] = [...host.querySelectorAll<HTMLElement>('[data-ouro="message"]')];
    const author = first!.querySelector<HTMLElement>("[data-ouro-message-author]")!;
    expect(author.textContent).toBe("Ouro, 9:41 AM");
    expect(author.querySelector("time")!.getAttribute("dateTime")).toBe("2026-05-04T09:41");
    expect(first!.querySelector("[data-ouro-message-footer]")!.textContent).toBe("Edited");
    expect(first!.querySelector("[data-ouro-message-thread]")!.textContent).toBe("2 replies");
    expect(second!.getAttribute("data-continued")).toBe("");
    expect(second!.querySelector('[data-ouro="avatar"]')).toBeNull();
    expect(visible(second!.querySelector("[data-ouro-message-author]")!)).toBe(false);
    expect(bubbleOf(second!).getBoundingClientRect().left).toBeCloseTo(bubbleOf(first!).getBoundingClientRect().left, 0);
    expect(mine!.querySelector('[data-ouro="avatar"]')).toBeNull();
    expect(system!.hasAttribute("data-continued")).toBe(false);
  });

  it("centers a system note in every variant", async () => {
    const { host, message } = await render(
      <Message variant="chat" role="system" name="Ouro" time="9:40 AM">
        Mara joined
      </Message>,
    );
    expect(message.dataset.variant).toBe("chat");
    const box = bubbleOf(message).getBoundingClientRect();
    const hostBox = host.getBoundingClientRect();
    expect(Math.abs(box.left - hostBox.left - (hostBox.right - box.right))).toBeLessThan(2);
  });

  it("renders an unknown variant as the default layout", async () => {
    const props = { role: "assistant", name: "Ouro", variant: "bubble", children: "Hi" } as unknown as MessageProps;
    const { message } = await render(<Message {...props} />);
    expect(message.hasAttribute("data-variant")).toBe(false);
  });
});

// Three 200px chips: wider than a message's column, so they wrap onto a second row.
const chips = (label: string) => (
  <>
    {[1, 2, 3].map((n) => (
      <span key={n} data-chip={`${label}${n}`} style={{ display: "inline-block", width: 200, height: 20 }} />
    ))}
  </>
);
const chip = (message: HTMLElement, name: string) => message.querySelector(`[data-chip="${name}"]`)!.getBoundingClientRect();

describe("Message rows", () => {
  it.each([
    ["default", undefined],
    ["chat", "chat"],
  ] as const)("lines up wrapped attachments, footer and thread rows at the user's end in the %s layout, and at the start for others", async (_name, variant) => {
    const { host } = await render(
      <>
        <Message variant={variant} role="user" name="Priya Okafor" attachments={chips("a")} footer={chips("f")} thread={chips("t")}>
          Mine
        </Message>
        <Message variant={variant} role="assistant" name="Mara Quill" attachments={chips("a")} footer={chips("f")} thread={chips("t")}>
          Theirs
        </Message>
      </>,
    );
    const [mine, theirs] = [...host.querySelectorAll<HTMLElement>('[data-ouro="message"]')];
    for (const row of ["a", "f", "t"]) {
      // The third chip wraps onto a row of its own.
      expect(chip(mine!, `${row}3`).top).toBeGreaterThan(chip(mine!, `${row}1`).top);
      expect(chip(mine!, `${row}3`).right).toBeCloseTo(chip(mine!, `${row}2`).right, 0);
      expect(chip(theirs!, `${row}3`).left).toBeCloseTo(chip(theirs!, `${row}1`).left, 0);
    }
    // A short message sits at the same side as the rows under it.
    expect(bubbleOf(mine!).getBoundingClientRect().right).toBeCloseTo(chip(mine!, "f2").right, 0);
    expect(bubbleOf(theirs!).getBoundingClientRect().left).toBeCloseTo(chip(theirs!, "f1").left, 0);
  });

  it("keeps 4px between a message and its footer", async () => {
    const { host } = await render(
      <>
        <Message variant="chat" role="assistant" name="Mara Quill" footer={chips("f")}>
          Hi
        </Message>
        <Message role="assistant" name="Ouro" footer={chips("f")}>
          Hi
        </Message>
      </>,
    );
    for (const message of host.querySelectorAll<HTMLElement>('[data-ouro="message"]')) {
      const footer = message.querySelector("[data-ouro-message-footer]")!;
      expect(footer.getBoundingClientRect().top - bubbleOf(message).getBoundingClientRect().bottom).toBeCloseTo(4, 0);
    }
  });

  it("leaves out the attachments row when there are none", async () => {
    const { host } = await render(
      <>
        <Message role="assistant" name="Ouro">
          Hi
        </Message>
        <Message role="user" name="Ada" attachments={null}>
          Hi
        </Message>
        <Message variant="chat" role="user" name="Ada" attachments={null}>
          Hi
        </Message>
      </>,
    );
    expect(host.querySelector("[data-ouro-message-attachments]")).toBeNull();
  });

  it("centers a system note over a wider footer", async () => {
    const { host, message } = await render(
      <Message role="system" name="Ouro" footer={<span style={{ display: "inline-block", width: 300, height: 20 }} />}>
        Ada joined
      </Message>,
    );
    const box = bubbleOf(message).getBoundingClientRect();
    const hostBox = host.getBoundingClientRect();
    expect(box.width).toBeLessThan(200);
    expect(Math.abs(box.left - hostBox.left - (hostBox.right - box.right))).toBeLessThan(2);
  });

  it("keeps a long chat message within 85% of the list's width", async () => {
    const { host, message } = await render(
      <Message variant="chat" role="assistant" name="Mara Quill">
        {"A long message that goes on and on. ".repeat(20)}
      </Message>,
    );
    expect(bubbleOf(message).getBoundingClientRect().width).toBeLessThanOrEqual(host.getBoundingClientRect().width * 0.85 + 1);
  });
});

describe("Message post", () => {
  it("is a card as wide as the list under the name and time, with the subject and footer inside it", async () => {
    const { host, message } = await render(
      <Message
        variant="post"
        role="user"
        name="Jonah Vale"
        time="7:30 AM"
        subject="Agenda for Friday"
        footer={<span>4 likes</span>}
        thread={<span>3 replies</span>}
        attachments={<Attachment name="agenda.pdf" />}
      >
        We start with onboarding.
      </Message>,
    );
    const card = message.querySelector<HTMLElement>("[data-ouro-message-card]")!;
    expect(card.getAttribute("data-ouro-message-card")).toBe("");
    const hostBox = host.getBoundingClientRect();
    // The user's own post sits at the start too, with their name shown.
    expect(visible(message.querySelector("[data-ouro-message-author]")!)).toBe(true);
    expect(message.querySelector('[data-ouro="avatar"]')).not.toBeNull();
    expect(card.getBoundingClientRect().right).toBeCloseTo(hostBox.right, 0);
    expect(getComputedStyle(card).backgroundColor).toBe(probeColor(host, "var(--card)"));
    const subject = card.querySelector<HTMLElement>("[data-ouro-message-subject]")!;
    expect(subject.textContent).toBe("Agenda for Friday");
    expect(getComputedStyle(subject).fontWeight).toBe("600");
    expect(bubbleOf(message).contains(subject)).toBe(true);
    const footer = card.querySelector<HTMLElement>("[data-ouro-message-footer]")!;
    expect(footer.textContent).toBe("4 likes");
    expect(footer.getAttribute("data-ouro-message-footer")).toBe("");
    // Reactions start at the card's start, under the text.
    expect(footer.firstElementChild!.getBoundingClientRect().left).toBeCloseTo(subject.getBoundingClientRect().left, 0);
    // Inside the card, the footer keeps 8px from the text.
    expect(footer.getBoundingClientRect().top - bubbleOf(message).getBoundingClientRect().bottom).toBeCloseTo(8, 0);
    // Reactions are not part of what MessageList reads out as the message.
    expect(bubbleOf(message).contains(footer)).toBe(false);
    const thread = message.querySelector<HTMLElement>("[data-ouro-message-thread]")!;
    expect(card.contains(thread)).toBe(false);
    expect(thread.getBoundingClientRect().top).toBeGreaterThanOrEqual(card.getBoundingClientRect().bottom);
  });

  it("shows no subject line without one, and no card footer without a footer", async () => {
    const { host } = await render(
      <>
        <Message variant="post" role="assistant" name="Jonah Vale" subject={null}>
          Short post.
        </Message>
        <Message variant="post" role="assistant" name="Jonah Vale">
          Another.
        </Message>
      </>,
    );
    for (const message of host.querySelectorAll('[data-ouro="message"]')) {
      expect(message.querySelector("[data-ouro-message-subject]")).toBeNull();
      expect(message.querySelector("[data-ouro-message-footer]")).toBeNull();
    }
  });

  it("lays a reply out unboxed under its name and time, at the start for everyone", async () => {
    const { host } = await render(
      <>
        <Message variant="reply" role="assistant" name="Mara Quill" time="7:36 AM">
          Can we swap?
        </Message>
        <Message variant="reply" role="user" name="Priya Okafor" time="7:44 AM" footer={<span>Edited</span>}>
          Swapped.
        </Message>
      </>,
    );
    const [other, mine] = [...host.querySelectorAll<HTMLElement>('[data-ouro="message"]')];
    expect(getComputedStyle(bubbleOf(other!)).backgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect(visible(mine!.querySelector("[data-ouro-message-author]")!)).toBe(true);
    expect(bubbleOf(mine!).getBoundingClientRect().left).toBeCloseTo(bubbleOf(other!).getBoundingClientRect().left, 0);
    expect(mine!.querySelector("[data-ouro-message-footer]")!.textContent).toBe("Edited");
  });

  it("keeps its avatar and name when continued, since every post shows its author", async () => {
    const props = { variant: "post", role: "assistant", name: "Jonah Vale", continued: true, children: "Hi" } as const;
    const { message } = await render(<Message {...props} />);
    expect(message.hasAttribute("data-continued")).toBe(false);
    expect(message.querySelector('[data-ouro="avatar"]')).not.toBeNull();
  });
});

describe("Message name tag", () => {
  it("shows a quiet tag after the name in every layout, read after the name", async () => {
    const { host } = await render(
      <>
        {(["default", "chat", "post", "reply"] as const).map((variant) => (
          <Message key={variant} variant={variant} role="assistant" name="Halden" nameTag="AI agent" time="3:24 PM">
            I'll post the summary by 4:00.
          </Message>
        ))}
      </>,
    );
    const probe = document.createElement("span");
    probe.style.color = "var(--muted-foreground)";
    host.append(probe);
    const messages = [...host.querySelectorAll<HTMLElement>('[data-ouro="message"]')];
    expect(messages).toHaveLength(4);
    for (const message of messages) {
      const author = message.querySelector<HTMLElement>("[data-ouro-message-author]")!;
      const tag = message.querySelector<HTMLElement>("[data-ouro-message-name-tag]")!;
      const line = message.getAttribute("data-variant") ? headerOf(message) : author;
      // Read in order: the name, its tag, then the time.
      expect(line.textContent).toBe("Halden, AI agent, 3:24 PM");
      expect(tag.getBoundingClientRect().width).toBeGreaterThan(1);
      expect(getComputedStyle(tag).color).toBe(getComputedStyle(probe).color);
      expect(getComputedStyle(tag).fontWeight).toBe("400");
      expect(parseFloat(getComputedStyle(tag).fontSize)).toBeLessThanOrEqual(12);
      const name = document.createRange();
      name.selectNodeContents(author.firstChild!);
      expect(tag.getBoundingClientRect().left).toBeGreaterThan(name.getBoundingClientRect().right);
      expect(Math.abs(tag.getBoundingClientRect().bottom - name.getBoundingClientRect().bottom)).toBeLessThan(3);
    }
    probe.remove();
  });

  it("hides the tag with the name, and still reads it", async () => {
    const { host } = await render(
      <>
        <Message variant="chat" role="assistant" name="Halden" nameTag="AI agent">
          Hi
        </Message>
        <Message variant="chat" role="assistant" name="Halden" nameTag="AI agent" continued>
          Again
        </Message>
        <Message variant="chat" role="user" name="Priya Okafor" nameTag="Guest" time="3:29 PM">
          Thanks
        </Message>
        <Message role="assistant" name="Halden" nameTag="AI agent" continued>
          Again
        </Message>
      </>,
    );
    const [, continued, mine, plain] = [...host.querySelectorAll<HTMLElement>('[data-ouro="message"]')];
    // Hidden as screen-reader text is: the tag, or a box around it, clipped to a pixel.
    const clipped = (node: HTMLElement, message: HTMLElement) => {
      for (let at: HTMLElement | null = node; at && at !== message; at = at.parentElement) if (at.getBoundingClientRect().width <= 1) return true;
      return false;
    };
    for (const message of [continued!, mine!, plain!]) {
      const tag = message.querySelector<HTMLElement>("[data-ouro-message-name-tag]")!;
      expect(clipped(tag, message)).toBe(true);
      expect(tag.textContent).toMatch(/AI agent|Guest/);
    }
    expect(headerOf(mine!).textContent).toBe("Priya Okafor, Guest, 3:29 PM");
  });
});

describe("Message presence", () => {
  it("shows the author's presence on the avatar in every variant, and says it", async () => {
    const { host } = await render(
      <>
        {(["default", "chat", "post", "reply"] as const).map((variant) => (
          <Message key={variant} variant={variant} role="assistant" name="Theo Brandt" avatar={picture} presence="busy" presenceLabel="In a meeting">
            Hi
          </Message>
        ))}
        <Message role="user" name="Priya Okafor" presence="available" presenceLabel="Available">
          Hi
        </Message>
      </>,
    );
    const messages = [...host.querySelectorAll<HTMLElement>('[data-ouro="message"]')];
    expect(messages).toHaveLength(5);
    for (const message of messages) {
      const avatar = message.querySelector<HTMLElement>('[data-ouro="avatar"]')!;
      expect(avatar.querySelector("[data-ouro-avatar-presence]")).not.toBeNull();
      // Avatar's own words for a presence beside a written name: the presence alone.
      expect(avatar.getAttribute("role")).toBe("img");
      expect(avatar.getAttribute("aria-label")).toBe(message.getAttribute("data-role") === "user" ? "Available" : "In a meeting");
    }
    expect(messages[1]!.querySelector('[data-ouro="avatar"]')!.getAttribute("data-presence")).toBe("busy");
    await expect.element(page.getByRole("img", { name: "In a meeting" }).first()).toBeVisible();
  });

  it("shows no dot where there is no avatar", async () => {
    const { host } = await render(
      <>
        <Message variant="chat" role="assistant" name="Theo Brandt" continued presence="busy" presenceLabel="Busy">
          Hi
        </Message>
        <Message variant="chat" role="user" name="Priya Okafor" presence="available" presenceLabel="Available">
          Hi
        </Message>
        <Message role="assistant" name="Mara Quill" avatar={false} presence="away" presenceLabel="Away">
          Hi
        </Message>
        <Message role="assistant" name="Mara Quill" continued presence="away" presenceLabel="Away">
          Hi
        </Message>
      </>,
    );
    expect(host.querySelectorAll('[data-ouro="message"]')).toHaveLength(4);
    expect(host.querySelector("[data-ouro-avatar-presence]")).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  it("names the presence label when it is missing, and still speaks the presence", async () => {
    const props = { role: "assistant", name: "Theo Brandt", presence: "do-not-disturb", children: "Hi" } as unknown as MessageProps;
    const { message } = await render(<Message {...props} />);
    expect(message.querySelector('[data-ouro="avatar"]')!.getAttribute("aria-label")).toBe("do not disturb");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      '[ouro-ui] Message: presenceLabel is missing, so screen readers hear no presence. Fix: <Message presence="do-not-disturb" presenceLabel="Do not disturb">.',
    );
  });
});

const ReplyIcon = () => (
  <svg viewBox="0 0 24 24">
    <path d="M9 14 4 9l5-5" />
  </svg>
);

function actionsFor(log: string[], extra: Partial<MessageAction> = {}): MessageAction[] {
  return [
    { key: "like", label: "Like", icon: "👍", onClick: () => void log.push("like") },
    { key: "reply", label: "Reply", icon: <ReplyIcon />, onClick: () => void log.push("reply"), ...extra },
  ];
}
const menu = [{ label: "Copy link", onClick: () => {} }];
const barOf = (message: HTMLElement) => message.querySelector<HTMLElement>('[role="toolbar"]')!;


describe("Message actions", () => {
  it("names each action, runs it, and shows its label in a tooltip", async () => {
    const log: string[] = [];
    const { message } = await render(
      <Message variant="chat" role="assistant" name="Mara Quill" actions={actionsFor(log)}>
        Morning!
      </Message>,
    );
    const bar = barOf(message);
    expect(bar.getAttribute("aria-label")).toBe("Message actions");
    // The bar is not part of what MessageList reads out as the message.
    expect(bubbleOf(message).contains(bar)).toBe(false);
    const buttons = [...bar.querySelectorAll<HTMLElement>("button")];
    expect(buttons.map((button) => button.getAttribute("aria-label"))).toEqual(["Like", "Reply"]);
    expect(buttons.every((button) => button.dataset.ouroControl === "message" && button.dataset.ouroPart === "action")).toBe(true);
    expect(buttons[1]!.querySelector("svg")!.closest('[aria-hidden="true"]')).not.toBeNull();
    await userEvent.hover(bubbleOf(message));
    const [like, reply] = [...bar.querySelectorAll<HTMLElement>("button")];
    await userEvent.click(reply!);
    expect(log).toEqual(["reply"]);
    await userEvent.hover(like!);
    await expect.poll(() => document.querySelector<HTMLElement>('[data-ouro="tooltip"]')?.textContent).toBe("Like");
    await userEvent.unhover(document.body);
  });

  it("shows the bar on hover and while focus is in the message, and hides it otherwise", async () => {
    const { message } = await render(
      <>
        <button type="button">Before</button>
        <Message variant="chat" role="assistant" name="Mara Quill" actions={actionsFor([])}>
          Morning!
        </Message>
      </>,
    );
    const bar = barOf(message);
    expect(getComputedStyle(bar).opacity).toBe("0");
    await userEvent.hover(bubbleOf(message));
    await expect.poll(() => getComputedStyle(bar).opacity).toBe("1");
    await userEvent.unhover(document.body);
    await expect.poll(() => getComputedStyle(bar).opacity).toBe("0");
    await act(async () => page.getByRole("button", { name: "Before" }).element().focus());
    await pressTab();
    expect(document.activeElement!.getAttribute("aria-label")).toBe("Like");
    await expect.poll(() => getComputedStyle(bar).opacity).toBe("1");
  });

  it("is one Tab stop, and the arrow keys, Home and End move between its buttons", async () => {
    const { message } = await render(
      <>
        <button type="button">Before</button>
        <Message variant="chat" role="assistant" name="Mara Quill" actions={actionsFor([])} menu={menu}>
          Morning!
        </Message>
        <button type="button">After</button>
      </>,
    );
    const [like, reply, more] = [...barOf(message).querySelectorAll<HTMLElement>("button")];
    expect(more!.getAttribute("aria-label")).toBe("More actions");
    expect(more!.querySelectorAll("svg circle")).toHaveLength(3);
    expect([like, reply, more].map((button) => button!.tabIndex)).toEqual([0, -1, -1]);
    await act(async () => page.getByRole("button", { name: "Before" }).element().focus());
    await pressTab();
    expect(document.activeElement).toBe(like);
    await userEvent.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(reply);
    await userEvent.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(more);
    await userEvent.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(like);
    await userEvent.keyboard("{ArrowLeft}");
    expect(document.activeElement).toBe(more);
    await userEvent.keyboard("{Home}");
    expect(document.activeElement).toBe(like);
    await userEvent.keyboard("{End}");
    expect(document.activeElement).toBe(more);
    // Other keys do nothing, and the button last focused is the Tab stop.
    await userEvent.keyboard("x");
    expect(document.activeElement).toBe(more);
    expect([like, reply, more].map((button) => button!.tabIndex)).toEqual([-1, -1, 0]);
    await pressTab();
    expect(document.activeElement!.textContent).toBe("After");
  });

  it("moves the other way in a right-to-left page", async () => {
    const { host } = await render(
      <div dir="rtl">
        <Message variant="chat" role="assistant" name="Mara Quill" actions={actionsFor([])} menu={menu}>
          Morning!
        </Message>
      </div>,
    );
    const [like, reply, more] = [...host.querySelectorAll<HTMLElement>('[role="toolbar"] button')];
    await act(async () => like!.focus());
    await userEvent.keyboard("{ArrowLeft}");
    expect(document.activeElement).toBe(reply);
    await userEvent.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(like);
    await userEvent.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(more);
  });

  it("skips a disabled action, and moves the Tab stop off one that turns disabled", async () => {
    function Toggling() {
      const [off, setOff] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOff(true)}>
            Turn off
          </button>
          <Message variant="chat" role="assistant" name="Mara Quill" actions={actionsFor([], { disabled: off })}>
            Morning!
          </Message>
        </>
      );
    }
    const { host } = await render(<Toggling />);
    const bar = host.querySelector<HTMLElement>('[role="toolbar"]')!;
    const [like, reply] = [...bar.querySelectorAll<HTMLButtonElement>("button")];
    await act(async () => reply!.focus());
    expect(reply!.tabIndex).toBe(0);
    await userEvent.click(page.getByRole("button", { name: "Turn off" }));
    expect(reply!.disabled).toBe(true);
    expect(like!.tabIndex).toBe(0);
    await act(async () => like!.focus());
    await userEvent.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(like);
  });

  it("ignores keys and focus that are not on one of its buttons", async () => {
    const { message } = await render(
      <Message variant="chat" role="assistant" name="Mara Quill" actions={actionsFor([])}>
        Morning!
      </Message>,
    );
    const bar = barOf(message);
    const away = new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true });
    await act(async () => {
      bar.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
      bar.dispatchEvent(away);
    });
    expect(away.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(document.body);
    expect([...bar.querySelectorAll("button")].map((button) => button.tabIndex)).toEqual([0, -1]);
    // An arrow key on a button moves focus instead of scrolling the page.
    const [like, reply] = [...bar.querySelectorAll<HTMLElement>("button")];
    const arrow = new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true });
    await act(async () => void like!.dispatchEvent(arrow));
    expect(arrow.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(reply);
  });

  it("opens the menu from the last button, and keeps the bar while it is open", async () => {
    const copied = vi.fn();
    const { message } = await render(
      <Message
        variant="post"
        role="assistant"
        name="Jonah Vale"
        menu={[{ label: "Copy link", icon: <svg data-testid="link-icon" viewBox="0 0 16 16" />, onClick: copied }]}
        menuLabel="Plus d'actions"
        actionsLabel="Actions du message"
      >
        Agenda
      </Message>,
    );
    const bar = barOf(message);
    expect(bar.getAttribute("aria-label")).toBe("Actions du message");
    await userEvent.hover(bubbleOf(message));
    const more = bar.querySelector<HTMLElement>('[data-ouro-part="menu"]')!;
    expect(more.getAttribute("aria-label")).toBe("Plus d'actions");
    expect(more.tabIndex).toBe(0);
    await userEvent.click(more);
    await expect.element(page.getByRole("menuitem", { name: "Copy link", exact: true })).toBeVisible();
    // An entry's icon shows before its label, as in Menu.
    expect(page.getByRole("menuitem", { name: "Copy link" }).element().querySelector('[data-ouro-menu-icon] [data-testid="link-icon"]')).not.toBeNull();
    await userEvent.unhover(document.body);
    expect(bar.getAttribute("data-menu-open")).toBe("");
    expect(getComputedStyle(bar).opacity).toBe("1");
    await userEvent.click(page.getByRole("menuitem", { name: "Copy link" }));
    expect(copied).toHaveBeenCalledTimes(1);
    await expect.poll(() => bar.hasAttribute("data-menu-open")).toBe(false);
  });

  it("moves the Tab stop back to the first action when the menu goes, and shows no menu button for an empty menu", async () => {
    const node = (entries: typeof menu) => (
      <Message variant="chat" role="assistant" name="Mara Quill" actions={actionsFor([])} menu={entries}>
        Morning!
      </Message>
    );
    const { message, rerender } = await render(node(menu));
    const more = barOf(message).querySelector<HTMLElement>('[data-ouro-part="menu"]')!;
    await act(async () => more.focus());
    expect(more.tabIndex).toBe(0);
    await rerender(node([]));
    expect(barOf(message).querySelector('[data-ouro-part="menu"]')).toBeNull();
    expect([...barOf(message).querySelectorAll("button")].map((button) => button.tabIndex)).toEqual([0, -1]);
  });

  it("opens the menu from its plain button, once Menu arrives", async () => {
    const { message } = await render(
      <Message variant="chat" role="assistant" name="Mara Quill" menu={menu}>
        Morning!
      </Message>,
    );
    // A click alone, with no pointer over the message first, as assistive technology sends it.
    await act(async () => barOf(message).querySelector<HTMLElement>('[data-ouro-part="menu"]')!.click());
    await expect.element(page.getByRole("menuitem", { name: "Copy link" })).toBeVisible();
    expect(barOf(message).getAttribute("data-menu-open")).toBe("");
  });

  it("hands focus from the plain menu button to Menu's, which takes it back when the menu closes", async () => {
    const { message } = await render(
      <Message variant="chat" role="assistant" name="Mara Quill" actions={actionsFor([])} menu={menu}>
        Morning!
      </Message>,
    );
    const plain = barOf(message).querySelector<HTMLElement>('[data-ouro-part="menu"]')!;
    // Until Menu arrives, the plain button says what it opens, as Menu's trigger does.
    expect(plain.getAttribute("aria-haspopup")).toBe("menu");
    expect(plain.getAttribute("aria-expanded")).toBe("false");
    await act(async () => plain.focus());
    await userEvent.keyboard("{Enter}");
    await expect.element(page.getByRole("menuitem", { name: "Copy link" })).toBeVisible();
    expect(plain.isConnected).toBe(false);
    await userEvent.keyboard("{Escape}");
    await expect.poll(() => document.activeElement?.getAttribute("data-ouro-part")).toBe("menu");
    const trigger = document.activeElement as HTMLElement;
    expect(barOf(message).contains(trigger)).toBe(true);
    // Menu's trigger keeps the bar's one Tab stop.
    const like = barOf(message).querySelector<HTMLElement>('[data-ouro-message-action="like"]')!;
    expect([like.tabIndex, trigger.tabIndex]).toEqual([-1, 0]);
    await userEvent.keyboard("{Home}");
    expect(document.activeElement).toBe(like);
    expect([like.tabIndex, trigger.tabIndex]).toEqual([0, -1]);
  });

  it("adds the bar when a message gains actions", async () => {
    const node = (actions?: MessageAction[]) => (
      <Message variant="chat" role="assistant" name="Mara Quill" actions={actions}>
        Morning!
      </Message>
    );
    const { message, rerender } = await render(node());
    expect(message.querySelector('[role="toolbar"]')).toBeNull();
    await rerender(node(actionsFor([])));
    await expect.poll(() => message.querySelector('[role="toolbar"]')).not.toBeNull();
  });

  it("has no bar without actions or menu entries", async () => {
    const { message } = await render(
      <Message variant="chat" role="assistant" name="Mara Quill" actions={[]} menu={[]}>
        Morning!
      </Message>,
    );
    expect(message.querySelector('[role="toolbar"]')).toBeNull();
  });

  it("puts the bar at the start of the user's own chat message, and adds it to the default layout", async () => {
    const { host } = await render(
      <>
        <Message variant="chat" role="user" name="Priya Okafor" actions={actionsFor([])}>
          Mine
        </Message>
        <Message role="user" name="Ada" actions={actionsFor([])}>
          Default
        </Message>
        <Message role="assistant" name="Ouro" actions={actionsFor([])}>
          Default
        </Message>
      </>,
    );
    const [mine, user, assistant] = [...host.querySelectorAll<HTMLElement>('[data-ouro="message"]')];
    const box = (element: Element) => element.getBoundingClientRect();
    expect(box(barOf(mine!)).left).toBeCloseTo(box(bubbleOf(mine!)).left + 8, 0);
    expect(box(bubbleOf(user!)).right).toBeGreaterThan(box(host).right - 60);
    // Elsewhere it sits at the bubble's end corner, 32px above it.
    for (const message of [user!, assistant!]) {
      expect(box(barOf(message)).right).toBeCloseTo(box(bubbleOf(message)).right - 8, 0);
      expect(box(barOf(message)).top).toBeCloseTo(box(bubbleOf(message)).top - 32, 0);
    }
  });

  it("puts the bar at the end corner of others' chat messages, and over a post card's corner", async () => {
    const { host } = await render(
      <>
        <Message variant="chat" role="assistant" name="Mara Quill" actions={actionsFor([])}>
          Theirs
        </Message>
        <Message variant="post" role="user" name="Priya Okafor" actions={actionsFor([])}>
          My post
        </Message>
        <Message variant="reply" role="user" name="Priya Okafor" actions={actionsFor([])}>
          My reply
        </Message>
      </>,
    );
    const [chat, post, reply] = [...host.querySelectorAll<HTMLElement>('[data-ouro="message"]')];
    const box = (element: Element) => element.getBoundingClientRect();
    expect(box(barOf(chat!)).right).toBeCloseTo(box(bubbleOf(chat!)).right - 8, 0);
    expect(box(barOf(chat!)).top).toBeCloseTo(box(bubbleOf(chat!)).top - 32, 0);
    const card = post!.querySelector("[data-ouro-message-card]")!;
    expect(box(barOf(post!)).right).toBeCloseTo(box(card).right - 8, 0);
    expect(box(barOf(post!)).top).toBeCloseTo(box(card).top - 20, 0);
    expect(box(barOf(reply!)).right).toBeCloseTo(box(bubbleOf(reply!)).right - 8, 0);
  });

  it("shows the bar after a tap on a touch screen, until a press lands outside the message", async () => {
    const onPointerUp = vi.fn();
    const { host, message } = await render(
      <>
        <Message variant="chat" role="assistant" name="Mara Quill" actions={actionsFor([])} onPointerUp={onPointerUp}>
          Morning! <a href="#venue">Venue</a>
        </Message>
        <p>Elsewhere</p>
      </>,
    );
    const tap = (target: Element, type = "pointerup", pointerType = "touch") =>
      act(async () => void target.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerType })));
    // A mouse press, or a tap on a link inside, does not.
    await tap(bubbleOf(message), "pointerup", "mouse");
    await tap(message.querySelector("a")!);
    expect(message.hasAttribute("data-ouro-message-active")).toBe(false);
    expect(onPointerUp).toHaveBeenCalledTimes(2);
    await tap(bubbleOf(message));
    expect(message.getAttribute("data-ouro-message-active")).toBe("");
    await expect.poll(() => getComputedStyle(barOf(message)).opacity).toBe("1");
    // A press inside keeps it; one outside hides it.
    await tap(bubbleOf(message), "pointerdown");
    expect(message.hasAttribute("data-ouro-message-active")).toBe(true);
    const removed = vi.spyOn(document, "removeEventListener");
    await tap(host.querySelector("p")!, "pointerdown");
    expect(message.hasAttribute("data-ouro-message-active")).toBe(false);
    // It stops listening once hidden.
    expect(removed).toHaveBeenCalledWith("pointerdown", expect.any(Function));
  });

  it("shows the default layout's bar after a tap too", async () => {
    const { message } = await render(
      <Message role="assistant" name="Ouro" actions={actionsFor([])}>
        Hi
      </Message>,
    );
    await act(async () => void bubbleOf(message).dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerType: "touch" })));
    expect(message.getAttribute("data-ouro-message-active")).toBe("");
  });

  it.each(["default", "chat"] as const)("draws a rounded focus ring on a %s message that takes keyboard focus, as one in a MessageList does", async (variant) => {
    const { host } = await render(
      <>
        <button type="button">Before</button>
        <Message variant={variant} role="assistant" name="Mara Quill" tabIndex={0}>
          Morning!
        </Message>
      </>,
    );
    const message = host.querySelector<HTMLElement>('[data-ouro="message"]')!;
    host.querySelector("button")!.focus();
    await pressTab();
    expect(document.activeElement).toBe(message);
    const style = getComputedStyle(message);
    expect([style.outlineStyle, style.outlineWidth, style.outlineOffset]).toEqual(["solid", "2px", "2px"]);
    const ring = document.createElement("span");
    ring.style.color = "var(--ring)";
    host.append(ring);
    expect(style.outlineColor).toBe(getComputedStyle(ring).color);
    expect(style.borderTopLeftRadius).not.toBe("0px");
  });

  it("shows the bar after a tap on a message that takes focus itself, as one in a MessageList does", async () => {
    const { message } = await render(
      <Message variant="chat" role="assistant" name="Mara Quill" tabIndex={-1} actions={actionsFor([])}>
        Morning!
      </Message>,
    );
    await act(async () => void bubbleOf(message).dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerType: "touch" })));
    expect(message.getAttribute("data-ouro-message-active")).toBe("");
  });

  it("ignores taps on a message with no actions", async () => {
    const { message } = await render(
      <Message variant="chat" role="assistant" name="Mara Quill">
        Morning!
      </Message>,
    );
    await act(async () => void bubbleOf(message).dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerType: "touch" })));
    expect(message.hasAttribute("data-ouro-message-active")).toBe(false);
  });

  it("forwards an object ref, and a function ref, to the article", async () => {
    const ref = createRef<HTMLElement>();
    const { message, rerender } = await render(
      <Message variant="chat" role="assistant" name="Mara Quill" ref={ref}>
        Hi
      </Message>,
    );
    expect(ref.current).toBe(message);
    let element: HTMLElement | null = null;
    await rerender(
      <Message variant="chat" role="assistant" name="Mara Quill" ref={(node) => void (element = node)}>
        Hi
      </Message>,
    );
    expect(element).toBe(message);
  });

  it("renders a message with actions in server HTML without its bar, hydrates without a warning, then adds the bar", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const node = (
      <Message variant="post" role="assistant" name="Jonah Vale" time="7:30 AM" subject="Agenda" actions={actionsFor([])} menu={menu} footer={<span>Edited</span>}>
        Hello
      </Message>
    );
    const html = renderToString(node);
    expect(html).not.toContain('role="toolbar"');
    expect(html).toContain("Agenda");
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
    await barCode();
    expect(host.querySelector('[role="toolbar"]')).not.toBeNull();
    expect(recoverable).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
});
