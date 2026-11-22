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

  it("pastes the clipboard's plain text only", async () => {
    const seen: string[] = [];
    const { editor } = await render(rich({ onValueChange: (value) => void seen.push(value) }));
    editor.focus();
    const data = new DataTransfer();
    data.setData("text/plain", "plain");
    data.setData("text/html", "<b>plain</b><script>x</script>");
    await act(async () => void editor.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: data })));
    await expect.poll(() => seen.at(-1)).toBe("plain");
    expect(editor.querySelector("strong, b")).toBeNull();
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

  it("describes the editor to assistive technology, sizes it in lines, and drops the placeholder once there is text", async () => {
    const { host, editor } = await render(rich({ placeholder: "Write a message", rows: 2, maxRows: 5, "aria-describedby": "hint" } as never));
    expect(editor.getAttribute("aria-placeholder")).toBe("Write a message");
    expect(editor.getAttribute("aria-disabled")).toBeNull();
    expect(editor.getAttribute("aria-readonly")).toBeNull();
    expect(editor.spellcheck).toBe(true);
    expect(editor.style.minHeight).toBe("2lh");
    expect(editor.style.maxHeight).toBe("5lh");
    expect(host.querySelector("[data-ouro-composer-placeholder]")?.getAttribute("aria-hidden")).toBe("true");
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
