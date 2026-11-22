import { createRef, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { Composer, type ComposerEditor } from "@/registry/ouro/components/ouro/composer/composer";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

const roots: Root[] = [];
let mounted: HTMLElement[] = [];

/** Renders and waits for the rich editor, which loads after the first render. */
async function render(node: ReactNode) {
  const host = document.createElement("div");
  host.style.width = "480px";
  document.body.append(host);
  mounted.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
  const find = () => host.querySelector<HTMLElement>("[data-ouro-composer-editor]");
  await expect.poll(find).not.toBeNull();
  return {
    host,
    rerender: (next: ReactNode) => act(async () => root.render(next)),
    get editor() {
      return find()!;
    },
    get send() {
      return host.querySelector<HTMLButtonElement>('[data-ouro-control="composer"][data-ouro-part="send"]')!;
    },
  };
}

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  Object.defineProperty(navigator, "userAgentData", { configurable: true, value: { platform: "Windows" } });
  Object.defineProperty(navigator, "platform", { configurable: true, value: "Win32" });
});
afterEach(async () => {
  vi.restoreAllMocks();
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  for (const node of mounted) node.remove();
  mounted = [];
  delete (navigator as { userAgentData?: unknown }).userAgentData;
  delete (navigator as { platform?: unknown }).platform;
});

const rich = (props: Partial<React.ComponentProps<typeof Composer>> = {}) => <Composer label="Message Mia" format="rich" onSend={() => {}} {...props} />;

describe("Composer rich mode", () => {
  it("renders the plain textarea on the server and until the editor has loaded, so the first render never touches the editor", () => {
    const html = renderToString(rich({ defaultValue: "hi", placeholder: "Write a message" }));
    expect(html).toContain("<textarea");
    expect(html).not.toContain("contenteditable");
  });

  it("swaps the textarea for a textbox named by the label, with the placeholder, once the editor has loaded", async () => {
    const { host, editor } = await render(rich({ placeholder: "Write a message" }));
    expect(host.querySelector("textarea")).toBeNull();
    expect(editor.getAttribute("role")).toBe("textbox");
    expect(editor.getAttribute("aria-multiline")).toBe("true");
    expect(editor.getAttribute("aria-label")).toBe("Message Mia");
    expect(editor.isContentEditable).toBe(true);
    expect(host.textContent).toContain("Write a message");
  });

  it("carries the caret over when the person was already typing in the plain box", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    mounted.push(host);
    const root = createRoot(host);
    roots.push(root);
    // A module that loaded before this render swaps in at once, so first load happens in the test above; focus here is the editor's own.
    await act(async () => root.render(rich({ defaultValue: "abc" })));
    await expect.poll(() => host.querySelector("[data-ouro-composer-editor]")).not.toBeNull();
    const editor = host.querySelector<HTMLElement>("[data-ouro-composer-editor]")!;
    editor.focus();
    await userEvent.keyboard("d");
    await expect.poll(() => editor.textContent).toBe("abcd");
  });

  it("shows Markdown marks as formatting, and writes formatting back out as the same Markdown", async () => {
    const seen: string[] = [];
    const { editor } = await render(rich({ defaultValue: "**bold** _it_ ++under++ ~~gone~~ `code`", onValueChange: (value) => void seen.push(value) }));
    expect(editor.querySelector("strong")?.textContent).toBe("bold");
    expect(editor.querySelector("em")?.textContent).toBe("it");
    expect(editor.querySelector(".underline")?.textContent).toBe("under");
    expect(editor.querySelector(".line-through")?.textContent).toBe("gone");
    expect(editor.querySelector("code")?.textContent).toBe("code");
    editor.focus();
    await userEvent.keyboard("!");
    await expect.poll(() => seen.at(-1)).toBe("**bold** _it_ ++under++ ~~gone~~ `code`!");
  });

  it("formats with the keys: mod+B, mod+I, mod+U, mod+Shift+X for strikethrough and mod+Shift+E for code", async () => {
    const seen: string[] = [];
    const { editor } = await render(rich({ onValueChange: (value) => void seen.push(value) }));
    editor.focus();
    for (const [key, wrap] of [
      ["b", "**"],
      ["i", "_"],
      ["u", "++"],
      ["X", "~~"],
      ["E", "`"],
    ] as const) {
      const shift = key === key.toUpperCase();
      await userEvent.keyboard(`{Control>}${shift ? "{Shift>}" : ""}${key.toLowerCase()}${shift ? "{/Shift}" : ""}{/Control}`);
      await userEvent.keyboard("x");
      await userEvent.keyboard(`{Control>}${shift ? "{Shift>}" : ""}${key.toLowerCase()}${shift ? "{/Shift}" : ""}{/Control}`);
      await userEvent.keyboard(" ");
      await expect.poll(() => seen.at(-1)).toContain(`${wrap}x${wrap}`);
    }
  });

  it("sends the Markdown on Enter, starts a line on Shift+Enter, and clears after a send", async () => {
    const onSend = vi.fn();
    const { editor } = await render(rich({ defaultValue: "**hi**", onSend }));
    editor.focus();
    await userEvent.keyboard("{Shift>}{Enter}{/Shift}there");
    await expect.poll(() => editor.querySelectorAll("br").length).toBe(1);
    await userEvent.keyboard("{Enter}");
    await expect.poll(() => onSend.mock.calls.length).toBe(1);
    expect(onSend.mock.calls[0]![0]).toBe("**hi**\nthere");
    await expect.poll(() => editor.textContent).toBe("");
    expect(document.activeElement).toBe(editor);
  });

  it("does not send on the Enter that ends an input method's word", async () => {
    const onSend = vi.fn();
    const { editor } = await render(rich({ defaultValue: "hi", onSend }));
    editor.focus();
    await act(async () => void editor.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true, isComposing: true })));
    await act(async () => void editor.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true, keyCode: 229 })));
    expect(onSend).not.toHaveBeenCalled();
  });

  it("takes composed text, as Chinese, Japanese and Korean input methods write it, through composition events", async () => {
    const seen: string[] = [];
    const { editor } = await render(rich({ onValueChange: (value) => void seen.push(value) }));
    editor.focus();
    await act(async () => {
      editor.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true, data: "" }));
    });
    expect(seen).toEqual([]);
    const selection = getSelection()!;
    const text = editor.querySelector("p")!;
    selection.collapse(text, 0);
    for (const step of ["に", "にほ", "日本"]) {
      await act(async () => {
        editor.dispatchEvent(new InputEvent("beforeinput", { bubbles: true, cancelable: true, inputType: "insertCompositionText", data: step, isComposing: true }));
      });
    }
    await act(async () => {
      editor.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "日本" }));
    });
    expect(editor.textContent).not.toContain("にほ");
  });

  it("follows a value the app sets, and reports only what the person types", async () => {
    const onValueChange = vi.fn();
    const { editor, rerender } = await render(rich({ value: "one", onValueChange }));
    expect(editor.textContent).toBe("one");
    await rerender(rich({ value: "**two**", onValueChange }));
    await expect.poll(() => editor.querySelector("strong")?.textContent).toBe("two");
    expect(onValueChange).not.toHaveBeenCalled();
    editor.focus();
    await userEvent.keyboard("!");
    await expect.poll(() => onValueChange.mock.calls.at(-1)?.[0]).toBe("**two**!");
  });

  it("undoes and redoes typing with mod+Z and mod+Shift+Z", async () => {
    const { editor } = await render(rich({ defaultValue: "a" }));
    editor.focus();
    await userEvent.keyboard("bc");
    await expect.poll(() => editor.textContent).toBe("abc");
    await userEvent.keyboard("{Control>}z{/Control}");
    await expect.poll(() => editor.textContent).toBe("a");
    await userEvent.keyboard("{Control>}{Shift>}z{/Shift}{/Control}");
    await expect.poll(() => editor.textContent).toBe("abc");
  });

  it("pastes the clipboard's formatting through the allowlist, never its scripts", async () => {
    const seen: string[] = [];
    const { editor } = await render(rich({ onValueChange: (value) => void seen.push(value) }));
    editor.focus();
    const data = new DataTransfer();
    data.setData("text/plain", "plain");
    data.setData("text/html", "<b>plain</b><script>x</script>");
    await act(async () => void editor.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: data })));
    await expect.poll(() => seen.at(-1)).toBe("**plain**");
    expect(editor.querySelector("script")).toBeNull();
    const second = new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: data });
    await act(async () => void editor.dispatchEvent(second));
    expect(second.defaultPrevented).toBe(true);
  });

  it("posts the Markdown under its name in a form, and a read-only box can still be reached with Tab", async () => {
    const { host, editor, rerender } = await render(
      <form>
        {rich({ name: "body", defaultValue: "**hi**" })}
      </form>,
    );
    expect(new FormData(host.querySelector("form")!).get("body")).toBe("**hi**");
    expect(editor.hasAttribute("tabindex")).toBe(false);
    await rerender(<form>{rich({ name: "body", readOnly: true })}</form>);
    expect(editor.tabIndex).toBe(0);
    await rerender(<form>{rich({ name: "body", readOnly: true, disabled: true })}</form>);
    expect(editor.hasAttribute("tabindex")).toBe(false);
    expect(new FormData(host.querySelector("form")!).get("body")).toBeNull();
  });

  it("leaves the box alone for a paste with no clipboard data, and for one with no caret in it", async () => {
    const { editor } = await render(rich({ defaultValue: "kept" }));
    const data = new DataTransfer();
    data.setData("text/plain", "more");
    await act(async () => void editor.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: data })));
    expect(editor.textContent).toBe("kept");
    editor.focus();
    await act(async () => void editor.dispatchEvent(new Event("paste", { bubbles: true, cancelable: true })));
    expect(editor.textContent).toBe("kept");
  });

  it("focuses the box at mount with autoFocus, caret after the text, and renders no hidden input without a name", async () => {
    const { host, editor } = await render(rich({ defaultValue: "ab", autoFocus: true }));
    await expect.poll(() => document.activeElement).toBe(editor);
    await userEvent.keyboard("!");
    await expect.poll(() => editor.textContent).toBe("ab!");
    expect(host.querySelector('input[type="hidden"]')).toBeNull();
  });

  it("inserts at the end when the box holds no selection yet", async () => {
    const handle = createRef<ComposerEditor>();
    const { editor } = await render(rich({ editorRef: handle, defaultValue: "hi" }));
    await act(async () => handle.current!.insert(" there"));
    await expect.poll(() => editor.textContent).toBe("hi there");
  });

  it("takes no input once it is disabled alone, or read-only alone, and takes it again when neither is set", async () => {
    const beforeInput = () => new InputEvent("beforeinput", { inputType: "insertText", data: "z", bubbles: true, cancelable: true });
    const { editor, rerender } = await render(rich({}));
    editor.focus();
    await rerender(rich({ disabled: true }));
    editor.dispatchEvent(beforeInput());
    await act(async () => {});
    expect(editor.textContent).toBe("");
    await rerender(rich({}));
    await rerender(rich({ readOnly: true }));
    editor.dispatchEvent(beforeInput());
    await act(async () => {});
    expect(editor.textContent).toBe("");
    await rerender(rich({}));
    editor.focus();
    editor.dispatchEvent(beforeInput());
    await expect.poll(() => editor.textContent).toBe("z");
  });

  it("brings the plain box back, and does not carry old focus into the editor, when format goes plain and rich again", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    mounted.push(host);
    const root = createRoot(host);
    roots.push(root);
    const at = (format: "plain" | "rich") => <Composer label="Message Mia" format={format} onSend={() => {}} />;
    await act(async () => root.render(at("plain")));
    host.querySelector("textarea")!.focus();
    await act(async () => root.render(at("rich")));
    await expect.poll(() => host.querySelector("[data-ouro-composer-editor]")).not.toBeNull();
    await act(async () => root.render(at("plain")));
    await expect.poll(() => host.querySelector("textarea")).not.toBeNull();
    (document.activeElement as HTMLElement).blur();
    await act(async () => root.render(at("rich")));
    await expect.poll(() => host.querySelector("[data-ouro-composer-editor]")).not.toBeNull();
    expect(document.activeElement).toBe(document.body);
  });

  it("formats and inserts through editorRef, and ignores both in a read-only box", async () => {
    const handle = createRef<ComposerEditor>();
    const seen: string[] = [];
    const { editor, rerender } = await render(rich({ editorRef: handle, defaultValue: "hi", onValueChange: (value) => void seen.push(value) }));
    editor.focus();
    await act(async () => handle.current!.insert(" you"));
    await expect.poll(() => seen.at(-1)).toBe("hi you");
    await act(async () => handle.current!.format("bold"));
    await act(async () => handle.current!.insert("x"));
    await expect.poll(() => seen.at(-1)).toBe("hi you**x**");
    await act(async () => handle.current!.format("bullets"));
    await rerender(rich({ editorRef: handle, defaultValue: "hi", readOnly: true, onValueChange: (value) => void seen.push(value) }));
    const before = seen.length;
    await act(async () => {
      handle.current!.insert("no");
      handle.current!.format("bold");
    });
    expect(seen).toHaveLength(before);
    expect(editor.isContentEditable).toBe(false);
    expect(editor.getAttribute("aria-readonly")).toBe("true");
  });

  it("reports to the newest onValueChange, not the one it first mounted with", async () => {
    const first = vi.fn();
    const second = vi.fn();
    const { editor, rerender } = await render(rich({ defaultValue: "a", onValueChange: first }));
    await rerender(rich({ defaultValue: "a", onValueChange: second }));
    editor.focus();
    await userEvent.keyboard("b");
    await expect.poll(() => second.mock.calls.at(-1)?.[0]).toBe("ab");
    expect(first).not.toHaveBeenCalled();
  });

  it("keeps the loaded value out of the undo history, so undoing never empties the box", async () => {
    const { editor } = await render(rich({ defaultValue: "hello" }));
    editor.focus();
    await userEvent.keyboard("{Control>}z{/Control}");
    await expect.poll(() => editor.textContent).toBe("hello");
  });

  it("draws underline and strikethrough together as one class pair", async () => {
    const handle = createRef<ComposerEditor>();
    const { editor } = await render(rich({ editorRef: handle }));
    editor.focus();
    await act(async () => {
      handle.current!.format("underline");
      handle.current!.format("strike");
      handle.current!.insert("both");
    });
    await expect.poll(() => editor.querySelector("span")?.className).toBe("underline line-through");
  });

  it("puts the caret where a press lands, and at the end for focus by any other way", async () => {
    const { editor } = await render(rich({ defaultValue: "abcd" }));
    await page.elementLocator(editor).click({ position: { x: 1, y: 10 } });
    await userEvent.keyboard("X");
    await expect.poll(() => editor.textContent).toBe("Xabcd");
    editor.blur();
    editor.focus();
    await userEvent.keyboard("Y");
    await expect.poll(() => editor.textContent).toBe("XabcdY");
  });

  it("takes input again when the box stops being disabled, and not while it is read-only", async () => {
    const { editor, rerender } = await render(rich({ disabled: true }));
    await rerender(rich({}));
    editor.focus();
    await userEvent.keyboard("a");
    await expect.poll(() => editor.textContent).toBe("a");
    await rerender(rich({ readOnly: true }));
    editor.dispatchEvent(new InputEvent("beforeinput", { inputType: "insertText", data: "z", bubbles: true, cancelable: true }));
    await act(async () => {});
    expect(editor.textContent).toBe("a");
  });

  it("moves focus into the editor, caret at the end, when the plain box that had it is replaced", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    mounted.push(host);
    const root = createRoot(host);
    roots.push(root);
    await act(async () => root.render(rich({ format: "plain", defaultValue: "ab" })));
    host.querySelector("textarea")!.focus();
    await act(async () => root.render(rich({ defaultValue: "ab" })));
    await expect.poll(() => document.activeElement?.hasAttribute("data-ouro-composer-editor")).toBe(true);
    await userEvent.keyboard("c");
    await expect.poll(() => host.querySelector("[data-ouro-composer-editor]")!.textContent).toBe("abc");
  });

  it("keeps a blank line the app sets, and leaves focus where it was when the app sets a value", async () => {
    const { editor, rerender } = await render(rich({ value: "", onValueChange: () => {} }));
    const other = document.createElement("button");
    document.body.append(other);
    mounted.push(other);
    other.focus();
    await rerender(rich({ value: "a\n\nb", onValueChange: () => {} }));
    await expect.poll(() => editor.querySelectorAll("p").length).toBe(3);
    expect(document.activeElement).toBe(other);
  });

  it("describes the editor to assistive technology, sizes it in lines, and drops the placeholder once there is text", async () => {
    const { host, editor } = await render(rich({ placeholder: "Write a message", rows: 2, maxRows: 5, "aria-describedby": "hint" } as never));
    expect(editor.getAttribute("aria-placeholder")).toBe("Write a message");
    expect(editor.getAttribute("aria-disabled")).toBeNull();
    expect(editor.getAttribute("aria-readonly")).toBeNull();
    expect(editor.spellcheck).toBe(true);
    expect(editor.style.minHeight).toBe("2lh");
    expect(editor.style.maxHeight).toBe("5lh");
    expect(host.querySelector("[data-ouro-composer-placeholder]")?.getAttribute("aria-hidden")).toBe("true");
    expect(getComputedStyle(editor.parentElement!).position).toBe("relative");
    editor.focus();
    await userEvent.keyboard("a");
    await expect.poll(() => host.querySelector("[data-ouro-composer-placeholder]")).toBeNull();
  });

  it("keeps lines apart in the Markdown it reports, and puts the caret after a value the app sets while it has focus", async () => {
    const seen: string[] = [];
    const { editor, rerender } = await render(rich({ value: "a\nb", onValueChange: (value) => void seen.push(value) }));
    expect(editor.querySelectorAll("p")).toHaveLength(2);
    editor.focus();
    await rerender(rich({ value: "c\nd", onValueChange: (value) => void seen.push(value) }));
    await expect.poll(() => editor.textContent).toBe("cd");
    await userEvent.keyboard("!");
    await expect.poll(() => seen.at(-1)).toBe("c\nd!");
    expect(seen).not.toContain("c\nd");
  });

  it("disables the editor, and leaves it to the send button's state", async () => {
    const { editor, send } = await render(rich({ disabled: true, defaultValue: "hi" }));
    expect(editor.isContentEditable).toBe(false);
    expect(editor.getAttribute("aria-disabled")).toBe("true");
    expect(send.disabled).toBe(true);
  });

  it("applies the app's key handler first, and a key it handles never reaches the editor", async () => {
    const { editor } = await render(rich({ defaultValue: "a", onKeyDown: (event) => event.key === "x" && event.preventDefault() }));
    editor.focus();
    await userEvent.keyboard("xy");
    await expect.poll(() => editor.textContent).toBe("ay");
  });

  it("lets an expanded box take the full width, and sends it with Ctrl+Enter while Enter starts a line", async () => {
    const onSend = vi.fn();
    const { editor } = await render(rich({ expanded: true, onExpandedChange: () => {}, onSend, defaultValue: "long" }));
    expect(editor.parentElement!.className).toContain("w-full");
    editor.focus();
    await userEvent.keyboard("{Enter}");
    expect(onSend).not.toHaveBeenCalled();
    await userEvent.keyboard("{Control>}{Enter}{/Control}");
    await expect.poll(() => onSend.mock.calls.length).toBe(1);
  });

  it("names the fix for a format that is not one, and renders the plain box", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const host = document.createElement("div");
    document.body.append(host);
    mounted.push(host);
    const root = createRoot(host);
    roots.push(root);
    await act(async () => root.render(<Composer label="Message Mia" format={"markdown" as never} onSend={() => {}} />));
    expect(host.querySelector("textarea")).not.toBeNull();
    expect(warn.mock.calls.some(([m]) => String(m).includes('format="markdown" is not a format'))).toBe(true);
  });

  it("does not take focus when format returns to rich after the person has moved on", async () => {
    function Switch() {
      const [format, setFormat] = useState<"plain" | "rich">("rich");
      return (
        <>
          <button onClick={() => setFormat(format === "rich" ? "plain" : "rich")}>toggle</button>
          <Composer label="Message Mia" format={format} onSend={() => {}} />
        </>
      );
    }
    const { host } = await render(<Switch />);
    expect(document.activeElement?.tagName).toBe("BODY");
    await page.getByRole("button", { name: "toggle" }).click();
    await expect.poll(() => host.querySelector("textarea")).not.toBeNull();
    await page.getByRole("button", { name: "toggle" }).click();
    await expect.poll(() => host.querySelector("[data-ouro-composer-editor]")).not.toBeNull();
    expect(document.activeElement).not.toBe(host.querySelector("[data-ouro-composer-editor]"));
  });

  it("goes back to the plain textarea when format returns to plain", async () => {
    function Switch() {
      const [format, setFormat] = useState<"plain" | "rich">("rich");
      return (
        <>
          <button onClick={() => setFormat("plain")}>plain</button>
          <Composer label="Message Mia" format={format} defaultValue="hi" onSend={() => {}} />
        </>
      );
    }
    const { host } = await render(<Switch />);
    await page.getByRole("button", { name: "plain" }).click();
    await expect.poll(() => host.querySelector("textarea")?.value).toBe("hi");
  });
});

describe("Composer rich mode with offsets in Markdown", () => {
  // The box has the focus, as it does for a person who has a selection in it.
  const field = (editor: HTMLElement) => (editor.focus(), editor) as HTMLElement & { value: string; selectionStart: number; selectionEnd: number; setSelectionRange: (start: number, end: number) => void; setRangeText: (text: string, start: number, end: number) => void };

  it("answers value and selection over the text without its marks by default, and over the Markdown with offsets=\"markdown\"", async () => {
    const plain = await render(rich({ defaultValue: "a **b** c" }));
    expect(field(plain.editor).value).toBe("a b c");
    await act(async () => field(plain.editor).setSelectionRange(2, 3));
    expect([field(plain.editor).selectionStart, field(plain.editor).selectionEnd]).toEqual([2, 3]);
    const { editor } = await render(rich({ defaultValue: "a **b** c", offsets: "markdown" }));
    expect(field(editor).value).toBe("a **b** c");
    await act(async () => field(editor).setSelectionRange(4, 5));
    // The Markdown offset 4 is inside the bold, which is the text offset 2 before it as well; the same two characters are selected.
    expect([field(editor).selectionStart, field(editor).selectionEnd]).toEqual([2, 5]);
    await act(async () => field(editor).setRangeText("X", 4, 5));
    await expect.poll(() => field(editor).value).toBe("a **X** c");
    await act(async () => field(editor).setSelectionRange(0, 9));
    expect([field(editor).selectionStart, field(editor).selectionEnd]).toEqual([0, 9]);
  });

  it("reads a caret in the Markdown after the person moves it, one block to a line and a blank line between blocks", async () => {
    const { editor } = await render(rich({ defaultValue: "- one\n- two\n\nend", offsets: "markdown" }));
    expect(field(editor).value).toBe("- one\n- two\n\nend");
    await act(async () => field(editor).setSelectionRange(8, 8));
    expect([field(editor).selectionStart, field(editor).selectionEnd]).toEqual([8, 8]);
    editor.focus();
    await userEvent.keyboard("{ArrowRight}");
    await expect.poll(() => field(editor).selectionStart).toBe(9);
    await act(async () => field(editor).setSelectionRange(15, 15));
    expect(field(editor).selectionStart).toBe(15);
    await userEvent.keyboard("!");
    await expect.poll(() => field(editor).value).toBe("- one\n- two\n\nen!d");
  });

  it("puts the caret at the end of the Markdown when the box holds no selection yet, and keeps an empty line's place", async () => {
    const { editor } = await render(rich({ defaultValue: "- a\n\n\nb", offsets: "markdown" }));
    expect(field(editor).selectionStart).toBe(field(editor).value.length);
    await act(async () => field(editor).setSelectionRange(5, 5));
    expect(field(editor).selectionStart).toBe(5);
  });

  it("replaces a range of the Markdown with Markdown, reports it, and leaves the caret after it", async () => {
    const seen: string[] = [];
    const { editor } = await render(rich({ defaultValue: "a **b** c", offsets: "markdown", onValueChange: (value) => void seen.push(value) }));
    await act(async () => field(editor).setRangeText("X", 4, 5));
    await expect.poll(() => field(editor).value).toBe("a **X** c");
    expect(seen.at(-1)).toBe("a **X** c");
    expect([field(editor).selectionStart, field(editor).selectionEnd]).toEqual([5, 5]);
    await act(async () => field(editor).setRangeText("_new_ ", 0, 0));
    await expect.poll(() => field(editor).value).toBe("_new_ a **X** c");
    expect(editor.querySelector("em")?.textContent).toBe("new");
    expect(field(editor).selectionStart).toBe(6);
  });

  it("clamps a range past the end, as a textarea does", async () => {
    const { editor } = await render(rich({ defaultValue: "ab", offsets: "markdown" }));
    await act(async () => field(editor).setRangeText("!", 9, 12));
    await expect.poll(() => field(editor).value).toBe("ab!");
    await act(async () => field(editor).setSelectionRange(0, 99));
    expect([field(editor).selectionStart, field(editor).selectionEnd]).toEqual([0, 3]);
  });

  it("names the fix for an offsets value that is not one, and answers over the text", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { editor } = await render(rich({ defaultValue: "**b**", offsets: "bytes" as "text" }));
    expect(field(editor).value).toBe("b");
    expect(warn.mock.calls.some(([m]) => String(m).includes('offsets="bytes" is not an offset; use "text" or "markdown"'))).toBe(true);
  });

  it("takes no change from setRangeText in a read-only box", async () => {
    const { editor } = await render(rich({ defaultValue: "a **b**", offsets: "markdown", readOnly: true }));
    await act(async () => field(editor).setRangeText("X", 0, 1));
    expect(field(editor).value).toBe("a **b**");
  });

  it("has the caret in place as soon as setRangeText returns, and keeps the blank lines it was given", async () => {
    const { editor } = await render(rich({ defaultValue: "ab", offsets: "markdown" }));
    let at = -1;
    await act(async () => {
      field(editor).setRangeText("X", 0, 0);
      at = field(editor).selectionStart;
    });
    expect(at).toBe(1);
    await act(async () => field(editor).setRangeText("x\n\n\ny", 0, 0));
    await expect.poll(() => field(editor).value).toBe("x\n\n\nyXab");
  });

  it("reads a caret in an empty line after a list, which is no text of its own", async () => {
    const { editor } = await render(rich({ defaultValue: "- a", offsets: "markdown", sendOn: "mod-enter" }));
    await act(async () => field(editor).setSelectionRange(3, 3));
    await userEvent.keyboard("{Enter}{Enter}");
    expect(field(editor).value).toBe("- a\n");
    expect(field(editor).selectionStart).toBe(4);
  });

  it("changes between the two as the prop does, with no remount", async () => {
    const { editor, rerender } = await render(rich({ defaultValue: "**b**" }));
    expect(field(editor).value).toBe("b");
    await rerender(rich({ defaultValue: "**b**", offsets: "markdown" }));
    expect(field(editor).value).toBe("**b**");
    await rerender(rich({ defaultValue: "**b**", offsets: "text" }));
    expect(field(editor).value).toBe("b");
  });
});
