import { type ReactNode } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { ToolCall } from "@/registry/ouro/components/ouro/tool-call/tool-call";
import { formatDuration, toolCallStatusFix } from "@/registry/ouro/components/ouro/tool-call/tool-call-styles";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

const roots: Root[] = [];
let mounted: Element[] = [];

async function render(node: ReactNode) {
  const host = document.createElement("div");
  host.style.width = "420px";
  document.body.append(host);
  mounted.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
  return {
    host,
    rerender: (next: ReactNode) => act(async () => root.render(next)),
    get call() {
      return host.querySelector<HTMLElement>('[data-ouro="tool-call"]')!;
    },
    get trigger() {
      return host.querySelector<HTMLButtonElement>("button[aria-expanded]");
    },
    part(name: string) {
      return host.querySelector<HTMLElement>(`[data-slot="tool-call-${name}"]`);
    },
  };
}

/** A theme colour, computed on a probe in the page. */
function themed(value: string) {
  const probe = document.createElement("span");
  probe.style.color = value;
  document.body.append(probe);
  mounted.push(probe);
  return getComputedStyle(probe).color;
}

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(async () => {
  vi.restoreAllMocks();
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  for (const node of mounted) node.remove();
  mounted = [];
});

const said = () => warn.mock.calls.map((call: unknown[]) => String(call[0]));

describe("ToolCall", () => {
  it("opens to its output in a CodeBlock, and is a plain row without output", async () => {
    const onOpenChange = vi.fn();
    const view = await render(<ToolCall name="Ran command" detail="npm test" status="done" duration={4.2} output="Tests  3 passed" onOpenChange={onOpenChange} />);
    expect(view.trigger!.getAttribute("aria-expanded")).toBe("false");
    await userEvent.click(view.trigger!);
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
    const output = view.call.querySelector<HTMLElement>('[data-ouro="code-block"]')!;
    expect(output.getAttribute("data-slot")).toBe("tool-call-output");
    await expect.element(page.getByText("Tests 3 passed")).toBeVisible();
    // Output is not code to paste, so it has no copy button.
    expect(output.querySelector("button")).toBeNull();
    const plain = await render(<ToolCall name="Read file" detail="recipes/roast.md" status="done" />);
    expect(plain.trigger).toBeNull();
    expect(plain.part("row")!.tagName).toBe("DIV");
  });

  it("keeps its own state with no onOpenChange", async () => {
    const view = await render(<ToolCall name="Ran command" status="done" output="ok" />);
    await userEvent.click(view.trigger!);
    expect(view.trigger!.getAttribute("aria-expanded")).toBe("true");
  });

  it("follows open when the app controls it, and starts open with defaultOpen", async () => {
    const onOpenChange = vi.fn();
    const controlled = await render(<ToolCall name="Ran command" status="done" output="ok" open={false} onOpenChange={onOpenChange} />);
    await userEvent.click(controlled.trigger!);
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
    expect(controlled.trigger!.getAttribute("aria-expanded")).toBe("false");
    const first = await render(<ToolCall name="Ran command" status="done" output="ok" defaultOpen />);
    expect(first.trigger!.getAttribute("aria-expanded")).toBe("true");
  });

  it("says each status in words for a screen reader, and shows Failed and Waiting for you", async () => {
    await render(<ToolCall name="Ran command" detail="npm test" status="failed" duration={4.2} output="1 failed" />);
    await expect.element(page.getByRole("button", { name: /^Ran command\s+npm test\s+4\.2s\s*,\s*failed$/ })).toBeVisible();
    const running = await render(<ToolCall name="Searched the web" status="running" />);
    expect(running.call.querySelector('[data-ouro="spinner"]')!.getAttribute("aria-hidden")).toBe("true");
    expect(running.part("row")!.textContent).toBe("Searched the web, running");
    const waiting = await render(<ToolCall name="Edit file" detail="roast.md" status="waiting" />);
    expect(waiting.part("status")!.textContent).toBe("Waiting for you");
    expect(waiting.part("row")!.textContent).toContain(", waiting for you");
    const read = await render(<ToolCall name="Read file" detail="recipes/roast.md" status="done" duration={0.4} />);
    expect(read.part("row")!.textContent).toBe("Read file recipes/roast.md 0.4s, done");
    expect(getComputedStyle(waiting.part("icon")!).color).toBe(themed("var(--warning)"));
    expect(getComputedStyle(waiting.part("status")!).color).toBe(themed("var(--warning)"));
    const failed = await render(<ToolCall name="Ran command" status="failed" />);
    expect(failed.call.getAttribute("data-status")).toBe("failed");
    expect(failed.part("status")!.textContent).toBe("Failed");
    expect(getComputedStyle(failed.part("status")!).color).toBe(themed("var(--destructive)"));
    expect(getComputedStyle(failed.part("icon")!).color).toBe(themed("var(--destructive)"));
    const done = await render(<ToolCall name="Read file" status="done" />);
    expect(done.part("status")).toBeNull();
    expect(getComputedStyle(done.part("icon")!).color).toBe(themed("var(--success)"));
    expect(done.call.getAttribute("data-status")).toBe("done");
  });

  it("cuts a long detail short on one line, so the row keeps its height", async () => {
    const short = await render(<ToolCall name="Ran command" detail="npm test" status="done" />);
    const long = await render(<ToolCall name="Ran command" detail={"npm test -- --run ".repeat(12)} status="done" />);
    const detail = long.part("detail")!;
    expect(getComputedStyle(detail).textOverflow).toBe("ellipsis");
    expect(detail.scrollWidth).toBeGreaterThan(detail.clientWidth);
    expect(long.part("row")!.getBoundingClientRect().height).toBe(short.part("row")!.getBoundingClientRect().height);
    expect(long.call.getBoundingClientRect().width).toBeLessThanOrEqual(420);
  });

  it("lines up a row with output and one without, as tall as a Collapsible's title", async () => {
    const view = await render(
      <>
        <ToolCall name="Ran command" detail="npm test" status="done" output="ok" />
        <ToolCall name="Read file" detail="recipes/roast.md" status="done" />
      </>,
    );
    const [withOutput, plain] = [...view.host.querySelectorAll<HTMLElement>('[data-ouro="tool-call"]')];
    const title = parseFloat(getComputedStyle(withOutput!.querySelector("button")!).minHeight);
    expect(withOutput!.getBoundingClientRect().height).toBe(title);
    expect(plain!.getBoundingClientRect().height).toBe(title);
  });

  it("shows how long it took, short, and nothing for a duration it cannot read", async () => {
    expect([undefined, -1, Number.NaN, 0, 0.42, 4.2, 9.96, 12.4, 59.6, 60, 125].map(formatDuration)).toEqual([
      undefined,
      undefined,
      undefined,
      "0s",
      "0.4s",
      "4.2s",
      "10s",
      "12s",
      "1m",
      "1m",
      "2m 5s",
    ]);
    const view = await render(<ToolCall name="Read file" status="done" duration={Number.NaN} />);
    expect(view.part("duration")).toBeNull();
  });

  it("renders in server HTML and hydrates without a mismatch", async () => {
    const node = <ToolCall name="Read file" detail="recipes/roast.md" status="done" duration={0.4} output="# Roast" />;
    const html = renderToString(node);
    expect(html).toContain('data-ouro="tool-call"');
    expect(html).toContain("recipes/roast.md");
    const host = document.createElement("div");
    host.innerHTML = html;
    document.body.append(host);
    mounted.push(host);
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    await act(async () => {
      roots.push(hydrateRoot(host, node));
    });
    expect(errors).not.toHaveBeenCalled();
  });

  it("renders an unknown status as done and names the fix, with AI Elements' states mapped", async () => {
    // @ts-expect-error output-error is not a status.
    const view = await render(<ToolCall name="Ran command" status="output-error" />);
    expect(view.call.getAttribute("data-status")).toBe("done");
    expect(said()).toContain('[ouro-ui] ToolCall: status="output-error" is not a status; use "running", "done", "failed" or "waiting". Fix: <ToolCall status="failed">.');
  });

  it("maps AI Elements' and other libraries' states to its own in the fix", () => {
    expect(
      ["input-streaming", "input-available", "output-available", "output-error", "approval-requested", "pending", "success", "error", "toString", "nonsense"].map(toolCallStatusFix),
    ).toEqual([
      '<ToolCall status="running">',
      '<ToolCall status="running">',
      '<ToolCall status="done">',
      '<ToolCall status="failed">',
      '<ToolCall status="waiting">',
      '<ToolCall status="running">',
      '<ToolCall status="done">',
      '<ToolCall status="failed">',
      '<ToolCall status="done">',
      '<ToolCall status="done">',
    ]);
  });

  it("draws an icon for each settled status", async () => {
    for (const status of ["done", "failed", "waiting"] as const) {
      const view = await render(<ToolCall name="Read file" status={status} />);
      const box = view.part("icon")!.getBoundingClientRect();
      const drawn = [...view.part("icon")!.children].map((shape) => (shape as SVGGraphicsElement).getBBox());
      expect(box.width).toBe(16);
      expect(drawn.every((bounds) => bounds.width > 0 && bounds.height > 0)).toBe(true);
      expect(drawn.length).toBe(status === "waiting" ? 2 : 1);
    }
  });

  it("says nothing in development for a call with only its own props", async () => {
    await render(<ToolCall name="Ran command" detail="npm test" status="failed" duration={4.2} output="1 failed" outputLanguage="ansi" defaultOpen onOpenChange={() => {}} className="mt-1" />);
    expect(warn).not.toHaveBeenCalled();
  });

  it("names the fix for a guessed prop in development", async () => {
    // @ts-expect-error state is not a prop.
    await render(<ToolCall name="Ran command" status="done" state="input-streaming" />);
    // @ts-expect-error toolName is not a prop.
    await render(<ToolCall name="Ran command" status="done" toolName="Read file" />);
    // @ts-expect-error args is not a prop.
    await render(<ToolCall name="Ran command" status="done" args={{ path: "roast.md" }} />);
    // @ts-expect-error input is not a prop.
    await render(<ToolCall name="Ran command" status="done" input={{ path: "roast.md" }} />);
    // @ts-expect-error result is not a prop.
    await render(<ToolCall name="Ran command" status="done" result="ok" />);
    expect(said()).toEqual(
      expect.arrayContaining([
        '[ouro-ui] ToolCall: state is not a prop; where the call stands is status. Fix: <ToolCall status="running">.',
        '[ouro-ui] ToolCall: toolName is not a prop. Fix: <ToolCall name="Read file">.',
        '[ouro-ui] ToolCall: args is not a prop; a summary of the arguments is detail. Fix: <ToolCall detail="recipes/roast.md">.',
        '[ouro-ui] ToolCall: input is not a prop; a summary of the arguments is detail. Fix: <ToolCall detail="recipes/roast.md">.',
        "[ouro-ui] ToolCall: result is not a prop; what the tool gave back is output, a string. Fix: <ToolCall output={text}>.",
      ]),
    );
  });

  it("names the fix for an appearance class, and leaves a layout class alone", async () => {
    await render(<ToolCall name="Read file" status="done" className="mt-1 text-red-500" />);
    expect(said().some((line: string) => line.startsWith("[ouro-ui] ToolCall: ") && line.includes('remove "text-red-500"; ToolCall sets its own look from the theme'))).toBe(true);
    expect(said().some((line: string) => line.includes("mt-1"))).toBe(false);
  });
});
