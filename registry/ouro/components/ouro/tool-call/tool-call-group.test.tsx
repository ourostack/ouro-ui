import { type ReactNode } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { ToolCallGroup, type ToolCallGroupItem } from "@/registry/ouro/components/ouro/tool-call/tool-call-group";
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
    get group() {
      return host.querySelector<HTMLElement>('[data-ouro="tool-call-group"]')!;
    },
    get trigger() {
      return host.querySelector<HTMLButtonElement>("button[aria-expanded]")!;
    },
    get title() {
      return host.querySelector<HTMLElement>('[data-slot="tool-call-group-title"]')!;
    },
  };
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

const read: ToolCallGroupItem = { id: "read", name: "Read file", detail: "recipes/roast.md", status: "done", duration: 0.4 };
const search: ToolCallGroupItem = { id: "search", name: "Searched the web", detail: "rice for six", status: "done", duration: 2.1 };
const running: ToolCallGroupItem = { ...search, status: "running" };

describe("ToolCallGroup", () => {
  it("is open while a call runs or waits, and closes when they all settle", async () => {
    const view = await render(<ToolCallGroup calls={[read, running]} />);
    expect(view.trigger.getAttribute("aria-expanded")).toBe("true");
    expect(view.group.hasAttribute("data-busy")).toBe(true);
    expect(view.group.querySelectorAll('[data-ouro="tool-call"]')).toHaveLength(2);
    await view.rerender(<ToolCallGroup calls={[read, { ...search, status: "waiting" }]} />);
    expect(view.trigger.getAttribute("aria-expanded")).toBe("true");
    await view.rerender(<ToolCallGroup calls={[read, search]} />);
    expect(view.trigger.getAttribute("aria-expanded")).toBe("false");
    expect(view.group.hasAttribute("data-busy")).toBe(false);
  });

  it("keeps the person's choice once they open or close it", async () => {
    const onOpenChange = vi.fn();
    const view = await render(<ToolCallGroup calls={[read, running]} onOpenChange={onOpenChange} />);
    await userEvent.click(view.trigger);
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    await view.rerender(<ToolCallGroup calls={[read, running, { ...running, id: "more" }]} onOpenChange={onOpenChange} />);
    expect(view.trigger.getAttribute("aria-expanded")).toBe("false");
    await view.rerender(<ToolCallGroup calls={[read, search]} onOpenChange={onOpenChange} />);
    await userEvent.click(view.trigger);
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
    await view.rerender(<ToolCallGroup calls={[read, running]} />);
    await view.rerender(<ToolCallGroup calls={[read, search]} />);
    expect(view.trigger.getAttribute("aria-expanded")).toBe("true");
  });

  it("stays open once the person uses a call in it, so focus and an opened output stay put", async () => {
    const view = await render(<ToolCallGroup calls={[{ ...read, output: "# Roast" }, running]} />);
    const row = page.getByRole("button", { name: /^Read file\s+recipes\/roast\.md\s+0\.4s\s*,\s*done$/ });
    await userEvent.click(row);
    await view.rerender(<ToolCallGroup calls={[{ ...read, output: "# Roast" }, search]} />);
    expect(view.trigger.getAttribute("aria-expanded")).toBe("true");
    await expect.element(page.getByText("# Roast")).toBeVisible();
    const focused = await render(<ToolCallGroup calls={[{ ...read, id: "focus", output: "# Rice" }, running]} />);
    const button = focused.group.querySelector<HTMLButtonElement>("ul button")!;
    await act(async () => button.focus());
    await focused.rerender(<ToolCallGroup calls={[{ ...read, id: "focus", output: "# Rice" }, search]} />);
    expect(focused.trigger.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(button);
  });

  it("starts open with defaultOpen, and follows open when the app controls it", async () => {
    const first = await render(<ToolCallGroup calls={[read]} defaultOpen />);
    expect(first.trigger.getAttribute("aria-expanded")).toBe("true");
    const onOpenChange = vi.fn();
    const second = await render(<ToolCallGroup calls={[running]} open={false} onOpenChange={onOpenChange} />);
    expect(second.trigger.getAttribute("aria-expanded")).toBe("false");
    await userEvent.click(second.trigger);
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
    expect(second.trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("titles itself from its calls: running, waiting, ran, and how many failed", async () => {
    const view = await render(<ToolCallGroup calls={[read, running]} />);
    expect(view.title.textContent).toBe("Running 2 tools");
    expect(view.title.querySelector('[data-ouro="spinner"]')!.getAttribute("aria-hidden")).toBe("true");
    await view.rerender(<ToolCallGroup calls={[read, { ...search, status: "waiting" }]} />);
    expect(view.title.textContent).toBe("Waiting for you · 2 tools");
    await view.rerender(<ToolCallGroup calls={[read]} />);
    expect(view.title.textContent).toBe("Ran 1 tool");
    await view.rerender(<ToolCallGroup calls={[read, { ...search, status: "failed" }, { ...read, id: "again", status: "failed" }]} />);
    expect(view.title.textContent).toBe("Ran 3 tools · 2 failed");
    await expect.element(page.getByRole("button", { name: "Ran 3 tools · 2 failed" })).toBeVisible();
    await view.rerender(<ToolCallGroup calls={[read, search]} summary="Read the recipe and its notes" />);
    expect(view.title.textContent).toBe("Read the recipe and its notes");
  });

  it("lists its calls, each a ToolCall that opens to its own output", async () => {
    const view = await render(<ToolCallGroup calls={[{ ...read, output: "# Roast" }, search]} defaultOpen />);
    const list = view.group.querySelector('[data-slot="tool-call-group-list"]')!;
    expect(list.tagName).toBe("UL");
    expect(list.querySelectorAll(":scope > li")).toHaveLength(2);
    await userEvent.click(page.getByRole("button", { name: /^Read file\s+recipes\/roast\.md\s+0\.4s\s*,\s*done$/ }));
    await expect.element(page.getByText("# Roast")).toBeVisible();
  });

  it("renders in server HTML and hydrates without a mismatch", async () => {
    const node = <ToolCallGroup calls={[read, search]} />;
    const html = renderToString(node);
    expect(html).toContain('data-ouro="tool-call-group"');
    expect(html).toContain("Ran 2 tools");
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

  it("says nothing in development for a group with only its own props", async () => {
    await render(<ToolCallGroup calls={[read, running]} summary="Read the recipe" defaultOpen onOpenChange={() => {}} className="mt-2" />);
    expect(warn).not.toHaveBeenCalled();
  });

  it("names the fix for a guessed prop in development", async () => {
    // @ts-expect-error children is not a prop.
    await render(<ToolCallGroup calls={[read]}>{"Read file"}</ToolCallGroup>);
    // @ts-expect-error tools is not a prop.
    await render(<ToolCallGroup calls={[read]} tools={[read]} />);
    // @ts-expect-error title is not a prop.
    await render(<ToolCallGroup calls={[read]} title="Read the recipe" />);
    expect(said()).toEqual(
      expect.arrayContaining([
        "[ouro-ui] ToolCallGroup: children is not a prop; the calls are calls, as data. Fix: <ToolCallGroup calls={[{ id, name, status }]} />.",
        "[ouro-ui] ToolCallGroup: tools is not a prop; the calls are calls. Fix: <ToolCallGroup calls={[{ id, name, status }]} />.",
        '[ouro-ui] ToolCallGroup: title is not a prop; the title is summary. Fix: <ToolCallGroup summary="Read the recipe">.',
      ]),
    );
  });

  it("names the fix for an appearance class, and leaves a layout class alone", async () => {
    await render(<ToolCallGroup calls={[read]} className="mt-2 bg-card" />);
    expect(said().some((line: string) => line.startsWith("[ouro-ui] ToolCallGroup: ") && line.includes('remove "bg-card"; ToolCallGroup sets its own look from the theme'))).toBe(true);
    expect(said().some((line: string) => line.includes("mt-2"))).toBe(false);
  });
});
