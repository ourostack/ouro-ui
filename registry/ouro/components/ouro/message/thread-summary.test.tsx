import { type ReactNode } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { ThreadSummary, type ThreadSummaryProps } from "@/registry/ouro/components/ouro/message/thread-summary";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

const roots: Root[] = [];
let mounted: Element[] = [];

async function render(node: ReactNode) {
  const host = document.createElement("div");
  host.style.width = "480px";
  document.body.append(host);
  mounted.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
  return {
    host,
    rerender: (next: ReactNode) => act(async () => root.render(next)),
    get summary() {
      return host.querySelector<HTMLElement>('[data-ouro="thread-summary"]')!;
    },
  };
}

// An inline picture: a path such as "/theo.png" would ask an app's dev server for its index page.
const picture = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR4AWP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==";
const repliers = [{ name: "Mara Quill" }, { name: "Theo Brandt", src: picture }, { name: "Priya Okafor" }, { name: "Jonah Vale" }];

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

describe("ThreadSummary", () => {
  it("shows who replied, a button with the count that opens the thread, and the last reply's time", async () => {
    const onOpen = vi.fn();
    const { summary } = await render(<ThreadSummary count={4} repliers={repliers} lastReply="7:44 AM" lastReplyDateTime="2026-05-04T07:44" onOpen={onOpen} />);
    const group = page.getByRole("group", { name: "Replied" });
    await expect.element(group).toBeVisible();
    // The first three faces, then a count for the rest.
    expect(summary.querySelectorAll('[data-ouro="avatar"]')).toHaveLength(3);
    expect(group.element().textContent).toContain("+1");
    const button = page.getByRole("button", { name: "4 replies" });
    await userEvent.click(button);
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen.mock.calls[0]![0].isTrusted).toBe(true);
    expect(button.element().getAttribute("data-ouro-control")).toBe("thread-summary");
    const time = summary.querySelector("time")!;
    expect(time.textContent).toBe("Last reply 7:44 AM");
    expect(time.getAttribute("dateTime")).toBe("2026-05-04T07:44");
    // In reading order: faces, then the button, then the time.
    expect(group.element().compareDocumentPosition(button.element()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(button.element().compareDocumentPosition(time) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("says one reply in the singular, and leaves out what it was not given", async () => {
    const { summary } = await render(<ThreadSummary count={1} onOpen={() => {}} />);
    await expect.element(page.getByRole("button", { name: "1 reply", exact: true })).toBeVisible();
    expect(summary.querySelector('[role="group"]')).toBeNull();
    expect(summary.querySelector("time")).toBeNull();
    const { summary: empty } = await render(<ThreadSummary count={2} repliers={[]} onOpen={() => {}} />);
    expect(empty.querySelector('[role="group"]')).toBeNull();
  });

  it("is a single Reply button with no replies yet", async () => {
    const onOpen = vi.fn();
    const { summary } = await render(<ThreadSummary count={0} repliers={repliers} lastReply="7:44 AM" onOpen={onOpen} />);
    const button = page.getByRole("button", { name: "Reply", exact: true });
    expect(summary.querySelector('[role="group"]')).toBeNull();
    expect(summary.querySelector("time")).toBeNull();
    expect(button.element().querySelector("svg")!.getAttribute("aria-hidden")).toBe("true");
    await userEvent.click(button);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("takes other words for every label", async () => {
    await render(
      <ThreadSummary
        count={3}
        repliers={repliers.slice(0, 1)}
        lastReply="07:44"
        onOpen={() => {}}
        repliesLabel={(count) => `${count} réponses`}
        lastReplyLabel={(time) => `Dernière réponse à ${time}`}
        repliersLabel="Ont répondu"
      />,
    );
    await expect.element(page.getByRole("button", { name: "3 réponses" })).toBeVisible();
    await expect.element(page.getByRole("group", { name: "Ont répondu" })).toBeVisible();
    await expect.element(page.getByText("Dernière réponse à 07:44")).toBeVisible();
    await render(<ThreadSummary count={0} onOpen={() => {}} replyLabel="Répondre" />);
    await expect.element(page.getByRole("button", { name: "Répondre" })).toBeVisible();
  });

  it("lines the Reply label up with the text above it, and puts the count just after the faces", async () => {
    const { summary, rerender } = await render(
      <div style={{ paddingInlineStart: 40 }}>
        <ThreadSummary count={0} onOpen={() => {}} />
      </div>,
    );
    const label = () => summary.querySelector("button")!;
    const start = summary.getBoundingClientRect().left;
    const icon = label().querySelector("svg")!.getBoundingClientRect().left;
    // The icon's own optical inset is a pixel or so.
    expect(Math.abs(icon - start)).toBeLessThan(2);
    await rerender(
      <div style={{ paddingInlineStart: 40 }}>
        <ThreadSummary count={2} repliers={repliers.slice(0, 2)} onOpen={() => {}} />
      </div>,
    );
    const faces = summary.querySelector('[role="group"]')!.getBoundingClientRect().right;
    expect(label().getBoundingClientRect().left - faces).toBeLessThan(8);
  });

  it("renders in server HTML and hydrates without a warning", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const node = <ThreadSummary count={2} repliers={repliers} lastReply="7:44 AM" onOpen={() => {}} />;
    const html = renderToString(node);
    expect(html).toContain("2 replies");
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
    let element: HTMLDivElement | null = null;
    const { summary } = await render(<ThreadSummary count={1} onOpen={() => {}} className="mt-4" ref={(node) => void (element = node)} />);
    expect(element).toBe(summary);
    expect(getComputedStyle(summary).marginTop).toBe("16px");
  });
});

describe("ThreadSummary development messages", () => {
  it("warns of nothing when the props are right", async () => {
    await render(<ThreadSummary count={2} repliers={repliers} lastReply="7:44 AM" onOpen={() => {}} />);
    expect(warn).not.toHaveBeenCalled();
  });

  it.each([
    ["missing onOpen", { onOpen: undefined }, "onOpen is missing, so the button opens nothing", "<ThreadSummary count={2} onOpen={openThread}>"],
    ["onClick", { onClick: () => {} }, "onClick is not a prop", "<ThreadSummary count={2} onOpen={openThread}>"],
    ["replyCount", { replyCount: 2 }, "replyCount is not a prop", "<ThreadSummary count={replies.length}>"],
  ])("names the fix for %s", async (_name, extra, problem, fix) => {
    const props = { count: 2, onOpen: () => {}, ...extra } as unknown as ThreadSummaryProps;
    const { summary } = await render(<ThreadSummary {...props} />);
    expect(warn).toHaveBeenCalledWith(`[ouro-ui] ThreadSummary: ${problem}. Fix: ${fix}.`);
    expect(summary.hasAttribute("replycount")).toBe(false);
    // A press without onOpen does nothing, and does not throw.
    await userEvent.click(summary.querySelector("button")!);
  });

  it("checks the className", async () => {
    await render(<ThreadSummary count={2} onOpen={() => {}} className="text-red-500" />);
    expect(warn).toHaveBeenCalledWith(
      '[ouro-ui] ThreadSummary: "text-red-500" sets appearance, and className is for layout only. Fix: remove "text-red-500"; ThreadSummary takes its colors from the theme.',
    );
  });
});
