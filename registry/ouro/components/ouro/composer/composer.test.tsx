import { createRef, useState, type ReactNode } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { commands, page, userEvent } from "vitest/browser";
import { Avatar } from "@/registry/ouro/components/ouro/avatar/avatar";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Composer, type ComposerProps, type ComposerQuote } from "@/registry/ouro/components/ouro/composer/composer";
import { Attachment } from "@/registry/ouro/components/ouro/message/attachment";
import { Message } from "@/registry/ouro/components/ouro/message/message";
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

const lunch = "Lunch on Friday? The bakery on the corner opens at noon, and they keep a long table for groups if you call ahead.";
const quoteOf = (extra: Partial<ComposerQuote> = {}): ComposerQuote => ({ author: "Ada Lovelace", excerpt: lunch, onRemove: () => {}, ...extra });

/** A composer whose quote its remove button and Escape clear, as an app keeps it. */
function Quoting({ onRemove, ...props }: Partial<ComposerProps> & { onRemove?: () => void }) {
  const [quoted, setQuoted] = useState(true);
  return (
    <Composer
      label="Reply to Ada"
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
  it("shows the quote inside the frame above the text: a bar, the author in semibold and the excerpt on one line, cut with an ellipsis", async () => {
    const { frame, textarea, quote } = await render(<Composer label="Reply to Ada" quote={quoteOf()} onSend={() => {}} />);
    expect(frame.contains(quote)).toBe(true);
    expect(quote!.getBoundingClientRect().bottom).toBeLessThanOrEqual(textarea.getBoundingClientRect().top);
    const bar = quote!.querySelector<HTMLElement>("[data-ouro-composer-quote-bar]")!;
    const author = quote!.querySelector<HTMLElement>("[data-ouro-composer-quote-author]")!;
    const excerpt = quote!.querySelector<HTMLElement>("[data-ouro-composer-quote-excerpt]")!;
    expect(bar.getAttribute("aria-hidden")).toBe("true");
    expect(bar.getBoundingClientRect().width).toBe(4);
    expect(getComputedStyle(bar).backgroundColor).toBe(themeColor("--primary"));
    expect(author.textContent).toBe("Ada Lovelace");
    expect(getComputedStyle(author).fontWeight).toBe("600");
    expect(excerpt.textContent).toBe(lunch);
    expect(getComputedStyle(excerpt).textOverflow).toBe("ellipsis");
    expect(getComputedStyle(excerpt).whiteSpace).toBe("nowrap");
    expect(excerpt.scrollWidth).toBeGreaterThan(excerpt.clientWidth);
    expect(excerpt.getBoundingClientRect().height).toBeCloseTo(parseFloat(getComputedStyle(excerpt).lineHeight), 0);
  });

  it("shows the author's avatar before the name", async () => {
    const { quote } = await render(<Composer label="Reply to Ada" quote={quoteOf({ avatar: <Avatar name="Ada Lovelace" alt="" size="xs" /> })} onSend={() => {}} />);
    const avatar = quote!.querySelector<HTMLElement>('[data-ouro="avatar"]')!;
    expect(avatar.compareDocumentPosition(quote!.querySelector("[data-ouro-composer-quote-author]")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(quote!.querySelector("[data-ouro-composer-quote-bar]")!.compareDocumentPosition(avatar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("describes the text with the quote, so screen readers hear what the reply quotes", async () => {
    const { host, textarea, rerender } = await render(
      <>
        <p id="hint">Replies go to the thread</p>
        <Composer label="Reply to Ada" aria-describedby="hint" description="Ctrl+Enter to send" quote={quoteOf({ excerpt: "Lunch on Friday?" })} onSend={() => {}} />
      </>,
    );
    expect(descriptions(textarea)).toEqual(["Replies go to the thread", "Quoting Ada Lovelace: ", "Lunch on Friday?", "Ctrl+Enter to send"]);
    await expect.element(page.getByRole("textbox", { name: "Reply to Ada" })).toHaveAccessibleDescription("Replies go to the thread Quoting Ada Lovelace: Lunch on Friday? Ctrl+Enter to send");
    expect(host.querySelector("[data-ouro-composer-quote-author]")!.getAttribute("aria-hidden")).toBe("true");
    await rerender(
      <>
        <p id="hint">Replies go to the thread</p>
        <Composer label="Reply to Ada" aria-describedby="hint" description="Ctrl+Enter to send" onSend={() => {}} />
      </>,
    );
    expect(descriptions(textarea)).toEqual(["Replies go to the thread", "Ctrl+Enter to send"]);
  });

  it("reads label and removeLabel, for other languages", async () => {
    const { textarea } = await render(<Composer label="Antwort an Ada" quote={quoteOf({ excerpt: "Mittagessen?", label: "Zitat von Ada", removeLabel: "Zitat entfernen" })} onSend={() => {}} />);
    expect(descriptions(textarea)).toEqual(["Zitat von Ada: ", "Mittagessen?"]);
    await expect.element(page.getByRole("button", { name: "Zitat entfernen" })).toBeVisible();
  });

  it("names the remove button after the author, which the keyboard reaches before the text and which removes the quote and puts focus back in the box", async () => {
    const onRemove = vi.fn();
    const { textarea, remove } = await render(<Quoting onRemove={onRemove} />);
    expect(remove!.querySelector("svg")!.getAttribute("aria-hidden")).toBe("true");
    textarea.focus();
    await pressTab({ shift: true });
    expect(document.activeElement).toBe(page.getByRole("button", { name: "Remove quote from Ada Lovelace" }).element());
    await userEvent.keyboard("{Enter}");
    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(textarea);
  });

  it("puts focus back in the box after a press of the remove button, even while the app keeps the quote", async () => {
    const onRemove = vi.fn();
    const { textarea, remove, quote } = await render(<Composer label="Reply to Ada" quote={quoteOf({ onRemove })} onSend={() => {}} />);
    await userEvent.click(remove!);
    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(quote!.isConnected).toBe(true);
    expect(document.activeElement).toBe(textarea);
  });

  it("puts focus back in the box after the remove button without scrolling a box around it", async () => {
    const { host, textarea, remove } = await render(
      <div data-frame="" style={{ height: 80, overflow: "hidden" }}>
        <div style={{ height: 400 }} />
        <Composer label="Reply to Ada" quote={quoteOf()} onSend={() => {}} />
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
    const { textarea } = await render(<Composer label="Reply to Ada" quote={quoteOf()} onSend={() => {}} />);
    const escape = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    await act(async () => void textarea.dispatchEvent(escape));
    expect(escape.defaultPrevented).toBe(true);
  });

  it("leaves Escape alone while the box has text, while an input method composes, or after the app's onKeyDown prevents it", async () => {
    const onRemove = vi.fn();
    const outer = vi.fn();
    const { textarea, rerender } = await render(
      <div onKeyDown={outer}>
        <Composer label="Reply to Ada" defaultValue="See you" quote={quoteOf({ onRemove })} onSend={() => {}} />
      </div>,
    );
    textarea.focus();
    await userEvent.keyboard("{Escape}");
    expect(outer).toHaveBeenCalledTimes(1);
    await rerender(
      <div onKeyDown={outer}>
        <Composer label="Reply to Ada" value="" onValueChange={() => {}} quote={quoteOf({ onRemove })} onSend={() => {}} />
      </div>,
    );
    for (const init of [{ isComposing: true }, { keyCode: 229 }]) {
      await act(async () => void textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true, ...init })));
    }
    expect(outer).toHaveBeenCalledTimes(3);
    await rerender(
      <div onKeyDown={outer}>
        <Composer label="Reply to Ada" value="" onValueChange={() => {}} quote={quoteOf({ onRemove })} onKeyDown={(event) => event.preventDefault()} onSend={() => {}} />
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
    const { textarea, quote } = await render(<Composer label="Reply to Ada" quote={quoteOf({ onRemove })} onSend={onSend} />);
    textarea.focus();
    await userEvent.keyboard("Sounds good{Enter}");
    expect(onSend).toHaveBeenCalledWith("Sounds good", expect.anything());
    expect(quote!.isConnected).toBe(true);
    expect(onRemove).not.toHaveBeenCalled();
  });

  it("leaves focus in the box when a quote appears", async () => {
    const { textarea, rerender } = await render(<Composer label="Reply to Ada" onSend={() => {}} />);
    textarea.focus();
    await rerender(<Composer label="Reply to Ada" quote={quoteOf()} onSend={() => {}} />);
    expect(document.activeElement).toBe(textarea);
  });

  it("fades in with opacity only, and not at all with reduced motion", async () => {
    const transitions = (element: Element) => element.getAnimations().map((animation) => (animation as CSSTransition).transitionProperty);
    const { host, rerender } = await render(<Composer label="Reply to Ada" onSend={() => {}} />);
    await rerender(<Composer label="Reply to Ada" quote={quoteOf()} onSend={() => {}} />);
    expect(transitions(host.querySelector("[data-ouro-composer-quote]")!)).toEqual(["opacity"]);
    await rerender(<Composer label="Reply to Ada" onSend={() => {}} />);
    await commands.emulateMedia({ reducedMotion: "reduce" });
    try {
      await rerender(<Composer label="Reply to Ada" quote={quoteOf()} onSend={() => {}} />);
      const quote = host.querySelector<HTMLElement>("[data-ouro-composer-quote]")!;
      expect(transitions(quote)).toEqual([]);
      expect(getComputedStyle(quote).opacity).toBe("1");
    } finally {
      await commands.emulateMedia({ reducedMotion: "no-preference" });
    }
  });

  it("is a button with onActivate, named by the quote, which the keyboard reaches before the remove button", async () => {
    const onActivate = vi.fn();
    const { host, textarea } = await render(<Composer label="Reply to Ada" quote={quoteOf({ excerpt: "Lunch on Friday?", onActivate })} onSend={() => {}} />);
    const button = page.getByRole("button", { name: "Quoting Ada Lovelace: Lunch on Friday?" });
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
    const { host } = await render(<Composer label="Reply to Ada" quote={quoteOf()} onSend={() => {}} />);
    expect(host.querySelector('[data-ouro-part="quote"]')).toBeNull();
    expect(host.querySelectorAll("button")).toHaveLength(2);
  });

  it("turns the remove button off with the rest of a disabled composer", async () => {
    const { remove } = await render(<Composer label="Reply to Ada" disabled quote={quoteOf()} onSend={() => {}} />);
    expect(remove!.disabled).toBe(true);
  });

  it("looks as Message's quote does once the reply is sent", async () => {
    const { host } = await render(
      <>
        <Composer label="Reply to Ada" quote={quoteOf()} onSend={() => {}} />
        <Message variant="chat" role="user" name="Priya Okafor" quote={{ author: "Ada Lovelace", excerpt: lunch }}>
          Sounds good
        </Message>
      </>,
    );
    const composer = host.querySelector<HTMLElement>("[data-ouro-composer-quote]")!;
    const sent = host.querySelector<HTMLElement>("[data-ouro-message-quote]")!;
    const same = (a: Element, b: Element, properties: string[]) => {
      for (const property of properties) expect(getComputedStyle(a).getPropertyValue(property), property).toBe(getComputedStyle(b).getPropertyValue(property));
    };
    same(composer, sent, ["background-color", "border-radius", "box-shadow"]);
    same(composer.querySelector("[data-ouro-composer-quote-bar]")!, sent.querySelector("[data-ouro-message-quote-bar]")!, ["width", "background-color", "border-radius"]);
    same(composer.querySelector("[data-ouro-composer-quote-author]")!, sent.querySelector("[data-ouro-message-quote-author]")!, ["font-size", "font-weight", "color"]);
    same(composer.querySelector("[data-ouro-composer-quote-excerpt]")!, sent.querySelector("[data-ouro-message-quote-excerpt]")!, ["font-size", "color", "text-overflow", "white-space"]);
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
    ["replyTo", { replyTo: "message-1" }, "replyTo is not a prop; the message a reply quotes is quote", '<Composer quote={{ author: "Ada", excerpt: "Lunch?", onRemove }}>'],
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
        quote={{ author: "Ada Lovelace", excerpt: "Lunch?", avatar: <Avatar name="Ada Lovelace" alt="" size="xs" />, onRemove: () => {}, onActivate: () => {} }}
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
        <Composer label="Reply to Ada" quote={quoteOf({ excerpt: "Lunch on Friday?" })} onSend={() => {}} />
      </div>
    );
    const html = renderToString(quoted);
    const doc = new DOMParser().parseFromString(html, "text/html");
    const textarea = doc.querySelector("textarea")!;
    expect(textarea.getAttribute("aria-describedby")!.split(" ").map((id) => doc.getElementById(id)!.textContent)).toEqual(["Quoting Ada Lovelace: ", "Lunch on Friday?"]);
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
