import { createRef, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { Autocomplete } from "@/registry/ouro/components/ouro/autocomplete/autocomplete";
import type { AutocompleteItem, AutocompleteTrigger } from "@/registry/ouro/components/ouro/autocomplete/autocomplete";
import { Composer, type ComposerEditor } from "@/registry/ouro/components/ouro/composer/composer";
import { preloadRichEditor } from "@/registry/ouro/components/ouro/composer/composer-styles";
import { Attachment } from "@/registry/ouro/components/ouro/message/attachment";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

await preloadRichEditor();

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
  return { host, get editor() { return find()!; } };
}

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  for (const node of mounted) node.remove();
  mounted = [];
});

const people: AutocompleteItem[] = [
  { value: "avery", label: "Avery Kim" },
  { value: "jordan", label: "Jordan Lee" },
];
const emoji: AutocompleteItem[] = [
  { value: "tada", label: "Party popper", glyph: "🎉", insert: ":tada:" },
  { value: "taco", label: "Taco", glyph: "🌮", insert: ":taco:" },
];
const filter = (items: AutocompleteItem[]) => (query: string) => items.filter((item) => item.label.toLowerCase().includes(query.toLowerCase()) || item.value.startsWith(query));
const mentions = (onPick?: AutocompleteTrigger["onPick"]): AutocompleteTrigger[] => [
  { char: "@", label: "People", items: filter(people), onPick },
  { char: ":", label: "Emoji", minQueryLength: 2, items: filter(emoji) },
];
const options = () => [...document.querySelectorAll<HTMLElement>('[data-ouro="autocomplete"] [role="option"]')];
const labels = () => options().map((option) => option.querySelector(".truncate")!.textContent);

function Controlled({ onSend, onPick, defaultValue = "" }: { onSend?: (text: string) => void; onPick?: AutocompleteTrigger["onPick"]; defaultValue?: string }) {
  const [text, setText] = useState(defaultValue);
  return (
    <>
      <Autocomplete triggers={mentions(onPick)}>
        <Composer label="Message" format="rich" value={text} onValueChange={setText} onSend={onSend ?? (() => {})} />
      </Autocomplete>
      <output>{text}</output>
    </>
  );
}

describe("Composer rich Markdown insertion", () => {
  it("replaces a selection with Markdown, keeping its neighbours, text offsets, focus and one-step undo", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const handle = createRef<ComposerEditor>();
    const original = "**Ask** today after [lunch](https://example.test/lunch).";
    const { editor } = await render(<Composer label="Reply" format="rich" editorRef={handle} defaultValue={original} onSend={() => {}} />);
    const control = editor as Control;
    control.focus();
    control.setSelectionRange(4, 9);
    await act(async () => handle.current!.insert("@[Noor](noor)", { format: "markdown" }));
    expect(editor.querySelector("[data-ouro-mention]")?.textContent).toBe("Noor");
    expect(editor.querySelector("strong")?.textContent).toBe("Ask");
    expect(editor.querySelector("a")?.getAttribute("href")).toBe("https://example.test/lunch");
    expect(editor.querySelector("a")?.getAttribute("data-ouro-control")).toBe("composer");
    expect(editor.querySelector("a")?.getAttribute("data-ouro-part")).toBe("link");
    expect(document.activeElement).toBe(editor);
    expect(control.selectionStart).toBe(control.value.indexOf(" after"));
    expect(control.selectionEnd).toBe(control.selectionStart);
    expect(control.value).not.toContain("[");
    const mod = /Mac|iPhone|iPad|iPod/.test(navigator.platform) ? "Meta" : "Control";
    await userEvent.keyboard(`{${mod}>}z{/${mod}}`);
    await expect.poll(() => editor.textContent).toBe("Ask today after lunch.");
    expect([control.selectionStart, control.selectionEnd]).toEqual([4, 9]);
    await act(async () => handle.current!.insert("@[Jules](jules)", { format: "text" }));
    expect(editor.querySelector("[data-ouro-mention]")).toBeNull();
    expect(editor.textContent).toBe("Ask @[Jules](jules) after lunch.");
  });

  it.each([false, true])("inserts Markdown at the end before a selection exists, unless read-only (%s)", async (readOnly) => {
    const handle = createRef<ComposerEditor>();
    const { editor } = await render(<Composer label="Reply" format="rich" editorRef={handle} defaultValue="Ask " readOnly={readOnly} onSend={() => {}} />);
    await act(async () => handle.current!.insert("@[Noor](noor)", { format: "markdown" }));
    expect(editor.textContent).toBe(readOnly ? "Ask " : "Ask Noor");
    expect(editor.querySelector("[data-ouro-mention]")?.textContent).toBe(readOnly ? undefined : "Noor");
  });

  it("turns an actual suggestion pick into a pill without sending, leaving no query and keeping Autocomplete's text offsets", async () => {
    const handle = createRef<ComposerEditor>();
    const onSend = vi.fn();
    function Setup() {
      const [text, setText] = useState("Before after");
      return (
        <Autocomplete triggers={[{
          char: "@",
          label: "People",
          items: [{ value: "noor", label: "Noor", insert: "" }],
          onPick: (item) => handle.current!.insert(`@[${item.label}](${item.value}) `, { format: "markdown" }),
        }]}>
          <Composer label="Reply" format="rich" editorRef={handle} value={text} onValueChange={setText} onSend={onSend} />
        </Autocomplete>
      );
    }
    const { editor } = await render(<Setup />);
    const control = editor as Control;
    control.focus();
    control.setSelectionRange(7, 7);
    await userEvent.keyboard("@no");
    await expect.poll(labels).toEqual(["Noor"]);
    await userEvent.keyboard("{Enter}");
    await expect.poll(() => editor.querySelector("[data-ouro-mention]")?.textContent).toBe("Noor");
    expect(editor.textContent).toBe("Before Noor after");
    expect(control.value).not.toContain("[");
    expect(onSend).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(editor);
    await expect.poll(options).toEqual([]);
    await userEvent.keyboard("{Enter}");
    expect(onSend).toHaveBeenCalledWith("Before @[Noor](noor) after", expect.anything());
  });
});

describe("Composer rich mentions and emoji", () => {
  it("draws an imported mention as an inset pill without changing its Markdown", async () => {
    const markdown = "Ask @[Avery Kim](avery) about Friday.";
    const onSend = vi.fn();
    const { editor } = await render(<Composer label="Message" format="rich" defaultValue={markdown} onSend={onSend} />);
    const mention = editor.querySelector<HTMLElement>("[data-ouro-mention]")!;
    const style = getComputedStyle(mention);
    expect(mention.textContent).toBe("Avery Kim");
    expect(style.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
    expect(parseFloat(style.paddingInlineStart)).toBeGreaterThan(0);
    expect(parseFloat(style.borderTopLeftRadius)).toBeGreaterThan(0);
    editor.focus();
    await userEvent.keyboard("{Enter}");
    expect(onSend).toHaveBeenCalledWith(markdown, expect.anything());
  });

  it("imports a link followed by a colon as a link rather than part of an emoji token", async () => {
    const markdown = "Read [the guide](https://example.test/guide): then reply.";
    const onSend = vi.fn();
    const { editor } = await render(<Composer label="Message" format="rich" defaultValue={markdown} onSend={onSend} />);
    const link = editor.querySelector("a");
    expect(link?.textContent).toBe("the guide");
    expect(link?.getAttribute("href")).toBe("https://example.test/guide");
    expect(getComputedStyle(link!).textDecorationLine).toContain("underline");
    expect(editor.textContent).toBe("Read the guide: then reply.");
    editor.focus();
    await userEvent.keyboard("{Enter}");
    expect(onSend).toHaveBeenCalledWith(markdown, expect.anything());
  });

  it("opens the list for a trigger typed in the rich box, and Enter picks in place of the trigger and query without sending", async () => {
    const onSend = vi.fn();
    const onPick = vi.fn();
    const { host, editor } = await render(<Controlled onSend={onSend} onPick={onPick} />);
    editor.focus();
    await userEvent.keyboard("Ask @jor");
    await expect.poll(labels).toEqual(["Jordan Lee"]);
    await userEvent.keyboard("{Enter}");
    await expect.poll(() => host.querySelector("output")!.textContent).toBe("Ask @Jordan Lee ");
    expect(editor.textContent).toBe("Ask @Jordan Lee ");
    expect(onPick).toHaveBeenCalledWith(people[1], "jor");
    expect(onSend).not.toHaveBeenCalled();
    await expect.poll(options).toEqual([]);
    expect(document.activeElement).toBe(editor);
    await userEvent.keyboard("hi");
    expect(editor.textContent).toBe("Ask @Jordan Lee hi");
  });

  it("picks with Tab and a click, and closes with Escape", async () => {
    const { editor } = await render(<Controlled />);
    editor.focus();
    await userEvent.keyboard("@av");
    await expect.poll(labels).toEqual(["Avery Kim"]);
    await userEvent.keyboard("{Escape}");
    await expect.poll(options).toEqual([]);
    await userEvent.keyboard(" @av");
    await expect.poll(labels).toEqual(["Avery Kim"]);
    await userEvent.click(options()[0]!);
    await expect.poll(() => editor.textContent).toBe("@av @Avery Kim ");
  });

  it("puts an emoji's shortcode in as text, and sends it as the Markdown the plain box sends", async () => {
    const onSend = vi.fn();
    const { host, editor } = await render(<Controlled onSend={onSend} />);
    editor.focus();
    await userEvent.keyboard("Party :ta");
    await expect.poll(labels).toEqual(["Party popper", "Taco"]);
    await userEvent.keyboard("{Enter}");
    await expect.poll(() => host.querySelector("output")!.textContent).toBe("Party :tada:");
    await userEvent.keyboard("{Enter}");
    expect(onSend).toHaveBeenCalledWith("Party :tada:", expect.anything());
  });

  it("finds a trigger on the line the caret is on, in a list item and after bold text", async () => {
    const { host, editor } = await render(<Controlled defaultValue={"- one\n- two"} />);
    editor.focus();
    await userEvent.keyboard("{Control>}{End}{/Control}");
    await userEvent.keyboard(" @sa");
    await userEvent.keyboard("{Backspace}{Backspace}{Backspace}{Backspace} **bold** @jo");
    await expect.poll(labels).toEqual(["Jordan Lee"]);
    await userEvent.keyboard("{Enter}");
    await expect.poll(() => host.querySelector("output")!.textContent).toBe("- one\n- two **bold** @Jordan Lee ");
  });

  it("does not pick while an input method is composing, and takes the composed word", async () => {
    const { host, editor } = await render(<Controlled />);
    editor.focus();
    await userEvent.keyboard("@jor");
    await expect.poll(labels).toEqual(["Jordan Lee"]);
    await act(async () => void editor.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true })));
    expect(labels()).toEqual(["Jordan Lee"]);
    await act(async () => void editor.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", keyCode: 229, isComposing: true, bubbles: true, cancelable: true })));
    expect(labels()).toEqual(["Jordan Lee"]);
    expect(host.querySelector("output")!.textContent).toBe("@jor");
  });

  it("reads and sets the caret as a textarea does, over the text without its marks", async () => {
    const { editor } = await render(<Controlled defaultValue={"**ab** c\n- d"} />);
    const control = editor as unknown as HTMLTextAreaElement;
    expect(control.value).toBe("ab c\nd");
    editor.focus();
    control.setSelectionRange(1, 3);
    expect([control.selectionStart, control.selectionEnd]).toEqual([1, 3]);
    control.setSelectionRange(6, 6);
    expect([control.selectionStart, control.selectionEnd]).toEqual([6, 6]);
    await userEvent.keyboard("!");
    expect(control.value).toBe("ab c\nd!");
  });
});

describe("Composer rich mentions after a pick", () => {
  const team: AutocompleteItem[] = [{ value: "lee", label: "Lee Gu" }];
  const triggers: AutocompleteTrigger[] = [{ char: "@", label: "People", allowSpaces: true, items: filter(team) }];
  function Setup({ controlled, onSend }: { controlled: boolean; onSend: (text: string) => void }) {
    const [text, setText] = useState("");
    return (
      <Autocomplete triggers={triggers}>
        {controlled ? <Composer label="Message" format="rich" value={text} onValueChange={setText} onSend={onSend} /> : <Composer label="Message" format="rich" onSend={onSend} />}
      </Autocomplete>
    );
  }
  it.each([
    [true, true],
    [false, true],
    [true, false],
    [false, false],
  ])("keeps the space a pick adds in the value, the list closed, and sends on the next Enter (controlled: %s, insertText command available: %s)", async (controlled, command) => {
    if (!command) vi.spyOn(document, "execCommand").mockReturnValue(false);
    const onSend = vi.fn();
    const { editor } = await render(<Setup controlled={controlled} onSend={onSend} />);
    const control = editor as unknown as HTMLTextAreaElement;
    editor.focus();
    await userEvent.keyboard("KS4 hi @lee");
    await expect.poll(labels).toEqual(["Lee Gu"]);
    await userEvent.keyboard("{Enter}");
    await expect.poll(() => editor.textContent).toContain("@Lee Gu ");
    await new Promise((r) => setTimeout(r, 400));
    expect(options().length).toBe(0);
    expect(control.value.endsWith("@Lee Gu ")).toBe(true);
    await expect.poll(options).toEqual([]);
    await userEvent.keyboard("{Enter}");
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith("KS4 hi @Lee Gu ", expect.anything());
  });
});

describe("Composer rich element reads", () => {
  it("reads its words and caret once for each state, however often an app asks between keys", async () => {
    const { editor } = await render(<Composer label="Message" format="rich" defaultValue="hello" onSend={() => {}} />);
    const control = editor as Control;
    editor.focus();
    const lexical = (editor as unknown as { __lexicalEditor: { read(fn: () => unknown): unknown } }).__lexicalEditor;
    const reads = vi.spyOn(lexical, "read");
    const ask = () => [control.value, control.selectionStart, control.selectionEnd];
    const first = ask();
    const cost = reads.mock.calls.length;
    expect(cost).toBeGreaterThan(0);
    expect(ask()).toEqual(first);
    expect(ask()).toEqual(first);
    expect(reads.mock.calls.length).toBe(cost);
    await userEvent.keyboard("!");
    expect(control.value).toContain("!");
    expect(reads.mock.calls.length).toBeGreaterThan(cost);
  });

  it("defines its textarea reads so a remount can redefine them", async () => {
    const { editor } = await render(<Composer label="Message" format="rich" onSend={() => {}} />);
    for (const name of ["value", "selectionStart", "selectionEnd"]) expect(Object.getOwnPropertyDescriptor(editor, name)?.configurable).toBe(true);
  });

  it("reads the caret from the page's selection when it is in the editor, and from the editor's own when it is elsewhere", async () => {
    const { host, ...mountedEditor } = await render(
      <>
        <Composer label="Message" format="rich" defaultValue="hello world" onSend={() => {}} />
        <p id="outside">elsewhere</p>
      </>,
    );
    const editor = mountedEditor.editor as HTMLElement & { selectionStart: number; selectionEnd: number; setSelectionRange(start: number, end: number): void };
    editor.focus();
    await userEvent.keyboard("{Control>}{End}{/Control}");
    const text = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT).nextNode()!;
    window.getSelection()!.setBaseAndExtent(text, 2, text, 4);
    expect([editor.selectionStart, editor.selectionEnd]).toEqual([2, 4]);
    editor.setSelectionRange(5, 5);
    const outside = host.querySelector("#outside")!.firstChild!;
    window.getSelection()!.setBaseAndExtent(outside, 1, outside, 3);
    expect([editor.selectionStart, editor.selectionEnd]).toEqual([5, 5]);
    window.getSelection()!.removeAllRanges();
    expect([editor.selectionStart, editor.selectionEnd]).toEqual([5, 5]);
  });
});

type Control = HTMLElement & { value: string; selectionStart: number; selectionEnd: number; setSelectionRange(start: number, end: number): void; setRangeText(text: string, start: number, end: number): void };

describe("Composer rich element selection", () => {
  async function broken() {
    const { host, ...mounted } = await render(<Composer label="Message" format="rich" defaultValue={"- ab"} onSend={() => {}} />);
    const control = mounted.editor as Control;
    control.focus();
    await userEvent.keyboard("{Control>}{End}{/Control}");
    const data = new DataTransfer();
    data.setData("text/html", "<p>x<br>cd<br><br>ef</p>");
    await act(async () => void control.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: data })));
    return { host, control };
  }

  it("counts a pasted soft line break as a line, for a caret set by offset and for one the page puts on its item", async () => {
    const { control } = await broken();
    expect(control.value).toBe("abx\ncd\n\nef");
    for (let at = 0; at <= 10; at++) {
      control.setSelectionRange(at, at);
      expect([at, control.selectionStart, control.selectionEnd]).toEqual([at, at, at]);
    }
    const item = control.querySelector("li")!;
    const seen: number[] = [];
    for (let child = 0; child <= item.childNodes.length; child++) {
      window.getSelection()!.setBaseAndExtent(item, child, item, child);
      seen.push(control.selectionStart);
    }
    expect(seen).toEqual([0, 3, 4, 6, 7, 8, 10]);
  });

  async function document_() {
    const { host, ...mountedEditor } = await render(<Composer label="Message" format="rich" defaultValue={"ab **cd** ef\n\n- gh\n- ij"} onSend={() => {}} />);
    const control = mountedEditor.editor as Control;
    control.focus();
    await userEvent.keyboard("{Control>}{End}{/Control}");
    await userEvent.keyboard("{Shift>}{Enter}{/Shift}mn");
    return { host, control };
  }

  it("takes any caret or range set by offset back unchanged, across blocks, list items and a line break", async () => {
    const { control } = await document_();
    const length = control.value.length;
    expect(control.value).toBe("ab cd ef\n\ngh\nij\nmn");
    for (let start = 0; start <= length; start++) {
      control.setSelectionRange(start, start);
      expect([start, control.selectionStart, control.selectionEnd]).toEqual([start, start, start]);
      control.setSelectionRange(start, length);
      expect([start, control.selectionStart, control.selectionEnd]).toEqual([start, start, length]);
    }
    control.setSelectionRange(length + 5, length + 9);
    expect([control.selectionStart, control.selectionEnd]).toEqual([length, length]);
  });

  it("puts text where the offsets say, with a range replaced and the caret after it", async () => {
    const { control } = await document_();
    control.setRangeText("X", 3, 5);
    expect(control.value).toBe("ab X ef\n\ngh\nij\nmn");
    control.setRangeText("YY", 15, 15);
    expect(control.value).toBe("ab X ef\n\ngh\nij\nYYmn");
  });

  it("reads a caret the page puts on an element, as the start or end of its line", async () => {
    const { host, control } = await document_();
    const paragraph = control.querySelector("p")!;
    const items = [...control.querySelectorAll("li")];
    const select = (node: Node, offset: number) => window.getSelection()!.setBaseAndExtent(node, offset, node, offset);
    select(paragraph, 0);
    expect(control.selectionStart).toBe(0);
    select(paragraph, paragraph.childNodes.length);
    expect(control.selectionStart).toBe(8);
    select(items[0]!, 0);
    expect(control.selectionStart).toBe(10);
    select(items[0]!, items[0]!.childNodes.length);
    expect(control.selectionStart).toBe(12);
    select(control, 0);
    expect(control.selectionStart).toBeGreaterThanOrEqual(0);
    expect(host.contains(control)).toBe(true);
  });

  it("reads a link as part of its line, not as a block, beside a nested list", async () => {
    const { host, ...mounted } = await render(<Composer label="Message" format="rich" defaultValue={"[ab](https://x.test) cd\n\n- one [two](https://x.test) end\n  - nest"} onSend={() => {}} />);
    const control = mounted.editor as Control;
    expect(control.querySelector("a")).not.toBeNull();
    control.focus();
    expect(control.value).toBe("ab cd\n\none two end\nnest");
    control.setSelectionRange(3, 3);
    expect([control.selectionStart, control.selectionEnd]).toEqual([3, 3]);
    control.setSelectionRange(11, 14);
    expect([control.selectionStart, control.selectionEnd]).toEqual([11, 14]);
    control.setRangeText("X", 11, 14);
    expect(control.value).toBe("ab cd\n\none X end\nnest");
    void host;
  });

  it("announces a change as an input event that is marked to bubble", async () => {
    const { control } = await document_();
    const seen: Event[] = [];
    window.addEventListener("input", (event) => seen.push(event), true);
    control.setRangeText("Z", 0, 0);
    expect(control.value.startsWith("Z")).toBe(true);
    await expect.poll(() => seen.length).toBeGreaterThan(0);
    expect(seen.every((event) => event instanceof InputEvent && event.type === "input" && event.bubbles)).toBe(true);
  });
});

describe("Composer rich attachments", () => {
  it("shows the attachments around a rich box, and keeps sending the Markdown", async () => {
    const onSend = vi.fn();
    const { host, editor } = await render(
      <Composer label="Message" format="rich" onSend={onSend} attachments={<Attachment name="notes.pdf" />} />,
    );
    expect(host.textContent).toContain("notes.pdf");
    editor.focus();
    await userEvent.keyboard("see **file**{Enter}");
    expect(onSend).toHaveBeenCalledWith("see **file**", expect.anything());
  });
});
