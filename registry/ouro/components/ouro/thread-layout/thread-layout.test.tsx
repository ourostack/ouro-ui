import { type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThreadLayout, type ThreadLayoutProps } from "@/registry/ouro/components/ouro/thread-layout/thread-layout";
import { ThreadRail } from "@/registry/ouro/components/ouro/thread-rail/thread-rail";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

const roots: Root[] = [];
let mounted: Element[] = [];

async function render(node: ReactNode, width = 640) {
  const host = document.createElement("div");
  host.style.width = `${width}px`;
  document.body.append(host);
  mounted.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
  return {
    host,
    rerender: (next: ReactNode) => act(async () => root.render(next)),
    get layout() {
      return host.querySelector<HTMLElement>('[data-ouro="thread-layout"]')!;
    },
    get conversation() {
      return host.querySelector<HTMLElement>("[data-test-conversation]")!.parentElement!.parentElement!;
    },
    get rail() {
      return host.querySelector<HTMLElement>('[data-ouro="thread-rail"]');
    },
  };
}

/** The conversation's list and reply box, which every test here mounts. */
function Conversation() {
  return (
    <div data-test-conversation="">
      <p>Design reviews</p>
      <textarea aria-label="Draft" />
    </div>
  );
}

/** A thread open beside the conversation, without taking focus, so a test keeps its focus where it put it. */
function Thread() {
  return (
    <ThreadRail label="Thread" title="Replies" autoFocus={false} onClose={() => {}}>
      <p>Meet at eight.</p>
    </ThreadRail>
  );
}

const rem = () => parseFloat(getComputedStyle(document.documentElement).fontSize);

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

describe("ThreadLayout", () => {
  it("is marked with data-ouro and draws no control of its own", async () => {
    const { layout } = await render(<ThreadLayout conversation={<p>Replies</p>} thread={null} />);
    expect(layout.getAttribute("data-ouro")).toBe("thread-layout");
    expect(layout.hasAttribute("data-ouro-control")).toBe(false);
    expect(layout.querySelector("[data-ouro-control]")).toBeNull();
  });

  it("puts the conversation and the rail side by side from 32rem up, the rail at 20rem", async () => {
    const { conversation, rail } = await render(<ThreadLayout conversation={<Conversation />} thread={<Thread />} />, 640);
    expect(getComputedStyle(conversation).display).not.toBe("none");
    expect(rail).not.toBeNull();
    const railBox = rail!.getBoundingClientRect();
    expect(railBox.width).toBeCloseTo(20 * rem(), 0);
    expect(conversation.getBoundingClientRect().right).toBeCloseTo(railBox.left, 0);
    expect(conversation.getBoundingClientRect().width).toBeCloseTo(640 - 20 * rem(), 0);
  });

  it("gives the conversation and the rail the box's height, so each fills it", async () => {
    const { host, layout, conversation, rail } = await render(<ThreadLayout conversation={<Conversation />} thread={<Thread />} />, 640);
    host.style.height = "300px";
    await expect.poll(() => rail!.getBoundingClientRect().height).toBeCloseTo(300, 0);
    expect(layout.getBoundingClientRect().height).toBeCloseTo(300, 0);
    expect(conversation.getBoundingClientRect().height).toBeCloseTo(300, 0);
  });

  it("gives the rail the whole box below 32rem, and hides the conversation", async () => {
    const { conversation, rail } = await render(<ThreadLayout conversation={<Conversation />} thread={<Thread />} />, 360);
    expect(getComputedStyle(conversation).display).toBe("none");
    expect(rail!.getBoundingClientRect().width).toBeCloseTo(360, 0);
    expect(rail!.getBoundingClientRect().left).toBeCloseTo(conversation.getBoundingClientRect().left, 0);
  });

  it("keeps the conversation mounted and its draft while a narrow box hides it", async () => {
    const { host, conversation, rerender } = await render(<ThreadLayout conversation={<Conversation />} thread={<Thread />} />, 640);
    const draft = host.querySelector("textarea")!;
    draft.value = "Hold this thought";
    host.style.width = "360px";
    await expect.poll(() => getComputedStyle(conversation).display).toBe("none");
    expect(host.querySelector("textarea")).toBe(draft);
    expect(draft.value).toBe("Hold this thought");
    host.style.width = "640px";
    await expect.poll(() => getComputedStyle(conversation).display).not.toBe("none");
    expect(host.querySelector("textarea")).toBe(draft);
    await rerender(<ThreadLayout conversation={<Conversation />} thread={null} />);
    expect(host.querySelector("textarea")).toBe(draft);
    expect(draft.value).toBe("Hold this thought");
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["false", false],
  ])("shows the conversation alone at any width when thread is %s", async (_name, thread) => {
    const { conversation, rail } = await render(<ThreadLayout conversation={<Conversation />} thread={thread} />, 360);
    expect(getComputedStyle(conversation).display).not.toBe("none");
    expect(conversation.getBoundingClientRect().width).toBeCloseTo(360, 0);
    expect(rail).toBeNull();
  });

  it("keeps the conversation's element when a thread opens and closes", async () => {
    const { host, rerender } = await render(<ThreadLayout conversation={<Conversation />} thread={null} />, 640);
    const before = host.querySelector("textarea");
    await rerender(<ThreadLayout conversation={<Conversation />} thread={<Thread />} />);
    expect(host.querySelector("textarea")).toBe(before);
    await rerender(<ThreadLayout conversation={<Conversation />} thread={null} />);
    expect(host.querySelector("textarea")).toBe(before);
  });

  it("takes the app's className last, so its height wins", async () => {
    const { layout } = await render(<ThreadLayout conversation={<Conversation />} thread={<Thread />} className="h-[200px]" />);
    expect(layout.getBoundingClientRect().height).toBeCloseTo(200, 0);
  });
});

describe("ThreadLayout dev messages", () => {
  it("warns, quoting the class, when className sets appearance", async () => {
    await render(<ThreadLayout conversation={<Conversation />} className="bg-red-500" />);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toBe(
      '[ouro-ui] ThreadLayout: "bg-red-500" sets appearance, and className is for layout only. Fix: remove "bg-red-500"; the theme sets the colors of the panes ThreadLayout holds.',
    );
  });

  it("warns that rail is not a prop, with the fix", async () => {
    const guessed = { conversation: <Conversation />, rail: <Thread /> } as unknown as ThreadLayoutProps;
    await render(<ThreadLayout {...guessed} />);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toBe(
      '[ouro-ui] ThreadLayout: rail is not a prop; the thread takes its place. Fix: <ThreadLayout conversation={list} thread={open ? <ThreadRail label="Thread" onClose={close} /> : null} />.',
    );
  });

  it("does not warn for a layout className or for a thread", async () => {
    await render(<ThreadLayout conversation={<Conversation />} thread={<Thread />} className="w-full max-w-3xl" />);
    expect(warn).not.toHaveBeenCalled();
  });
});
