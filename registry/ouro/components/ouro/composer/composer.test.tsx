import { createRef, useState, type ReactNode } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { commands, page, userEvent } from "vitest/browser";
import { Autocomplete } from "@/registry/ouro/components/ouro/autocomplete/autocomplete";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Composer, type ComposerProps } from "@/registry/ouro/components/ouro/composer/composer";
import { Attachment } from "@/registry/ouro/components/ouro/message/attachment";
import type { TextAreaHighlight } from "@/registry/ouro/components/ouro/text-field/text-area";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
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
  };
}

/** The texts of the elements `aria-describedby` names, in order. */
const descriptions = (element: Element) =>
  (element.getAttribute("aria-describedby") ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent);

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
});

describe("Composer", () => {
  it("is a message box named by its label, one line tall with the placeholder on it, and a send button", async () => {
    const { root, frame, textarea, send } = await render(<Composer label="Message Mia" placeholder="Write a message" onSend={() => {}} />);
    expect(root.getAttribute("data-ouro")).toBe("composer");
    expect([...root.children]).toEqual([frame]);
    expect(root.hasAttribute("data-sending")).toBe(false);
    expect(root.hasAttribute("data-send-disabled")).toBe(false);
    await expect.element(page.getByRole("textbox", { name: "Message Mia" })).toBeVisible();
    expect(textarea.placeholder).toBe("Write a message");
    expect(textarea.rows).toBe(1);
    expect(textarea.getBoundingClientRect().height).toBeCloseTo(parseFloat(getComputedStyle(textarea).lineHeight), 0);
    await expect.element(page.getByRole("button", { name: "Send" })).toBeDisabled();
    expect(send.querySelector("svg")!.getAttribute("aria-hidden")).toBe("true");
  });

  it("grows as the person writes, up to maxRows, then scrolls", async () => {
    const { textarea } = await render(<Composer label="Message" maxRows={3} onSend={() => {}} />);
    const line = parseFloat(getComputedStyle(textarea).lineHeight);
    textarea.focus();
    await userEvent.keyboard("one{Shift>}{Enter}{/Shift}two");
    expect(textarea.getBoundingClientRect().height).toBeCloseTo(2 * line, 0);
    await userEvent.keyboard("{Shift>}{Enter}{/Shift}three{Shift>}{Enter}{/Shift}four");
    expect(textarea.getBoundingClientRect().height).toBeCloseTo(3 * line, 0);
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
      expect(textarea.disabled).toBe(false);
      await expect.element(page.getByText(reason)).toBeVisible();
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
    await userEvent.click(button);
    expect(onExpandedChange).toHaveBeenCalledWith(true);
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(root.hasAttribute("data-expanded")).toBe(true);
    expect(root.querySelector("[data-ouro-composer-toolbar]")!.textContent).toBe("B");
    expect(textarea.rows).toBe(6);
    await expect.poll(() => textarea.getBoundingClientRect().height).toBeGreaterThanOrEqual(6 * parseFloat(getComputedStyle(textarea).lineHeight));
    await userEvent.click(button);
    expect(onExpandedChange).toHaveBeenLastCalledWith(false);
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

  it("grows and shrinks in height over a moment, and at once with reduced motion", async () => {
    const heights = (element: Element) => element.getAnimations().map((animation) => (animation as CSSTransition).transitionProperty);
    const { root, textarea } = await render(<Composer label="Reply" defaultExpanded={false} onSend={() => {}} />);
    const body = root.querySelector<HTMLElement>("[data-ouro-composer-body]")!;
    const settled = () => heights(body).length === 0 && body.style.height === "" && !body.classList.contains("transition-[height]");
    await userEvent.click(expandButton()!);
    expect(heights(body)).toEqual(["height"]);
    expect(getComputedStyle(body).overflow).toBe("hidden");
    // The text has its new height at once; the row around it shows it as it grows.
    expect(textarea.rows).toBe(6);
    expect(heights(textarea)).toEqual([]);
    await expect.poll(settled).toBe(true);
    const expandedHeight = body.getBoundingClientRect().height;
    // Typing grows the box at once, as before.
    await userEvent.keyboard("a");
    expect(heights(body)).toEqual([]);
    await userEvent.click(expandButton()!);
    expect(heights(body)).toEqual(["height"]);
    await expect.poll(settled).toBe(true);
    // Collapsed again mid-way: it turns back from the height it shows, not from the full height, and ends at its own.
    const small = body.getBoundingClientRect().height;
    body.style.setProperty("--ouro-duration-base", "10s");
    await userEvent.click(expandButton()!);
    await userEvent.click(expandButton()!);
    expect(body.getBoundingClientRect().height).toBeLessThan(small + (expandedHeight - small) / 2);
    expect(heights(body)).toEqual(["height"]);
    await act(async () => body.getAnimations().forEach((animation) => animation.finish()));
    await expect.poll(settled).toBe(true);
    // A render that is no expand or collapse ends a change at once.
    await userEvent.click(expandButton()!);
    expect(heights(body)).toEqual(["height"]);
    await userEvent.keyboard("b");
    expect(settled()).toBe(true);
    body.style.removeProperty("--ouro-duration-base");
    await commands.emulateMedia({ reducedMotion: "reduce" });
    try {
      await userEvent.click(expandButton()!);
      expect(heights(body)).toEqual([]);
      expect(settled()).toBe(true);
      expect(textarea.rows).toBe(1);
    } finally {
      await commands.emulateMedia({ reducedMotion: "no-preference" });
    }
  });

  it("does not animate when expanding leaves the box its height", async () => {
    const { root } = await render(<Composer label="Reply" defaultExpanded={false} expandedRows={1} onSend={() => {}} />, 200);
    const body = root.querySelector<HTMLElement>("[data-ouro-composer-body]")!;
    await userEvent.click(expandButton()!);
    expect(body.getAnimations()).toEqual([]);
    expect(body.style.height).toBe("");
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
