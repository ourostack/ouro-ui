import { createRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { commands, page, userEvent } from "vitest/browser";
import { Avatar } from "@/registry/ouro/components/ouro/avatar/avatar";
import { Autocomplete } from "@/registry/ouro/components/ouro/autocomplete/autocomplete";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Composer, type ComposerEditor, type ComposerMove, type ComposerProps, type ComposerQuote } from "@/registry/ouro/components/ouro/composer/composer";
import { clearComposerDrafts, composerDrafts, composerShortcuts, formatEdit, isApple, pressed } from "@/registry/ouro/components/ouro/composer/composer-styles";
import { EmojiText, type EmojiCatalogue, type EmojiItem } from "@/registry/ouro/components/ouro/emoji/emoji";
import { Attachment } from "@/registry/ouro/components/ouro/message/attachment";
import { Message } from "@/registry/ouro/components/ouro/message/message";
import type { TextAreaHighlight } from "@/registry/ouro/components/ouro/text-field/text-area";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { expectMotion, expectNoMotion, parseDuration } from "@/registry/ouro/lib/ouro/testing/motion";
import { watchAnnouncements } from "@/registry/ouro/lib/ouro/testing/announcements";
import { pressTab } from "@/registry/ouro/lib/ouro/testing/tab";

const roots: Root[] = [];
let mounted: HTMLElement[] = [];

async function render(node: ReactNode, width = 480) {
  const host = document.createElement("div");
  host.style.padding = "24px";
  host.style.width = `${width}px`;
  document.body.append(host);
  mounted.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
  return {
    host,
    rerender: (next: ReactNode) => act(async () => root.render(next)),
    get root() {
      return host.querySelector<HTMLElement>('[data-ouro="composer"]')!;
    },
    get frame() {
      return host.querySelector<HTMLElement>("[data-ouro-composer-frame]")!;
    },
    get textarea() {
      return host.querySelector<HTMLTextAreaElement>("textarea")!;
    },
    get send() {
      return host.querySelector<HTMLButtonElement>('[data-ouro-control="composer"][data-ouro-part="send"]')!;
    },
    get quote() {
      return host.querySelector<HTMLElement>("[data-ouro-composer-quote]");
    },
    get remove() {
      return host.querySelector<HTMLButtonElement>('[data-ouro-control="composer"][data-ouro-part="remove"]');
    },
  };
}

/** The texts of the elements `aria-describedby` names, in order. */
const descriptions = (element: Element) =>
  (element.getAttribute("aria-describedby") ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent);

/** The height of the textarea's lines, inside its padding. */
const linesHeight = (textarea: HTMLTextAreaElement) => {
  const style = getComputedStyle(textarea);
  return textarea.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
};

/** A key press the browser cannot make by typing: Enter while an input method composes a word. */
function pressEnter(textarea: HTMLTextAreaElement, init: KeyboardEventInit) {
  return act(async () => void textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true, ...init })));
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
  delete (navigator as { userAgentData?: unknown }).userAgentData;
  delete (navigator as { platform?: unknown }).platform;
});

/** Pretends the browser runs on `platform`, through the modern API and the legacy one, so a shortcut's form is deterministic. */
function onPlatform(platform: "macOS" | "Windows") {
  const legacy = { macOS: "MacIntel", Windows: "Win32" }[platform];
  Object.defineProperty(navigator, "userAgentData", { configurable: true, value: { platform } });
  Object.defineProperty(navigator, "platform", { configurable: true, value: legacy });
}

describe("Composer conversation", () => {
  it("starts an uncontrolled draft over when conversation changes, and keeps it while it stays", async () => {
    const view = await render(<Composer label="Message" conversation="a" onSend={() => {}} />);
    await userEvent.fill(view.textarea, "half a thought");
    await view.rerender(<Composer label="Message" conversation="a" onSend={() => {}} />);
    expect(view.textarea.value).toBe("half a thought");
    await view.rerender(<Composer label="Message" conversation="b" defaultValue="Hi" onSend={() => {}} />);
    expect(view.textarea.value).toBe("Hi");
  });

  it("empties the draft when conversation changes and the app gives no defaultValue", async () => {
    const view = await render(<Composer label="Message" conversation="a" onSend={() => {}} />);
    await userEvent.type(view.textarea, "half a thought");
    await view.rerender(<Composer label="Message" conversation="b" onSend={() => {}} />);
    expect(view.textarea.value).toBe("");
  });
});

describe("Composer drafts", () => {
  // A composer unmounted by the test's cleanup leaves its draft, so the store is cleared before each test.
  beforeEach(clearComposerDrafts);

  it("gives a draft back to a composer that mounts again, as a phone does on its way back to a conversation", async () => {
    const first = await render(<Composer label="Message" conversation="a" onSend={() => {}} />);
    await userEvent.type(first.textarea, "half a thought");
    await first.rerender(<div />);
    const second = await render(<Composer label="Message" conversation="a" onSend={() => {}} />);
    expect(second.textarea.value).toBe("half a thought");
    const other = await render(<Composer label="Message" conversation="b" onSend={() => {}} />);
    expect(other.textarea.value).toBe("");
  });

  it("stores nothing when a controlled box unmounts, and restores for an uncontrolled one on remount", async () => {
    const first = await render(<Composer label="Message" conversation="c" onSend={() => {}} />);
    await userEvent.type(first.textarea, "kept");
    await first.rerender(<div />);
    const controlled = await render(<Composer label="Message" conversation="c" defaultValue="kept" value="mine" onValueChange={() => {}} onSend={() => {}} />);
    await controlled.rerender(<div />);
    const again = await render(<Composer label="Message" conversation="c" defaultValue="other" onSend={() => {}} />);
    expect(again.textarea.value).toBe("kept");
  });

  it("forgets a draft the person cleared, and leaves a controlled box and one with no conversation to the app", async () => {
    const first = await render(<Composer label="Message" conversation="a" defaultValue="hi" onSend={() => {}} />);
    await userEvent.clear(first.textarea);
    await first.rerender(<div />);
    expect((await render(<Composer label="Message" conversation="a" defaultValue="hi" onSend={() => {}} />)).textarea.value).toBe("hi");
    const controlled = await render(<Composer label="Message" conversation="c" value="mine" onValueChange={() => {}} onSend={() => {}} />);
    await controlled.rerender(<div />);
    expect((await render(<Composer label="Message" conversation="c" onSend={() => {}} />)).textarea.value).toBe("");
    const moving = await render(<Composer label="Message" onSend={() => {}} />);
    await userEvent.type(moving.textarea, "stray");
    await moving.rerender(<Composer label="Message" conversation="d" onSend={() => {}} />);
    const other = await render(<Composer label="Message" conversation="e" onSend={() => {}} />);
    await other.rerender(<Composer label="Message" onSend={() => {}} />);
    expect(other.textarea.value).toBe("");
    const bare = await render(<Composer label="Message" onSend={() => {}} />);
    await userEvent.type(bare.textarea, "x");
    await bare.rerender(<div />);
    expect((await render(<Composer label="Message" onSend={() => {}} />)).textarea.value).toBe("");
  });

  it("gives a draft back when the person returns to its conversation", async () => {
    const view = await render(<Composer label="Message" conversation="a" onSend={() => {}} />);
    await userEvent.type(view.textarea, "half a thought");
    await view.rerender(<Composer label="Message" conversation="b" onSend={() => {}} />);
    expect(view.textarea.value).toBe("");
    await view.rerender(<Composer label="Message" conversation="a" onSend={() => {}} />);
    expect(view.textarea.value).toBe("half a thought");
  });

  it("gives a draft back in the rich editor", async () => {
    const view = await render(<Composer label="Message" format="rich" conversation="a" onSend={() => {}} />);
    const editor = () => view.host.querySelector<HTMLElement>('[contenteditable="true"]')!;
    await expect.poll(editor).not.toBeNull();
    await userEvent.type(editor(), "half a thought");
    await view.rerender(<Composer label="Message" format="rich" conversation="b" onSend={() => {}} />);
    await expect.poll(() => editor().textContent).toBe("");
    await view.rerender(<Composer label="Message" format="rich" conversation="a" onSend={() => {}} />);
    await expect.poll(() => editor().textContent).toBe("half a thought");
  });

  it("keeps only the most recent drafts, and counts a draft written again as recent", async () => {
    const view = await render(<Composer label="Message" conversation="c0" onSend={() => {}} />);
    // Set by the native setter, so filling fifty drafts costs no typing.
    const write = (text: string) =>
      act(async () => {
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(view.textarea, text);
        view.textarea.dispatchEvent(new Event("input", { bubbles: true }));
      });
    const go = (id: string) => view.rerender(<Composer label="Message" conversation={id} onSend={() => {}} />);
    await write("first");
    await go("c1");
    await write("second");
    await go("c0");
    await write("first again");
    for (let i = 2; i <= 50; i++) {
      await go(`c${i}`);
      await write(`draft ${i}`);
    }
    await go("c51");
    await go("c1");
    expect(view.textarea.value).toBe("");
    await go("c0");
    expect(view.textarea.value).toBe("first again");
  });

  it("keeps fifty drafts left by unmounting boxes, and drops the oldest only when a fifty-first arrives", async () => {
    const leave = async (id: string, text: string) => {
      const view = await render(<Composer label="Message" conversation={id} onSend={() => {}} />);
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(view.textarea, text);
        view.textarea.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await view.rerender(<div />);
    };
    const read = async (id: string) => (await render(<Composer label="Message" conversation={id} onSend={() => {}} />)).textarea.value;
    for (let i = 0; i < 50; i++) await leave(`u${i}`, `draft ${i}`);
    expect(composerDrafts.size).toBe(50);
    expect(composerDrafts.get("u0")).toBe("draft 0");
    await leave("u50", "draft 50");
    expect(composerDrafts.size).toBe(50);
    expect(composerDrafts.has("u0")).toBe(false);
    expect(composerDrafts.get("u1")).toBe("draft 1");
    expect(await read("u50")).toBe("draft 50");
  });

  it("counts a draft left again as recent, so rewriting the oldest protects it from eviction", async () => {
    const leave = async (id: string, text: string) => {
      const view = await render(<Composer label="Message" conversation={id} onSend={() => {}} />);
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(view.textarea, text);
        view.textarea.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await view.rerender(<div />);
    };
    for (let i = 0; i < 50; i++) await leave(`r${i}`, `draft ${i}`);
    await leave("r0", "rewritten");
    await leave("r50", "newest");
    expect(composerDrafts.get("r0")).toBe("rewritten");
    expect(composerDrafts.has("r1")).toBe(false);
    expect(composerDrafts.size).toBe(50);
  });

  it("leaves a controlled value to the app", async () => {
    const view = await render(<Composer label="Message" conversation="a" value="mine" onValueChange={() => {}} onSend={() => {}} />);
    await view.rerender(<Composer label="Message" conversation="b" value="mine" onValueChange={() => {}} onSend={() => {}} />);
    expect(view.textarea.value).toBe("mine");
  });
});

describe("Composer", () => {
  it("keeps its text box's flex basis at 12rem, and follows a compact --spacing, which sizes it on the spacing scale", async () => {
    const { host } = await render(<Composer label="Message Mia" placeholder="Write a message" onSend={() => {}} />);
    const basis = () => parseFloat(getComputedStyle(host.querySelector<HTMLElement>(".basis-48")!).flexBasis);
    expect(basis()).toBeCloseTo(192, 2);
    host.style.setProperty("--spacing", "0.2rem");
    expect(basis()).toBeCloseTo(153.6, 2);
  });

  it("keeps its quote bar 4px wide and its icons 16 or 20px at a compact --spacing", async () => {
    const { host } = await render(<Composer label="Message Mia" placeholder="Write a message" onSend={() => {}} quote={{ author: "Ana Lind", excerpt: "Soft polenta", onRemove: () => {} }} />);
    const sizes = () => [getComputedStyle(host.querySelector<HTMLElement>("[data-ouro-composer-quote-bar]")!).width, [...host.querySelectorAll<SVGElement>("svg")].map((svg) => getComputedStyle(svg).width)];
    expect(sizes()).toEqual(["4px", ["16px", "20px"]]);
    host.style.setProperty("--spacing", "0.2rem");
    expect(sizes()).toEqual(["4px", ["16px", "20px"]]);
  });
  it("is a message box named by its label, one line tall with the placeholder on it, and a send button", async () => {
    const { root, frame, textarea, send } = await render(<Composer label="Message Mia" placeholder="Write a message" onSend={() => {}} />);
    expect(root.getAttribute("data-ouro")).toBe("composer");
    expect([...root.children]).toEqual([frame]);
    expect(root.hasAttribute("data-sending")).toBe(false);
    expect(root.hasAttribute("data-send-disabled")).toBe(false);
    await expect.element(page.getByRole("textbox", { name: "Message Mia" })).toBeVisible();
    expect(textarea.placeholder).toBe("Write a message");
    expect(textarea.rows).toBe(1);
    expect(linesHeight(textarea)).toBeCloseTo(parseFloat(getComputedStyle(textarea).lineHeight), 0);
    await expect.element(page.getByRole("button", { name: "Send" })).toBeDisabled();
    expect(send.querySelector("svg")!.getAttribute("aria-hidden")).toBe("true");
  });

  it("grows as the person writes, up to maxRows, then scrolls", async () => {
    const { textarea } = await render(<Composer label="Message" maxRows={3} onSend={() => {}} />);
    const line = parseFloat(getComputedStyle(textarea).lineHeight);
    textarea.focus();
    await userEvent.keyboard("one{Shift>}{Enter}{/Shift}two");
    expect(linesHeight(textarea)).toBeCloseTo(2 * line, 0);
    await userEvent.keyboard("{Shift>}{Enter}{/Shift}three{Shift>}{Enter}{/Shift}four");
    expect(linesHeight(textarea)).toBeCloseTo(3 * line, 0);
    expect(getComputedStyle(textarea).overflowY).toBe("auto");
  });

  it("draws one focus outline, on the frame, while the text has focus, and none on the text itself", async () => {
    const { frame, textarea } = await render(<Composer label="Message" onSend={() => {}} />);
    expect(getComputedStyle(frame).outlineStyle).toBe("none");
    await userEvent.click(textarea);
    expect(getComputedStyle(frame).outlineStyle).toBe("solid");
    expect(getComputedStyle(frame).outlineWidth).toBe("2px");
    expect(getComputedStyle(textarea).outlineWidth).toBe("0px");
    expect(getComputedStyle(frame).borderTopStyle).toBe("solid");
    expect(getComputedStyle(textarea).borderTopWidth).toBe("0px");
  });

  it("does not outline the frame while a button inside it has focus", async () => {
    const { frame, send } = await render(<Composer label="Message" defaultValue="Hi" onSend={() => {}} />);
    send.focus();
    expect(getComputedStyle(frame).outlineStyle).toBe("none");
  });

  it("sends on Enter with the text and the key event, clears itself, and keeps focus in the box", async () => {
    const onSend = vi.fn();
    const { textarea } = await render(<Composer label="Message" onSend={onSend} />);
    textarea.focus();
    await userEvent.keyboard("See you Saturday{Enter}");
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend.mock.calls[0]![0]).toBe("See you Saturday");
    expect(onSend.mock.calls[0]![1].type).toBe("keydown");
    expect(textarea.value).toBe("");
    expect(document.activeElement).toBe(textarea);
  });

  it("starts a new line on Shift+Enter, and sends on Ctrl+Enter or Command+Enter too", async () => {
    const onSend = vi.fn();
    const { textarea } = await render(<Composer label="Message" onSend={onSend} />);
    textarea.focus();
    await userEvent.keyboard("one{Shift>}{Enter}{/Shift}two");
    expect(textarea.value).toBe("one\ntwo");
    expect(onSend).not.toHaveBeenCalled();
    await userEvent.keyboard("{Control>}{Enter}{/Control}");
    expect(onSend).toHaveBeenLastCalledWith("one\ntwo", expect.anything());
    await userEvent.keyboard("three{Meta>}{Enter}{/Meta}");
    expect(onSend).toHaveBeenLastCalledWith("three", expect.anything());
  });

  it('with sendOn="mod-enter", starts a new line on Enter and sends on Ctrl+Enter or Command+Enter', async () => {
    const onSend = vi.fn();
    const { textarea } = await render(<Composer label="Message" sendOn="mod-enter" onSend={onSend} />);
    textarea.focus();
    await userEvent.keyboard("one{Enter}two");
    expect(textarea.value).toBe("one\ntwo");
    expect(onSend).not.toHaveBeenCalled();
    await userEvent.keyboard("{Control>}{Enter}{/Control}");
    expect(onSend).toHaveBeenLastCalledWith("one\ntwo", expect.anything());
    await userEvent.keyboard("three{Meta>}{Enter}{/Meta}");
    expect(onSend).toHaveBeenLastCalledWith("three", expect.anything());
  });

  it("never sends on the Enter that ends a word an input method is composing", async () => {
    const onSend = vi.fn();
    const { textarea } = await render(<Composer label="Message" defaultValue="にほんご" onSend={onSend} />);
    await pressEnter(textarea, { isComposing: true });
    await pressEnter(textarea, { keyCode: 229 } as KeyboardEventInit);
    expect(onSend).not.toHaveBeenCalled();
    await pressEnter(textarea, {});
    expect(onSend).toHaveBeenCalledWith("にほんご", expect.anything());
  });

  it("leaves Enter to the app's onKeyDown when it prevents the default, as a suggestion list does", async () => {
    const onSend = vi.fn();
    const onKeyDown = vi.fn((event: { key: string; preventDefault: () => void }) => {
      if (event.key === "Enter") event.preventDefault();
    });
    const { textarea } = await render(<Composer label="Message" defaultValue="@mi" onKeyDown={onKeyDown} onSend={onSend} />);
    textarea.focus();
    textarea.setSelectionRange(3, 3);
    await userEvent.keyboard("{Enter}a");
    expect(onKeyDown).toHaveBeenCalled();
    expect(onSend).not.toHaveBeenCalled();
    expect(textarea.value).toBe("@mia");
  });

  it("sends nothing while the text is blank", async () => {
    const onSend = vi.fn();
    const { textarea, send } = await render(<Composer label="Message" onSend={onSend} />);
    textarea.focus();
    await userEvent.keyboard("   {Enter}");
    expect(onSend).not.toHaveBeenCalled();
    expect(send.disabled).toBe(true);
  });

  it("sends with the button, then puts focus back in the box", async () => {
    const onSend = vi.fn();
    const { textarea, send } = await render(<Composer label="Message" defaultValue="Hello" onSend={onSend} />);
    expect(send.disabled).toBe(false);
    await userEvent.click(send);
    expect(onSend).toHaveBeenCalledWith("Hello", expect.objectContaining({ type: "click" }));
    expect(textarea.value).toBe("");
    expect(document.activeElement).toBe(textarea);
  });

  it("puts focus back in the box without scrolling a box around it, after a press of Send or the expand button", async () => {
    const { host, textarea } = await render(
      <div data-frame="" style={{ height: 80, overflow: "hidden" }}>
        <div style={{ height: 400 }} />
        <Composer label="Reply" defaultExpanded={false} defaultValue="See you" onSend={() => {}} />
      </div>,
    );
    const frame = host.querySelector<HTMLElement>("[data-frame]")!;
    await act(async () => host.querySelector<HTMLButtonElement>('[data-ouro-part="send"]')!.click());
    expect(document.activeElement).toBe(textarea);
    expect(frame.scrollTop).toBe(0);
    textarea.blur();
    await act(async () => host.querySelector<HTMLButtonElement>('[data-ouro-part="expand"]')!.click());
    expect(document.activeElement).toBe(textarea);
    expect(frame.scrollTop).toBe(0);
  });

  it("names the send button with sendLabel, which its tooltip shows on keyboard focus", async () => {
    const { textarea } = await render(<Composer label="Message" defaultValue="Hi" sendLabel="Post" onSend={() => {}} />);
    textarea.focus();
    await pressTab();
    await expect.element(page.getByRole("button", { name: "Post" })).toHaveFocus();
    await expect.poll(() => document.querySelector('[data-ouro="tooltip"]')?.textContent).toBe("Post");
  });

  it("is controlled with value and onValueChange, and leaves clearing to the app", async () => {
    const onSend = vi.fn();
    function Controlled() {
      const [text, setText] = useState("Hi");
      return <Composer label="Message" value={text} onValueChange={setText} onSend={onSend} />;
    }
    const { textarea } = await render(<Controlled />);
    textarea.focus();
    textarea.setSelectionRange(2, 2);
    await userEvent.keyboard(" Mia{Enter}");
    expect(onSend).toHaveBeenCalledWith("Hi Mia", expect.anything());
    expect(textarea.value).toBe("Hi Mia");
  });

  it("calls onValueChange in an uncontrolled composer too", async () => {
    const onValueChange = vi.fn();
    const { textarea } = await render(<Composer label="Message" onValueChange={onValueChange} onSend={() => {}} />);
    textarea.focus();
    await userEvent.keyboard("a");
    expect(onValueChange).toHaveBeenLastCalledWith("a");
  });

  it("carries the app's own id and data-/aria- attributes to the plain text box", async () => {
    const { textarea } = await render(<Composer label="Message" onSend={() => {}} {...{ id: "mia-composer", "data-testid": "mia-composer", "aria-required": true }} />);
    expect(textarea.id).toBe("mia-composer");
    expect(textarea.getAttribute("data-testid")).toBe("mia-composer");
    expect(textarea.getAttribute("aria-required")).toBe("true");
  });
});

describe("Composer presses around the text", () => {
  const text = "Yes, Friday works.\nSee you then.";
  /** A press at a point in the frame, from its top left corner. */
  const press = (frame: HTMLElement, x: number, y: number) => page.elementLocator(frame).click({ position: { x, y } });

  it("puts the caret at the start of the text on a press in the box's top left corner", async () => {
    const { frame, textarea } = await render(<Composer label="Reply" defaultValue={text} onSend={() => {}} />);
    await press(frame, 6, 6);
    expect(document.activeElement).toBe(textarea);
    expect(textarea.selectionStart).toBe(0);
  });

  it("puts the caret at the end of the text on a press in the box's bottom left corner, under the text", async () => {
    const { frame, textarea } = await render(<Composer label="Reply" defaultValue={text} onSend={() => {}} />);
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    await press(frame, 6, frame.getBoundingClientRect().height - 6);
    expect(document.activeElement).toBe(textarea);
    expect(textarea.selectionStart).toBe(text.length);
  });

  it("puts the caret at the end of a line on a press between the line and the send button", async () => {
    const { frame, textarea, send } = await render(<Composer label="Reply" defaultValue={text} onSend={() => {}} />);
    const box = frame.getBoundingClientRect();
    const firstLine = textarea.getBoundingClientRect().top + parseFloat(getComputedStyle(textarea).paddingTop) + parseFloat(getComputedStyle(textarea).lineHeight) / 2;
    await press(frame, send.getBoundingClientRect().left - box.left - 6, firstLine - box.top);
    expect(document.activeElement).toBe(textarea);
    expect(textarea.selectionStart).toBe(text.indexOf("\n"));
  });
});

describe("Composer attachments, actions and toolbar", () => {
  it("shows the files waiting to go in a named group under the text, and can send them without text", async () => {
    const onSend = vi.fn();
    const { textarea, frame } = await render(<Composer label="Message" attachments={[<Attachment key="a" name="menu.pdf" onRemove={() => {}} />]} onSend={onSend} />);
    const group = page.getByRole("group", { name: "Attachments" });
    await expect.element(group).toBeVisible();
    expect(frame.contains(group.element())).toBe(true);
    expect(group.element().getBoundingClientRect().top).toBeGreaterThanOrEqual(textarea.getBoundingClientRect().bottom);
    await expect.element(page.getByRole("button", { name: "Send" })).toBeEnabled();
    textarea.focus();
    await userEvent.keyboard("{Enter}");
    expect(onSend).toHaveBeenCalledWith("", expect.anything());
  });

  it("names the attachments group with attachmentsLabel, and shows no group for an empty list", async () => {
    const { host, rerender } = await render(<Composer label="Message" attachmentsLabel="Fichiers" attachments={<Attachment name="menu.pdf" />} onSend={() => {}} />);
    await expect.element(page.getByRole("group", { name: "Fichiers" })).toBeVisible();
    await rerender(<Composer label="Message" attachments={[]} onSend={() => {}} />);
    expect(host.querySelector("[data-ouro-composer-attachments]")).toBeNull();
  });

  it("puts the actions before the send button, and the toolbar above the text inside the frame", async () => {
    const { host, frame, textarea, send } = await render(
      <Composer
        label="Message"
        onSend={() => {}}
        actions={<Button variant="plain" aria-label="Emoji">:)</Button>}
        toolbar={<Button variant="plain" aria-label="Bold">B</Button>}
      />,
    );
    const emoji = page.getByRole("button", { name: "Emoji" }).element();
    const bold = page.getByRole("button", { name: "Bold" }).element();
    expect(emoji.compareDocumentPosition(send) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(emoji.getBoundingClientRect().right).toBeLessThanOrEqual(send.getBoundingClientRect().left);
    expect(frame.contains(bold)).toBe(true);
    expect(bold.getBoundingClientRect().bottom).toBeLessThanOrEqual(textarea.getBoundingClientRect().top);
    expect(host.querySelector("[data-ouro-composer-toolbar]")).not.toBeNull();
  });

  it("shows no toolbar row without a toolbar", async () => {
    const { host } = await render(<Composer label="Message" toolbar={false} onSend={() => {}} />);
    expect(host.querySelector("[data-ouro-composer-toolbar]")).toBeNull();
  });

  it("keeps the text and the buttons on one row when there is room, and moves the buttons under the text when there is not", async () => {
    const actions = <Button variant="plain" aria-label="Emoji">:)</Button>;
    const wide = await render(<Composer label="Wide" actions={actions} onSend={() => {}} />, 600);
    expect(Math.abs(wide.send.getBoundingClientRect().bottom - wide.textarea.getBoundingClientRect().bottom)).toBeLessThan(12);
    const narrow = await render(<Composer label="Narrow" actions={actions} onSend={() => {}} />, 200);
    expect(narrow.send.getBoundingClientRect().top).toBeGreaterThanOrEqual(narrow.textarea.getBoundingClientRect().bottom);
    expect(narrow.frame.scrollWidth).toBeLessThanOrEqual(narrow.frame.clientWidth);
  });
});

describe("Composer states", () => {
  it("while sending, shows a spinner, says so, and sends nothing more", async () => {
    const onSend = vi.fn();
    const announced = watchAnnouncements();
    try {
      const { textarea, send, rerender, root } = await render(<Composer label="Message" defaultValue="Hello" onSend={onSend} />);
      await rerender(<Composer label="Message" defaultValue="Hello" sending sendingLabel="Posting" onSend={onSend} />);
      expect(send.getAttribute("aria-busy")).toBe("true");
      expect(root.getAttribute("data-sending")).toBe("");
      textarea.focus();
      await userEvent.keyboard("{Enter}");
      expect(onSend).not.toHaveBeenCalled();
      await expect.poll(() => announced.count("Posting")).toBe(1);
    } finally {
      announced.stop();
    }
  });

  it('says "Sending" when sending turns on, by default', async () => {
    const announced = watchAnnouncements();
    try {
      const { rerender } = await render(<Composer label="Message" defaultValue="Hello" onSend={() => {}} />);
      await rerender(<Composer label="Message" defaultValue="Hello" sending onSend={() => {}} />);
      await expect.poll(() => announced.count("Sending")).toBe(1);
    } finally {
      announced.stop();
    }
  });

  it("with sendDisabledReason, keeps the box writable, shows and describes the reason, and says it again on Enter", async () => {
    const onSend = vi.fn();
    const announced = watchAnnouncements();
    const reason = "Sending is off while you review the draft.";
    try {
      const { textarea, send, root } = await render(<Composer label="Message" defaultValue="Hello" description="Ctrl+Enter to send" sendDisabledReason={reason} onSend={onSend} />);
      expect(root.getAttribute("data-send-disabled")).toBe("");
      expect(send.disabled).toBe(true);
      expect(descriptions(send)).toEqual([reason]);
      expect(textarea.disabled).toBe(false);
      await expect.element(page.getByText(reason)).toBeVisible();
      expect(root.querySelector<HTMLElement>("[data-ouro-composer-reason]")!.getBoundingClientRect().height).toBeGreaterThan(1);
      expect(descriptions(textarea)).toEqual([reason, "Ctrl+Enter to send"]);
      textarea.focus();
      textarea.setSelectionRange(5, 5);
      await userEvent.keyboard(" there{Enter}");
      expect(textarea.value).toBe("Hello there");
      expect(onSend).not.toHaveBeenCalled();
      await expect.poll(() => announced.count(reason)).toBe(1);
    } finally {
      announced.stop();
    }
  });

  it("with hideSendDisabledReason, keeps the reason as the box's description and says it on Enter, but draws no line for it", async () => {
    const onSend = vi.fn();
    const announced = watchAnnouncements();
    const reason = "Sending is off while you review the draft.";
    try {
      const { host, textarea, send, root } = await render(<Composer label="Message" defaultValue="Hello" hideSendDisabledReason sendDisabledReason={reason} onSend={onSend} />);
      const { root: plain } = await render(<Composer label="Message" defaultValue="Hello" onSend={() => {}} />);
      expect(send.disabled).toBe(true);
      expect(root.getAttribute("data-send-disabled")).toBe("");
      expect(descriptions(textarea)).toEqual([reason]);
      const hidden = host.querySelector<HTMLElement>("[data-ouro-composer-reason]")!;
      expect(hidden.textContent).toBe(reason);
      expect(hidden.parentElement).toBe(root);
      expect(hidden.getBoundingClientRect().width).toBe(1);
      expect(hidden.getBoundingClientRect().height).toBe(1);
      expect(root.getBoundingClientRect().height).toBe(plain.getBoundingClientRect().height);
      textarea.focus();
      await userEvent.keyboard("{Enter}");
      expect(onSend).not.toHaveBeenCalled();
      await expect.poll(() => announced.count(reason)).toBe(1);
    } finally {
      announced.stop();
    }
  });

  it("with hideSendDisabledReason and a description, draws the description alone under the box", async () => {
    const reason = "Sending is off while you review the draft.";
    const { host, textarea } = await render(
      <Composer label="Message" defaultValue="Hello" description="Ctrl+Enter to send" hideSendDisabledReason sendDisabledReason={reason} onSend={() => {}} />,
    );
    expect(descriptions(textarea)).toEqual([reason, "Ctrl+Enter to send"]);
    const shown = host.querySelector<HTMLElement>("[data-ouro-composer-description]")!;
    expect(shown.parentElement!.textContent).toBe("Ctrl+Enter to send");
    expect(host.querySelector<HTMLElement>("[data-ouro-composer-reason]")!.getBoundingClientRect().width).toBe(1);
  });

  it("with hideSendDisabledReason and no reason, draws no reason element and no line", async () => {
    const { host, root } = await render(<Composer label="Message" defaultValue="Hello" hideSendDisabledReason onSend={() => {}} />);
    const { root: plain } = await render(<Composer label="Message" defaultValue="Hello" onSend={() => {}} />);
    expect(host.querySelector("[data-ouro-composer-reason]")).toBeNull();
    expect(root.getBoundingClientRect().height).toBe(plain.getBoundingClientRect().height);
  });

  it("when disabled, takes no text and no send, and does not show a reason", async () => {
    const announced = watchAnnouncements();
    vi.useFakeTimers();
    try {
      const { host, textarea, send } = await render(<Composer label="Message" defaultValue="Hello" disabled sendDisabledReason="Off" onSend={() => {}} />);
      expect(textarea.disabled).toBe(true);
      expect(send.disabled).toBe(true);
      expect(host.querySelector("[data-ouro-composer-reason]")).toBeNull();
      await pressEnter(textarea, {});
      await act(async () => void vi.advanceTimersByTime(1000));
      expect(announced.count("Off")).toBe(0);
    } finally {
      vi.useRealTimers();
      announced.stop();
    }
  });

  it("describes the text with the description under the box, after the app's own aria-describedby", async () => {
    const { textarea } = await render(
      <>
        <p id="outside">Messages are kept for a year.</p>
        <Composer label="Message" aria-describedby="outside" description="Your assistant's suggestions are underlined." onSend={() => {}} />
      </>,
    );
    expect(descriptions(textarea)).toEqual(["Messages are kept for a year.", "Your assistant's suggestions are underlined."]);
  });

  it("marks the text with highlights and moves them as the person edits", async () => {
    const onHighlightsChange = vi.fn();
    function Marked() {
      const [highlights, setHighlights] = useState<TextAreaHighlight[]>([{ start: 0, end: 6, label: "Suggested" }]);
      return (
        <Composer
          label="Message"
          defaultValue="Thanks for the notes"
          highlights={highlights}
          onHighlightsChange={(next) => {
            setHighlights(next);
            onHighlightsChange(next);
          }}
          onSend={() => {}}
        />
      );
    }
    const { host, textarea } = await render(<Marked />);
    expect(host.querySelector("[data-ouro-highlight]")!.textContent).toBe("Thanks");
    textarea.focus();
    textarea.setSelectionRange(0, 0);
    await userEvent.keyboard("Oh, ");
    expect(onHighlightsChange).toHaveBeenLastCalledWith([{ start: 4, end: 10, label: "Suggested" }]);
    expect(host.querySelector("[data-ouro-highlight]")!.textContent).toBe("Thanks");
  });

  it("passes textarea attributes, name and ref through", async () => {
    const ref = createRef<HTMLTextAreaElement>();
    const onPaste = vi.fn();
    const { textarea } = await render(<Composer label="Message" name="message" maxLength={500} readOnly onPaste={onPaste} ref={ref} onSend={() => {}} />);
    expect(ref.current).toBe(textarea);
    expect(textarea.name).toBe("message");
    expect(textarea.maxLength).toBe(500);
    expect(textarea.readOnly).toBe(true);
  });

  it("lets layout classes through to the root", async () => {
    const { root } = await render(<Composer label="Message" className="mt-4" onSend={() => {}} />);
    expect(getComputedStyle(root).marginTop).toBe("16px");
  });
});

const lunch = "Lunch on Friday? The bakery on the corner opens at noon, and they keep a long table for groups if you call ahead.";
const quoteOf = (extra: Partial<ComposerQuote> = {}): ComposerQuote => ({ author: "Ana Lind", excerpt: lunch, onRemove: () => {}, ...extra });

/** A composer whose quote its remove button and Escape clear, as an app keeps it. */
function Quoting({ onRemove, ...props }: Partial<ComposerProps> & { onRemove?: () => void }) {
  const [quoted, setQuoted] = useState(true);
  return (
    <Composer
      label="Reply to Ana"
      onSend={() => {}}
      {...props}
      quote={
        quoted
          ? quoteOf({
              onRemove: () => {
                onRemove?.();
                setQuoted(false);
              },
            })
          : undefined
      }
    />
  );
}

/** The computed colour of a theme variable, as the browser writes colours. */
function themeColor(variable: string) {
  const probe = document.createElement("div");
  probe.style.color = `var(${variable})`;
  document.body.append(probe);
  const color = getComputedStyle(probe).color;
  probe.remove();
  return color;
}

describe("Composer quote", () => {
  it("draws a quote present at mount at once, and fades one in that arrives later", async () => {
    await commands.emulateMedia({ reducedMotion: "no-preference" });
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    try {
      const quote = () => host.querySelector<HTMLElement>("[data-ouro-composer-quote]")!;
      flushSync(() => root.render(<Composer label="Reply to Ana" quote={quoteOf()} onSend={() => {}} />));
      expect(getComputedStyle(quote()).opacity).toBe("1");
      expect(quote().getAnimations()).toEqual([]);
      flushSync(() => root.render(<Composer label="Reply to Ana" onSend={() => {}} />));
      flushSync(() => root.render(<Composer label="Reply to Ana" quote={quoteOf()} onSend={() => {}} />));
      expect(quote().getAnimations().some((a) => a instanceof CSSTransition && a.transitionProperty === "opacity")).toBe(true);
    } finally {
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      root.unmount();
      host.remove();
    }
  });

  it("shows the quote inside the frame above the text: a bar, the author in semibold and the excerpt on one line, cut with an ellipsis", async () => {
    const { frame, textarea, quote } = await render(<Composer label="Reply to Ana" quote={quoteOf()} onSend={() => {}} />);
    expect(frame.contains(quote)).toBe(true);
    expect(quote!.getBoundingClientRect().bottom).toBeLessThanOrEqual(textarea.getBoundingClientRect().top);
    const bar = quote!.querySelector<HTMLElement>("[data-ouro-composer-quote-bar]")!;
    const author = quote!.querySelector<HTMLElement>("[data-ouro-composer-quote-author]")!;
    const excerpt = quote!.querySelector<HTMLElement>("[data-ouro-composer-quote-excerpt]")!;
    expect(bar.getAttribute("aria-hidden")).toBe("true");
    expect(bar.getBoundingClientRect().width).toBe(4);
    expect(getComputedStyle(bar).backgroundColor).toBe(themeColor("--primary"));
    expect(author.textContent).toBe("Ana Lind");
    expect(getComputedStyle(author).fontWeight).toBe("600");
    expect(excerpt.textContent).toBe(lunch);
    expect(getComputedStyle(excerpt).textOverflow).toBe("ellipsis");
    expect(getComputedStyle(excerpt).whiteSpace).toBe("nowrap");
    expect(excerpt.scrollWidth).toBeGreaterThan(excerpt.clientWidth);
    expect(excerpt.getBoundingClientRect().height).toBeCloseTo(parseFloat(getComputedStyle(excerpt).lineHeight), 0);
  });

  it("shows the author's avatar before the name", async () => {
    const { quote } = await render(<Composer label="Reply to Ana" quote={quoteOf({ avatar: <Avatar name="Ana Lind" alt="" size="xs" /> })} onSend={() => {}} />);
    const avatar = quote!.querySelector<HTMLElement>('[data-ouro="avatar"]')!;
    expect(avatar.compareDocumentPosition(quote!.querySelector("[data-ouro-composer-quote-author]")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(quote!.querySelector("[data-ouro-composer-quote-bar]")!.compareDocumentPosition(avatar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("shows authorContent and excerptContent in place of the author and the excerpt, while screen readers hear the text", async () => {
    const image = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><title>party</title></svg>')}`;
    const catalogue: EmojiCatalogue = { categories: [{ id: "activities", label: "Activities", items: [{ id: "party", name: "Party popper", shortcodes: ["party"], text: "🎉", src: image }] }] };
    const { quote } = await render(
      <Composer
        label="Reply to Ana"
        quote={quoteOf({
          author: "Ana Lind 🎉",
          authorContent: <EmojiText text="Ana Lind :party:" catalogue={catalogue} />,
          excerpt: `🎉 ${lunch}`,
          excerptContent: <EmojiText text={`:party: ${lunch}`} catalogue={catalogue} />,
        })}
        onSend={() => {}}
      />,
    );
    const author = quote!.querySelector<HTMLElement>("[data-ouro-composer-quote-author]")!;
    const excerpt = quote!.querySelector<HTMLElement>("[data-ouro-composer-quote-excerpt]")!;
    expect(author.querySelector("img")!.getAttribute("src")).toBe(image);
    expect(author.textContent).not.toContain(":party:");
    const picture = excerpt.querySelector<HTMLElement>("[aria-hidden='true'] img")!;
    expect(picture.getAttribute("src")).toBe(image);
    expect(excerpt.textContent).not.toContain(":party:");
    expect(getComputedStyle(excerpt).textOverflow).toBe("ellipsis");
    expect(excerpt.scrollWidth).toBeGreaterThan(excerpt.clientWidth);
    expect(excerpt.getBoundingClientRect().height).toBeCloseTo(parseFloat(getComputedStyle(excerpt).lineHeight), 0);
    await expect.element(page.getByRole("textbox", { name: "Reply to Ana" })).toHaveAccessibleDescription(`Quoting Ana Lind 🎉: 🎉 ${lunch}`);
    await expect.element(page.getByRole("button", { name: "Remove quote from Ana Lind 🎉" })).toBeVisible();
  });

  it("describes the text with the quote, so screen readers hear what the reply quotes", async () => {
    const { host, textarea, rerender } = await render(
      <>
        <p id="hint">Replies go to the thread</p>
        <Composer label="Reply to Ana" aria-describedby="hint" description="Ctrl+Enter to send" quote={quoteOf({ excerpt: "Lunch on Friday?" })} onSend={() => {}} />
      </>,
    );
    expect(descriptions(textarea)).toEqual(["Replies go to the thread", "Quoting Ana Lind: ", "Lunch on Friday?", "Ctrl+Enter to send"]);
    await expect.element(page.getByRole("textbox", { name: "Reply to Ana" })).toHaveAccessibleDescription("Replies go to the thread Quoting Ana Lind: Lunch on Friday? Ctrl+Enter to send");
    expect(host.querySelector("[data-ouro-composer-quote-author]")!.getAttribute("aria-hidden")).toBe("true");
    await rerender(
      <>
        <p id="hint">Replies go to the thread</p>
        <Composer label="Reply to Ana" aria-describedby="hint" description="Ctrl+Enter to send" onSend={() => {}} />
      </>,
    );
    expect(descriptions(textarea)).toEqual(["Replies go to the thread", "Ctrl+Enter to send"]);
  });

  it("reads label and removeLabel, for other languages", async () => {
    const { textarea } = await render(<Composer label="Antwort an Ana" quote={quoteOf({ excerpt: "Mittagessen?", label: "Zitat von Ana", removeLabel: "Zitat entfernen" })} onSend={() => {}} />);
    expect(descriptions(textarea)).toEqual(["Zitat von Ana: ", "Mittagessen?"]);
    await expect.element(page.getByRole("button", { name: "Zitat entfernen" })).toBeVisible();
  });

  it("names the remove button after the author, which the keyboard reaches before the text and which removes the quote and puts focus back in the box", async () => {
    const onRemove = vi.fn();
    const { textarea, remove } = await render(<Quoting onRemove={onRemove} />);
    expect(remove!.querySelector("svg")!.getAttribute("aria-hidden")).toBe("true");
    textarea.focus();
    await pressTab({ shift: true });
    expect(document.activeElement).toBe(page.getByRole("button", { name: "Remove quote from Ana Lind" }).element());
    await userEvent.keyboard("{Enter}");
    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(textarea);
  });

  it("puts focus back in the box after a press of the remove button, even while the app keeps the quote", async () => {
    const onRemove = vi.fn();
    const { textarea, remove, quote } = await render(<Composer label="Reply to Ana" quote={quoteOf({ onRemove })} onSend={() => {}} />);
    await userEvent.click(remove!);
    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(quote!.isConnected).toBe(true);
    expect(document.activeElement).toBe(textarea);
  });

  it("puts focus back in the box after the remove button without scrolling a box around it", async () => {
    const { host, textarea, remove } = await render(
      <div data-frame="" style={{ height: 80, overflow: "hidden" }}>
        <div style={{ height: 400 }} />
        <Composer label="Reply to Ana" quote={quoteOf()} onSend={() => {}} />
      </div>,
    );
    await act(async () => remove!.click());
    expect(document.activeElement).toBe(textarea);
    expect(host.querySelector<HTMLElement>("[data-frame]")!.scrollTop).toBe(0);
  });

  it("removes the quote on Escape while the box is empty, and that Escape goes no further", async () => {
    const onRemove = vi.fn();
    const outer = vi.fn();
    const onDocument = vi.fn();
    document.addEventListener("keydown", onDocument);
    try {
      const { textarea, host } = await render(
        <div onKeyDown={outer}>
          <Quoting onRemove={onRemove} />
        </div>,
      );
      textarea.focus();
      await userEvent.keyboard("{Escape}");
      expect(onRemove).toHaveBeenCalledTimes(1);
      expect(host.querySelector("[data-ouro-composer-quote]")).toBeNull();
      expect(outer).not.toHaveBeenCalled();
      expect(onDocument).not.toHaveBeenCalled();
      expect(document.activeElement).toBe(textarea);
    } finally {
      document.removeEventListener("keydown", onDocument);
    }
  });

  it("takes the Escape it uses, so nothing else acts on it", async () => {
    const { textarea } = await render(<Composer label="Reply to Ana" quote={quoteOf()} onSend={() => {}} />);
    const escape = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    await act(async () => void textarea.dispatchEvent(escape));
    expect(escape.defaultPrevented).toBe(true);
  });

  it("leaves Escape alone while the box has text, while an input method composes, or after the app's onKeyDown prevents it", async () => {
    const onRemove = vi.fn();
    const outer = vi.fn();
    const { textarea, rerender } = await render(
      <div onKeyDown={outer}>
        <Composer label="Reply to Ana" defaultValue="See you" quote={quoteOf({ onRemove })} onSend={() => {}} />
      </div>,
    );
    textarea.focus();
    await userEvent.keyboard("{Escape}");
    expect(outer).toHaveBeenCalledTimes(1);
    await rerender(
      <div onKeyDown={outer}>
        <Composer label="Reply to Ana" value="" onValueChange={() => {}} quote={quoteOf({ onRemove })} onSend={() => {}} />
      </div>,
    );
    for (const init of [{ isComposing: true }, { keyCode: 229 }]) {
      await act(async () => void textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true, ...init })));
    }
    expect(outer).toHaveBeenCalledTimes(3);
    await rerender(
      <div onKeyDown={outer}>
        <Composer label="Reply to Ana" value="" onValueChange={() => {}} quote={quoteOf({ onRemove })} onKeyDown={(event) => event.preventDefault()} onSend={() => {}} />
      </div>,
    );
    await userEvent.keyboard("{Escape}");
    expect(outer).toHaveBeenCalledTimes(4);
    expect(onRemove).not.toHaveBeenCalled();
  });

  it("without a quote, lets Escape in the empty box go on to the app", async () => {
    const outer = vi.fn();
    const { textarea } = await render(
      <div onKeyDown={outer}>
        <Composer label="Message" onSend={() => {}} />
      </div>,
    );
    textarea.focus();
    await userEvent.keyboard("{Escape}");
    expect(outer).toHaveBeenCalledTimes(1);
  });

  it("stays after a send until the app clears it", async () => {
    const onRemove = vi.fn();
    const onSend = vi.fn();
    const { textarea, quote } = await render(<Composer label="Reply to Ana" quote={quoteOf({ onRemove })} onSend={onSend} />);
    textarea.focus();
    await userEvent.keyboard("Sounds good{Enter}");
    expect(onSend).toHaveBeenCalledWith("Sounds good", expect.anything());
    expect(quote!.isConnected).toBe(true);
    expect(onRemove).not.toHaveBeenCalled();
  });

  it("leaves focus in the box when a quote appears", async () => {
    const { textarea, rerender } = await render(<Composer label="Reply to Ana" onSend={() => {}} />);
    textarea.focus();
    await rerender(<Composer label="Reply to Ana" quote={quoteOf()} onSend={() => {}} />);
    expect(document.activeElement).toBe(textarea);
  });

  it("fades in with opacity only, and not at all with reduced motion", async () => {
    const transitions = (element: Element) => element.getAnimations().map((animation) => (animation as CSSTransition).transitionProperty);
    const { host, rerender } = await render(<Composer label="Reply to Ana" onSend={() => {}} />);
    await rerender(<Composer label="Reply to Ana" quote={quoteOf()} onSend={() => {}} />);
    expect(transitions(host.querySelector("[data-ouro-composer-quote]")!)).toEqual(["opacity"]);
    await rerender(<Composer label="Reply to Ana" onSend={() => {}} />);
    await commands.emulateMedia({ reducedMotion: "reduce" });
    try {
      await rerender(<Composer label="Reply to Ana" quote={quoteOf()} onSend={() => {}} />);
      const quote = host.querySelector<HTMLElement>("[data-ouro-composer-quote]")!;
      expect(transitions(quote)).toEqual([]);
      expect(getComputedStyle(quote).opacity).toBe("1");
    } finally {
      await commands.emulateMedia({ reducedMotion: "no-preference" });
    }
  });

  it("is a button with onActivate, named by the quote, which the keyboard reaches before the remove button", async () => {
    const onActivate = vi.fn();
    const { host, textarea } = await render(<Composer label="Reply to Ana" quote={quoteOf({ excerpt: "Lunch on Friday?", onActivate })} onSend={() => {}} />);
    const button = page.getByRole("button", { name: "Quoting Ana Lind: Lunch on Friday?" });
    await userEvent.click(button);
    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(button.element().getAttribute("type")).toBe("button");
    expect(button.element().getAttribute("data-ouro-part")).toBe("quote");
    textarea.focus();
    await pressTab({ shift: true });
    await pressTab({ shift: true });
    expect(document.activeElement).toBe(button.element());
    await userEvent.keyboard("{Enter}");
    expect(onActivate).toHaveBeenCalledTimes(2);
    expect(host.querySelectorAll("[data-ouro-composer-quote-bar]")).toHaveLength(1);
  });

  it("is no button without onActivate", async () => {
    const { host } = await render(<Composer label="Reply to Ana" quote={quoteOf()} onSend={() => {}} />);
    expect(host.querySelector('[data-ouro-part="quote"]')).toBeNull();
    expect(host.querySelectorAll("button")).toHaveLength(2);
  });

  it("turns the remove button off with the rest of a disabled composer", async () => {
    const { remove } = await render(<Composer label="Reply to Ana" disabled quote={quoteOf()} onSend={() => {}} />);
    expect(remove!.disabled).toBe(true);
  });

  it("matches Message's quote in its author and excerpt once the reply is sent", async () => {
    const { host } = await render(
      <>
        <Composer label="Reply to Ana" quote={quoteOf()} onSend={() => {}} />
        {/* A raised bubble: inside a filled one, the quote takes the bubble's own colors. */}
        <Message variant="chat" bubble="raised" role="user" name="Priya Okafor" quote={{ author: "Ana Lind", excerpt: lunch }}>
          Sounds good
        </Message>
      </>,
    );
    const composer = host.querySelector<HTMLElement>("[data-ouro-composer-quote]")!;
    const sent = host.querySelector<HTMLElement>("[data-ouro-message-quote]")!;
    const same = (a: Element, b: Element, properties: string[]) => {
      for (const property of properties) expect(getComputedStyle(a).getPropertyValue(property), property).toBe(getComputedStyle(b).getPropertyValue(property));
    };
    same(composer.querySelector("[data-ouro-composer-quote-author]")!, sent.querySelector("[data-ouro-message-quote-author]")!, ["font-size", "font-weight", "color"]);
    same(composer.querySelector("[data-ouro-composer-quote-excerpt]")!, sent.querySelector("[data-ouro-message-quote-excerpt]")!, ["font-size", "color", "text-overflow", "white-space"]);
  });
});

const expandButton = () => document.querySelector<HTMLButtonElement>('[data-ouro-control="composer"][data-ouro-part="expand"]');
const formatting = <Button variant="plain" aria-label="Bold">B</Button>;

describe("Composer expanded", () => {
  it("shows the expand button first among the actions, pressed while expanded, with the toolbar only while expanded", async () => {
    const onExpandedChange = vi.fn();
    const { root, textarea } = await render(
      <Composer label="Reply" defaultExpanded={false} onExpandedChange={onExpandedChange} toolbar={formatting} actions={<Button variant="plain" aria-label="Emoji">:)</Button>} onSend={() => {}} />,
    );
    const button = expandButton()!;
    expect(button.parentElement!.firstElementChild).toBe(button);
    expect(button.getAttribute("aria-pressed")).toBe("false");
    await expect.element(page.getByRole("button", { name: "Expand", pressed: false })).toBeVisible();
    expect(root.querySelector("[data-ouro-composer-toolbar]")).toBeNull();
    expect(root.hasAttribute("data-expanded")).toBe(false);
    expect(textarea.rows).toBe(1);
    const iconPath = () => button.querySelector("svg[aria-hidden='true'] path")!.getAttribute("d");
    const collapsedIcon = iconPath();
    await userEvent.click(button);
    expect(onExpandedChange).toHaveBeenCalledWith(true);
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(root.getAttribute("data-expanded")).toBe("");
    expect(iconPath()).toMatch(/^M\d/);
    expect(collapsedIcon).toMatch(/^M\d/);
    expect(iconPath()).not.toBe(collapsedIcon);
    expect(root.querySelector("[data-ouro-composer-toolbar]")!.textContent).toBe("B");
    expect(textarea.rows).toBe(6);
    await expect.poll(() => textarea.getBoundingClientRect().height).toBeGreaterThanOrEqual(6 * parseFloat(getComputedStyle(textarea).lineHeight));
    await userEvent.click(button);
    expect(onExpandedChange).toHaveBeenLastCalledWith(false);
    await expect.poll(() => root.querySelector("[data-ouro-composer-toolbar]")).toBeNull();
    expect(iconPath()).toBe(collapsedIcon);
    expect(warn).not.toHaveBeenCalled();
  });

  it("draws the pressed expand button as an outlined primary Button, and the other as a plain one, and keeps focus in the text on a press", async () => {
    const { host } = await render(
      <>
        <Composer label="Reply" defaultExpanded={false} onSend={() => {}} />
        <Button variant="outline" tone="primary" aria-label="Outlined" data-test-harness="">o</Button>
        <Button variant="plain" tone="secondary" aria-label="Plain" data-test-harness="">p</Button>
      </>,
    );
    const look = (element: Element) => ["border-top-color", "color", "background-color"].map((property) => getComputedStyle(element).getPropertyValue(property));
    const [outlined, plain] = [...host.querySelectorAll("[data-test-harness]")];
    expect(look(expandButton()!)).toEqual(look(plain!));
    await userEvent.click(expandButton()!);
    await expect.poll(() => look(expandButton()!)).toEqual(look(outlined!));
    const down = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    expandButton()!.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
    expect(warn).not.toHaveBeenCalled();
  });

  it("can expand with onExpandedChange alone, and hides the toolbar of a collapsed composer the app controls without listening", async () => {
    const onExpandedChange = vi.fn();
    const { root, rerender } = await render(<Composer label="Reply" onExpandedChange={onExpandedChange} toolbar={formatting} onSend={() => {}} />);
    expect(root.querySelector("[data-ouro-composer-toolbar]")).toBeNull();
    await userEvent.click(expandButton()!);
    expect(onExpandedChange).toHaveBeenCalledWith(true);
    await rerender(<Composer label="Reply" expanded={false} toolbar={formatting} onSend={() => {}} />);
    expect(expandButton()).toBeNull();
    expect(root.querySelector("[data-ouro-composer-toolbar]")).toBeNull();
  });

  it("gives the expanded text the whole width, with the buttons on a row under it", async () => {
    const { textarea, send, frame, rerender } = await render(<Composer label="Reply" defaultExpanded onSend={() => {}} />, 600);
    expect(textarea.getBoundingClientRect().right).toBeGreaterThan(send.getBoundingClientRect().left);
    expect(textarea.getBoundingClientRect().width).toBeGreaterThan(frame.getBoundingClientRect().width * 0.9);
    expect(send.getBoundingClientRect().top).toBeGreaterThanOrEqual(textarea.getBoundingClientRect().bottom);
    await rerender(<Composer label="Reply" defaultExpanded onSend={() => {}} />);
    await userEvent.click(expandButton()!);
    expect(send.getBoundingClientRect().top).toBeLessThan(textarea.getBoundingClientRect().bottom);
  });

  it("shows no expand button, and the toolbar as passed, in a composer that does not expand", async () => {
    const { root } = await render(<Composer label="Reply" toolbar={formatting} onSend={() => {}} />);
    expect(expandButton()).toBeNull();
    expect(root.querySelector("[data-ouro-composer-toolbar]")).not.toBeNull();
  });

  it("names the expand button with expandLabel, grows to expandedRows and expandedMaxRows, and turns the button off with the composer", async () => {
    const { textarea, rerender } = await render(<Composer label="Reply" defaultExpanded expandLabel="Long message" expandedRows={4} expandedMaxRows={5} onSend={() => {}} />);
    await expect.element(page.getByRole("button", { name: "Long message", pressed: true })).toBeVisible();
    expect(textarea.rows).toBe(4);
    const line = parseFloat(getComputedStyle(textarea).lineHeight);
    textarea.focus();
    await userEvent.keyboard("1{Enter}2{Enter}3{Enter}4{Enter}5{Enter}6{Enter}7");
    expect(textarea.getBoundingClientRect().height).toBeCloseTo(5 * line + parseFloat(getComputedStyle(textarea).paddingTop) * 2, 0);
    await rerender(<Composer label="Reply" defaultExpanded disabled onSend={() => {}} />);
    expect(expandButton()!.disabled).toBe(true);
  });

  it("starts a new line on Enter and sends on Ctrl+Enter or Command+Enter, whatever sendOn says", async () => {
    const onSend = vi.fn();
    const { textarea } = await render(<Composer label="Reply" sendOn="enter" defaultExpanded onSend={onSend} />);
    textarea.focus();
    await userEvent.keyboard("one{Enter}two");
    expect(onSend).not.toHaveBeenCalled();
    expect(textarea.value).toBe("one\ntwo");
    await userEvent.keyboard("{Control>}{Enter}{/Control}");
    expect(onSend).toHaveBeenCalledWith("one\ntwo", expect.anything());
    await userEvent.keyboard("three{Meta>}{Enter}{/Meta}");
    expect(onSend).toHaveBeenLastCalledWith("three", expect.anything());
  });

  it("never sends while a suggestion list is open, Ctrl+Enter included", async () => {
    const onSend = vi.fn();
    const { textarea } = await render(
      <Autocomplete triggers={[{ char: "@", label: "People", items: [{ value: "mara", label: "Mara Quill" }] }]}>
        <Composer label="Reply" defaultExpanded onSend={onSend} />
      </Autocomplete>,
    );
    textarea.focus();
    await userEvent.keyboard("Hi @ma");
    await expect.poll(() => textarea.hasAttribute("aria-activedescendant")).toBe(true);
    await userEvent.keyboard("{Control>}{Enter}{/Control}");
    expect(onSend).not.toHaveBeenCalled();
    await userEvent.keyboard("{Escape}");
    await expect.poll(() => textarea.hasAttribute("aria-activedescendant")).toBe(false);
    await userEvent.keyboard("{Control>}{Enter}{/Control}");
    expect(onSend).toHaveBeenCalledWith("Hi @ma", expect.anything());
  });

  it("leaves a rich composer's editor a multiline textbox with its placeholder without an Autocomplete, and a combobox with neither inside one", async () => {
    const bare = await render(<Composer label="Bare rich" format="rich" placeholder="Say hi" onSend={() => {}} />);
    await expect.poll(() => bare.host.querySelector("[data-ouro-composer-editor]")).not.toBeNull();
    const plain = bare.host.querySelector<HTMLElement>("[data-ouro-composer-editor]")!;
    expect(plain.getAttribute("role")).toBe("textbox");
    expect(plain.getAttribute("aria-multiline")).toBe("true");
    expect(plain.getAttribute("aria-placeholder")).toBe("Say hi");
    expect(plain.hasAttribute("aria-expanded")).toBe(false);
    expect(plain.hasAttribute("aria-autocomplete")).toBe(false);
    const wrapped = await render(
      <Autocomplete triggers={[{ char: "@", label: "People", items: [{ value: "mara", label: "Mara Quill" }] }]}>
        <Composer label="Wrapped rich" format="rich" placeholder="Say hi" onSend={() => {}} />
      </Autocomplete>,
    );
    await expect.poll(() => wrapped.host.querySelector("[data-ouro-composer-editor]")).not.toBeNull();
    const boxed = wrapped.host.querySelector<HTMLElement>("[data-ouro-composer-editor]")!;
    expect(boxed.getAttribute("role")).toBe("combobox");
    expect(boxed.hasAttribute("aria-multiline")).toBe(false);
    expect(boxed.hasAttribute("aria-placeholder")).toBe(false);
  });

  it("gives a rich composer's editor the combobox attributes of an open and a closed suggestion list", async () => {
    const { host } = await render(
      <Autocomplete triggers={[{ char: "@", label: "People", items: [{ value: "mara", label: "Mara Quill" }] }]}>
        <Composer label="Reply rich" format="rich" onSend={() => {}} />
      </Autocomplete>,
    );
    const find = () => host.querySelector<HTMLElement>("[data-ouro-composer-editor]");
    await expect.poll(find).not.toBeNull();
    const box = find()!;
    expect(box.getAttribute("role")).toBe("combobox");
    expect(box.getAttribute("aria-expanded")).toBe("false");
    expect(box.getAttribute("aria-autocomplete")).toBe("list");
    expect(box.hasAttribute("aria-controls")).toBe(false);
    expect(box.hasAttribute("aria-activedescendant")).toBe(false);
    box.focus();
    await userEvent.keyboard("Hi @ma");
    await expect.poll(() => box.getAttribute("aria-expanded")).toBe("true");
    expect(document.getElementById(box.getAttribute("aria-controls")!)?.getAttribute("role")).toBe("listbox");
    await expect.poll(() => box.getAttribute("aria-activedescendant")).toMatch(/\S/);
    expect(document.getElementById(box.getAttribute("aria-activedescendant")!)?.getAttribute("role")).toBe("option");
    await userEvent.keyboard("{Escape}");
    await expect.poll(() => box.getAttribute("aria-expanded")).toBe("false");
    expect(box.hasAttribute("aria-controls")).toBe(false);
  });

  it("keeps the text, focus and the caret when it expands and collapses", async () => {
    const { textarea } = await render(<Composer label="Reply" defaultExpanded={false} onSend={() => {}} />);
    textarea.focus();
    await userEvent.keyboard("Hello world");
    textarea.setSelectionRange(5, 5);
    await userEvent.click(expandButton()!);
    expect(document.activeElement).toBe(textarea);
    expect([textarea.value, textarea.selectionStart, textarea.selectionEnd]).toEqual(["Hello world", 5, 5]);
    await pressTab();
    expect(document.activeElement).toBe(expandButton());
    await userEvent.keyboard("{Enter}");
    expect(expandButton()!.getAttribute("aria-pressed")).toBe("false");
    expect(document.activeElement).toBe(textarea);
    expect([textarea.value, textarea.selectionStart, textarea.selectionEnd]).toEqual(["Hello world", 5, 5]);
  });

  it("collapses on Escape, and that Escape goes no further", async () => {
    const outer = vi.fn();
    const onExpandedChange = vi.fn();
    const { textarea, root } = await render(
      <div onKeyDown={outer}>
        <Composer label="Reply" defaultExpanded onExpandedChange={onExpandedChange} defaultValue="Draft" onSend={() => {}} />
      </div>,
    );
    textarea.focus();
    const escape = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    await act(async () => void textarea.dispatchEvent(escape));
    expect(escape.defaultPrevented).toBe(true);
    expect(onExpandedChange).toHaveBeenCalledWith(false);
    expect(root.hasAttribute("data-expanded")).toBe(false);
    expect(outer).not.toHaveBeenCalled();
    expect(textarea.value).toBe("Draft");
    // Collapsed, Escape is the app's again.
    await userEvent.keyboard("{Escape}");
    expect(outer).toHaveBeenCalledTimes(1);
  });

  it("leaves Escape to an input method, to the app's onKeyDown, and to an app that controls it without listening", async () => {
    const outer = vi.fn();
    const { textarea, rerender } = await render(
      <div onKeyDown={outer}>
        <Composer label="Reply" expanded onSend={() => {}} />
      </div>,
    );
    expect(expandButton()).toBeNull();
    textarea.focus();
    await userEvent.keyboard("{Escape}");
    expect(outer).toHaveBeenCalledTimes(1);
    const onExpandedChange = vi.fn();
    await rerender(
      <div onKeyDown={outer}>
        <Composer label="Reply" expanded onExpandedChange={onExpandedChange} onKeyDown={(event) => event.key === "Escape" && event.preventDefault()} onSend={() => {}} />
      </div>,
    );
    await userEvent.keyboard("{Escape}");
    for (const init of [{ isComposing: true }, { keyCode: 229 }]) {
      await act(async () => void textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true, ...init })));
    }
    expect(onExpandedChange).not.toHaveBeenCalled();
  });

  it("is controlled with expanded and onExpandedChange", async () => {
    const onExpandedChange = vi.fn();
    const { root, rerender } = await render(<Composer label="Reply" expanded={false} onExpandedChange={onExpandedChange} onSend={() => {}} />);
    await userEvent.click(expandButton()!);
    expect(onExpandedChange).toHaveBeenCalledWith(true);
    expect(root.hasAttribute("data-expanded")).toBe(false);
    await rerender(<Composer label="Reply" expanded onExpandedChange={onExpandedChange} onSend={() => {}} />);
    expect(root.hasAttribute("data-expanded")).toBe(true);
    expect(expandButton()!.getAttribute("aria-pressed")).toBe("true");
  });

  it("does not animate when expanding leaves the box its height", async () => {
    const { root } = await render(<Composer label="Reply" defaultExpanded={false} expandedRows={1} onSend={() => {}} />, 200);
    const frame = root.querySelector<HTMLElement>("[data-ouro-composer-frame]")!;
    await userEvent.click(expandButton()!);
    expect(frame.getAnimations()).toEqual([]);
    expect(frame.hasAttribute("data-ouro-moving")).toBe(false);
  });
});

describe("Composer expanded motion", () => {
  const token = (name: string) => parseDuration(getComputedStyle(document.documentElement).getPropertyValue(name));
  const frameOf = (root: HTMLElement) => root.querySelector<HTMLElement>("[data-ouro-composer-frame]")!;
  /** The top of the frame's clip, in pixels: how much of its height the clip still hides. */
  const clipTop = (frame: HTMLElement) => Number(/inset\(([\d.]+)px/.exec(getComputedStyle(frame).clipPath)?.[1] ?? 0);
  const rects = (...elements: Element[]) => elements.map((element) => JSON.stringify(element.getBoundingClientRect().toJSON()));
  /** The share of a cubic-bezier(0.32, 0.72, 0, 1) change made between two moments, as fractions of its duration. */
  const curve = (t: number) => {
    let low = 0;
    let high = 1;
    const x = (u: number) => 3 * (1 - u) ** 2 * u * 0.32 + 3 * (1 - u) * u ** 2 * 0 + u ** 3;
    for (let i = 0; i < 40; i++) {
      const mid = (low + high) / 2;
      if (x(mid) < t) low = mid;
      else high = mid;
    }
    const u = (low + high) / 2;
    return 3 * (1 - u) ** 2 * u * 0.72 + 3 * (1 - u) * u ** 2 + u ** 3;
  };
  /** The most the curve moves in `dt` ms of a `duration` ms change, as a fraction of the change. */
  const largestStep = (dt: number, duration: number) => {
    let most = 0;
    for (let at = 0; at <= duration; at += duration / 400) most = Math.max(most, curve(Math.min(at + dt, duration) / duration) - curve(at / duration));
    return most;
  };

  /** Runs `change` while sampling the frame on every animation frame, until the move it starts has ended. */
  async function sampled(frame: HTMLElement, others: Element[], change: () => Promise<void>) {
    const samples: Array<{ at: number; height: number; moving: boolean; others: string[]; duration: number }> = [];
    let sampling = true;
    const loop = (at: number) => {
      const moving = frame.hasAttribute("data-ouro-moving");
      samples.push({
        at,
        height: frame.getBoundingClientRect().height - clipTop(frame),
        moving,
        others: rects(...others),
        duration: moving ? parseDuration(getComputedStyle(frame).animationDuration.split(",")[0]!) : 0,
      });
      if (sampling) requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    await change();
    await expect.poll(() => samples.some((sample) => sample.moving)).toBe(true);
    await expect.poll(() => !samples.at(-1)!.moving).toBe(true);
    sampling = false;
    return samples;
  }

  const unsettledHeader = () => {
    const header = document.createElement("header");
    header.style.height = "40px";
    return header;
  };

  it("moves one way in steps the curve allows, with no layout of the page around it, and ends on one line", async () => {
    const { host, root, textarea } = await render(<Composer label="Reply" defaultExpanded={false} onSend={() => {}} />);
    const header = unsettledHeader();
    const thread = document.createElement("div");
    thread.style.height = "120px";
    host.prepend(header, thread);
    const frame = frameOf(root);
    const oneLine = frame.getBoundingClientRect().height;
    const heights: number[] = [];
    for (const open of [true, false]) {
      const samples = await sampled(frame, [header, thread], () => userEvent.click(expandButton()!));
      const moving = samples.filter((sample) => sample.moving);
      expect(moving.length).toBeGreaterThan(1);
      const first = samples[0]!.height;
      const last = samples.at(-1)!.height;
      heights.push(last);
      const change = Math.abs(last - first);
      expect(change).toBeGreaterThan(20);
      samples.slice(1).forEach((sample, index) => {
        const step = sample.height - samples[index]!.height;
        // One direction only, and no step bigger than the curve makes in the time that frame really took.
        expect(open ? step : -step).toBeGreaterThanOrEqual(-0.5);
        const allowed = largestStep(sample.at - samples[index]!.at, moving[0]!.duration) * change + 2;
        expect(Math.abs(step)).toBeLessThanOrEqual(allowed);
        expect(sample.others).toEqual(samples[0]!.others);
      });
      expect(frame.hasAttribute("data-ouro-moving")).toBe(false);
      expect(frame.style.minHeight).toBe("");
      expect(frame.style.getPropertyValue("--ouro-composer-gap")).toBe("");
      if (!open) {
        expect(textarea.rows).toBe(1);
        expect(Math.abs(frame.getBoundingClientRect().height - oneLine)).toBeLessThan(0.75);
      }
    }
    expect(heights[0]!).toBeGreaterThan(heights[1]!);
  });

  it("tells the surroundings the heights it moves between, and when it has stopped", async () => {
    const { host, root } = await render(<Composer label="Reply" defaultExpanded={false} onSend={() => {}} />);
    const moves: ComposerMove[] = [];
    host.addEventListener("ouro-composer-move", (event) => moves.push((event as CustomEvent<ComposerMove>).detail));
    await userEvent.click(expandButton()!);
    expect(moves).toHaveLength(1);
    expect(moves[0]!.to).toBeGreaterThan(moves[0]!.from);
    expect(frameOf(root).getBoundingClientRect().height).toBeCloseTo(moves[0]!.to, 0);
    await moves[0]!.playing;
    expect(frameOf(root).hasAttribute("data-ouro-moving")).toBe(false);
    await userEvent.click(expandButton()!);
    expect(moves).toHaveLength(2);
    expect(moves[1]!.from).toBeCloseTo(moves[0]!.to, 0);
    expect(moves[1]!.to).toBeLessThan(moves[1]!.from);
    await moves[1]!.playing;
  });

  it("starts the move back from the height the clip had left to clear when it is turned round mid-way", async () => {
    const { host, root } = await render(<Composer label="Reply" defaultExpanded={false} onSend={() => {}} />);
    const moves: ComposerMove[] = [];
    host.addEventListener("ouro-composer-move", (event) => moves.push((event as CustomEvent<ComposerMove>).detail));
    await act(async () => expandButton()!.click());
    expect(moves).toHaveLength(1);
    expect(frameOf(root).getAttribute("data-ouro-moving")).toBe("grow");
    const clipped = getComputedStyle(frameOf(root)).clipPath;
    await expect.poll(() => getComputedStyle(frameOf(root)).clipPath).not.toBe(clipped);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    await act(async () => expandButton()!.click());
    expect(moves).toHaveLength(2);
    expect(moves[1]!.from).toBeLessThan(moves[0]!.to - 1);
    expect(moves[1]!.from).toBeGreaterThan(moves[0]!.from - 2);
    // The first move's own frames are over by now, and leave the second move running.
    for (let i = 0; i < 6; i++) await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(frameOf(root).getAttribute("data-ouro-moving")).toBe("shrink");
    await moves[1]!.playing;
  });

  it("keeps the long layout's height for a collapse that is turned round at once", async () => {
    const { host, root } = await render(<Composer label="Reply" defaultExpanded onSend={() => {}} />);
    const moves: ComposerMove[] = [];
    host.addEventListener("ouro-composer-move", (event) => moves.push((event as CustomEvent<ComposerMove>).detail));
    await act(async () => expandButton()!.click());
    const clipped = getComputedStyle(frameOf(root)).clipPath;
    await expect.poll(() => getComputedStyle(frameOf(root)).clipPath).not.toBe(clipped);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    await act(async () => expandButton()!.click());
    expect(moves).toHaveLength(2);
    expect(moves[1]!.from).toBeGreaterThan(moves[0]!.to + 1);
    expect(moves[1]!.from).toBeLessThan(moves[0]!.from + 1);
    await moves[1]!.playing;
  });

  it("keeps the toolbar on screen while a collapse fades it out, and takes it away at the end", async () => {
    const { root } = await render(<Composer label="Reply" defaultExpanded toolbar={<span>Tools</span>} onSend={() => {}} />);
    const toolbar = () => root.querySelector('[data-ouro-part="toolbar"]');
    await act(async () => expandButton()!.click());
    expect(toolbar()).not.toBeNull();
    await expect.poll(() => toolbar()).toBeNull();
    expect(frameOf(root).hasAttribute("data-ouro-moving")).toBe(false);
  });

  it("takes the collapsing toolbar out of the DOM in the same commit that clears data-ouro-moving, with no frame showing the full-height box and the toolbar together", async () => {
    const { root } = await render(<Composer label="Reply" defaultExpanded toolbar={<span>Tools</span>} onSend={() => {}} />);
    const frame = frameOf(root);
    const toolbar = () => root.querySelector('[data-ouro-part="toolbar"]');
    await act(async () => expandButton()!.click());
    expect(frame.hasAttribute("data-ouro-moving")).toBe(true);
    // flushSync forces the toolbar's unmount to commit before data-ouro-moving clears (see the comment
    // on `end` in composer.tsx); without it, the unmount is a later, separately scheduled React commit,
    // so a MutationObserver callback woken by the attribute clearing (a microtask, ahead of that
    // scheduled commit) would still see the toolbar in the DOM.
    let toolbarGoneWhenMovingCleared: boolean | null = null;
    const observer = new MutationObserver(() => {
      if (toolbarGoneWhenMovingCleared === null && !frame.hasAttribute("data-ouro-moving")) toolbarGoneWhenMovingCleared = toolbar() === null;
    });
    observer.observe(frame, { attributes: true, attributeFilter: ["data-ouro-moving"] });
    try {
      await expect.poll(() => toolbarGoneWhenMovingCleared).not.toBeNull();
      expect(toolbarGoneWhenMovingCleared).toBe(true);
    } finally {
      observer.disconnect();
    }
  });

  it("takes the toolbar away at once when motion is reduced", async () => {
    const { root } = await render(<Composer label="Reply" defaultExpanded toolbar={<span>Tools</span>} onSend={() => {}} />);
    try {
      await commands.emulateMedia({ reducedMotion: "reduce" });
      await act(async () => expandButton()!.click());
      expect(root.querySelector('[data-ouro-part="toolbar"]')).toBeNull();
    } finally {
      await commands.emulateMedia({ reducedMotion: "no-preference" });
    }
  });

  it("holds the long height only while a collapse runs, and leaves no variables behind", async () => {
    const { root, host } = await render(<Composer label="Reply" defaultExpanded onSend={() => {}} />);
    const frame = frameOf(root);
    const moves: ComposerMove[] = [];
    host.addEventListener("ouro-composer-move", (event) => moves.push((event as CustomEvent<ComposerMove>).detail));
    await act(async () => expandButton()!.click());
    expect(frame.style.minHeight).not.toBe("");
    expect(frame.style.getPropertyValue("--ouro-composer-gap")).not.toBe("");
    expect(frame.style.getPropertyValue("--ouro-composer-radius")).not.toBe("");
    await moves[0]!.playing;
    expect(frame.style.minHeight).toBe("");
    expect(frame.style.getPropertyValue("--ouro-composer-gap")).toBe("");
    expect(frame.style.getPropertyValue("--ouro-composer-radius")).toBe("");
    await act(async () => expandButton()!.click());
    expect(frame.style.minHeight).toBe("");
    await moves[1]!.playing;
  });

  it("lets a move's promise settle when the box is removed mid-way", async () => {
    const { host, root } = await render(<Composer label="Reply" defaultExpanded={false} onSend={() => {}} />);
    const moves: ComposerMove[] = [];
    host.addEventListener("ouro-composer-move", (event) => moves.push((event as CustomEvent<ComposerMove>).detail));
    await act(async () => expandButton()!.click());
    expect(frameOf(root).hasAttribute("data-ouro-moving")).toBe(true);
    await act(async () => roots.splice(0).forEach((r) => r.unmount()));
    await moves[0]!.playing;
  });

  it("clips and fades the box in over a moment, and only fades the toolbar in with reduced motion", async () => {
    const { root } = await render(<Composer label="Reply" defaultExpanded={false} toolbar={<span>Tools</span>} onSend={() => {}} />);
    const toolbar = () => root.querySelector<HTMLElement>('[data-ouro-part="toolbar"]')!;
    const fast = token("--ouro-duration-fast");
    const slow = token("--ouro-duration-slow");
    try {
      for (const reduced of [false, true]) {
        await commands.emulateMedia({ reducedMotion: reduced ? "reduce" : "no-preference" });
        // A synchronous click, so a slow browser cannot let the animations end before they are read.
        await act(async () => expandButton()!.click());
        if (reduced) {
          expect(getComputedStyle(frameOf(root)).clipPath).toBe("none");
          await Promise.all([
            expectNoMotion(frameOf(root), { stem: "composer", state: "data-expanded", reduced }),
            expectMotion(toolbar(), { stem: "composer", state: "data-expanded", properties: { opacity: fast }, reduced }),
          ]);
        } else {
          await Promise.all([
            expectMotion(frameOf(root), { stem: "composer", state: "data-expanded", properties: { "--ouro-composer-inset": slow }, reduced }),
            expectMotion(toolbar(), { stem: "composer", state: "data-expanded", properties: { opacity: slow, transform: slow }, reduced }),
          ]);
        }
        await userEvent.click(expandButton()!);
        await expect.poll(() => frameOf(root).hasAttribute("data-ouro-moving")).toBe(false);
      }
    } finally {
      await commands.emulateMedia({ reducedMotion: "no-preference" });
    }
  });

  it("only fades the toolbar in with reduced motion, and clips nothing", async () => {
    const { root, frame } = await render(<Composer label="Reply" defaultExpanded={false} toolbar={<span>Tools</span>} onSend={() => {}} />);
    await commands.emulateMedia({ reducedMotion: "reduce" });
    try {
      // A synchronous click, so a slow browser cannot let the fade end before it is read.
      await act(async () => expandButton()!.click());
      expect(frame.getAnimations().filter((animation) => (animation as CSSAnimation).animationName === "ouro-composer-reveal")).toEqual([]);
      expect(getComputedStyle(frame).clipPath).toBe("none");
      const names = root.querySelector<HTMLElement>('[data-ouro-part="toolbar"]')!.getAnimations().map((animation) => (animation as CSSAnimation).animationName);
      expect(names).toEqual(["ouro-composer-fade-in"]);
      await userEvent.click(expandButton()!);
      expect(frame.hasAttribute("data-ouro-moving")).toBe(false);
    } finally {
      await commands.emulateMedia({ reducedMotion: "no-preference" });
    }
  });
});

/** The platform's command key, as userEvent names it. */
const mod = () => (isApple() ? "Meta" : "Control");
/** Presses a shortcut, `mod` and the other modifiers held: `press("shift", "x")`. */
async function press(...keys: string[]) {
  const held = [mod(), ...keys.slice(0, -1).map((key) => ({ shift: "Shift", alt: "Alt" })[key]!)];
  await userEvent.keyboard(`${held.map((key) => `{${key}>}`).join("")}${keys.at(-1)}${held.reverse().map((key) => `{/${key}}`).join("")}`);
}
const undo = () => act(async () => void document.execCommand("undo"));
/** WebKit (Safari) can join edits made in a row into one Undo step, as it joins typing (on macOS it does, on Linux not always); Chromium keeps each its own. */
const webkit = () => !/Chrome\//.test(navigator.userAgent);
const redo = () => act(async () => void document.execCommand("redo"));
/** The text with the selection drawn in brackets. */
const marked = (textarea: HTMLTextAreaElement) => {
  const { value, selectionStart: start, selectionEnd: end } = textarea;
  return `${value.slice(0, start)}[${value.slice(start, end)}]${value.slice(end)}`;
};
/** A change from formatEdit, applied, with the selection in brackets. */
const edited = (value: string, start: number, end: number, kind: Parameters<typeof formatEdit>[3]) => {
  const change = formatEdit(value, start, end, kind);
  const next = value.slice(0, change.from) + change.text + value.slice(change.to);
  return `${next.slice(0, change.start)}[${next.slice(change.start, change.end)}]${next.slice(change.end)}`;
};

describe("Composer shortcuts' platform", () => {
  it.each([
    ["macOS", "Meta"],
    ["Windows", "Control"],
  ] as const)("names the expand shortcut's mod as %s's own modifier", async (platform, modifier) => {
    onPlatform(platform);
    await render(<Composer label="Reply" defaultExpanded={false} onSend={() => {}} />);
    expect(expandButton()!.getAttribute("aria-keyshortcuts")).toBe(`${modifier}+Shift+X`);
  });

  it("names the expand shortcut's mod both ways on the server", () => {
    const html = renderToString(<Composer label="Reply" defaultExpanded={false} onSend={() => {}} />);
    expect(html).toContain('aria-keyshortcuts="Control+Shift+X Meta+Shift+X"');
  });
});

describe("Composer formatting", () => {
  it("applies Teams' formatting keys, and takes each back with Undo and gives it again with Redo", async () => {
    const onValueChange = vi.fn();
    const { textarea } = await render(<Composer label="Reply" formatting defaultValue="Ship it today" onValueChange={onValueChange} onSend={() => {}} />);
    textarea.focus();
    // Selects two characters from `at` as a person does, with Shift and the arrow keys, then holds the
    // shortcut's modifiers, in one call: a round trip to the real browser is the cost worth cutting, not keystrokes.
    const selectAndPress = async (at: number, keys: readonly string[]) => {
      textarea.setSelectionRange(at, at);
      const held = [mod(), ...keys.slice(0, -1).map((key) => ({ shift: "Shift", alt: "Alt" })[key]!)];
      await userEvent.keyboard(
        `{Shift>}{ArrowRight}{ArrowRight}{/Shift}${held.map((key) => `{${key}>}`).join("")}${keys.at(-1)}${held.reverse().map((key) => `{/${key}}`).join("")}`,
      );
    };
    let before = "";
    for (const [keys, mark] of [
      [["b"], "**"],
      [["i"], "_"],
      [["u"], "++"],
      [["alt", "x"], "~~"],
      [["shift", "c"], "`"],
    ] as const) {
      await selectAndPress(5, keys);
      expect(marked(textarea), mark).toBe(`Ship ${mark}[it]${mark} today`);
      expect(onValueChange).toHaveBeenLastCalledWith(`Ship ${mark}it${mark} today`);
      await undo();
      // WebKit may take back the last key's change with the one before it, which put the text back to plain.
      expect(webkit() && before ? ["Ship it today", `Ship ${before}it${before} today`] : ["Ship it today"], mark).toContain(textarea.value);
      await redo();
      expect(textarea.value, mark).toBe(`Ship ${mark}it${mark} today`);
      // The same key again takes the mark away.
      await selectAndPress(5 + mark.length, keys);
      expect(marked(textarea), mark).toBe("Ship [it] today");
      before = mark;
    }
  });

  it("leaves the keys to the browser without formatting, and leaves other modifiers alone", async () => {
    const { textarea, rerender } = await render(<Composer label="Reply" defaultValue="Ship it" onSend={() => {}} />);
    textarea.focus();
    textarea.setSelectionRange(0, 4);
    await press("b");
    expect(textarea.value).toBe("Ship it");
    await rerender(<Composer label="Reply" formatting defaultValue="Ship it" onSend={() => {}} />);
    await press("shift", "b");
    await press("alt", "b");
    expect(textarea.value).toBe("Ship it");
  });

  it("formats and inserts from editorRef, each a step that Undo takes back", async () => {
    const editor = createRef<ComposerEditor>();
    const { textarea, host } = await render(
      <>
        <button type="button" data-test-harness="">
          Format
        </button>
        <Composer label="Reply" editorRef={editor} defaultValue={"eggs\nflour"} onSend={() => {}} />
      </>,
    );
    // As from a formatting bar: focus is on its button when the format is applied.
    const fromBar = async (change: () => void) => {
      host.querySelector("button")!.focus();
      await act(async () => change());
    };
    textarea.setSelectionRange(0, 10);
    await fromBar(() => editor.current!.format("bullets"));
    expect(marked(textarea)).toBe("[- eggs\n- flour]");
    expect(document.activeElement).toBe(textarea);
    await fromBar(() => editor.current!.format("numbers"));
    expect(marked(textarea)).toBe("[1. eggs\n2. flour]");
    await undo();
    // WebKit may take back both formats in one step.
    expect(webkit() ? ["- eggs\n- flour", "eggs\nflour"] : ["- eggs\n- flour"]).toContain(textarea.value);
    if (textarea.value !== "eggs\nflour") await undo();
    expect(textarea.value).toBe("eggs\nflour");
    textarea.setSelectionRange(4, 4);
    await fromBar(() => editor.current!.insert(" 🎉"));
    expect(marked(textarea)).toBe("eggs 🎉[]\nflour");
    await undo();
    expect(textarea.value).toBe("eggs\nflour");
  });

  it("puts a paste through pasteText, as one step that Undo takes back", async () => {
    const pasteText = vi.fn((data: DataTransfer) => (data.getData("text/html") ? "**Saturday**" : undefined));
    const { textarea, rerender } = await render(<Composer label="Reply" defaultValue="See you " pasteText={pasteText} onSend={() => {}} />);
    textarea.focus();
    textarea.setSelectionRange(8, 8);
    const paste = (type: string) => {
      const data = new DataTransfer();
      data.setData(type, "Saturday");
      const event = new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true });
      textarea.dispatchEvent(event);
      return event;
    };
    let event!: ClipboardEvent;
    await act(async () => void (event = paste("text/html")));
    expect(event.defaultPrevented).toBe(true);
    expect(textarea.value).toBe("See you **Saturday**");
    await undo();
    expect(textarea.value).toBe("See you ");
    // Plain text is the browser's own paste.
    await act(async () => void (event = paste("text/plain")));
    expect(event.defaultPrevented).toBe(false);
    // An app's onPaste that takes the paste comes first.
    await rerender(<Composer label="Reply" defaultValue="See you " pasteText={pasteText} onPaste={(paste) => paste.preventDefault()} onSend={() => {}} />);
    pasteText.mockClear();
    await act(async () => void paste("text/html"));
    expect(pasteText).not.toHaveBeenCalled();
    expect(textarea.value).toBe("See you ");
    // Without pasteText, every paste is the browser's own.
    await rerender(<Composer label="Reply" defaultValue="See you " onSend={() => {}} />);
    await act(async () => void (event = paste("text/html")));
    expect(event.defaultPrevented).toBe(false);
  });

  it("changes nothing in a read-only box", async () => {
    const editor = createRef<ComposerEditor>();
    const { textarea } = await render(<Composer label="Reply" formatting readOnly editorRef={editor} defaultValue="Ship it" onSend={() => {}} />);
    textarea.focus();
    textarea.setSelectionRange(0, 4);
    await press("b");
    await act(async () => editor.current!.insert("x"));
    expect(textarea.value).toBe("Ship it");
  });

  it("expands and collapses on Command+Shift+X, and shows the key in the expand button's tooltip", async () => {
    const prevented: boolean[] = [];
    const { root, textarea } = await render(
      <div onKeyDown={(event) => event.code === "KeyX" && prevented.push(event.defaultPrevented)}>
        <Composer label="Reply" defaultExpanded={false} formatting onSend={() => {}} />
      </div>,
    );
    textarea.focus();
    await press("shift", "x");
    expect(prevented).toEqual([true]);
    expect(root.hasAttribute("data-expanded")).toBe(true);
    await press("shift", "x");
    expect(root.hasAttribute("data-expanded")).toBe(false);
    // A format's key is the composer's too.
    await press("alt", "x");
    expect(prevented).toEqual([true, true, true]);
    const button = expandButton()!;
    expect(button.getAttribute("aria-keyshortcuts")).toContain("Shift+X");
    await pressTab();
    expect(document.activeElement).toBe(button);
    const tooltip = () => document.querySelector('[data-ouro="tooltip"]');
    await expect.poll(() => tooltip()?.textContent?.startsWith("Expand")).toBe(true);
    expect(tooltip()!.querySelector('[data-ouro="kbd"]')).not.toBeNull();
    // A composer that does not expand leaves the key alone.
    const plain = await render(<Composer label="Note" defaultValue="x" onSend={() => {}} />);
    plain.textarea.focus();
    await press("shift", "x");
    expect(plain.root.hasAttribute("data-expanded")).toBe(false);
    expect(plain.textarea.value).toBe("x");
  });

  it("lists the keys for a toolbar's tooltips, and reads a press only with exactly its modifiers", () => {
    expect(composerShortcuts).toEqual({ bold: ["mod", "b"], italic: ["mod", "i"], underline: ["mod", "u"], strike: ["mod", "alt", "x"], code: ["mod", "shift", "c"], expand: ["mod", "shift", "x"] });
    const key = (code: string, held: Partial<Record<"metaKey" | "ctrlKey" | "altKey" | "shiftKey", boolean>>) => ({ code, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...held });
    expect(pressed(key("KeyB", { metaKey: true }), ["mod", "b"], true)).toBe(true);
    expect(pressed(key("KeyB", { ctrlKey: true }), ["mod", "b"], true)).toBe(false);
    expect(pressed(key("KeyB", { ctrlKey: true }), ["mod", "b"], false)).toBe(true);
    expect(pressed(key("KeyB", { metaKey: true }), ["mod", "b"], false)).toBe(false);
    expect(pressed(key("KeyX", { metaKey: true, altKey: true }), ["mod", "alt", "x"], true)).toBe(true);
    expect(pressed(key("KeyX", { metaKey: true }), ["mod", "alt", "x"], true)).toBe(false);
    expect(pressed(key("KeyC", { metaKey: true, shiftKey: true }), ["mod", "shift", "c"], true)).toBe(true);
    expect(pressed(key("KeyC", { metaKey: true }), ["mod", "shift", "c"], true)).toBe(false);
    expect(pressed(key("KeyV", { metaKey: true, shiftKey: true }), ["mod", "shift", "c"], true)).toBe(false);
    // The letter alone, or with both Command and Ctrl, is no shortcut.
    expect(pressed(key("KeyB", {}), ["mod", "b"], true)).toBe(false);
    expect(pressed(key("KeyB", { metaKey: true, ctrlKey: true }), ["mod", "b"], true)).toBe(false);
    expect(pressed(key("KeyB", { metaKey: true, ctrlKey: true }), ["mod", "b"], false)).toBe(false);
  });

  it("reads the platform from userAgentData where the browser has it, and from navigator.platform where not", () => {
    // Own properties over the prototype's getters; deleting them brings the browser's back.
    const set = (name: "userAgentData" | "platform", value: unknown) => Object.defineProperty(navigator, name, { value, configurable: true });
    try {
      set("platform", "Linux x86_64");
      set("userAgentData", { platform: "macOS" });
      expect(isApple()).toBe(true);
      set("platform", "MacIntel");
      set("userAgentData", { platform: "Windows" });
      expect(isApple()).toBe(false);
      set("userAgentData", undefined);
      expect(isApple()).toBe(true);
      set("platform", "Win32");
      expect(isApple()).toBe(false);
    } finally {
      delete (navigator as { userAgentData?: unknown }).userAgentData;
      delete (navigator as { platform?: unknown }).platform;
    }
  });

  it("wraps the selection in marks, with spaces outside them, or puts a pair at the caret", () => {
    expect(edited("Ship it today", 4, 8, "bold")).toBe("Ship **[it]** today");
    expect(edited("Ship it today", 7, 7, "italic")).toBe("Ship it_[]_ today");
    expect(edited("Ship   today", 4, 7, "strike")).toBe("Ship   ~~[]~~today");
    expect(edited("it", 0, 2, "code")).toBe("`[it]`");
  });

  it("takes marks away from around the selection or from inside it", () => {
    expect(edited("Ship **it** today", 7, 9, "bold")).toBe("Ship [it] today");
    expect(edited("Ship **it** today", 5, 11, "bold")).toBe("Ship [it] today");
    // A mark on one side only is no pair: the selection is wrapped.
    expect(edited("**it", 2, 4, "bold")).toBe("****[it]**");
    // Marks inside need something between them.
    expect(edited("Ship **** today", 5, 9, "bold")).toBe("Ship **[****]** today");
    expect(edited("Ship it** today", 5, 7, "bold")).toBe("Ship **[it]**** today");
    expect(edited("**its", 0, 5, "bold")).toBe("**[**its]**");
    expect(edited("its**", 0, 5, "bold")).toBe("**[its**]**");
  });

  it("marks the selected lines as a list or quote, numbering them, and takes the markers away when every line has one", () => {
    expect(edited("eggs\n\nflour", 0, 11, "numbers")).toBe("[1. eggs\n\n2. flour]");
    expect(edited("- eggs\nflour", 3, 9, "numbers")).toBe("[1. eggs\n2. flour]");
    expect(edited("> eggs\n\n> flour", 0, 15, "quote")).toBe("[eggs\n\nflour]");
    expect(edited("1. eggs\n2. flour", 0, 16, "numbers")).toBe("[eggs\nflour]");
    expect(edited("Buy:\neggs\nmilk", 6, 6, "bullets")).toBe("Buy:\n[- eggs]\nmilk");
    // A selection that ends just after a line break ends on the line before it.
    expect(edited("eggs\nmilk", 0, 5, "quote")).toBe("[> eggs]\nmilk");
    expect(edited("", 0, 0, "bullets")).toBe("[- ]");
    expect(edited("\n", 0, 0, "bullets")).toBe("[- ]\n");
    // Another kind's marker at the line's start gives way, whatever its number; a dash inside the line stays.
    expect(edited("1. eggs\n10. flour", 0, 17, "bullets")).toBe("[- eggs\n- flour]");
    expect(edited("eggs - flour", 0, 12, "bullets")).toBe("[- eggs - flour]");
    // The caret at a line's start marks that line.
    expect(edited("eggs\nmilk", 5, 5, "bullets")).toBe("eggs\n[- milk]");
    // Some lines marked is not every line: all get the marker.
    expect(edited("> eggs\nflour", 0, 12, "quote")).toBe("[> eggs\n> flour]");
    // A line of spaces is blank: it gets no marker, and does not stop the others' markers going.
    expect(edited("eggs\n  \nflour", 0, 13, "bullets")).toBe("[- eggs\n  \n- flour]");
    expect(edited("- eggs\n  \n- flour", 0, 17, "bullets")).toBe("[eggs\n  \nflour]");
  });

  it("fences the selection as a code block on lines of its own", () => {
    expect(edited("Run npm test now", 4, 12, "codeBlock")).toBe("Run \n```\n[npm test]\n```\n now");
    expect(edited("npm test", 0, 8, "codeBlock")).toBe("```\n[npm test]\n```");
    expect(edited("a\nb\nc", 2, 3, "codeBlock")).toBe("a\n```\n[b]\n```\nc");
    expect(edited("a\nbc", 2, 4, "codeBlock")).toBe("a\n```\n[bc]\n```");
  });
});

describe("Composer development messages", () => {
  it.each([
    ["sendOn", { sendOn: "shift-enter" }, 'sendOn="shift-enter" is not a key; use "enter" or "mod-enter"', '<Composer sendOn="enter">'],
    ["onSubmit", { onSubmit: () => {} }, "onSubmit is not a prop; sending calls onSend", "<Composer onSend={(text) => send(text)}>"],
    ["submitOnEnter", { submitOnEnter: true }, "submitOnEnter is not a prop", '<Composer sendOn="enter">'],
    ["enterToSend", { enterToSend: true }, "enterToSend is not a prop", '<Composer sendOn="enter">'],
    ["loading", { loading: true }, "loading is not a prop", "<Composer sending>"],
    ["sendDisabled", { sendDisabled: true }, "sendDisabled is not a prop; say why sending is off", '<Composer sendDisabledReason="Sending is off">'],
    ["replyTo", { replyTo: "message-1" }, "replyTo is not a prop; the message a reply quotes is quote", '<Composer quote={{ author: "Ana", excerpt: "Lunch?", onRemove }}>'],
    ["expandable", { expandable: true }, "expandable is not a prop; defaultExpanded or onExpandedChange shows the expand button", "<Composer defaultExpanded={false}>"],
  ])("says what to use instead of %s", async (name, extra, problem, fix) => {
    const props = { label: "Message", onSend: () => {}, ...extra } as unknown as ComposerProps;
    const { host } = await render(<Composer {...props} />);
    expect(warn).toHaveBeenCalledWith(`[ouro-ui] Composer: ${problem}. Fix: ${fix}.`);
    for (const element of host.querySelectorAll("*")) expect(element.hasAttribute(name.toLowerCase())).toBe(false);
  });

  it("treats a sendOn that is not a key as enter", async () => {
    const onSend = vi.fn();
    const props = { label: "Message", defaultValue: "Hi", onSend, sendOn: "shift-enter" } as unknown as ComposerProps;
    const { textarea } = await render(<Composer {...props} />);
    textarea.focus();
    await userEvent.keyboard("{Enter}");
    expect(onSend).toHaveBeenCalled();
  });

  it("says that className is for layout", async () => {
    await render(<Composer label="Message" className="bg-red-500" onSend={() => {}} />);
    expect(warn).toHaveBeenCalledWith('[ouro-ui] Composer: "bg-red-500" sets appearance, and className is for layout only. Fix: remove "bg-red-500"; Composer takes its colors from the theme.');
  });

  it("says nothing for the least a composer takes", async () => {
    await render(<Composer label="Message" onSend={() => {}} />);
    expect(warn).not.toHaveBeenCalled();
  });

  it("says nothing for a full, valid composer", async () => {
    await render(
      <Composer
        label="Message"
        placeholder="Write"
        sendOn="mod-enter"
        description="Ctrl+Enter to send"
        actions={<Button variant="plain" aria-label="Emoji">:)</Button>}
        attachments={<Attachment name="menu.pdf" />}
        highlights={[{ start: 0, end: 2, label: "Suggested" }]}
        defaultValue="Hi there"
        quote={{ author: "Ana Lind", excerpt: "Lunch?", avatar: <Avatar name="Ana Lind" alt="" size="xs" />, onRemove: () => {}, onActivate: () => {} }}
        className="mt-2"
        onSend={() => {}}
      />,
    );
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("Composer server rendering", () => {
  const node = (
    <div>
      <Composer label="Message" defaultValue="Hi" description="Ctrl+Enter to send" sendDisabledReason="Sending is off." onSend={() => {}} />
    </div>
  );

  it("renders the box, its description and the reason on the server", () => {
    const doc = new DOMParser().parseFromString(renderToString(node), "text/html");
    const textarea = doc.querySelector("textarea")!;
    expect(textarea.textContent).toBe("Hi");
    expect(textarea.getAttribute("aria-describedby")!.split(" ").map((id) => doc.getElementById(id)!.textContent)).toEqual(["Sending is off.", "Ctrl+Enter to send"]);
  });

  it("renders the quote and the text's description on the server, and hydrates with no error", async () => {
    const quoted = (
      <div>
        <Composer label="Reply to Ana" quote={quoteOf({ excerpt: "Lunch on Friday?" })} onSend={() => {}} />
      </div>
    );
    const html = renderToString(quoted);
    const doc = new DOMParser().parseFromString(html, "text/html");
    const textarea = doc.querySelector("textarea")!;
    expect(textarea.getAttribute("aria-describedby")!.split(" ").map((id) => doc.getElementById(id)!.textContent)).toEqual(["Quoting Ana Lind: ", "Lunch on Friday?"]);
    const host = document.createElement("div");
    host.innerHTML = html;
    document.body.append(host);
    mounted.push(host);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const recoverable = vi.fn();
    let root!: Root;
    await act(async () => {
      root = hydrateRoot(host, quoted, { onRecoverableError: recoverable });
    });
    roots.push(root);
    expect(recoverable).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it("hydrates with no hydration error", async () => {
    const host = document.createElement("div");
    host.innerHTML = renderToString(node);
    document.body.append(host);
    mounted.push(host);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const recoverable = vi.fn();
    let root!: Root;
    await act(async () => {
      root = hydrateRoot(host, node, { onRecoverableError: recoverable });
    });
    roots.push(root);
    expect(recoverable).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
});

describe("Composer with a catalogue", () => {
  const image = (name: string) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><title>${name}</title></svg>`)}`;
  const party: EmojiItem = { id: "party", name: "Party popper", shortcodes: ["party", "tada"], text: "🎉", src: image("party") };
  const wave: EmojiItem = {
    id: "wave",
    name: "Waving hand",
    shortcodes: ["wave"],
    text: "👋",
    src: image("wave"),
    skinTones: [1, 2, 3, 4, 5].map((tone) => ({ id: `wave-tone${tone}`, src: image(`wave tone${tone}`), text: `👋${String.fromCodePoint(0x1f3fa + tone)}` })),
  };
  const coder: EmojiItem = { id: "technologist", name: "Technologist", text: "👩‍💻", src: image("coder") };
  const catalogue: EmojiCatalogue = { categories: [{ id: "people", label: "People", items: [wave, coder, party] }] };
  const box = () => page.getByRole("textbox", { name: "Message" });

  /** Pastes text as the browser would announce it; a script's paste inserts nothing itself. */
  async function paste(textarea: HTMLTextAreaElement, text: string) {
    const data = new DataTransfer();
    data.setData("text/plain", text);
    const event = new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true });
    await act(async () => void textarea.dispatchEvent(event));
    return event;
  }
  /** An input event the browser announces before it inserts text; a script's inserts nothing itself. */
  async function beforeInput(textarea: HTMLTextAreaElement, init: InputEventInit) {
    const event = new InputEvent("beforeinput", { bubbles: true, cancelable: true, ...init });
    await act(async () => void textarea.dispatchEvent(event));
    return event;
  }

  it("puts a typed emoji in as its token, with the caret after it, in one step undo takes out", async () => {
    const onValueChange = vi.fn();
    const { textarea } = await render(<Composer label="Message" catalogue={catalogue} defaultValue="Hi there" onValueChange={onValueChange} onSend={() => {}} />);
    // The system's emoji panel puts an emoji in whole, as one insertion, as fill does.
    await userEvent.fill(box(), "Hi 🎉 there");
    expect(textarea.value).toBe("Hi :party: there");
    expect([textarea.selectionStart, textarea.selectionEnd]).toEqual([16, 16]);
    // The emoji never went in as a character.
    expect(onValueChange.mock.calls.map((call: unknown[]) => call[0]).filter((value) => /🎉/u.test(value as string))).toEqual([]);
    expect(onValueChange).toHaveBeenLastCalledWith("Hi :party: there");
    await act(async () => void document.execCommand("undo"));
    expect(textarea.value).toBe("Hi there");
    expect(onValueChange).toHaveBeenLastCalledWith("Hi there");
    // A joined emoji and a toned one become theirs; one the catalogue does not list stays.
    await userEvent.fill(box(), "Coding 👩‍💻 👋🏽 🦄");
    expect(textarea.value).toBe("Coding :technologist: :wave-tone3: 🦄");
  });

  it("puts pasted emoji in as their tokens, including joined and toned ones, and leaves those it does not list", async () => {
    const onPaste = vi.fn();
    const { textarea } = await render(<Composer label="Message" catalogue={catalogue} defaultValue="Hi there" onPaste={onPaste} onSend={() => {}} />);
    textarea.focus();
    textarea.setSelectionRange(3, 3);
    const event = await paste(textarea, "👋🏽 coding 👩‍💻 🦄 🎉 ");
    expect(event.defaultPrevented).toBe(true);
    expect(onPaste).toHaveBeenCalledTimes(1);
    expect(textarea.value).toBe("Hi :wave-tone3: coding :technologist: 🦄 :party: there");
    // The caret lands after what went in, before the text that followed it.
    expect([textarea.selectionStart, textarea.selectionEnd]).toEqual([49, 49]);
    await act(async () => void document.execCommand("undo"));
    expect(textarea.value).toBe("Hi there");
    // Text with none of its emoji is the browser's to paste.
    expect((await paste(textarea, "plain 🦄 text")).defaultPrevented).toBe(false);
    expect(textarea.value).toBe("Hi there");
  });

  it("puts the emoji of a pasteText paste in as their tokens, in one step undo takes out", async () => {
    const { textarea } = await render(<Composer label="Message" catalogue={catalogue} pasteText={(data) => `**${data.getData("text/plain")}**`} defaultValue="Hi " onSend={() => {}} />);
    textarea.focus();
    textarea.setSelectionRange(3, 3);
    expect((await paste(textarea, "🎉 Ana")).defaultPrevented).toBe(true);
    expect(textarea.value).toBe("Hi **:party: Ana**");
    await act(async () => void document.execCommand("undo"));
    expect(textarea.value).toBe("Hi ");
  });

  it("leaves a paste the app handled, a word an input method composes, and other edits to the browser", async () => {
    const { textarea, rerender } = await render(<Composer label="Message" catalogue={catalogue} onPaste={(event) => event.preventDefault()} onSend={() => {}} />);
    textarea.focus();
    expect((await paste(textarea, "🎉")).defaultPrevented).toBe(true);
    expect(textarea.value).toBe("");
    expect((await beforeInput(textarea, { inputType: "insertText", data: "🎉", isComposing: true })).defaultPrevented).toBe(false);
    expect((await beforeInput(textarea, { inputType: "insertFromDrop", data: "🎉" })).defaultPrevented).toBe(false);
    expect((await beforeInput(textarea, { inputType: "insertReplacementText", data: null })).defaultPrevented).toBe(false);
    expect((await beforeInput(textarea, { inputType: "insertReplacementText", data: "🎉" })).defaultPrevented).toBe(true);
    expect(textarea.value).toBe(":party:");
    // Without a catalogue, an emoji goes in as typed.
    await rerender(<Composer label="Message" onSend={() => {}} />);
    await userEvent.fill(box(), "🎉");
    expect(textarea.value).toBe("🎉");
    expect((await paste(textarea, "🎉")).defaultPrevented).toBe(false);
  });
});

describe("Composer text at rest", () => {
  /** Where the placeholder's capital letters centre: the line's baseline from the font's ascent and descent, less half a cap height. */
  function capCentre(textarea: HTMLTextAreaElement) {
    const style = getComputedStyle(textarea);
    const context = document.createElement("canvas").getContext("2d")!;
    context.font = style.font;
    const { fontBoundingBoxAscent: ascent, fontBoundingBoxDescent: descent } = context.measureText("H");
    const cap = context.measureText("H").actualBoundingBoxAscent;
    const lineHeight = parseFloat(style.lineHeight);
    const lineTop = textarea.getBoundingClientRect().top + parseFloat(style.borderTopWidth) + parseFloat(style.paddingTop);
    return lineTop + (lineHeight - (ascent + descent)) / 2 + ascent - cap / 2;
  }
  const middle = (element: Element) => {
    const { top, height } = element.getBoundingClientRect();
    return top + height / 2;
  };

  it("centres the placeholder on its cap height in the box, level with the send button", async () => {
    const { frame, textarea, send } = await render(<Composer label="Reply" placeholder="Message Mia" onSend={() => {}} />);
    expect(Math.abs(capCentre(textarea) - middle(frame))).toBeLessThanOrEqual(0.75);
    expect(Math.abs(middle(send) - middle(frame))).toBeLessThanOrEqual(0.75);
  });

  it("keeps the actions at the bottom when the text takes three lines", async () => {
    const { host, textarea, send } = await render(<Composer label="Reply" onSend={() => {}} />);
    const body = host.querySelector<HTMLElement>("[data-ouro-composer-body]")!;
    await userEvent.fill(textarea, "One\nTwo\nThree");
    await expect.poll(() => textarea.getBoundingClientRect().height).toBeGreaterThan(parseFloat(getComputedStyle(textarea).lineHeight) * 3);
    const tools = send.parentElement!.getBoundingClientRect();
    expect(Math.abs(tools.bottom - body.getBoundingClientRect().bottom)).toBeLessThanOrEqual(0.75);
    expect(tools.top).toBeGreaterThan(textarea.getBoundingClientRect().top + 20);
  });
});
