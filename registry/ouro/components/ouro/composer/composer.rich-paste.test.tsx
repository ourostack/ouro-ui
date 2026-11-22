import { type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { Composer } from "@/registry/ouro/components/ouro/composer/composer";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

const roots: Root[] = [];
let mounted: HTMLElement[] = [];

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
  return find()!;
}

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(async () => {
  vi.restoreAllMocks();
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  for (const node of mounted) node.remove();
  mounted = [];
});

const rich = (props: Partial<React.ComponentProps<typeof Composer>> = {}) => <Composer label="Message Mia" format="rich" onSend={() => {}} {...props} />;

async function paste(editor: HTMLElement, parts: Record<string, string>) {
  const data = new DataTransfer();
  for (const [type, value] of Object.entries(parts)) data.setData(type, value);
  const event = new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: data });
  await act(async () => void editor.dispatchEvent(event));
  return event;
}

async function key(editor: HTMLElement, init: KeyboardEventInit) {
  await act(async () => void editor.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init })));
}

async function selectAll(editor: HTMLElement) {
  editor.focus();
  await userEvent.keyboard("{ControlOrMeta>}a{/ControlOrMeta}");
}

describe("Composer rich paste", () => {
  it("keeps the formatting the allowlist names: bold, italic, code, strikethrough and a web link", async () => {
    const seen: string[] = [];
    const editor = await render(rich({ onValueChange: (value: string) => void seen.push(value) }));
    editor.focus();
    await paste(editor, { "text/plain": "x", "text/html": '<p>a <b>bold</b> <em>it</em> <code>c</code> <s>gone</s> <a href="https://x.test/">link</a></p>' });
    await expect.poll(() => seen.at(-1)).toBe("a **bold** _it_ `c` ~~gone~~ [link](https://x.test/)");
    expect(editor.querySelector("a")!.getAttribute("href")).toBe("https://x.test/");
  });

  it("drops scripts, styles, event handlers and addresses that are not web links, and keeps their text", async () => {
    const seen: string[] = [];
    const editor = await render(rich({ onValueChange: (value: string) => void seen.push(value) }));
    editor.focus();
    await paste(editor, { "text/html": '<style>p{color:red}</style><a name="top">anchor</a><!-- note --> <p style="color:red" onclick="x()"><span>one</span> <a href="javascript:alert(1)">two</a> <script>alert(1)</script><img src="x" onerror="y()"><font color="red">three</font></p>' });
    await expect.poll(() => seen.at(-1)).toBe("anchor\none two three");
    expect(editor.querySelector("a, script, style, img, font, [style], [onclick]")).toBeNull();
  });

  it("brings paragraphs, line breaks, list items and quotes in as lines", async () => {
    const seen: string[] = [];
    const editor = await render(rich({ onValueChange: (value: string) => void seen.push(value) }));
    editor.focus();
    await paste(editor, { "text/html": "<p>first<br>second</p><ul><li>a</li><li>b</li></ul><ol><li>c</li></ol><blockquote>q</blockquote><pre>x  y\nz</pre><ul><li><p>wrapped</p></li></ul><blockquote><p>quoted</p></blockquote>" });
    await expect.poll(() => seen.at(-1)).toBe("first\nsecond\n\n- a\n- b\n1. c\n\n> q\n\nx  y\nz\n\n- wrapped\n\n> quoted");
  });

  it("keeps the formatting inside a link, and one formatting tag nested in itself once", async () => {
    const seen: string[] = [];
    const editor = await render(rich({ onValueChange: (value: string) => void seen.push(value) }));
    editor.focus();
    await paste(editor, { "text/html": '<a href="mailto:a@b.test"><b><strong>mail</strong></b></a>' });
    await expect.poll(() => seen.at(-1)).toBe("[**mail**](mailto:a@b.test)");
  });

  it("lets an ordinary paste keep its formatting after a ⌘⇧V that pasted nothing", async () => {
    const seen: string[] = [];
    const editor = await render(rich({ onValueChange: (value: string) => void seen.push(value) }));
    await key(editor, { key: "v", metaKey: true, shiftKey: true });
    await paste(editor, { "text/html": "<b>no caret</b>" });
    editor.focus();
    await paste(editor, { "text/html": "<b>bold</b>" });
    await expect.poll(() => seen.at(-1)).toBe("**bold**");
  });

  it("pastes plain text for a clipboard with no HTML, and for ⌘⇧V, once", async () => {
    const seen: string[] = [];
    const editor = await render(rich({ onValueChange: (value: string) => void seen.push(value) }));
    editor.focus();
    await paste(editor, { "text/plain": "plain" });
    await expect.poll(() => seen.at(-1)).toBe("plain");
    await key(editor, { key: "v", metaKey: true, shiftKey: true });
    await paste(editor, { "text/plain": " raw", "text/html": "<b> raw</b>" });
    await expect.poll(() => seen.at(-1)).toBe("plain raw");
    expect(editor.querySelector("strong, b")).toBeNull();
    await paste(editor, { "text/plain": "x", "text/html": "<b>bold</b>" });
    await expect.poll(() => seen.at(-1)).toBe("plain raw**bold**");
  });

  it("makes a web address pasted over a selection a link to it, and pastes it as text with no selection", async () => {
    const seen: string[] = [];
    const editor = await render(rich({ defaultValue: "docs", onValueChange: (value: string) => void seen.push(value) }));
    await selectAll(editor);
    await paste(editor, { "text/plain": "https://x.test/a" });
    await expect.poll(() => seen.at(-1)).toBe("[docs](https://x.test/a)");
    editor.focus();
    await userEvent.keyboard("{ArrowRight}");
    await paste(editor, { "text/plain": "https://x.test/b" });
    await expect.poll(() => seen.at(-1)).toContain("https://x.test/b");
  });

  it("pastes text, not a link, for words over a selection and for an address that is not a web one", async () => {
    const seen: string[] = [];
    const editor = await render(rich({ defaultValue: "docs", onValueChange: (value: string) => void seen.push(value) }));
    await selectAll(editor);
    await paste(editor, { "text/plain": "javascript:alert(1)" });
    await expect.poll(() => seen.at(-1)).toBe("javascript:alert(1)");
    expect(editor.querySelector("a")).toBeNull();
    await selectAll(editor);
    await paste(editor, { "text/plain": "https://x.test/ two" });
    await expect.poll(() => seen.at(-1)).toBe("https://x.test/ two");
    expect(editor.querySelector("a")).toBeNull();
  });

  it("⌘K links a selected address to itself, takes a link off, and asks for the address otherwise", async () => {
    const seen: string[] = [];
    const prompt = vi.spyOn(window, "prompt").mockReturnValue("https://y.test/");
    const editor = await render(rich({ defaultValue: "https://x.test/", onValueChange: (value: string) => void seen.push(value) }));
    await selectAll(editor);
    await key(editor, { key: "k", metaKey: true });
    await expect.poll(() => seen.at(-1)).toBe("[https://x.test/](https://x.test/)");
    expect(prompt).not.toHaveBeenCalled();
    await selectAll(editor);
    await key(editor, { key: "k", ctrlKey: true });
    await expect.poll(() => seen.at(-1)).toBe("https://x.test/");
    expect(editor.querySelector("a")).toBeNull();
    const words = await render(rich({ defaultValue: "words", onValueChange: (value: string) => void seen.push(value) }));
    await selectAll(words);
    await key(words, { key: "k", metaKey: true });
    expect(prompt).toHaveBeenCalledTimes(1);
    await expect.poll(() => seen.at(-1)).toBe("[words](https://y.test/)");
  });

  it("leaves the text alone when ⌘K has no selection, no answer or an unsafe one, and in a read-only box", async () => {
    const seen: string[] = [];
    const prompt = vi.spyOn(window, "prompt").mockReturnValue("javascript:alert(1)");
    const editor = await render(rich({ defaultValue: "words", onValueChange: (value: string) => void seen.push(value) }));
    editor.focus();
    await key(editor, { key: "k", metaKey: true });
    expect(prompt).not.toHaveBeenCalled();
    await selectAll(editor);
    await key(editor, { key: "k", metaKey: true });
    expect(prompt).toHaveBeenCalledTimes(1);
    prompt.mockReturnValue(null);
    await key(editor, { key: "k", metaKey: true });
    await key(editor, { key: "k", metaKey: true, shiftKey: true });
    await key(editor, { key: "k", metaKey: true, altKey: true });
    expect(prompt).toHaveBeenCalledTimes(2);
    expect(editor.querySelector("a")).toBeNull();
    const locked = await render(rich({ defaultValue: "words", readOnly: true }));
    await selectAll(locked);
    await key(locked, { key: "k", metaKey: true });
    expect(prompt).toHaveBeenCalledTimes(2);
  });
});
