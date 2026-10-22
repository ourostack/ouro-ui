import { type ReactNode } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { AttentionCard, type AttentionCardProps } from "@/registry/ouro/components/ouro/attention-card/attention-card";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

const roots: Root[] = [];
let mounted: Element[] = [];

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
    rerender: (next: ReactNode) => act(async () => root.render(next)),
    get card() {
      return host.querySelector<HTMLElement>('[data-ouro="attention-card"]')!;
    },
  };
}

const base = { reason: "Asked you", title: "Design review", from: "Ada Lovelace" } as const;

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

describe("AttentionCard", () => {
  it("is an article named by its reason and where it happened", async () => {
    const { card } = await render(
      <AttentionCard {...base} time="9:41">
        Can you look at the second draft before noon?
      </AttentionCard>,
    );
    expect(card.tagName).toBe("ARTICLE");
    await expect.element(page.getByRole("article", { name: "Asked you Design review" })).toBeVisible();
    expect(card.textContent).toBe("Asked youDesign review9:41Ada Lovelace: Can you look at the second draft before noon?");
  });

  it("shows the reason in a soft badge in the tone's color", async () => {
    const { card, rerender } = await render(<AttentionCard {...base}>Hi</AttentionCard>);
    const badge = () => card.querySelector<HTMLElement>('[data-ouro="badge"]')!;
    expect(badge().textContent).toBe("Asked you");
    expect(badge().className).toContain("bg-primary/10");
    await rerender(
      <AttentionCard {...base} tone="warning">
        Hi
      </AttentionCard>,
    );
    expect(badge().className).toContain("bg-warning/10");
  });

  it("opens from the message when onOpen is given", async () => {
    const onOpen = vi.fn();
    const { card, rerender } = await render(<AttentionCard {...base}>Can you review?</AttentionCard>);
    expect(card.querySelector("button")).toBeNull();
    await rerender(
      <AttentionCard {...base} onOpen={onOpen}>
        Can you review?
      </AttentionCard>,
    );
    await userEvent.click(page.getByRole("button", { name: "Ada Lovelace: Can you review?" }));
    expect(onOpen).toHaveBeenCalledTimes(1);
    const open = card.querySelector<HTMLButtonElement>('[data-ouro-part="open"]')!;
    expect(open.type).toBe("button");
    expect(open.querySelector("[data-ouro-touch-target]")).not.toBeNull();
  });

  it("cuts a long message to two lines", async () => {
    const { card } = await render(<AttentionCard {...base}>{"Please read this carefully. ".repeat(40)}</AttentionCard>);
    const message = card.querySelector<HTMLElement>("[data-ouro-attention-message]")!;
    const lineHeight = Number.parseFloat(getComputedStyle(message).lineHeight);
    expect(message.getBoundingClientRect().height).toBeLessThanOrEqual(lineHeight * 2 + 1);
    expect(message.scrollHeight).toBeGreaterThan(message.clientHeight);
  });

  it("puts the actions under the message", async () => {
    const { card } = await render(
      <AttentionCard {...base} actions={<Button size="sm">Reply</Button>}>
        Can you review?
      </AttentionCard>,
    );
    const message = card.querySelector<HTMLElement>("[data-ouro-attention-message]")!;
    const reply = card.querySelector<HTMLElement>('[data-ouro="button"]')!;
    expect(reply.getBoundingClientRect().top).toBeGreaterThanOrEqual(message.getBoundingClientRect().bottom);
  });

  it("sets the time quieter than the title, and opens from a plain, left-aligned button that underlines on hover", async () => {
    const { card } = await render(
      <AttentionCard {...base} time="9:41" onOpen={() => {}}>
        Can you review?
      </AttentionCard>,
    );
    const header = card.firstElementChild!;
    const [, title, time] = [...header.children] as HTMLElement[];
    expect(time!.textContent).toBe("9:41");
    expect(getComputedStyle(time!).color).not.toBe(getComputedStyle(title!).color);
    const open = card.querySelector<HTMLButtonElement>('[data-ouro-part="open"]')!;
    const style = getComputedStyle(open);
    expect(style.backgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect(style.borderTopWidth).toBe("0px");
    expect(style.paddingTop).toBe("0px");
    expect(style.textAlign).toBe("start");
    expect(style.cursor).toBe("pointer");
    expect(style.touchAction).toBe("manipulation");
    expect(style.width).toBe(`${card.querySelector("[data-ouro-attention-message]")!.parentElement!.getBoundingClientRect().width}px`);
    await userEvent.hover(open);
    expect(getComputedStyle(open).textDecorationLine).toBe("underline");
  });

  it.each([undefined, null])("leaves out the time and actions when they are %s", async (missing) => {
    const { card } = await render(
      <AttentionCard {...base} time={missing} actions={missing}>
        Hi
      </AttentionCard>,
    );
    expect(card.firstElementChild!.children).toHaveLength(2);
    expect(card.children).toHaveLength(2);
  });

  it("leaves out the time when there is none", async () => {
    const { card } = await render(
      <AttentionCard {...base} time={null}>
        Hi
      </AttentionCard>,
    );
    expect(card.textContent).toBe("Asked youDesign reviewAda Lovelace: Hi");
  });

  it("renders in server HTML and hydrates without a warning", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const node = (
      <AttentionCard {...base} time="9:41" onOpen={() => {}}>
        Can you review?
      </AttentionCard>
    );
    const html = renderToString(node);
    expect(html).toContain("<article");
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
    await expect.element(page.getByRole("article", { name: "Asked you Design review" })).toBeVisible();
  });

  it("forwards a ref and lets app layout classes win", async () => {
    let element: HTMLElement | null = null;
    const { card } = await render(
      <AttentionCard {...base} className="mt-4" ref={(node) => void (element = node)}>
        Hi
      </AttentionCard>,
    );
    expect(element).toBe(card);
    expect(getComputedStyle(card).marginTop).toBe("16px");
  });
});

describe("AttentionCard development messages", () => {
  it("warns of nothing when the props are right", async () => {
    await render(<AttentionCard {...base}>Hi</AttentionCard>);
    await render(
      <AttentionCard {...base} tone="warning" time="9:41" onOpen={() => {}}>
        Hi
      </AttentionCard>,
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it.each([
    ["a missing reason", { reason: undefined }, "reason is missing, so the card does not say why it needs the person"],
    ["a missing title", { title: undefined }, "title is missing, so the card does not say where it happened"],
    ["a missing from", { from: undefined }, "from is missing, so the card does not say who is asking"],
  ])("names the fix for %s", async (_name, extra, problem) => {
    const props = { ...base, children: "Hi", ...extra } as unknown as AttentionCardProps;
    await render(<AttentionCard {...props} />);
    expect(warn).toHaveBeenCalledWith(`[ouro-ui] AttentionCard: ${problem}. Fix: <AttentionCard reason="Asked you" title="Design review" from="Ada">.`);
  });

  it.each([
    ["a renamed tone", { tone: "danger" }, 'tone="danger" is not a tone', '<AttentionCard tone="destructive">'],
    ["an unknown tone", { tone: "pink" }, 'tone="pink" is not a tone; use "primary", "secondary", "destructive", "success", "warning"', '<AttentionCard tone="primary">'],
    ["message", { message: "Hi" }, "message is not a prop; what they wrote is the children", '<AttentionCard reason="Asked you" title="Review" from="Ada">Can you review?</AttentionCard>'],
    ["text", { text: "Hi" }, "text is not a prop; what they wrote is the children", '<AttentionCard reason="Asked you" title="Review" from="Ada">Can you review?</AttentionCard>'],
    ["onClick", { onClick: () => {} }, "onClick is not a prop; the message opens with onOpen", "<AttentionCard onOpen={open}>"],
  ])("names the fix for %s prop", async (_name, extra, problem, fix) => {
    const props = { ...base, children: "Hi", ...extra } as unknown as AttentionCardProps;
    const { card } = await render(<AttentionCard {...props} />);
    expect(warn).toHaveBeenCalledWith(`[ouro-ui] AttentionCard: ${problem}. Fix: ${fix}.`);
    expect(card.hasAttribute("message")).toBe(false);
    expect(card.hasAttribute("text")).toBe(false);
  });

  it("renders an unknown tone as primary", async () => {
    const props = { ...base, children: "Hi", tone: "pink" } as unknown as AttentionCardProps;
    const { card } = await render(<AttentionCard {...props} />);
    expect(card.querySelector('[data-ouro="badge"]')!.className).toContain("bg-primary/10");
  });

  it("checks the className", async () => {
    await render(
      <AttentionCard {...base} className="bg-blue-500">
        Hi
      </AttentionCard>,
    );
    expect(warn).toHaveBeenCalledWith(
      `[ouro-ui] AttentionCard: "bg-blue-500" sets appearance, and className is for layout only. Fix: remove "bg-blue-500"; the badge's color is tone.`,
    );
  });
});
