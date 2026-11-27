import { type ReactNode } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { ThinkingBlock } from "@/registry/ouro/components/ouro/thinking-block/thinking-block";
import { thoughtFor } from "@/registry/ouro/components/ouro/thinking-block/thinking-block-styles";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

const roots: Root[] = [];
let mounted: Element[] = [];

const REASONING = "The roast needs the oven for an hour.\n\nThe rice can go on the stove.";

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
    get block() {
      return host.querySelector<HTMLElement>('[data-ouro="thinking-block"]')!;
    },
    get trigger() {
      return host.querySelector<HTMLButtonElement>("button[aria-expanded]")!;
    },
    get reasoning() {
      return host.querySelector<HTMLElement>('[data-slot="thinking-block-reasoning"]')!;
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

describe("ThinkingBlock", () => {
  it("is open with a spinner while streaming, and closes to its duration when it finishes", async () => {
    const view = await render(
      <ThinkingBlock streaming duration={12}>
        {REASONING}
      </ThinkingBlock>,
    );
    expect(view.trigger.getAttribute("aria-expanded")).toBe("true");
    expect(view.trigger.textContent).toBe("Thinking");
    expect(view.block.hasAttribute("data-streaming")).toBe(true);
    const spinner = view.block.querySelector('[data-ouro="spinner"]')!;
    expect(spinner.getAttribute("aria-hidden")).toBe("true");
    await expect.element(page.getByRole("button", { name: "Thinking" })).toBeVisible();
    await view.rerender(<ThinkingBlock duration={12}>{REASONING}</ThinkingBlock>);
    expect(view.trigger.getAttribute("aria-expanded")).toBe("false");
    expect(view.trigger.textContent).toBe("Thought for 12 seconds");
    expect(view.block.hasAttribute("data-streaming")).toBe(false);
    expect(view.block.querySelector('[data-ouro="spinner"]')).toBeNull();
  });

  it("keeps the person's choice once they open or close it", async () => {
    const onOpenChange = vi.fn();
    const view = await render(
      <ThinkingBlock streaming onOpenChange={onOpenChange}>
        {REASONING}
      </ThinkingBlock>,
    );
    await userEvent.click(view.trigger);
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    expect(view.trigger.getAttribute("aria-expanded")).toBe("false");
    // A closed block stays closed while the stream goes on, and after it ends.
    await view.rerender(<ThinkingBlock streaming onOpenChange={onOpenChange}>{`${REASONING} More.`}</ThinkingBlock>);
    expect(view.trigger.getAttribute("aria-expanded")).toBe("false");
    await view.rerender(<ThinkingBlock onOpenChange={onOpenChange}>{REASONING}</ThinkingBlock>);
    await userEvent.click(view.trigger);
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
    // One the person opened stays open when a new stream starts and ends.
    await view.rerender(<ThinkingBlock streaming>{REASONING}</ThinkingBlock>);
    await view.rerender(<ThinkingBlock>{REASONING}</ThinkingBlock>);
    expect(view.trigger.getAttribute("aria-expanded")).toBe("true");
  });

  it("starts open with defaultOpen, and follows open when the app controls it", async () => {
    const first = await render(
      <ThinkingBlock defaultOpen duration={3}>
        {REASONING}
      </ThinkingBlock>,
    );
    expect(first.trigger.getAttribute("aria-expanded")).toBe("true");
    // With no onOpenChange, the block keeps its own state.
    await userEvent.click(first.trigger);
    expect(first.trigger.getAttribute("aria-expanded")).toBe("false");
    const onOpenChange = vi.fn();
    const second = await render(
      <ThinkingBlock streaming open={false} onOpenChange={onOpenChange}>
        {REASONING}
      </ThinkingBlock>,
    );
    expect(second.trigger.getAttribute("aria-expanded")).toBe("false");
    await userEvent.click(second.trigger);
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
    expect(second.trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("titles a finished block with its summary, its duration, or Thought", async () => {
    const view = await render(<ThinkingBlock summary="Planned the oven around the roast">{REASONING}</ThinkingBlock>);
    expect(view.trigger.textContent).toBe("Planned the oven around the roast");
    expect([thoughtFor(undefined), thoughtFor(-1), thoughtFor(Number.NaN), thoughtFor(0), thoughtFor(0.2), thoughtFor(1), thoughtFor(59.4), thoughtFor(59.5), thoughtFor(59.6), thoughtFor(150)]).toEqual([
      "Thought",
      "Thought",
      "Thought",
      "Thought for 1 second",
      "Thought for 1 second",
      "Thought for 1 second",
      "Thought for 59 seconds",
      "Thought for 1 minute",
      "Thought for 1 minute",
      "Thought for 3 minutes",
    ]);
  });

  it("marks the reasoning busy while it streams, and keeps a string's line breaks", async () => {
    const view = await render(<ThinkingBlock streaming>{REASONING}</ThinkingBlock>);
    expect(view.reasoning.getAttribute("aria-busy")).toBe("true");
    expect(getComputedStyle(view.reasoning).whiteSpace).toBe("pre-wrap");
    await view.rerender(
      <ThinkingBlock>
        <p>Rendered as the app's own markup.</p>
      </ThinkingBlock>,
    );
    expect(view.reasoning.getAttribute("aria-busy")).toBe("false");
    expect(getComputedStyle(view.reasoning).whiteSpace).toBe("normal");
  });

  it("draws the reasoning muted, behind a line at its start edge, in the theme's colours", async () => {
    const view = await render(<ThinkingBlock defaultOpen>{REASONING}</ThinkingBlock>);
    const probe = document.createElement("span");
    probe.style.color = "var(--muted-foreground)";
    probe.style.borderColor = "var(--border)";
    document.body.append(probe);
    mounted.push(probe);
    const style = getComputedStyle(view.reasoning);
    expect(style.color).toBe(getComputedStyle(probe).color);
    expect(style.borderInlineStartColor).toBe(getComputedStyle(probe).borderTopColor);
    expect(style.borderInlineStartWidth).toBe("2px");
    expect(style.borderInlineEndWidth).toBe("0px");
  });

  it("is a Collapsible, whose closed reasoning is in the server HTML", async () => {
    const node = <ThinkingBlock duration={4}>{REASONING}</ThinkingBlock>;
    const html = renderToString(node);
    expect(html).toContain('data-ouro="thinking-block"');
    expect(html).toContain('data-ouro="collapsible"');
    expect(html).toContain("Thought for 4 seconds");
    expect(html).toContain("The roast needs the oven for an hour.");
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

  it("names the fix for a guessed prop in development", async () => {
    // @ts-expect-error isStreaming is not a prop.
    await render(<ThinkingBlock isStreaming>{REASONING}</ThinkingBlock>);
    // @ts-expect-error title is not a prop.
    await render(<ThinkingBlock title="Checked">{REASONING}</ThinkingBlock>);
    // @ts-expect-error title is not a prop, and a title that is not a string gets a sample summary.
    await render(<ThinkingBlock title={<b>Checked</b>}>{REASONING}</ThinkingBlock>);
    // @ts-expect-error content is not a prop.
    await render(<ThinkingBlock content={REASONING}>{REASONING}</ThinkingBlock>);
    // @ts-expect-error loading is not a prop.
    await render(<ThinkingBlock loading>{REASONING}</ThinkingBlock>);
    // @ts-expect-error isOpen is not a prop.
    await render(<ThinkingBlock isOpen>{REASONING}</ThinkingBlock>);
    const said = warn.mock.calls.map((call: unknown[]) => String(call[0]));
    expect(said).toContain("[ouro-ui] ThinkingBlock: isStreaming is not a prop. Fix: <ThinkingBlock streaming>.");
    expect(said).toContain('[ouro-ui] ThinkingBlock: title is not a prop; the finished title is summary. Fix: <ThinkingBlock summary="Checked">.');
    expect(said).toContain("[ouro-ui] ThinkingBlock: content is not a prop; the reasoning is the children. Fix: <ThinkingBlock>{reasoning}</ThinkingBlock>.");
    expect(said).toContain("[ouro-ui] ThinkingBlock: loading is not a prop; the reasoning is streaming. Fix: <ThinkingBlock streaming>.");
    expect(said).toContain("[ouro-ui] ThinkingBlock: isOpen is not a prop. Fix: <ThinkingBlock open>.");
    expect(said).toContain('[ouro-ui] ThinkingBlock: title is not a prop; the finished title is summary. Fix: <ThinkingBlock summary="Checked the ratios">.');
  });

  it("says nothing in development for a block with only its own props", async () => {
    await render(
      <ThinkingBlock streaming duration={3} summary="Planned the oven" defaultOpen onOpenChange={() => {}} className="mt-2">
        {REASONING}
      </ThinkingBlock>,
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it("names the fix for an appearance class, and leaves a layout class alone", async () => {
    await render(
      <ThinkingBlock className="mt-2 bg-muted" duration={2}>
        {REASONING}
      </ThinkingBlock>,
    );
    const said = warn.mock.calls.map((call: unknown[]) => String(call[0]));
    expect(said.some((line: string) => line.startsWith("[ouro-ui] ThinkingBlock: ") && line.includes('remove "bg-muted"; ThinkingBlock sets its own look from the theme'))).toBe(true);
    expect(said.some((line: string) => line.includes("mt-2"))).toBe(false);
  });
});
