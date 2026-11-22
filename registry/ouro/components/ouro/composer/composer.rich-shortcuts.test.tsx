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

describe("Composer rich shortcuts", () => {
  it("turns '- ' into a list, and writes it back out as Markdown", async () => {
    const seen: string[] = [];
    const editor = await render(rich({ onValueChange: (value: string) => seen.push(value) }));
    editor.focus();
    await userEvent.keyboard("- one");
    await expect.poll(() => editor.querySelector("ul > li")?.textContent).toBe("one");
    await expect.poll(() => seen.at(-1)).toBe("- one");
  });

  it("turns a numbered start into an ordered list", async () => {
    const editor = await render(rich());
    editor.focus();
    await userEvent.keyboard("1. first");
    await expect.poll(() => editor.querySelector("ol > li")?.textContent).toBe("first");
  });

  it("turns '> ' into a quote", async () => {
    const editor = await render(rich());
    editor.focus();
    await userEvent.keyboard("> said");
    await expect.poll(() => editor.querySelector("blockquote")?.textContent).toBe("said");
  });

  it("turns a fence and a space into a code block", async () => {
    const editor = await render(rich());
    editor.focus();
    await userEvent.keyboard("``` x");
    await expect.poll(() => editor.querySelector("code")).not.toBeNull();
  });

  it("turns **bold** and _italic_ typed out into formatting", async () => {
    const editor = await render(rich());
    editor.focus();
    await userEvent.keyboard("**bold** and _it_ ");
    await expect.poll(() => editor.querySelector("strong")?.textContent).toBe("bold");
    await expect.poll(() => editor.querySelector("em")?.textContent).toBe("it");
  });

  it("leaves a dash alone mid-line", async () => {
    const editor = await render(rich());
    editor.focus();
    await userEvent.keyboard("a - b");
    await expect.poll(() => editor.textContent).toBe("a - b");
    expect(editor.querySelector("ul")).toBeNull();
  });
});
