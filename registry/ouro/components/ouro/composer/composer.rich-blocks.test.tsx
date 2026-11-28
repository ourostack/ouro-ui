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
const shiftEnter = "{Shift>}{Enter}{/Shift}";

describe("Composer rich blocks", () => {
  it("draws bullets and numbers with an inset under the app's CSS reset", async () => {
    const editor = await render(rich({ defaultValue: "- flour\n- water\n\n1. Mix\n2. Rest" }));
    const bullets = getComputedStyle(editor.querySelector("ul")!);
    const numbers = getComputedStyle(editor.querySelector("ol")!);
    expect(bullets.listStyleType).toBe("disc");
    expect(numbers.listStyleType).toBe("decimal");
    expect(parseFloat(bullets.paddingInlineStart)).toBeGreaterThan(0);
    expect(parseFloat(numbers.paddingInlineStart)).toBeGreaterThan(0);
  });

  it("shows lists, quotes and code blocks as blocks, and writes them back out as the same Markdown", async () => {
    const seen: string[] = [];
    const markdown = "- one\n- two\n\n1. first\n2. second\n\n> quoted\n\n```\ncode\n```";
    const editor = await render(rich({ defaultValue: markdown, onValueChange: (value) => void seen.push(value) }));
    expect(editor.querySelectorAll("ul > li")).toHaveLength(2);
    expect(editor.querySelectorAll("ol > li")).toHaveLength(2);
    expect(editor.querySelector("blockquote")?.textContent).toBe("quoted");
    expect(editor.querySelector("code")?.textContent).toBe("code");
    editor.focus();
    await userEvent.keyboard("!");
    await expect.poll(() => seen.at(-1)).toBe(markdown.replace("code\n```", "code!\n```"));
  });

  it("starts the next item on Shift+Enter in a list, and leaves the list on Shift+Enter in an empty item", async () => {
    const seen: string[] = [];
    const editor = await render(rich({ defaultValue: "- one", onValueChange: (value) => void seen.push(value) }));
    editor.focus();
    await userEvent.keyboard(`${shiftEnter}two`);
    await expect.poll(() => seen.at(-1)).toBe("- one\n- two");
    await userEvent.keyboard(`${shiftEnter}${shiftEnter}after`);
    await expect.poll(() => seen.at(-1)).toBe("- one\n- two\n\nafter");
  });

  it("sends from a list on Enter, and continues the list on Enter when Ctrl+Enter sends", async () => {
    const onSend = vi.fn();
    const editor = await render(rich({ defaultValue: "- one", onSend }));
    editor.focus();
    await userEvent.keyboard("{Enter}");
    await expect.poll(() => onSend.mock.calls.length).toBe(1);
    expect(onSend.mock.calls[0]![0]).toBe("- one");

    const seen: string[] = [];
    const modEditor = await render(rich({ sendOn: "mod-enter", defaultValue: "1. one", onValueChange: (value) => void seen.push(value) }));
    modEditor.focus();
    await userEvent.keyboard("{Enter}two");
    await expect.poll(() => seen.at(-1)).toBe("1. one\n2. two");
  });

  it.each([
    ["expanded", { expanded: true }],
    ['sendOn="mod-enter"', { sendOn: "mod-enter" as const }],
  ])("makes Shift+Enter a line break inside a list item where Enter does not send (%s)", async (_name, props) => {
    const seen: string[] = [];
    const editor = await render(rich({ ...props, defaultValue: "- one", onValueChange: (value) => void seen.push(value) }));
    editor.focus();
    await userEvent.keyboard(`${shiftEnter}two`);
    await expect.poll(() => seen.at(-1)).toBe("- one\n  two");
    expect(editor.querySelectorAll("ul > li")).toHaveLength(1);
    expect(editor.querySelectorAll("ul > li > br")).toHaveLength(1);
  });

  it("makes Shift+Enter a line break in a paragraph where Enter does not send", async () => {
    const seen: string[] = [];
    const editor = await render(rich({ expanded: true, defaultValue: "one", onValueChange: (value) => void seen.push(value) }));
    editor.focus();
    await userEvent.keyboard(`${shiftEnter}two`);
    await expect.poll(() => seen.at(-1)).toBe("one\ntwo");
    expect(editor.querySelectorAll("p")).toHaveLength(1);
  });

  it("writes a line break in a list item as its indented next line, and reads that back as one item", async () => {
    const seen: string[] = [];
    const editor = await render(rich({ expanded: true, defaultValue: "- a\n  b\n- c\n\n1. x\n   y", onValueChange: (value) => void seen.push(value) }));
    expect(editor.querySelectorAll("ul > li")).toHaveLength(2);
    expect(editor.querySelectorAll("ol > li")).toHaveLength(1);
    expect(editor.querySelectorAll("li > br")).toHaveLength(2);
    expect(editor.querySelector("ul > li")?.textContent).toBe("ab");
    editor.focus();
    await userEvent.keyboard("!");
    await expect.poll(() => seen.at(-1)).toBe("- a\n  b\n- c\n\n1. x\n   y!");
  });

  it("indents a nested item's next line four spaces a level, and keeps a paragraph after a list apart from it", async () => {
    const seen: string[] = [];
    const nested = await render(rich({ expanded: true, defaultValue: "- a\n    - b\n      c", onValueChange: (value) => void seen.push(value) }));
    expect(nested.querySelectorAll("li > br")).toHaveLength(1);
    nested.focus();
    await userEvent.keyboard("!");
    await expect.poll(() => seen.at(-1)).toBe("- a\n    - b\n      c!");
  });

  it("reads a line of words straight after a list as its own paragraph, and writes it after a blank line", async () => {
    const seen: string[] = [];
    const editor = await render(rich({ defaultValue: "- a\n\nb c", onValueChange: (value) => void seen.push(value) }));
    expect(editor.querySelectorAll("li > br")).toHaveLength(0);
    editor.focus();
    await userEvent.keyboard("!");
    await expect.poll(() => seen.at(-1)).toBe("- a\n\nb c!");
    const joined = await render(rich({ defaultValue: "- a\nb c" }));
    expect(joined.querySelectorAll("li > br")).toHaveLength(0);
    expect(joined.querySelectorAll("li")).toHaveLength(1);
  });

  it("keeps an indented line after a line break in a paragraph in that paragraph", async () => {
    const seen: string[] = [];
    const editor = await render(rich({ expanded: true, defaultValue: "one", onValueChange: (value) => void seen.push(value) }));
    editor.focus();
    await userEvent.keyboard(`${shiftEnter}  two`);
    await expect.poll(() => seen.at(-1)).toBe("one\n  two");
  });

  it("keeps a blank line between a list item and a line after it as a paragraph", async () => {
    const editor = await render(rich({ defaultValue: "- a\n\n  b" }));
    expect(editor.querySelectorAll("ul > li > br")).toHaveLength(0);
    expect([...editor.querySelectorAll("p")].map((p) => p.textContent?.trim())).toContain("b");
  });

  it("takes a list item back to a plain line on Backspace at its start", async () => {
    const seen: string[] = [];
    const editor = await render(rich({ defaultValue: "- one", onValueChange: (value) => void seen.push(value) }));
    editor.focus();
    await userEvent.keyboard(`${"{ArrowLeft}".repeat(10)}{Backspace}`);
    await expect.poll(() => seen.at(-1)).toBe("one");
    expect(editor.querySelector("ul")).toBeNull();
  });

  it("takes a quote back to a plain line on Backspace at its start", async () => {
    const seen: string[] = [];
    const editor = await render(rich({ defaultValue: "> quoted", onValueChange: (value) => void seen.push(value) }));
    editor.focus();
    await userEvent.keyboard(`${"{ArrowLeft}".repeat(10)}{Backspace}`);
    await expect.poll(() => seen.at(-1)).toBe("quoted");
    expect(editor.querySelector("blockquote")).toBeNull();
  });

  it("keeps a quote's lines on Shift+Enter, and leaves the quote from an empty last line", async () => {
    const seen: string[] = [];
    const editor = await render(rich({ defaultValue: "> quoted", onValueChange: (value) => void seen.push(value) }));
    editor.focus();
    await userEvent.keyboard(`${shiftEnter}more`);
    await expect.poll(() => seen.at(-1)).toBe("> quoted\n> more");
    await userEvent.keyboard(`${shiftEnter}${shiftEnter}after`);
    await expect.poll(() => seen.at(-1)).toBe("> quoted\n> more\n\nafter");
    expect(editor.querySelector("p")?.innerHTML).not.toContain("<br");
  });

  it("leaves the quote only from a caret on its empty last line, not from one before it or a selection over it", async () => {
    const editor = await render(rich({ defaultValue: "> ab" }));
    editor.focus();
    await userEvent.keyboard(shiftEnter);
    const quote = editor.querySelector("blockquote")!;
    const press = async (anchor: [Node, number], focus: [Node, number]) => {
      const lines = quote.querySelectorAll("br").length;
      window.getSelection()!.setBaseAndExtent(...anchor, ...focus);
      await act(async () => document.dispatchEvent(new Event("selectionchange")));
      await userEvent.keyboard(shiftEnter);
      expect(editor.querySelector("p")).toBeNull();
      expect(quote.querySelectorAll("br").length).toBeGreaterThan(lines);
    };
    const text = () => quote.querySelector("span")!.firstChild!;
    await press([text(), 2], [text(), 2]);
    await press([quote, 1], [quote, 1]);
  });

  it("keeps a quote when a selection ends on its empty last line", async () => {
    const editor = await render(rich({ defaultValue: "> ab" }));
    editor.focus();
    await userEvent.keyboard(`${shiftEnter}{Shift>}{ArrowLeft}{/Shift}${shiftEnter}`);
    expect(editor.querySelector("p")).toBeNull();
  });

  it("keeps the text when a caret on the quote itself is not after a line break", async () => {
    const editor = await render(rich({ defaultValue: "> ab" }));
    editor.focus();
    const quote = editor.querySelector("blockquote")!;
    window.getSelection()!.setBaseAndExtent(quote, 1, quote, 1);
    await act(async () => document.dispatchEvent(new Event("selectionchange")));
    await userEvent.keyboard(shiftEnter);
    expect(editor.querySelector("p")).toBeNull();
    expect(quote.textContent).toBe("ab");
  });

  it.each([
    ["keeps a blank line between a line and a list that follows it", "para\n\n- item"],
    ["keeps a nested list in its list", "- a\n    - b"],
    ["numbers a list past nine as a list", `${Array.from({ length: 10 }, (_, i) => `${i + 1}. n${i + 1}`).join("\n")}\n\nafter`],
    ["does not take a line with a dash inside it for a list item", "x\na- b"],
    ["does not take a line that starts with a word and a period for a list item", "Note. call back\nsoon"],
    ["keeps a blank line around a fence with a language", "para\n\n```js\ncode\n```\n\nafter"],
  ])("%s, as Markdown", async (_, markdown) => {
    const seen: string[] = [];
    const editor = await render(rich({ defaultValue: markdown, onValueChange: (value) => void seen.push(value) }));
    editor.focus();
    await userEvent.keyboard("!");
    await expect.poll(() => seen.at(-1)).toBe(`${markdown}!`);
  });

  it("starts a new line of code on Shift+Enter in a code block, and leaves the block from a second empty line", async () => {
    const seen: string[] = [];
    const editor = await render(rich({ defaultValue: "```\none\n```", onValueChange: (value) => void seen.push(value) }));
    editor.focus();
    await userEvent.keyboard(`${shiftEnter}two`);
    await expect.poll(() => seen.at(-1)).toBe("```\none\ntwo\n```");
    await userEvent.keyboard(`${shiftEnter}${shiftEnter}${shiftEnter}after`);
    await expect.poll(() => seen.at(-1)).toBe("```\none\ntwo\n```\n\nafter");
  });
});
