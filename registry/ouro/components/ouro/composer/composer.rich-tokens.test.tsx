import { useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { Autocomplete } from "@/registry/ouro/components/ouro/autocomplete/autocomplete";
import type { AutocompleteItem, AutocompleteTrigger } from "@/registry/ouro/components/ouro/autocomplete/autocomplete";
import { Composer } from "@/registry/ouro/components/ouro/composer/composer";
import { Attachment } from "@/registry/ouro/components/ouro/message/attachment";
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
  return { host, get editor() { return find()!; } };
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

describe("Composer rich mentions and emoji", () => {
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

describe("Composer rich element reads", () => {
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
