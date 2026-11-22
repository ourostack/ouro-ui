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
