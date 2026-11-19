import { type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { AgentHandoff } from "@/registry/ouro/components/ouro/agent-handoff/agent-handoff";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { watchAnnouncements } from "@/registry/ouro/lib/ouro/testing/announcements";

const roots: Root[] = [];
let mounted: Element[] = [];
let clipboard: string[] = [];

const PROMPT = "Build this app's interface with Ouro UI. Read https://ui.ouroboros.bot/llms.txt first and follow it.";

async function render(node: ReactNode) {
  const host = document.createElement("div");
  document.body.append(host);
  mounted.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
  return {
    host,
    get handoff() {
      return host.querySelector<HTMLElement>('[data-ouro="agent-handoff"]')!;
    },
    part(name: string) {
      return host.querySelector<HTMLElement>(`[data-ouro="agent-handoff"] [data-slot="${name}"]`);
    },
    get copy() {
      return host.querySelector<HTMLButtonElement>('[data-ouro-control="agent-handoff"][data-ouro-part="copy"]')!;
    },
  };
}

/** A theme value, computed on a probe in the page. */
function themed(property: "color" | "backgroundColor" | "borderTopColor" | "fontFamily", value: string) {
  const probe = document.createElement("span");
  if (property === "borderTopColor") probe.style.borderColor = value;
  else probe.style[property] = value;
  document.body.append(probe);
  mounted.push(probe);
  return getComputedStyle(probe)[property];
}

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  clipboard = [];
  Object.defineProperty(navigator, "clipboard", { configurable: true, get: () => ({ writeText: async (text: string) => void clipboard.push(text) }) });
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(async () => {
  vi.restoreAllMocks();
  delete (navigator as { clipboard?: unknown }).clipboard;
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  for (const node of mounted) node.remove();
  mounted = [];
});

const full = <AgentHandoff label="Hand it to your agent" prompt={PROMPT} caption="Paste it into your coding agent's chat." aside={<span data-test-aside="">v1.0.0</span>} />;

describe("AgentHandoff", () => {
  it("shows the label, the line, the caption and the aside, as a group named by its label", async () => {
    const { handoff, part } = await render(<div style={{ width: 560 }}>{full}</div>);
    await expect.element(page.getByRole("group", { name: "Hand it to your agent" })).toBeVisible();
    expect(handoff.getAttribute("role")).toBe("group");
    expect(part("label")!.textContent).toBe("Hand it to your agent");
    expect(part("prompt")!.textContent).toBe(PROMPT);
    expect(part("caption")!.textContent).toBe("Paste it into your coding agent's chat.");
    const aside = part("aside")!;
    expect(aside.querySelector("[data-test-aside]")!.textContent).toBe("v1.0.0");
    // The aside sits at the end of the label's row.
    const label = part("label")!.getBoundingClientRect();
    expect(aside.getBoundingClientRect().top).toBeLessThan(label.bottom);
    expect(aside.getBoundingClientRect().right).toBeCloseTo(handoff.getBoundingClientRect().right, 0);
    // In reading order: label, the line, then the caption.
    expect(part("line")!.getBoundingClientRect().top).toBeGreaterThanOrEqual(label.bottom);
    expect(part("caption")!.getBoundingClientRect().top).toBeGreaterThanOrEqual(part("line")!.getBoundingClientRect().bottom);
  });

  it("leaves out the caption and the aside when they are not given", async () => {
    const { part } = await render(<AgentHandoff label="Hand it to your agent" prompt="Read https://example.com/llms.txt" />);
    expect(part("caption")).toBeNull();
    expect(part("aside")).toBeNull();
  });

  it("draws the line in the page's own type, on the card surface with a border in the theme's colors", async () => {
    const { part } = await render(<div style={{ lineHeight: 1.6 }}>{full}</div>);
    const prompt = getComputedStyle(part("prompt")!);
    expect(prompt.fontFamily).toBe(getComputedStyle(document.body).fontFamily);
    expect(prompt.fontFamily).not.toBe(themed("fontFamily", "var(--font-mono)"));
    expect(prompt.fontSize).toBe(getComputedStyle(document.body).fontSize);
    expect(prompt.color).toBe(themed("color", "var(--foreground)"));
    const line = getComputedStyle(part("line")!);
    expect(line.backgroundColor).toBe(themed("backgroundColor", "var(--card)"));
    expect(line.borderTopStyle).toBe("solid");
    expect(line.borderTopWidth).toBe("1px");
    expect(line.borderTopColor).toBe(themed("borderTopColor", "color-mix(in oklab, var(--border) 85%, transparent)"));
    expect(Number.parseFloat(line.borderTopLeftRadius)).toBeGreaterThan(1);
    // Clipping a rounded Ouro element to its squircle corner repaints everything in it on each change.
    expect(line.overflow).toBe("visible");
    expect(getComputedStyle(part("label")!).color).toBe(themed("color", "var(--foreground)"));
    expect(getComputedStyle(part("caption")!).color).toBe(themed("color", "var(--muted-foreground)"));
    // The label and the caption are smaller than the line, and keep the page's line height.
    for (const name of ["label", "caption"]) {
      const style = getComputedStyle(part(name)!);
      expect(Number.parseFloat(style.fontSize)).toBeLessThan(Number.parseFloat(prompt.fontSize));
      expect(Number.parseFloat(style.lineHeight)).toBeCloseTo(Number.parseFloat(style.fontSize) * 1.6, 1);
    }
  });

  it("lets the line break after each slash of a web address, and never between the two of its scheme", async () => {
    const { part } = await render(<AgentHandoff label="L" prompt="Read https://ui.ouroboros.bot/docs/dialog.md first." />);
    const prompt = part("prompt")!;
    const before = [...prompt.querySelectorAll("wbr")].map((wbr) => wbr.previousSibling!.textContent);
    expect(before).toEqual(["Read https://", "ui.ouroboros.bot/", "docs/"]);
    expect(prompt.textContent).toBe("Read https://ui.ouroboros.bot/docs/dialog.md first.");
    // Nothing breaks inside "//".
    for (const wbr of prompt.querySelectorAll("wbr")) expect(wbr.nextSibling!.textContent!.startsWith("/")).toBe(false);
    // A line with no web address has no break points of its own.
    const plain = await render(<AgentHandoff label="L" prompt="Add a dialog with Ouro UI." />);
    expect(plain.part("prompt")!.querySelectorAll("wbr")).toHaveLength(0);
  });

  it("puts Copy under the line in a narrow column, and beside it in a wide one", async () => {
    const { host, part, copy } = await render(<div style={{ width: 560 }}>{full}</div>);
    const prompt = part("prompt")!;
    const copied = () => copy.closest('[data-ouro="copy-button"]')!.getBoundingClientRect();
    expect(copied().top).toBeLessThan(prompt.getBoundingClientRect().bottom);
    expect(copied().left).toBeGreaterThanOrEqual(prompt.getBoundingClientRect().right);
    (host.firstElementChild as HTMLElement).style.width = "320px";
    await expect.poll(() => copied().top).toBeGreaterThanOrEqual(prompt.getBoundingClientRect().bottom);
    expect(copied().left).toBeCloseTo(prompt.getBoundingClientRect().left, 0);
    expect(prompt.scrollWidth).toBeLessThanOrEqual(prompt.clientWidth);
  });

  it("copies the line and says Copied on its own button, marked as the hand-off's copy part", async () => {
    const { copy } = await render(full);
    expect(copy.tagName).toBe("BUTTON");
    expect(copy.textContent).toBe("Copy");
    expect(copy.closest('[data-ouro="copy-button"]')).not.toBeNull();
    const announced = watchAnnouncements();
    // "Copied" lasts two seconds, which a loaded runner can outlast between two steps, so the clock is held from the press.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      await userEvent.click(copy);
      // Real frames, not expect.poll, which moves the held timers on at each retry.
      const deadline = performance.now() + 10_000;
      while (copy.textContent !== "Copied" && performance.now() < deadline) await new Promise((frame) => requestAnimationFrame(frame));
      expect(copy.textContent).toBe("Copied");
      expect(clipboard).toEqual([PROMPT]);
      await act(async () => vi.advanceTimersByTime(100));
      expect(announced.count("Copied")).toBe(1);
    } finally {
      vi.useRealTimers();
      announced.stop();
    }
  });

  it("passes copyLabel, copiedLabel and failedMessage to its Copy button", async () => {
    const { copy } = await render(<AgentHandoff label="L" prompt="Read https://example.com/llms.txt" copyLabel="Copy the line" copiedLabel="Line copied" failedMessage="Select the line and copy it." />);
    expect(copy.textContent).toBe("Copy the line");
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      await userEvent.click(copy);
      let deadline = performance.now() + 10_000;
      while (copy.textContent !== "Line copied" && performance.now() < deadline) await new Promise((frame) => requestAnimationFrame(frame));
      expect(copy.textContent).toBe("Line copied");
      await act(async () => vi.advanceTimersByTime(2000));
      expect(copy.textContent).toBe("Copy the line");
      Object.defineProperty(navigator, "clipboard", { configurable: true, get: () => ({ writeText: () => Promise.reject(new DOMException("Denied", "NotAllowedError")) }) });
      vi.spyOn(document, "execCommand").mockReturnValue(false);
      await userEvent.click(copy);
      deadline = performance.now() + 10_000;
      while (copy.getAttribute("title") === null && performance.now() < deadline) await new Promise((frame) => requestAnimationFrame(frame));
      expect(copy.getAttribute("title")).toBe("Select the line and copy it.");
    } finally {
      vi.useRealTimers();
    }
  });

  it("by default tells a person whose browser blocked copying to select the line", async () => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, get: () => ({ writeText: () => Promise.reject(new DOMException("Denied", "NotAllowedError")) }) });
    vi.spyOn(document, "execCommand").mockReturnValue(false);
    const { copy } = await render(<AgentHandoff label="L" prompt="Read https://example.com/llms.txt" />);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      await userEvent.click(copy);
      const deadline = performance.now() + 10_000;
      while (copy.getAttribute("title") === null && performance.now() < deadline) await new Promise((frame) => requestAnimationFrame(frame));
      expect(copy.getAttribute("title")).toBe("The browser blocked copying. Select the line and copy it yourself.");
    } finally {
      vi.useRealTimers();
    }
  });

  it("forwards a ref, passes attributes through, and lets the app's layout classes win", async () => {
    let element: HTMLDivElement | null = null;
    const { handoff } = await render(<AgentHandoff label="L" prompt="P" className="mt-8" id="handoff" data-app="" ref={(node) => void (element = node)} />);
    expect(element).toBe(handoff);
    expect(handoff.id).toBe("handoff");
    expect(handoff.hasAttribute("data-app")).toBe(true);
    expect(handoff.className.endsWith("mt-8")).toBe(true);
    expect(getComputedStyle(handoff).marginTop).toBe("32px");
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("AgentHandoff development messages", () => {
  it.each([
    ["text", { text: "Read https://example.com/llms.txt" }, "text is not a prop; the line to paste is prompt", '<AgentHandoff prompt="Read https://example.com/llms.txt" />'],
    ["value", { value: "Read it" }, "value is not a prop; the line to paste is prompt", '<AgentHandoff prompt="Read it" />'],
    ["command", { command: "npx shadcn add" }, "command is not a prop; the line to paste is prompt, and a command to run in a terminal is CodeBlock", '<AgentHandoff prompt="npx shadcn add" />'],
    ["command (not a string)", { command: 1 }, "command is not a prop; the line to paste is prompt, and a command to run in a terminal is CodeBlock", '<AgentHandoff prompt="the line to paste" />'],
    ["title", { title: "Give it to your agent" }, "title is not a prop; the words above the line are label", '<AgentHandoff label="Give it to your agent" />'],
    ["title (an element)", { title: <b>Hand it over</b> }, "title is not a prop; the words above the line are label", '<AgentHandoff label="Hand it to your agent" />'],
    ["description", { description: "Paste it." }, "description is not a prop; the words under the line are caption", '<AgentHandoff caption="Paste it." />'],
    ["description (an element)", { description: <i>Paste it</i> }, "description is not a prop; the words under the line are caption", `<AgentHandoff caption="Paste it into your coding agent's chat." />`],
    ["hint (a string)", { hint: "Paste it here." }, "hint is not a prop; the words under the line are caption", '<AgentHandoff caption="Paste it here." />'],
    ["hint", { hint: <i>Paste it</i> }, "hint is not a prop; the words under the line are caption", `<AgentHandoff caption="Paste it into your coding agent's chat." />`],
  ])("explains %s with the fix", async (_name, extra, problem, fix) => {
    const props = { label: "L", prompt: "P", ...extra } as unknown as Parameters<typeof AgentHandoff>[0];
    const { handoff } = await render(<AgentHandoff {...props} />);
    expect(warn).toHaveBeenCalledWith(`[ouro-ui] AgentHandoff: ${problem}. Fix: ${fix}.`);
    for (const name of ["text", "value", "command", "title", "description", "hint"]) expect(handoff.hasAttribute(name)).toBe(false);
  });

  it.each([
    ["bg-muted", 'remove "bg-muted"; AgentHandoff sets its own look from the theme'],
    ["max-w-xl", ""],
  ])("checks the className %s", async (className, fix) => {
    const { handoff } = await render(<AgentHandoff label="L" prompt="P" className={className} />);
    expect(handoff.classList.contains(className)).toBe(true);
    if (fix) expect(warn).toHaveBeenCalledWith(expect.stringMatching(new RegExp(`^\\[ouro-ui\\] AgentHandoff: "${className}".*${fix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`)));
    else expect(warn).not.toHaveBeenCalled();
  });

  it("renders to a string", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const html = renderToString(full);
    expect(html).toContain('data-ouro="agent-handoff"');
    expect(html).toContain("Hand it to your agent");
    expect(html).toContain("<wbr/>");
    expect(error).not.toHaveBeenCalled();
  });
});
