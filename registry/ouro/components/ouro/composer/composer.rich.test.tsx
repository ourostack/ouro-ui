import { createRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { Composer, type ComposerEditor } from "@/registry/ouro/components/ouro/composer/composer";
import { forgetRichEditor, preloadRichEditor } from "@/registry/ouro/components/ouro/composer/composer-styles";
import type { EmojiCatalogue, EmojiItem } from "@/registry/ouro/components/ouro/emoji/emoji";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { $getRoot, type ElementNode } from "lexical";

const roots: Root[] = [];
let mounted: HTMLElement[] = [];
const nativeMod = /Mac/.test(navigator.platform) ? "Meta" : "Control";

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
  vi.useRealTimers();
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

  it("hydrates server HTML with the plain box, then draws the editor, though the page has already loaded its module", async () => {
    // A render anywhere on the page warms the module cache the state initializer reads from.
    await render(rich());
    const node = rich({ placeholder: "Write a message" });
    const host = document.createElement("div");
    host.innerHTML = renderToString(node);
    // The server draws the plain box, however warm this page's module cache is: a real server never loads the editor.
    expect(host.querySelector("textarea")).not.toBeNull();
    expect(host.querySelector("[data-ouro-composer-editor]")).toBeNull();
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
    await expect.poll(() => host.querySelector("[data-ouro-composer-editor]")).not.toBeNull();
  });

  it("draws the editor directly, with no plain box first, once a page has already loaded its module", async () => {
    // A render anywhere on the page warms the module cache the state initializer below reads from.
    await render(rich());
    const host = document.createElement("div");
    document.body.append(host);
    mounted.push(host);
    const root = createRoot(host);
    roots.push(root);
    await act(() => root.render(rich({ placeholder: "Write a message" })));
    expect(host.querySelector("textarea")).toBeNull();
    expect(host.querySelector("[data-ouro-composer-editor]")).not.toBeNull();
  });

  it("draws the editor within the same commit as the warm mount, before the usual async load could ever run", async () => {
    // A render anywhere on the page warms the module cache the state initializer below reads from.
    await render(rich());
    const host = document.createElement("div");
    document.body.append(host);
    mounted.push(host);
    const root = createRoot(host);
    roots.push(root);
    // flushSync renders synchronously, with no chance for any effect or async load to run first, so this confirms the editor
    // comes from the component's own first render, not drawn in afterward by an effect: the async effect would draw the same
    // editor a tick later regardless.
    flushSync(() => root.render(rich({ placeholder: "Write a message" })));
    expect(host.querySelector("textarea")).toBeNull();
    expect(host.querySelector("[data-ouro-composer-editor]")).not.toBeNull();
    // Let the later effect settle before the next test unmounts this root.
    await act(async () => {});
  });

  it("draws the editor from its first render and focuses once, for a rich box mounted after preloadRichEditor() resolves", async () => {
    forgetRichEditor();
    const loading = preloadRichEditor();
    // A second call joins the first load instead of starting another.
    expect(preloadRichEditor()).toBeInstanceOf(Promise);
    await loading;
    const host = document.createElement("div");
    document.body.append(host);
    mounted.push(host);
    const root = createRoot(host);
    roots.push(root);
    let focusMoves = 0;
    const onFocusIn = () => {
      focusMoves += 1;
    };
    document.addEventListener("focusin", onFocusIn);
    try {
      flushSync(() => root.render(rich({ autoFocus: true })));
      expect(host.querySelector("textarea")).toBeNull();
      expect(host.querySelector("[data-ouro-composer-editor]")).not.toBeNull();
      await act(async () => {});
    } finally {
      document.removeEventListener("focusin", onFocusIn);
    }
    expect(host.querySelector("textarea")).toBeNull();
    expect(focusMoves).toBe(1);
  });

  it("loads the editor once however often preloadRichEditor() is called", async () => {
    forgetRichEditor();
    const first = preloadRichEditor();
    const second = preloadRichEditor();
    await Promise.all([first, second]);
    await expect(preloadRichEditor()).resolves.toBeUndefined();
    // One shared load: the module instance a later mount reads is the one both calls waited on.
    const { richEditorModule, loadRich } = await import("@/registry/ouro/components/ouro/composer/composer-styles");
    expect(richEditorModule()).toBe(await loadRich());
    forgetRichEditor();
    expect(richEditorModule()).toBeUndefined();
    await preloadRichEditor();
  });

  it("focuses once, not twice, mounting a box that asks for focus once a page has already loaded the module", async () => {
    // A render anywhere on the page warms the module cache the state initializer below reads from.
    await render(rich());
    const host = document.createElement("div");
    document.body.append(host);
    mounted.push(host);
    const root = createRoot(host);
    roots.push(root);
    let focusMoves = 0;
    const onFocusIn = () => {
      focusMoves += 1;
    };
    document.addEventListener("focusin", onFocusIn);
    try {
      await act(async () => root.render(rich({ autoFocus: true })));
    } finally {
      document.removeEventListener("focusin", onFocusIn);
    }
    expect(host.querySelector("textarea")).toBeNull();
    expect(focusMoves).toBe(1);
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

  it.each([
    ["a link with underscores in its path", "see https://x.com/a_b_c", "see https://x.com/a_b_c!"],
    ["a star-spelled italic run", "Hi *there*", "Hi *there*!"],
    ["an underscore-spelled bold run", "__bold__", "__bold__!"],
    ["a mention with an underscore in its name", "@quiet_fox hi", "@quiet_fox hi!"],
    ["a lone star with no partner, as in a sum", "2*3=6", "2*3=6!"],
    ["a star-spelled italic run that is also bold, which writes back out with the default underscore instead", "**say *mixed* thing**", "**say _mixed_ thing**!"],
    ["a word-flanked underscore inside a star-spelled italic run, which CommonMark never reads as a mark", "*a_b c*", "*a_b c*!"],
    ["a space-flanked underscore inside a star-spelled italic run, escaped so it reads bare", "*wow _ cool*", "*wow \\_ cool*!"],
    ["adjacent tildes inside a star-spelled italic run, each escaped since it has a same-mark neighbor", "*note~~x end*", "*note\\~\\~x end*!"],
    ["an underscore-spelled bold run inside a word", "a__b__c", "a__b__c!"],
    ["an underscore at the very start of a star-spelled italic run, with no character before it to flank, escaped", "*_a*", "*\\_a*!"],
    ["a lone star in plain text with a word before it but a space after, which only unescapeSafeMarkText's own star-run-adjacency check reads, not a word-flank test", "a* b", "a* b!"],
  ])("round-trips %s unchanged: %s", async (_label, markdown, expected) => {
    const seen: string[] = [];
    const { editor } = await render(rich({ defaultValue: markdown, onValueChange: (value) => void seen.push(value) }));
    await act(() => editor.focus());
    await userEvent.keyboard("{End}!");
    await expect.poll(() => seen.at(-1)).toBe(expected);
  });

  it("keeps a leading underscore in plain text escaped, with nothing before it to flank", async () => {
    const seen: string[] = [];
    const { editor } = await render(rich({ defaultValue: "_leading word", onValueChange: (value) => void seen.push(value) }));
    editor.focus();
    await userEvent.keyboard("{End}!");
    await expect.poll(() => seen.at(-1)).toBe("\\_leading word!");
  });

  it("keeps a trailing underscore in plain text escaped, with nothing after it to flank", async () => {
    const seen: string[] = [];
    const { editor } = await render(rich({ defaultValue: "trailing word_", onValueChange: (value) => void seen.push(value) }));
    editor.focus();
    await userEvent.keyboard("{End}!");
    await expect.poll(() => seen.at(-1)).toBe("trailing word\\_!");
  });

  // Every other trailing-underscore case here types a character after it (the "!" above), which gives unescapeSafeMarkText's `after` an actual value and leaves `after !== undefined` unable to tell "still escaped" from "a mutant that skips that check": replacing the whole value with one that still ends in the escaped underscore keeps it the exported string's own last character, the one case where `after` is truly undefined and the check's own return value is the only thing keeping the backslash.
  it("keeps a trailing underscore in plain text escaped, where it is the exported string's own last character", async () => {
    const seen: string[] = [];
    const { editor } = await render(rich({ defaultValue: "trailing word_", onValueChange: (value) => void seen.push(value) }));
    editor.focus();
    await userEvent.keyboard(`{${nativeMod}>}a{/${nativeMod}}Xtrailing word_`);
    await expect.poll(() => seen.at(-1)).toBe("Xtrailing word\\_");
  });

  // Building a run's raw text this way, then round-tripping it out, puts an un-markdown-safe `_`/`~` in a star-spelled italic node without ever handing it back through the real importer or a live keystroke: either path reparses the text as Markdown and can read the character as a second mark's delimiter, which is exactly the ambiguity escapeMarkText's bare/escaped choice exists to settle on export, so the one way to pin the input is to set the node's content and state directly.
  function starItalicState(text: string) {
    return {
      root: {
        children: [
          {
            children: [{ detail: 0, format: 2, mode: "normal", style: "", text, type: "text", version: 1, $: { composerMark: "star" } }],
            direction: null,
            format: "",
            indent: 0,
            textFormat: 2,
            textStyle: "",
            type: "paragraph",
            version: 1,
          },
        ],
        direction: null,
        format: "",
        indent: 0,
        type: "root",
        version: 1,
      },
    };
  }

  it("keeps a star-spelled italic run's mark memory for a lone tilde with space on both sides and no same-mark neighbor to pair with", async () => {
    const seen: string[] = [];
    const { editor } = await render(rich({ onValueChange: (value) => void seen.push(value) }));
    const lexical = (editor as unknown as { __lexicalEditor: { parseEditorState(json: unknown): unknown; setEditorState(state: unknown): void } }).__lexicalEditor;
    await act(async () => lexical.setEditorState(lexical.parseEditorState(starItalicState("wow ~ cool"))));
    await expect.poll(() => seen.at(-1)).toBe("*wow ~ cool*");
  });

  it("keeps a star-spelled italic run's mark memory for an underscore with a word character before it but a space after, escaped since only one side is word-flanked", async () => {
    const seen: string[] = [];
    const { editor } = await render(rich({ onValueChange: (value) => void seen.push(value) }));
    const lexical = (editor as unknown as { __lexicalEditor: { parseEditorState(json: unknown): unknown; setEditorState(state: unknown): void } }).__lexicalEditor;
    await act(async () => lexical.setEditorState(lexical.parseEditorState(starItalicState("a_ b"))));
    await expect.poll(() => seen.at(-1)).toBe("*a\\_ b*");
  });

  it("keeps a star-spelled italic run's mark memory for an underscore with a space before it but a word character after, escaped since only one side is word-flanked", async () => {
    const seen: string[] = [];
    const { editor } = await render(rich({ onValueChange: (value) => void seen.push(value) }));
    const lexical = (editor as unknown as { __lexicalEditor: { parseEditorState(json: unknown): unknown; setEditorState(state: unknown): void } }).__lexicalEditor;
    await act(async () => lexical.setEditorState(lexical.parseEditorState(starItalicState("x _b"))));
    await expect.poll(() => seen.at(-1)).toBe("*x \\_b*");
  });

  it("keeps a star-spelled italic run's mark memory for an underscore at the very end of the run, with no character after it to flank, escaped", async () => {
    const seen: string[] = [];
    const { editor } = await render(rich({ onValueChange: (value) => void seen.push(value) }));
    const lexical = (editor as unknown as { __lexicalEditor: { parseEditorState(json: unknown): unknown; setEditorState(state: unknown): void } }).__lexicalEditor;
    await act(async () => lexical.setEditorState(lexical.parseEditorState(starItalicState("a_"))));
    await expect.poll(() => seen.at(-1)).toBe("*a\\_*");
  });

  // markState's own parse validates a deserialized `$.composerMark`, since nothing but "star" and "underscore" ever reaches the two places that read it back (both strict `===` checks): both a stale, hand-edited value and the parse's own default of null land the same way there (neither is "star" or "underscore"), so the two mark checks alone cannot tell a parse that normalizes an unknown value from one that passes it through unchanged. Lexical only drops a state from a node's exported JSON when it equals that state's own default (parse(undefined)), so if parse let an invalid value "slash" straight through instead of returning null, the exported state would still carry it after a round trip; parsing it down to null, the same as the array never having seen that run's mark at all, keeps the export clean.
  it("normalizes an invalid deserialized mark state to null, not passing it through unchanged", async () => {
    const { editor } = await render(rich());
    const lexical = (
      editor as unknown as { __lexicalEditor: { getEditorState(): { toJSON(): unknown }; parseEditorState(json: unknown): unknown; setEditorState(state: unknown): void } }
    ).__lexicalEditor;
    const state = starItalicState("wow");
    (state.root.children[0]!.children[0]!.$ as { composerMark: string }).composerMark = "slash";
    await act(async () => lexical.setEditorState(lexical.parseEditorState(state)));
    expect(JSON.stringify(lexical.getEditorState().toJSON())).not.toContain("slash");
  });

  // The bold counterpart of starItalicState above, for markState's other value: an underscore-spelled bold run's mark memory round-trips through the same deserialized `$: { composerMark: "underscore" }` the editor state JSON carries, not just through $restoreMarkMemory's own import-time marker scan.
  function underscoreBoldState(text: string) {
    return {
      root: {
        children: [
          {
            children: [{ detail: 0, format: 1, mode: "normal", style: "", text, type: "text", version: 1, $: { composerMark: "underscore" } }],
            direction: null,
            format: "",
            indent: 0,
            textFormat: 1,
            textStyle: "",
            type: "paragraph",
            version: 1,
          },
        ],
        direction: null,
        format: "",
        indent: 0,
        type: "root",
        version: 1,
      },
    };
  }

  it("keeps an underscore-spelled bold run's mark memory for a lone tilde with space on both sides and no same-mark neighbor to pair with", async () => {
    const seen: string[] = [];
    const { editor } = await render(rich({ onValueChange: (value) => void seen.push(value) }));
    const lexical = (editor as unknown as { __lexicalEditor: { parseEditorState(json: unknown): unknown; setEditorState(state: unknown): void } }).__lexicalEditor;
    await act(async () => lexical.setEditorState(lexical.parseEditorState(underscoreBoldState("wow ~ cool"))));
    await expect.poll(() => seen.at(-1)).toBe("__wow ~ cool__");
  });

  it("falls back to the array's default spelling when an underscore-spelled bold run also turns italic", async () => {
    const handle = createRef<ComposerEditor>();
    const seen: string[] = [];
    const { editor } = await render(rich({ editorRef: handle, defaultValue: "__bold__", onValueChange: (value) => void seen.push(value) }));
    editor.focus();
    await userEvent.keyboard(`{${nativeMod}>}a{/${nativeMod}}`);
    await act(async () => handle.current!.format("italic"));
    await expect.poll(() => seen.at(-1)).toBe("**_bold_**");
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
      const toggle = `{Control>}${shift ? "{Shift>}" : ""}${key.toLowerCase()}${shift ? "{/Shift}" : ""}{/Control}`;
      // One call drives both toggles and the typed text, so a loaded shard pays one round trip
      // for the whole key sequence instead of four.
      await userEvent.keyboard(`${toggle}x${toggle} `);
      await expect.poll(() => seen.at(-1)).toContain(`${wrap}x${wrap}`);
    }
  });

  it("sends the Markdown on Enter, starts a paragraph on Shift+Enter, and clears after a send", async () => {
    const onSend = vi.fn();
    const { editor } = await render(rich({ defaultValue: "**hi**", onSend }));
    editor.focus();
    await userEvent.keyboard("{Shift>}{Enter}{/Shift}there");
    await expect.poll(() => editor.querySelectorAll("p").length).toBe(2);
    expect(editor.querySelectorAll("br")).toHaveLength(0);
    await userEvent.keyboard("{Enter}");
    await expect.poll(() => onSend.mock.calls.length).toBe(1);
    expect(onSend.mock.calls[0]![0]).toBe("**hi**\nthere");
    await expect.poll(() => editor.textContent).toBe("");
    expect(document.activeElement).toBe(editor);
  });

  it("starts a list item with a dash after Shift+Enter, the way a fresh line does", async () => {
    const seen: string[] = [];
    const { editor } = await render(rich({ defaultValue: "hi", onValueChange: (value) => void seen.push(value) }));
    editor.focus();
    await userEvent.keyboard("{Shift>}{Enter}{/Shift}- one");
    await expect.poll(() => editor.querySelectorAll("ul > li")).toHaveLength(1);
    expect(editor.querySelector("li")?.textContent).toBe("one");
    await expect.poll(() => seen.at(-1)).toBe("hi\n\n- one");
  });

  it("keeps a line break's paragraphs through a value, editor and value round trip", async () => {
    const seen: string[] = [];
    const markdown = "one\ntwo";
    const { editor } = await render(rich({ defaultValue: markdown, onValueChange: (value) => void seen.push(value) }));
    expect(editor.querySelectorAll("p")).toHaveLength(2);
    editor.focus();
    await userEvent.keyboard("!");
    await expect.poll(() => seen.at(-1)).toBe("one\ntwo!");
  });

  it("does not send on the Enter that ends an input method's word", async () => {
    const onSend = vi.fn();
    const { editor } = await render(rich({ defaultValue: "hi", onSend }));
    editor.focus();
    await act(async () => void editor.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true, isComposing: true })));
    await act(async () => void editor.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true, keyCode: 229 })));
    expect(onSend).not.toHaveBeenCalled();
  });

  it("sends on the next plain Enter once a committed word lands with no compositionend, even though that Enter still reads isComposing as true (ourostack/ouro-ui#3843)", async () => {
    const onSend = vi.fn();
    const { editor } = await render(rich({ defaultValue: "hi", onSend }));
    editor.focus();
    await act(async () => void editor.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true, data: "" })));
    await act(async () => void editor.dispatchEvent(new InputEvent("beforeinput", { bubbles: true, cancelable: true, inputType: "insertCompositionText", data: "にほん", isComposing: true })));
    // The input method's own Enter commits the word.
    await act(async () => void editor.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true, keyCode: 229 })));
    // This CDP sequence (Edge) delivers the committed word as a plain insertText instead of a compositionend: the editor's own composition session never closes.
    await act(async () => void editor.dispatchEvent(new InputEvent("beforeinput", { bubbles: true, cancelable: true, inputType: "insertText", data: "にほん" })));
    // The next, plain Enter still reads isComposing as true, since compositionend never fired.
    await act(async () => void editor.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true, isComposing: true })));
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it("does not send on a stray isComposing Enter from a plain insertText that never followed a compositionstart", async () => {
    const onSend = vi.fn();
    const { editor } = await render(rich({ defaultValue: "hi", onSend }));
    editor.focus();
    // No input method session opened this editor at all: an ordinary beforeinput, with no
    // compositionstart before it, must count for nothing toward the committed-word signal.
    await act(async () => void editor.dispatchEvent(new InputEvent("beforeinput", { bubbles: true, cancelable: true, inputType: "insertText", data: "hi" })));
    await act(async () => void editor.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true, isComposing: true })));
    expect(onSend).not.toHaveBeenCalled();
  });

  it("does not resend on a later isComposing Enter once a second, ordinary composition starts and closes with its own compositionend", async () => {
    const onSend = vi.fn();
    const { editor } = await render(rich({ defaultValue: "hi", onSend }));
    editor.focus();
    await act(async () => void editor.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true, data: "" })));
    await act(async () => void editor.dispatchEvent(new InputEvent("beforeinput", { bubbles: true, cancelable: true, inputType: "insertCompositionText", data: "にほん", isComposing: true })));
    await act(async () => void editor.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true, keyCode: 229 })));
    await act(async () => void editor.dispatchEvent(new InputEvent("beforeinput", { bubbles: true, cancelable: true, inputType: "insertText", data: "にほん" })));
    await act(async () => void editor.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true, isComposing: true })));
    expect(onSend).toHaveBeenCalledTimes(1);
    // A second composition opens and closes the ordinary way, with its own compositionend: starting
    // it must reset the committed-word flag the first one left behind, and closing it properly (no
    // insertText standing in) must leave no stale flag of its own for a later, unrelated Enter to read.
    await act(async () => void editor.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true, data: "" })));
    await act(async () => void editor.dispatchEvent(new InputEvent("beforeinput", { bubbles: true, cancelable: true, inputType: "insertCompositionText", data: "ご", isComposing: true })));
    await act(async () => void editor.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "ご" })));
    // Ordinary typing right after, unrelated to any composition, must not look like a committed word.
    await act(async () => void editor.dispatchEvent(new InputEvent("beforeinput", { bubbles: true, cancelable: true, inputType: "insertText", data: "!" })));
    await act(async () => void editor.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true, isComposing: true })));
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it("also sends on a committed word that lands as insertReplacementText instead of insertText, the other no-compositionend quirk", async () => {
    const onSend = vi.fn();
    const { editor } = await render(rich({ defaultValue: "hi", onSend }));
    editor.focus();
    await act(async () => void editor.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true, data: "" })));
    await act(async () => void editor.dispatchEvent(new InputEvent("beforeinput", { bubbles: true, cancelable: true, inputType: "insertCompositionText", data: "にほん", isComposing: true })));
    await act(async () => void editor.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true, keyCode: 229 })));
    // Some sequences commit the word by replacing the composition's own marked range rather than inserting plain text.
    await act(async () => void editor.dispatchEvent(new InputEvent("beforeinput", { bubbles: true, cancelable: true, inputType: "insertReplacementText", data: "にほん" })));
    await act(async () => void editor.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true, isComposing: true })));
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it("stops listening for the three composition signals once the box leaves the page", async () => {
    const { editor } = await render(rich({ defaultValue: "hi" }));
    const removed: string[] = [];
    vi.spyOn(editor, "removeEventListener").mockImplementation((type) => void removed.push(type));
    const root = roots.pop()!;
    const host = mounted.pop()!;
    await act(async () => root.unmount());
    host.remove();
    expect(removed).toEqual(expect.arrayContaining(["compositionstart", "compositionend", "beforeinput"]));
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

  it("leaves focus where the person is when the app sets a value while they are outside the box", async () => {
    const { editor, rerender } = await render(rich({ value: "one", onValueChange: () => {} }));
    // The editor keeps its last caret once the person has been in it, which is what a value change used to carry back.
    editor.focus();
    await userEvent.keyboard("{End}");
    const elsewhere = document.createElement("input");
    elsewhere.setAttribute("aria-label", "Search");
    document.body.append(elsewhere);
    mounted.push(elsewhere);
    elsewhere.focus();
    await rerender(rich({ value: "two", onValueChange: () => {} }));
    await expect.poll(() => editor.textContent).toBe("two");
    expect(document.activeElement).toBe(elsewhere);
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
    // Lexical's history plugin merges consecutive character edits into one undo step only when
    // Date.now() reads them under 300ms apart (registerHistory's delay). A busy runner can take
    // longer than that to deliver the second keystroke, splitting "b" and "c" into two undo
    // entries so one mod+Z lands on "ab" instead of "a" (ourostack/ouro-ui#3069). Holding the
    // clock removes the race between that real elapsed time and the merge window, without
    // widening the window or waiting on one.
    vi.useFakeTimers({ toFake: ["Date"] });
    const { editor } = await render(rich({ defaultValue: "a" }));
    editor.focus();
    await userEvent.keyboard("bc");
    await expect.poll(() => editor.textContent).toBe("abc");
    await userEvent.keyboard(`{${nativeMod}>}z{/${nativeMod}}`);
    await expect.poll(() => editor.textContent).toBe("a");
    await userEvent.keyboard(`{${nativeMod}>}{Shift>}z{/Shift}{/${nativeMod}}`);
    await expect.poll(() => editor.textContent).toBe("abc");
  });

  it("keeps one mod+Z merging typed characters however long the runner takes to deliver them (ourostack/ouro-ui#3069)", async () => {
    // Holds Date so Lexical's history-merge window reads zero elapsed time between the two
    // keystrokes, while a real wait between them stands in for a busy runner's actual delay.
    // Without holding the clock, this delay alone reproduces the race: it reads over 300ms
    // elapsed, splits "b" and "c" into two undo entries, and one mod+Z leaves "ab", not "a".
    vi.useFakeTimers({ toFake: ["Date"] });
    const { editor } = await render(rich({ defaultValue: "a" }));
    editor.focus();
    await userEvent.keyboard("b");
    await expect.poll(() => editor.textContent).toBe("ab");
    await new Promise((resolve) => setTimeout(resolve, 350));
    await userEvent.keyboard("c");
    await expect.poll(() => editor.textContent).toBe("abc");
    await userEvent.keyboard(`{${nativeMod}>}z{/${nativeMod}}`);
    await expect.poll(() => editor.textContent).toBe("a");
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

  it("keeps a line break when dictation or an input method delivers a whole line in one insertText event", async () => {
    const seen: string[] = [];
    const { editor } = await render(rich({ onValueChange: (value) => void seen.push(value) }));
    editor.focus();
    await act(async () => void editor.dispatchEvent(new InputEvent("beforeinput", { inputType: "insertText", data: "a\nb", bubbles: true, cancelable: true })));
    await expect.poll(() => seen.at(-1)).toBe("a\nb");
    expect(editor.querySelectorAll("br")).toHaveLength(1);
    expect(editor.querySelectorAll("p")).toHaveLength(1);
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
    await userEvent.keyboard(`{${nativeMod}>}z{/${nativeMod}}`);
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

  it("draws the placeholder where the typed text starts, whatever padding the app gives the editor's box", async () => {
    const { host, editor } = await render(<div style={{ width: 320 }}>{rich({ placeholder: "Write a message", className: "ps-3 pe-2" } as never)}</div>);
    await expect.poll(() => host.querySelector("[data-ouro-composer-placeholder]")).not.toBeNull();
    const placeholder = host.querySelector("[data-ouro-composer-placeholder]")!.getBoundingClientRect();
    expect(placeholder.left).toBe(editor.getBoundingClientRect().left);
    expect(placeholder.top).toBe(editor.getBoundingClientRect().top);
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

describe("Composer rich mode with a catalogue", () => {
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
  const catalogue: EmojiCatalogue = { categories: [{ id: "people", label: "People", items: [party, wave] }] };
  const field = (editor: HTMLElement) => (editor.focus(), editor) as HTMLElement & { value: string };
  // Lexical adds empty-alt images of its own beside an inline decorator in WebKit.
  const pictures = (editor: HTMLElement) => [...editor.querySelectorAll("img:not([alt=\"\"])")];
  const withCatalogue = (props: Partial<React.ComponentProps<typeof Composer>> = {}) => rich({ catalogue, offsets: "markdown", ...props });

  it("draws a token the catalogue lists as its picture, named by the emoji's name, with the token as the Markdown", async () => {
    const { editor } = await render(withCatalogue({ defaultValue: "hi :party: and :tada: :wave:" }));
    const drawn = pictures(editor);
    expect(drawn.map((img) => img.getAttribute("alt"))).toEqual(["Party popper", "Party popper", "Waving hand"]);
    expect(drawn[0]!.getAttribute("src")).toBe(party.src);
    expect(field(editor).value).toBe("hi :party: and :tada: :wave:");
  });

  it("draws a skin tone's own picture, and keeps text a token that names nothing", async () => {
    const { editor } = await render(withCatalogue({ defaultValue: ":wave-tone3: :nope: :party" }));
    expect(pictures(editor).map((img) => img.getAttribute("src"))).toEqual([image("wave tone3")]);
    expect(field(editor).value).toBe(":wave-tone3: :nope: :party");
  });

  it("draws nothing without a catalogue, and tokens stay text", async () => {
    const { editor } = await render(rich({ defaultValue: "hi :party:" }));
    expect(pictures(editor)).toEqual([]);
    expect(editor.textContent).toBe("hi :party:");
  });

  it("turns a token the person types into its picture, and reports the token", async () => {
    const seen: string[] = [];
    const { editor } = await render(withCatalogue({ onValueChange: (value) => void seen.push(value) }));
    editor.focus();
    await userEvent.keyboard("go :party:");
    await expect.poll(() => pictures(editor).length).toBe(1);
    expect(seen.at(-1)).toBe("go :party:");
    await userEvent.keyboard("{Backspace}");
    await expect.poll(() => seen.at(-1)).toBe("go ");
    expect(pictures(editor)).toEqual([]);
  });

  it("turns a token typed after one the catalogue does not list into its picture", async () => {
    const { editor } = await render(withCatalogue());
    editor.focus();
    await userEvent.keyboard("hi :nope: :party:");
    await expect.poll(() => pictures(editor).length).toBe(1);
    expect(field(editor).value).toBe("hi :nope: :party:");
  });

  it("keeps a half-formed token as text, and draws it once its colon closes it", async () => {
    const { editor } = await render(withCatalogue());
    editor.focus();
    await userEvent.keyboard("party: :party");
    expect(pictures(editor)).toEqual([]);
    await userEvent.keyboard(":");
    await expect.poll(() => pictures(editor).length).toBe(1);
    expect(field(editor).value).toBe("party: :party:");
  });

  it("leaves a typed token the catalogue does not list as text", async () => {
    const { editor } = await render(withCatalogue());
    editor.focus();
    await userEvent.keyboard(":nope:");
    expect(pictures(editor)).toEqual([]);
    expect(field(editor).value).toBe(":nope:");
  });

  it("leaves a non-string composition payload to Lexical's own handling", async () => {
    const { editor } = await render(withCatalogue());
    editor.focus();
    const selection = getSelection()!;
    const text = editor.querySelector("p")!;
    selection.collapse(text, 0);
    // A yanked selection hands the control the native event, not a string: Lexical's own
    // insertFromYank/insertFromDrop/insertFromComposition/insertReplacementText paths all pass
    // the raw InputEvent through, under the hood, same as this does.
    await act(async () => void editor.dispatchEvent(new InputEvent("beforeinput", { inputType: "insertFromYank", data: "ok", bubbles: true, cancelable: true })));
    await expect.poll(() => field(editor).value).toBe("ok");
  });

  it("lets Lexical insert plain multi-character text with no emoji under the active format", async () => {
    const handle = createRef<ComposerEditor>();
    const { editor } = await render(withCatalogue({ editorRef: handle }));
    editor.focus();
    await act(async () => handle.current!.format("bold"));
    await act(async () => void editor.dispatchEvent(new InputEvent("beforeinput", { inputType: "insertText", data: "hi", bubbles: true, cancelable: true })));
    await expect.poll(() => editor.querySelector("strong")?.textContent).toBe("hi");
  });

  it("puts an emoji the system inserts in as its token, drawn as the picture", async () => {
    const seen: string[] = [];
    const { editor } = await render(withCatalogue({ onValueChange: (value) => void seen.push(value) }));
    editor.focus();
    await act(async () => void editor.dispatchEvent(new InputEvent("beforeinput", { inputType: "insertText", data: "a🎉b", bubbles: true, cancelable: true })));
    await expect.poll(() => pictures(editor).length).toBe(1);
    expect(seen.at(-1)).toBe("a:party:b");
  });

  it("puts emoji in pasted text, and in the editorRef's insert, in as pictures", async () => {
    const handle = createRef<ComposerEditor>();
    const { editor } = await render(withCatalogue({ editorRef: handle }));
    editor.focus();
    const data = new DataTransfer();
    data.setData("text/plain", "🎉 :wave:");
    await act(async () => void editor.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: data })));
    await expect.poll(() => pictures(editor).length).toBe(2);
    await act(async () => handle.current!.insert(" :tada:"));
    await expect.poll(() => pictures(editor).length).toBe(3);
    expect(field(editor).value).toBe(":party: :wave: :tada:");
  });

  it("copies a picture and pastes it back as the same picture, through Lexical's own clipboard format", async () => {
    const { editor } = await render(withCatalogue({ defaultValue: ":party:" }));
    editor.focus();
    (editor as HTMLElement & { setSelectionRange: (s: number, e: number) => void }).setSelectionRange(0, 7);
    const data = new DataTransfer();
    await act(async () => void editor.dispatchEvent(new ClipboardEvent("copy", { bubbles: true, cancelable: true, clipboardData: data })));
    expect(data.getData("application/x-lexical-editor")).toContain(":party:");
    (editor as HTMLElement & { setSelectionRange: (s: number, e: number) => void }).setSelectionRange(7, 7);
    await act(async () => void editor.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: data })));
    await expect.poll(() => pictures(editor).length).toBe(2);
    expect(field(editor).value).toBe(":party::party:");
  });

  it("loads a saved state back with its pictures, by the type each node saves", async () => {
    const { editor } = await render(withCatalogue({ defaultValue: "a :party: b" }));
    const lexical = (editor as unknown as { __lexicalEditor: { getEditorState(): { toJSON(): unknown }; parseEditorState(json: unknown): unknown; setEditorState(state: unknown): void } }).__lexicalEditor;
    const json = lexical.getEditorState().toJSON();
    expect(JSON.stringify(json)).toContain('"type":"ouro-emoji"');
    await act(async () => lexical.setEditorState(lexical.parseEditorState(json)));
    await expect.poll(() => pictures(editor).length).toBe(1);
    expect(field(editor).value).toBe("a :party: b");
  });

  it("keeps a plain selection's text offsets over a token, as the token's own text", async () => {
    const { editor } = await render(rich({ catalogue, defaultValue: "a :party: b" }));
    expect(field(editor).value).toBe("a :party: b");
    (editor as HTMLElement & { setSelectionRange: (s: number, e: number) => void }).setSelectionRange(0, 9);
    await expect.poll(() => (editor as HTMLElement & { selectionEnd: number }).selectionEnd).toBe(9);
  });
  it("draws each picture inline, undraggable, and keeps its tokens", async () => {
    const { editor } = await render(withCatalogue({ defaultValue: "a :party: b :wave: c" }));
    const [first, second] = pictures(editor) as HTMLImageElement[];
    expect(first!.draggable).toBe(false);
    expect(first!.className).toContain("inline-block");
    expect(second!.getAttribute("alt")).toBe("Waving hand");
    expect(field(editor).value).toBe("a :party: b :wave: c");
  });

  it("reads tokens among other colons and text, each one alone", async () => {
    const { editor } = await render(withCatalogue({ defaultValue: "at 10:30:45 :party::wave: x:y :nope here: :wave:" }));
    expect(pictures(editor).map((img) => img.getAttribute("alt"))).toEqual(["Party popper", "Waving hand", "Waving hand"]);
    expect(field(editor).value).toBe("at 10:30:45 :party::wave: x:y :nope here: :wave:");
  });

  it.each([
    [0, 0, "X:party: b"],
    [7, 7, ":party:X b"],
    [3, 0, "X:party: b"],
    [8, 8, ":party: Xb"],
  ])("puts the caret at %i before, after or over a picture by its token's Markdown offsets", async (at, expected, written) => {
    const { editor } = await render(withCatalogue({ defaultValue: ":party: b" }));
    const box = field(editor) as unknown as HTMLElement & { value: string; setSelectionRange: (s: number, e: number) => void; selectionStart: number; setRangeText: (t: string, s: number, e: number) => void };
    box.setSelectionRange(at, at);
    await expect.poll(() => box.selectionStart).toBe(expected);
    await act(async () => box.setRangeText("X", expected, expected));
    await expect.poll(() => box.value).toBe(written);
  });

  it("takes a catalogue that arrives after the first render", async () => {
    const view = await render(rich({ offsets: "markdown" }));
    await view.rerender(withCatalogue());
    const editor = view.editor;
    editor.focus();
    await act(async () => void editor.dispatchEvent(new InputEvent("beforeinput", { inputType: "insertText", data: "🎉", bubbles: true, cancelable: true })));
    await expect.poll(() => pictures(editor).length).toBe(1);
  });

  it("leaves typed text with no emoji, and a typed emoji with no catalogue, as text", async () => {
    const { editor } = await render(withCatalogue());
    editor.focus();
    await userEvent.keyboard("ab");
    expect(pictures(editor)).toEqual([]);
    expect(field(editor).value).toBe("ab");
    const bare = await render(rich());
    bare.editor.focus();
    await act(async () => void bare.editor.dispatchEvent(new InputEvent("beforeinput", { inputType: "insertText", data: "🎉", bubbles: true, cancelable: true })));
    await expect.poll(() => field(bare.editor).value).toBe("🎉");
  });

  it("inserts plain text as text when there is no catalogue, by paste and by the editorRef", async () => {
    const handle = createRef<ComposerEditor>();
    const { editor } = await render(rich({ editorRef: handle }));
    editor.focus();
    const data = new DataTransfer();
    data.setData("text/plain", "one :party:");
    await act(async () => void editor.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: data })));
    await act(async () => handle.current!.insert(" two"));
    expect(field(editor).value).toBe("one :party: two");
  });
  it("marks a run that holds an emoji's picture, over the picture", async () => {
    const { host, editor } = await render(withCatalogue({ defaultValue: "go :party: now", highlights: [{ start: 3, end: 10, label: "a" }] }));
    await expect.poll(() => host.querySelectorAll("[data-ouro-highlight]").length).toBe(1);
    const picture = pictures(editor)[0]!.getBoundingClientRect();
    const box = host.querySelector("[data-ouro-highlight]")!.getBoundingClientRect();
    expect(Math.abs(box.left - picture.left)).toBeLessThan(3);
    expect(Math.abs(box.right - picture.right)).toBeLessThan(3);
  });
});

describe("Composer rich mode mentions", () => {
  const id = "8:orgid:00000000-0000-4000-8000-0000000000a1";
  const value = (editor: HTMLElement) => (editor as unknown as { value: string }).value;

  it("draws a mention written as @[Name](id) as the person's name, never a link, and writes it back as it came", async () => {
    const written = `@[Avery Kim](${id}), the plan for **Thursday** is ready`;
    const onValueChange = vi.fn();
    const { editor } = await render(rich({ defaultValue: written, offsets: "markdown", onValueChange }));
    const person = editor.querySelector<HTMLElement>("[data-ouro-mention]");
    expect(person?.textContent).toBe("Avery Kim");
    expect(person?.getAttribute("data-ouro-mention")).toBe("");
    expect(person?.isContentEditable).toBe(false);
    // Drawn as a sent message draws a mention, in its line's paragraph with the words around it.
    expect(getComputedStyle(person!).fontWeight).toBe("600");
    expect(person?.parentElement?.tagName).toBe("P");
    expect(editor.querySelector("a")).toBeNull();
    expect(value(editor)).toBe(written);
    editor.focus();
    await userEvent.keyboard("{Control>}{End}{/Control}!");
    await expect.poll(() => onValueChange.mock.lastCall?.[0]).toBe(`${written}!`);
  });

  it("stays the same person through the editor's own copies: its state saved and read back, and the node written to and redrawn", async () => {
    const written = `@[Avery Kim](${id}) hi`;
    const { editor } = await render(rich({ defaultValue: written, offsets: "markdown" }));
    type State = { toJSON(): unknown };
    const lexical = (editor as unknown as { __lexicalEditor: { getEditorState(): State; parseEditorState(json: unknown): State; setEditorState(state: State): void; update(fn: () => void, options: { discrete: boolean }): void } }).__lexicalEditor;
    await act(async () => lexical.setEditorState(lexical.parseEditorState(JSON.stringify(lexical.getEditorState().toJSON()))));
    expect(editor.querySelector("[data-ouro-mention]")?.textContent).toBe("Avery Kim");
    expect(value(editor)).toBe(written);
    await act(async () => lexical.update(() => { for (const node of ($getRoot().getFirstChildOrThrow() as ElementNode).getChildren()) if (node.getType() === "ouro-mention") node.markDirty(); }, { discrete: true }));
    expect(editor.querySelector("[data-ouro-mention]")?.textContent).toBe("Avery Kim");
    expect(value(editor)).toBe(written);
  });

  it("reads as @Name in the box's words where offsets are the words'", async () => {
    const { editor } = await render(rich({ defaultValue: `@[Avery Kim](${id}) hi` }));
    expect(value(editor)).toBe("@Avery Kim hi");
  });

  it("keeps an @ before a link to a web address an @ and a link", async () => {
    for (const address of ["https://example.com/docs", "http://example.com/docs", "mailto:docs@example.com"]) {
      const { editor } = await render(rich({ defaultValue: `@[the docs](${address})`, offsets: "markdown" }));
      expect(editor.querySelector("[data-ouro-mention]")).toBeNull();
      expect(editor.querySelector("a")?.getAttribute("href")).toBe(address);
      expect(value(editor)).toBe(`@[the docs](${address})`);
    }
  });
});

describe("Composer rich mode highlights", () => {
  const layer = (host: HTMLElement) => host.querySelector("[data-ouro-composer-marks]");
  const boxes = (host: HTMLElement) => [...(layer(host)?.children ?? [])] as HTMLElement[];
  const marked = [{ start: 8, end: 12, label: "Suggested" }];

  it("draws a box over the run the Markdown offsets name, on the formatted text and not on its marks", async () => {
    const { host, editor } = await render(rich({ defaultValue: "Hello **bold** world", highlights: marked }));
    await expect.poll(() => boxes(host).length).toBe(1);
    const bold = editor.querySelector("strong")!.getBoundingClientRect();
    const box = boxes(host)[0]!.getBoundingClientRect();
    expect(Math.abs(box.left - bold.left)).toBeLessThan(1.5);
    expect(Math.abs(box.width - bold.width)).toBeLessThan(1.5);
    expect(Math.abs(box.top - bold.top)).toBeLessThan(2);
    expect(layer(host)!.getAttribute("aria-hidden")).toBe("true");
    expect(getComputedStyle(layer(host)!).pointerEvents).toBe("none");
  });

  it("marks only the words a run covers, never a blank line or a list's empty space beside them", async () => {
    const text = "Hi **all**:\n\n- one\n- two\n\nDone.";
    const { host, editor } = await render(rich({ defaultValue: text, highlights: [{ start: 0, end: text.length, label: "Suggested" }] }));
    await expect.poll(() => boxes(host).length).toBeGreaterThan(0);
    const words: DOMRect[] = [];
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const range = document.createRange();
      range.selectNodeContents(node);
      words.push(...[...range.getClientRects()].filter((rect) => rect.width > 0));
    }
    const onWords = (box: DOMRect) => words.some((w) => w.top < box.bottom && box.top < w.bottom && w.left <= box.left + 0.5 && box.right <= w.right + 0.5);
    expect(boxes(host).map((box) => box.getBoundingClientRect()).filter((box) => !onWords(box))).toEqual([]);
    // And to the end of the last line's words.
    const done = words.at(-1)!;
    expect(boxes(host).some((box) => Math.abs(box.getBoundingClientRect().right - done.right) < 1)).toBe(true);
  });

  it("trims both ends of a highlight that crosses formatting partway through its first and last words", async () => {
    const { host, editor } = await render(rich({ defaultValue: "Hello **bold** world", highlights: [{ start: 2, end: 17, label: "Suggested" }] }));
    await expect.poll(() => boxes(host).length).toBe(3);
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    const first = walker.nextNode()!;
    walker.nextNode();
    const last = walker.nextNode()!;
    const range = document.createRange();
    range.setStart(first, 2);
    range.setEnd(last, 3);
    const expected = [...range.getClientRects()].filter((rect) => rect.width > 0);
    const drawn = boxes(host).map((box) => box.getBoundingClientRect());
    expect(Math.abs(drawn[0]!.left - expected[0]!.left)).toBeLessThan(1);
    expect(Math.abs(drawn.at(-1)!.right - expected.at(-1)!.right)).toBeLessThan(1);
  });

  it("describes the marks to a screen reader, with their label and the words, beside the description the app gave", async () => {
    const { host, editor } = await render(rich({ defaultValue: "Hello **bold** world", highlights: marked, description: "Be kind" }));
    await expect.poll(() => boxes(host).length).toBe(1);
    const ids = editor.getAttribute("aria-describedby")!.split(" ");
    expect(ids).toHaveLength(2);
    expect(document.getElementById(ids[1]!)!.textContent).toBe("Suggested: “bold”.");
    expect(document.getElementById(ids[1]!)!.hidden).toBe(true);
    expect(document.getElementById(ids[0]!)!.textContent).toBe("Be kind");
  });

  it("draws a tone's own line, and an unknown tone as primary", async () => {
    const { host } = await render(rich({ defaultValue: "one two three", highlights: [{ start: 0, end: 3, label: "a", tone: "destructive" }, { start: 4, end: 7, label: "b", tone: "warning" }, { start: 8, end: 13, label: "c", tone: "nope" as "primary" }] }));
    await expect.poll(() => boxes(host).length).toBe(3);
    expect(boxes(host).map((box) => box.dataset.ouroHighlight)).toEqual(["destructive", "warning", "primary"]);
    expect(getComputedStyle(boxes(host)[0]!).borderBottomStyle).toBe("dashed");
    expect(getComputedStyle(boxes(host)[2]!).borderBottomStyle).toBe("dotted");
  });

  it("draws nothing, and describes nothing, with no marks or marks that cover nothing", async () => {
    const { host, editor, rerender } = await render(rich({ defaultValue: "Hello" }));
    expect(layer(host)).toBeNull();
    expect(editor.getAttribute("aria-describedby")).toBeNull();
    await rerender(rich({ defaultValue: "Hello", highlights: [{ start: 3, end: 3, label: "x" }, { start: 40, end: 50, label: "y" }] }));
    expect(layer(host)).toBeNull();
    expect(editor.getAttribute("aria-describedby")).toBeNull();
  });

  it("follows the marks the app gives, and takes them away", async () => {
    const { host, rerender } = await render(rich({ defaultValue: "Hello world", highlights: [{ start: 0, end: 5, label: "a" }] }));
    await expect.poll(() => boxes(host).length).toBe(1);
    const first = boxes(host)[0]!.getBoundingClientRect().left;
    await rerender(rich({ defaultValue: "Hello world", highlights: [{ start: 6, end: 11, label: "a" }] }));
    await expect.poll(() => boxes(host)[0]!.getBoundingClientRect().left).toBeGreaterThan(first + 10);
    await rerender(rich({ defaultValue: "Hello world", highlights: [] }));
    await expect.poll(() => layer(host)).toBeNull();
  });

  it("moves the marks with the text the person types, tells the app, and leaves what is typed unmarked", async () => {
    const changes = vi.fn();
    const { host, editor } = await render(rich({ defaultValue: "Hello world", highlights: [{ start: 6, end: 11, label: "a" }], onHighlightsChange: changes }));
    await expect.poll(() => boxes(host).length).toBe(1);
    const before = boxes(host)[0]!.getBoundingClientRect().left;
    editor.focus();
    await act(async () => (editor as unknown as { setSelectionRange: (a: number, b: number) => void }).setSelectionRange(0, 0));
    await userEvent.keyboard("ab");
    await expect.poll(() => editor.textContent).toBe("abHello world");
    await expect.poll(() => changes.mock.calls.at(-1)?.[0]).toEqual([{ start: 8, end: 13, label: "a" }]);
    await expect.poll(() => boxes(host)[0]!.getBoundingClientRect().left).toBeGreaterThan(before + 5);
    expect(boxes(host)).toHaveLength(1);
    expect(changes).toHaveBeenCalledTimes(2);
  });

  it("does not tell the app of marks an edit left where they were", async () => {
    const changes = vi.fn();
    const { host, editor } = await render(rich({ defaultValue: "Hello world", highlights: [{ start: 0, end: 5, label: "a" }], onHighlightsChange: changes }));
    await expect.poll(() => boxes(host).length).toBe(1);
    editor.focus();
    await userEvent.keyboard("{Control>}{End}{/Control}!");
    await expect.poll(() => editor.textContent).toBe("Hello world!");
    expect(changes).not.toHaveBeenCalled();
  });

  it("moves the marks when the app changes the value, and drops one whose text is gone", async () => {
    const changes = vi.fn();
    const props = { highlights: [{ start: 6, end: 11, label: "a" }], onHighlightsChange: changes };
    const { rerender, host } = await render(rich({ value: "Hello world", ...props }));
    await rerender(rich({ value: ">> Hello world", ...props }));
    await expect.poll(() => changes.mock.calls.at(-1)?.[0]).toEqual([{ start: 9, end: 14, label: "a" }]);
    await rerender(rich({ value: ">> Hello", ...props }));
    await expect.poll(() => changes.mock.calls.at(-1)?.[0]).toEqual([]);
    await expect.poll(() => layer(host)).toBeNull();
  });

  it("draws the marks again when the box is resized, and as its text scrolls", async () => {
    const lines = Array.from({ length: 12 }, (_, index) => `line ${index}`).join("\n\n");
    const { host, editor } = await render(rich({ defaultValue: lines, maxRows: 3, highlights: [{ start: 0, end: 6, label: "a" }] }));
    await expect.poll(() => boxes(host).length).toBe(1);
    const top = boxes(host)[0]!.getBoundingClientRect().top;
    editor.scrollTop = 40;
    await expect.poll(() => boxes(host)[0]!.getBoundingClientRect().top).toBeLessThan(top - 20);
    const wide = await render(rich({ defaultValue: "aaaa bbbb cccc dddd eeee ffff gggg hhhh iiii jjjj kkkk llll mmmm nnnn oooo pppp qqqq rrrr", highlights: [{ start: 80, end: 84, label: "a" }] }));
    await expect.poll(() => boxes(wide.host).length).toBe(1);
    const lower = boxes(wide.host)[0]!.getBoundingClientRect().top;
    wide.host.style.width = "900px";
    await expect.poll(() => boxes(wide.host)[0]!.getBoundingClientRect().top).toBeLessThan(lower);
    expect(host).toBeTruthy();
  });

  it("stops measuring once the marks are taken away", async () => {
    const { host, editor, rerender } = await render(rich({ defaultValue: "Hello world", highlights: [{ start: 6, end: 11, label: "a" }] }));
    await expect.poll(() => boxes(host).length).toBe(1);
    await rerender(rich({ defaultValue: "Hello world", highlights: [] }));
    await expect.poll(() => layer(host)).toBeNull();
    const measured = vi.spyOn(Range.prototype, "getClientRects");
    await act(async () => void editor.dispatchEvent(new Event("scroll")));
    host.style.width = "300px";
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await act(async () => void editor.focus());
    await userEvent.keyboard("!");
    await expect.poll(() => editor.textContent).toBe("Hello world!");
    expect(measured).not.toHaveBeenCalled();
  });

  it("draws one box for each different rectangle a run covers, and none for a rectangle seen again or with no width", async () => {
    const rect = (left: number, top: number, width: number) => new DOMRect(left, top, width, 10);
    vi.spyOn(Range.prototype, "getClientRects").mockReturnValue([rect(10, 10, 20), rect(10, 10, 20), rect(10, 30, 20), rect(50, 10, 0)] as unknown as DOMRectList);
    const { host } = await render(rich({ defaultValue: "Hello world", highlights: [{ start: 0, end: 5, label: "a" }] }));
    await expect.poll(() => boxes(host).length).toBe(2);
  });

  it("draws no layer for marks that measure to no rectangle", async () => {
    vi.spyOn(Range.prototype, "getClientRects").mockReturnValue([] as unknown as DOMRectList);
    const { host } = await render(rich({ defaultValue: "Hello world", highlights: [{ start: 0, end: 5, label: "a" }] }));
    await act(async () => void (await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))));
    expect(layer(host)).toBeNull();
  });

  it("moves the marks and tells the app on every edit, with the callback it gave last, and with none given", async () => {
    const first = vi.fn();
    const last = vi.fn();
    const marks = [{ start: 6, end: 11, label: "a" }];
    const { editor, rerender } = await render(rich({ defaultValue: "Hello world", highlights: marks, onHighlightsChange: first }));
    await rerender(rich({ defaultValue: "Hello world", highlights: marks, onHighlightsChange: last }));
    editor.focus();
    await act(async () => (editor as unknown as { setSelectionRange: (a: number, b: number) => void }).setSelectionRange(0, 0));
    await userEvent.keyboard("a");
    await expect.poll(() => last.mock.calls.at(-1)?.[0]).toEqual([{ start: 7, end: 12, label: "a" }]);
    await userEvent.keyboard("b");
    await expect.poll(() => last.mock.calls.at(-1)?.[0]).toEqual([{ start: 8, end: 13, label: "a" }]);
    expect(first).not.toHaveBeenCalled();
    await rerender(rich({ defaultValue: "Hello world", highlights: marks }));
    await userEvent.keyboard("c");
    await expect.poll(() => editor.textContent).toBe("abcHello world");
  });

  it("measures the marks again when the box scrolls", async () => {
    const { host, editor } = await render(rich({ defaultValue: "Hello world", highlights: [{ start: 6, end: 11, label: "a" }] }));
    await expect.poll(() => boxes(host).length).toBe(1);
    const measured = vi.spyOn(Range.prototype, "getClientRects");
    await act(async () => void editor.dispatchEvent(new Event("scroll")));
    expect(measured).toHaveBeenCalled();
  });

  it("marks over an emoji's picture and a list", async () => {
    const { host } = await render(rich({ defaultValue: "- one\n- two", highlights: [{ start: 8, end: 11, label: "a" }] }));
    await expect.poll(() => boxes(host).length).toBe(1);
    const item = host.querySelectorAll("li")[1]!.getBoundingClientRect();
    const box = boxes(host)[0]!.getBoundingClientRect();
    expect(box.top).toBeGreaterThan(item.top - 2);
    expect(box.bottom).toBeLessThan(item.bottom + 2);
  });

  it("marks a draft an agent sets from outside the editor, ending in a list's inline code, without throwing", async () => {
    const draft = "Thanks! **Rerun** the build after the [lint fixes](https://example.com/builds/4521/lint) land:\n\n- fix the two warnings\n- then `npm test`";
    function Agent() {
      const [value, setValue] = useState("");
      return (
        <>
          <Composer label="Message Mia" format="rich" offsets="markdown" value={value} onValueChange={setValue} highlights={value ? [{ start: 0, end: value.length, label: "Agent" }] : []} onSend={() => {}} />
          <button type="button" onClick={() => setValue(draft)}>
            Agent sets draft
          </button>
        </>
      );
    }
    const { host } = await render(<Agent />);
    await act(async () => void [...host.querySelectorAll("button")].at(-1)!.click());
    await expect.poll(() => boxes(host).length).toBeGreaterThan(0);
    expect(host.querySelector("code")!.textContent).toBe("npm test");
  });

  it("marks a draft an agent sets from outside the editor, ending in bold-and-code (a second wrapper level), without throwing", async () => {
    const draft = "Thanks! **Rerun** the build after the [lint fixes](https://example.com/builds/4521/lint) land:\n\n- fix the two warnings\n- then run **`npm test`**";
    function Agent() {
      const [value, setValue] = useState("");
      return (
        <>
          <Composer label="Message Mia" format="rich" offsets="markdown" value={value} onValueChange={setValue} highlights={value ? [{ start: 0, end: value.length, label: "Agent" }] : []} onSend={() => {}} />
          <button type="button" onClick={() => setValue(draft)}>
            Agent sets draft
          </button>
        </>
      );
    }
    const { host } = await render(<Agent />);
    await act(async () => void [...host.querySelectorAll("button")].at(-1)!.click());
    await expect.poll(() => boxes(host).length).toBeGreaterThan(0);
    const code = host.querySelector("code")!;
    expect(code.textContent).toBe("npm test");
    expect(code.querySelector("strong")!.textContent).toBe("npm test");
  });

  it("marks a draft an agent sets from outside the editor, ending in a link around bold-and-code (three nested elements), without throwing", async () => {
    const draft = "Thanks! **Rerun** the build after the [lint fixes](https://example.com/builds/4521/lint) land:\n\n- fix the two warnings\n- then run [**`npm test`**](https://example.com/builds/4521/log)";
    function Agent() {
      const [value, setValue] = useState("");
      return (
        <>
          <Composer label="Message Mia" format="rich" offsets="markdown" value={value} onValueChange={setValue} highlights={value ? [{ start: 0, end: value.length, label: "Agent" }] : []} onSend={() => {}} />
          <button type="button" onClick={() => setValue(draft)}>
            Agent sets draft
          </button>
        </>
      );
    }
    const { host } = await render(<Agent />);
    await act(async () => void [...host.querySelectorAll("button")].at(-1)!.click());
    await expect.poll(() => boxes(host).length).toBeGreaterThan(0);
    const code = host.querySelector("code")!;
    expect(code.textContent).toBe("npm test");
    expect(code.closest("a")).not.toBeNull();
  });
});

describe("Composer rich mode Escape", () => {
  it("keeps focus in the editor when Escape closes nothing", async () => {
    const { editor } = await render(rich({ defaultValue: "hi" }));
    await act(async () => editor.focus());
    expect(document.activeElement).toBe(editor);
    await userEvent.keyboard("{Escape}");
    expect(document.activeElement).toBe(editor);
  });
});

describe("Composer rich mode pasteText", () => {
  const paste = (editor: HTMLElement, text: string, html = "") => {
    const data = new DataTransfer();
    data.setData("text/plain", text);
    if (html) data.setData("text/html", html);
    const event = new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: data });
    return act(async () => void editor.dispatchEvent(event)).then(() => event);
  };

  it("takes the Markdown the app returns in place of the clipboard's HTML, and puts it in as formatted text", async () => {
    const seen: string[] = [];
    const given = vi.fn((data: DataTransfer) => `**${data.getData("text/plain")}**`);
    const { editor } = await render(rich({ pasteText: given, onValueChange: (value) => void seen.push(value) }));
    editor.focus();
    const event = await paste(editor, "bold", "<i>bold</i><script>x</script>");
    await expect.poll(() => seen.at(-1)).toBe("**bold**");
    expect(editor.querySelector("strong")!.textContent).toBe("bold");
    expect(editor.querySelector("em")).toBeNull();
    expect(event.defaultPrevented).toBe(true);
    expect(given).toHaveBeenCalledTimes(1);
  });

  it("inserts the Markdown at the caret, among the text", async () => {
    const { editor } = await render(rich({ defaultValue: "ab", pasteText: (data) => data.getData("text/plain") }));
    editor.focus();
    await act(async () => (editor as unknown as { setSelectionRange: (a: number, b: number) => void }).setSelectionRange(1, 1));
    await paste(editor, " **x** ");
    await expect.poll(() => editor.textContent).toBe("a x b");
    expect(editor.querySelector("strong")!.textContent).toBe("x");
  });

  it("replaces the selected text with the Markdown, and leaves the caret after it", async () => {
    const { editor } = await render(rich({ defaultValue: "one two three", pasteText: () => "**2**" }));
    editor.focus();
    const field = editor as unknown as { setSelectionRange: (a: number, b: number) => void; selectionStart: number };
    await act(async () => field.setSelectionRange(4, 7));
    await paste(editor, "x");
    await expect.poll(() => editor.textContent).toBe("one 2 three");
    expect(field.selectionStart).toBe(5);
  });

  it("puts Markdown that holds blocks in as those blocks", async () => {
    const { editor } = await render(rich({ pasteText: (data) => data.getData("text/plain") }));
    editor.focus();
    await paste(editor, "- one\n- two");
    await expect.poll(() => editor.querySelectorAll("li").length).toBe(2);
  });

  it("leaves a paste to the allowlist when the app returns undefined", async () => {
    const { editor } = await render(rich({ pasteText: () => undefined }));
    editor.focus();
    await paste(editor, "plain", "<b>plain</b><script>x</script>");
    await expect.poll(() => editor.querySelector("strong")?.textContent).toBe("plain");
    expect(editor.querySelector("script")).toBeNull();
  });

  it("still sends a paste through the allowlist with no pasteText, and uses the callback of the last render", async () => {
    const first = vi.fn(() => "first");
    const second = vi.fn(() => "second");
    const { editor, rerender } = await render(rich({ pasteText: first }));
    await rerender(rich({ pasteText: second }));
    editor.focus();
    await paste(editor, "x");
    await expect.poll(() => editor.textContent).toBe("second");
    expect(first).not.toHaveBeenCalled();
  });

  it("draws the catalogue's emoji in the Markdown the app returns", async () => {
    const party: EmojiItem = { id: "party", name: "Party popper", shortcodes: ["party"], text: "🎉", src: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1'/%3E" };
    const catalogue: EmojiCatalogue = { categories: [{ id: "people", label: "People", items: [party] }] };
    const { editor } = await render(rich({ catalogue, pasteText: () => "hi :party:" }));
    editor.focus();
    await paste(editor, "x");
    await expect.poll(() => editor.querySelectorAll("img:not([alt=''])").length).toBe(1);
  });

  it("carries the app's own id and data-/aria- attributes to the editor, as the plain box already does", async () => {
    const { editor } = await render(rich({ id: "mia-composer", "data-testid": "mia-composer", "aria-required": true } as Partial<React.ComponentProps<typeof Composer>>));
    expect(editor.id).toBe("mia-composer");
    expect(editor.getAttribute("data-testid")).toBe("mia-composer");
    expect(editor.getAttribute("aria-required")).toBe("true");
  });

  it("leaves off an attribute that is neither id nor data-/aria-, since it isn't a pass-through one", async () => {
    const { editor } = await render(rich({ title: "not forwarded" } as Partial<React.ComponentProps<typeof Composer>>));
    expect(editor.hasAttribute("title")).toBe(false);
  });
});

