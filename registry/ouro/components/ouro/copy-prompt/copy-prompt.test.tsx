import { type ReactNode } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { CopyPrompt, type CopyPromptProps } from "@/registry/ouro/components/ouro/copy-prompt/copy-prompt";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

const roots: Root[] = [];
let mounted: Element[] = [];
let clipboard: string[] = [];

/** Puts a Clipboard API in place that records what it is given. */
function stubClipboard() {
  const value = {
    writeText: (text: string) => {
      clipboard.push(text);
      return Promise.resolve();
    },
  };
  Object.defineProperty(navigator, "clipboard", { configurable: true, get: () => value });
}

async function render(node: ReactNode) {
  const host = document.createElement("div");
  host.style.width = "360px";
  document.body.append(host);
  mounted.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
  return {
    host,
    get prompt() {
      return host.querySelector<HTMLElement>('[data-ouro="copy-prompt"]')!;
    },
    get text() {
      return host.querySelector<HTMLElement>("[data-ouro-copy-prompt-text]")!;
    },
  };
}

const text = "Suggest a layout for my mornings: customer chats first, then my calendar.";

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  clipboard = [];
  stubClipboard();
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(async () => {
  vi.restoreAllMocks();
  delete (navigator as { clipboard?: unknown }).clipboard;
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  for (const node of mounted) node.remove();
  mounted = [];
});

describe("CopyPrompt", () => {
  it("names the button by its label and describes it with the prompt", async () => {
    await render(<CopyPrompt text={text} />);
    await expect.element(page.getByRole("button", { name: "Copy" })).toHaveAccessibleDescription(text);
    await render(<CopyPrompt text="Summarize my week." label="Copy prompt" />);
    await expect.element(page.getByRole("button", { name: "Copy prompt" })).toHaveAccessibleDescription("Summarize my week.");
  });

  it("copies the prompt, says Copied and calls onCopy", async () => {
    // The confirmation lasts two seconds on the page's clock, which stands still here, so a slow
    // runner cannot end it before the read (CopyButton's own tests do the same).
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const onCopy = vi.fn();
      const { host } = await render(<CopyPrompt text={text} onCopy={onCopy} copiedLabel="Copié" />);
      const button = host.querySelector("button")!;
      await userEvent.click(button);
      const deadline = performance.now() + 5000;
      while (button.textContent !== "Copié" && performance.now() < deadline) await new Promise((resolve) => requestAnimationFrame(resolve));
      expect(button.textContent).toBe("Copié");
      expect(clipboard).toEqual([text]);
      expect(onCopy).toHaveBeenCalledWith(text);
    } finally {
      vi.useRealTimers();
    }
  });

  it("wraps the prompt in the page's type and keeps its line breaks", async () => {
    const { text: shown, host } = await render(<CopyPrompt text={`First line\nSecond line ${"word ".repeat(30)}`} />);
    expect(getComputedStyle(shown).whiteSpace).toBe("pre-wrap");
    expect(getComputedStyle(shown).fontFamily).toBe(getComputedStyle(document.body).fontFamily);
    expect(shown.getBoundingClientRect().right).toBeLessThanOrEqual(host.getBoundingClientRect().right);
    expect(shown.getClientRects().length).toBe(1);
    expect(shown.getBoundingClientRect().height).toBeGreaterThan(Number.parseFloat(getComputedStyle(shown).lineHeight) * 2);
  });

  it("renders in server HTML and hydrates without a warning", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const node = <CopyPrompt text={text} />;
    const html = renderToString(node);
    expect(html).toContain(text);
    const host = document.createElement("div");
    host.innerHTML = html;
    document.body.append(host);
    mounted.push(host);
    const recoverable = vi.fn();
    let root!: Root;
    await act(async () => {
      root = hydrateRoot(host, node, { onRecoverableError: recoverable });
    });
    roots.push(root);
    expect(recoverable).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it("forwards a ref and lets app layout classes win", async () => {
    let element: HTMLDivElement | null = null;
    const { prompt } = await render(<CopyPrompt text={text} className="mt-4" id="prompt" ref={(node) => void (element = node)} />);
    expect(element).toBe(prompt);
    expect(prompt.id).toBe("prompt");
    expect(getComputedStyle(prompt).marginTop).toBe("16px");
  });
});

describe("CopyPrompt development messages", () => {
  it("warns of nothing when the props are right", async () => {
    await render(<CopyPrompt text={text} />);
    expect(warn).not.toHaveBeenCalled();
  });

  it("copies nothing made up when the text is missing", async () => {
    const props = {} as unknown as CopyPromptProps;
    await render(<CopyPrompt {...props} />);
    await userEvent.click(page.getByRole("button"));
    expect(clipboard.every((copied) => copied === "")).toBe(true);
  });

  it.each([
    ["a missing text", { text: undefined }, "text is missing, so there is nothing to copy", '<CopyPrompt text="Suggest a layout for my mornings.">'],
    ["value", { value: text }, "value is not a prop", '<CopyPrompt text="Suggest a layout for my mornings.">'],
    ["prompt", { prompt: text }, "prompt is not a prop", '<CopyPrompt text="Suggest a layout for my mornings.">'],
  ])("names the fix for %s", async (_name, extra, problem, fix) => {
    const props = { text, ...extra } as unknown as CopyPromptProps;
    const { prompt } = await render(<CopyPrompt {...props} />);
    expect(warn).toHaveBeenCalledWith(`[ouro-ui] CopyPrompt: ${problem}. Fix: ${fix}.`);
    expect(prompt.hasAttribute("value")).toBe(false);
  });

  it("checks the className", async () => {
    await render(<CopyPrompt text={text} className="bg-blue-500" />);
    expect(warn).toHaveBeenCalledWith(
      '[ouro-ui] CopyPrompt: "bg-blue-500" sets appearance, and className is for layout only. Fix: remove "bg-blue-500"; CopyPrompt takes its colors from the theme.',
    );
  });
});
