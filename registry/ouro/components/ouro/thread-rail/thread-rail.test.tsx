import { useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { ThreadRail, type ThreadRailProps } from "@/registry/ouro/components/ouro/thread-rail/thread-rail";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { pressTab } from "@/registry/ouro/lib/ouro/testing/tab";

const roots: Root[] = [];
let mounted: Element[] = [];

async function render(node: ReactNode) {
  const host = document.createElement("div");
  host.style.width = "360px";
  document.body.append(host);
  mounted.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
  return {
    host,
    rerender: (next: ReactNode) => act(async () => root.render(next)),
    get rail() {
      return host.querySelector<HTMLElement>('[data-ouro="thread-rail"]')!;
    },
    get close() {
      return host.querySelector<HTMLButtonElement>('[data-ouro-part="close"]')!;
    },
  };
}

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

const noop = () => {};

/** A button that opens the rail, another control elsewhere on the page, and the rail while `open`. */
function Frame({
  open,
  onOpen = noop,
  onClose = noop,
  returnFocus,
}: {
  open: boolean;
  onOpen?: () => void;
  onClose?: () => void;
  returnFocus?: RefObject<HTMLElement | null> | undefined;
}) {
  return (
    <>
      <button type="button" data-test-back="">
        Back
      </button>
      <button type="button" data-test-harness="" onClick={onOpen}>
        Show thread
      </button>
      <button type="button" data-test-elsewhere="">
        Elsewhere
      </button>
      {open && (
        <ThreadRail label="Thread" title="Replies" returnFocus={returnFocus} onClose={onClose}>
          <Button variant="plain">Reply</Button>
        </ThreadRail>
      )}
    </>
  );
}

/** Frame with its own open state: the rail closes when it asks to. */
function Stateful({ returnFocus }: { returnFocus?: RefObject<HTMLElement | null> | undefined }) {
  const [open, setOpen] = useState(false);
  return <Frame open={open} onOpen={() => setOpen(true)} onClose={() => setOpen(false)} returnFocus={returnFocus} />;
}

describe("ThreadRail", () => {
  it("is a complementary landmark named by its title", async () => {
    await render(
      <ThreadRail label="Thread" title="Ana's replies" onClose={noop}>
        <p>Replies</p>
      </ThreadRail>,
    );
    await expect.element(page.getByRole("complementary", { name: "Ana's replies" })).toBeVisible();
  });

  it("is named by its label when it has no title, and its heading shows the label", async () => {
    const { rail } = await render(<ThreadRail label="Thread" onClose={noop} />);
    await expect.element(page.getByRole("complementary", { name: "Thread" })).toBeVisible();
    expect(rail.querySelector("h2")?.textContent).toBe("Thread");
    expect(rail.tabIndex).toBe(-1);
  });

  it("shows the detail and meta under the heading, and leaves out what is not given", async () => {
    const { rail } = await render(<ThreadRail label="Thread" title="Replies" detail="Design reviews" meta="2 replies" onClose={noop} />);
    const header = rail.querySelector<HTMLElement>("[data-ouro-thread-rail-header]")!;
    expect(header.textContent).toContain("Design reviews");
    expect(header.textContent).toContain("2 replies");
    const bare = await render(<ThreadRail label="Thread" onClose={noop} />);
    expect(bare.rail.querySelectorAll("p")).toHaveLength(0);
  });

  it("names the close button Close thread, with its shortcut, and shows the name on keyboard focus", async () => {
    const { close } = await render(<ThreadRail label="Thread" onClose={noop} />);
    expect(close.getAttribute("aria-label")).toBe("Close thread");
    expect(close.getAttribute("aria-keyshortcuts")).toBe("Escape");
    await pressTab();
    expect(document.activeElement).toBe(close);
    await expect.poll(() => document.querySelector('[data-ouro="tooltip"]')?.textContent).toContain("Close thread");
    expect(document.querySelector('[data-ouro="tooltip"] kbd')?.textContent).toContain("Esc");
  });

  it("names the close button by closeLabel, and draws a cross in it", async () => {
    const { close } = await render(<ThreadRail label="Thread" closeLabel="Hide replies" onClose={noop} />);
    expect(close.getAttribute("aria-label")).toBe("Hide replies");
    expect(close.querySelector("svg")).not.toBeNull();
  });

  it("calls onClose when the close button is pressed", async () => {
    const onClose = vi.fn();
    const { close } = await render(<ThreadRail label="Thread" onClose={onClose} />);
    await userEvent.click(close);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("ThreadRail Escape", () => {
  it("calls onClose on Escape with focus in the rail, and ignores other keys", async () => {
    const onClose = vi.fn();
    await render(
      <ThreadRail label="Thread" onClose={onClose}>
        <button type="button">Reply</button>
      </ThreadRail>,
    );
    await userEvent.keyboard("a");
    expect(onClose).not.toHaveBeenCalled();
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("lets the close button's tooltip take the first Escape, then closes on the next", async () => {
    const onClose = vi.fn();
    const { close } = await render(<ThreadRail label="Thread" onClose={onClose} />);
    await pressTab();
    await expect.poll(() => document.querySelector('[data-ouro="tooltip"]')).not.toBeNull();
    await userEvent.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(close);
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["an input", <input key="x" aria-label="Reply" />],
    ["a textarea", <textarea key="x" aria-label="Draft" />],
    [
      "a select",
      <select key="x" aria-label="Pick">
        <option>One</option>
      </select>,
    ],
    ["editable text", <div key="x" contentEditable suppressContentEditableWarning aria-label="Editable" />],
  ])("does not close on Escape typed into %s inside the rail", async (_name, field) => {
    const onClose = vi.fn();
    const { rail } = await render(<ThreadRail label="Thread" onClose={onClose}>{field}</ThreadRail>);
    rail.querySelector<HTMLElement>("input, textarea, select, [contenteditable]")!.focus();
    await userEvent.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
  });

  it.each(["menu", "listbox", "dialog"])("does not close on Escape inside a %s in the rail", async (role) => {
    const onClose = vi.fn();
    const { rail } = await render(
      <ThreadRail label="Thread" onClose={onClose}>
        <div role={role} aria-label="Options">
          <button type="button">Item</button>
        </div>
      </ThreadRail>,
    );
    rail.querySelector<HTMLElement>("button")!.focus();
    await userEvent.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("does not close on Escape from a menu drawn in a portal outside the rail", async () => {
    const onClose = vi.fn();
    const { rail } = await render(
      <ThreadRail label="Thread" onClose={onClose}>
        <p>Replies</p>
        {createPortal(
          <div role="menu" aria-label="Actions">
            <button type="button">Copy</button>
          </div>,
          document.body,
        )}
      </ThreadRail>,
    );
    expect(rail.contains(document.querySelector('[role="menu"]'))).toBe(false);
    document.querySelector<HTMLElement>('[role="menu"] button')!.focus();
    await userEvent.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes on Escape from a control drawn in a portal, which is not a popup", async () => {
    const onClose = vi.fn();
    await render(
      <ThreadRail label="Thread" onClose={onClose}>
        {createPortal(<button type="button">Copy</button>, document.body)}
      </ThreadRail>,
    );
    document.querySelector<HTMLElement>("body > button")!.focus();
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape when the rail sits inside a dialog", async () => {
    const onClose = vi.fn();
    const { rail } = await render(
      <div role="dialog" aria-label="Page">
        <ThreadRail label="Thread" onClose={onClose} />
      </div>,
    );
    rail.focus();
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("prevents the default action of the Escape it handles", async () => {
    const onClose = vi.fn();
    const { rail } = await render(<ThreadRail label="Thread" onClose={onClose} />);
    const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    rail.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not close on Escape that a control inside the rail already handled", async () => {
    const onClose = vi.fn();
    const { rail } = await render(
      <ThreadRail label="Thread" onClose={onClose}>
        <button type="button" onKeyDown={(event) => event.key === "Escape" && event.preventDefault()}>
          Cancel
        </button>
      </ThreadRail>,
    );
    rail.querySelector<HTMLElement>("button")!.focus();
    await userEvent.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("ThreadRail focus", () => {
  it("takes focus on mount, on the rail itself or on initialFocus", async () => {
    const { rail } = await render(<ThreadRail label="Thread" onClose={noop} />);
    expect(document.activeElement).toBe(rail);
    const reply: RefObject<HTMLInputElement | null> = { current: null };
    const { rail: withInitial } = await render(
      <ThreadRail label="Thread" initialFocus={reply} onClose={noop}>
        <input aria-label="Reply" ref={(element) => void (reply.current = element)} />
      </ThreadRail>,
    );
    expect(document.activeElement).toBe(withInitial.querySelector("input"));
  });

  it("leaves focus where it is with autoFocus false", async () => {
    const { host, rerender } = await render(<button type="button" data-test-harness="">Show thread</button>);
    host.querySelector<HTMLElement>("[data-test-harness]")!.focus();
    await rerender(
      <>
        <button type="button" data-test-harness="">
          Show thread
        </button>
        <ThreadRail label="Thread" autoFocus={false} onClose={noop} />
      </>,
    );
    expect(document.activeElement).toBe(host.querySelector("[data-test-harness]"));
  });

  it("returns focus to the control that opened it when it closes", async () => {
    const { host } = await render(<Stateful />);
    host.querySelector<HTMLButtonElement>("[data-test-harness]")!.focus();
    await userEvent.keyboard("{Enter}");
    expect(document.activeElement?.closest('[data-ouro="thread-rail"]')).not.toBeNull();
    await userEvent.keyboard("{Escape}");
    expect(host.querySelector('[data-ouro="thread-rail"]')).toBeNull();
    expect(document.activeElement).toBe(host.querySelector("[data-test-harness]"));
  });

  it("returns focus to returnFocus when it is given", async () => {
    const back: RefObject<HTMLElement | null> = { current: null };
    const { host } = await render(<Stateful returnFocus={back} />);
    back.current = host.querySelector<HTMLElement>("[data-test-back]");
    host.querySelector<HTMLButtonElement>("[data-test-harness]")!.focus();
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard("{Escape}");
    expect(document.activeElement).toBe(back.current);
  });

  it("leaves focus where it went when focus moved out of the rail first", async () => {
    const { host, rerender } = await render(<Frame open={false} />);
    host.querySelector<HTMLElement>("[data-test-harness]")!.focus();
    await rerender(<Frame open />);
    host.querySelector<HTMLElement>("[data-test-elsewhere]")!.focus();
    await rerender(<Frame open={false} />);
    expect(document.activeElement).toBe(host.querySelector("[data-test-elsewhere]"));
  });

  it("does not move focus when the page held it, outside the rail, as the rail closes", async () => {
    const { host, rerender } = await render(<Frame open={false} />);
    host.querySelector<HTMLElement>("[data-test-harness]")!.focus();
    await rerender(<Frame open />);
    (document.activeElement as HTMLElement).blur();
    expect(document.activeElement).toBe(document.body);
    await rerender(<Frame open={false} />);
    expect(document.activeElement).toBe(document.body);
  });

  it("hands focus to a control nearby when nothing returns it", async () => {
    const { host, rerender } = await render(
      <>
        <button type="button">Before</button>
        <ThreadRail label="Thread" autoFocus={false} onClose={noop}>
          <button type="button">Reply</button>
        </ThreadRail>
      </>,
    );
    host.querySelector<HTMLElement>('[data-ouro="thread-rail"] button')!.focus();
    await rerender(<button type="button">Before</button>);
    await expect.poll(() => document.activeElement?.textContent).toBe("Before");
  });
});

describe("ThreadRail dev messages", () => {
  it("warns, quoting the class, when className sets appearance", async () => {
    await render(<ThreadRail label="Thread" className="bg-red-500" onClose={noop} />);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toBe(
      '[ouro-ui] ThreadRail: "bg-red-500" sets appearance, and className is for layout only. Fix: remove "bg-red-500"; the theme sets ThreadRail\'s colors.',
    );
  });

  it("warns about open, onOpenChange and a missing label, each with its fix", async () => {
    const guessed = { open: true, onOpenChange: noop, label: undefined, onClose: noop } as unknown as ThreadRailProps;
    await render(<ThreadRail {...guessed} />);
    const messages = warn.mock.calls.map((call: unknown[]) => String(call[0]));
    expect(messages).toEqual([
      '[ouro-ui] ThreadRail: label is missing, so screen readers cannot name the rail. Fix: <ThreadRail label="Thread" onClose={close}>.',
      '[ouro-ui] ThreadRail: open is not a prop; the rail shows while it is rendered. Fix: {thread && <ThreadRail label="Thread" onClose={close}>}.',
      "[ouro-ui] ThreadRail: onOpenChange is not a prop. Fix: <ThreadRail onClose={() => setOpen(false)}>.",
    ]);
  });
});
