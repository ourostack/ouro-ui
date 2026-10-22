import { type ReactNode } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { BriefingCard, type BriefingCardItem, type BriefingCardProps } from "@/registry/ouro/components/ouro/briefing-card/briefing-card";
import { Button } from "@/registry/ouro/components/ouro/button/button";
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
    get card() {
      return host.querySelector<HTMLElement>('[data-ouro="briefing-card"]')!;
    },
  };
}

const items: BriefingCardItem[] = [
  { id: "chat", label: "Chat", content: "2 new · 1 asks you" },
  { id: "last", label: "Last time", content: null },
  { id: "files", label: "Files", content: <a href="#notes">Notes from last week</a> },
  { id: "empty", label: "Empty", content: "" },
  { id: "later", label: "Later", content: undefined },
  { id: "none", label: "None", content: false },
];

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

describe("BriefingCard", () => {
  it("is a region named by its title, with the title as a heading", async () => {
    const { card, rerender } = await render(<BriefingCard title="Weekly sync" detail="In 25 min · 6 people" items={items} />);
    await expect.element(page.getByRole("region", { name: "Weekly sync" })).toBeVisible();
    await expect.element(page.getByRole("heading", { level: 3, name: "Weekly sync" })).toBeVisible();
    expect(card.textContent).toContain("In 25 min · 6 people");
    await rerender(<BriefingCard title="Weekly sync" headingLevel={2} items={items} />);
    await expect.element(page.getByRole("heading", { level: 2, name: "Weekly sync" })).toBeVisible();
  });

  it("lists the rows as terms and details, leaving out empty rows", async () => {
    const { card, rerender } = await render(<BriefingCard title="Weekly sync" items={items} />);
    expect([...card.querySelectorAll("dt")].map((term) => term.textContent)).toEqual(["Chat", "Files"]);
    expect([...card.querySelectorAll("dd")].map((details) => details.textContent)).toEqual(["2 new · 1 asks you", "Notes from last week"]);
    await expect.element(page.getByRole("link", { name: "Notes from last week" })).toBeVisible();
    // The terms form a column beside their details.
    const term = card.querySelector("dt")!.getBoundingClientRect();
    const details = card.querySelector("dd")!.getBoundingClientRect();
    expect(details.left).toBeGreaterThan(term.right);
    await rerender(<BriefingCard title="Weekly sync" items={[{ id: "none", label: "None", content: false }]} />);
    expect(card.querySelector("dl")).toBeNull();
  });

  it("sets the detail and the terms in a quieter color than the title", async () => {
    const { card } = await render(<BriefingCard title="Weekly sync" detail="In 25 min" items={items} />);
    const title = getComputedStyle(card.querySelector("h3")!).color;
    expect(getComputedStyle(card.querySelector("p")!).color).not.toBe(title);
    expect(getComputedStyle(card.querySelector("dt")!).color).not.toBe(title);
  });

  it("shows the status in a badge of its tone, before the title", async () => {
    const { card, rerender } = await render(<BriefingCard title="Weekly sync" items={[]} />);
    expect(card.querySelector('[data-ouro="badge"]')).toBeNull();
    await rerender(<BriefingCard title="Weekly sync" items={[]} status="Needs you" statusTone="warning" />);
    const badge = card.querySelector<HTMLElement>('[data-ouro="badge"]')!;
    expect(badge.textContent).toBe("Needs you");
    expect(badge.className).toContain("bg-warning/10");
    expect(badge.getBoundingClientRect().right).toBeLessThanOrEqual(card.querySelector("h3")!.getBoundingClientRect().left);
    await rerender(<BriefingCard title="Weekly sync" items={[]} status="Up to date" />);
    expect(card.querySelector('[data-ouro="badge"]')!.className).toContain("bg-muted");
  });

  it("puts the note after the rows, and the actions last", async () => {
    const { card } = await render(<BriefingCard title="Weekly sync" items={items} note={<p data-testid="note">A note</p>} actions={<Button size="sm">Open chat</Button>} />);
    const note = card.querySelector('[data-testid="note"]')!.getBoundingClientRect();
    expect(note.top).toBeGreaterThanOrEqual(card.querySelector("dl")!.getBoundingClientRect().bottom);
    expect(page.getByRole("button", { name: "Open chat" }).element().getBoundingClientRect().top).toBeGreaterThanOrEqual(note.bottom);
  });

  it.each([undefined, null])("leaves out the detail, note and actions when they are %s", async (missing) => {
    const { card } = await render(<BriefingCard title="Weekly sync" items={[]} detail={missing} note={missing} actions={missing} />);
    // Only the title's block remains.
    expect(card.childElementCount).toBe(1);
    expect(card.firstElementChild!.childElementCount).toBe(1);
  });

  it("keeps a long title and content inside the card", async () => {
    const { card, host } = await render(<BriefingCard title={"Quarterly ".repeat(30)} items={[{ id: "a", label: "Notes", content: "word".repeat(80) }]} />);
    expect(card.getBoundingClientRect().right).toBeLessThanOrEqual(host.getBoundingClientRect().right);
    expect(card.querySelector("dd")!.getBoundingClientRect().right).toBeLessThanOrEqual(card.getBoundingClientRect().right);
  });

  it("renders in server HTML and hydrates without a warning", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const node = <BriefingCard title="Weekly sync" status="Needs you" statusTone="warning" items={items} />;
    const html = renderToString(node);
    expect(html).toContain("<dl");
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
    let element: HTMLElement | null = null;
    const { card } = await render(<BriefingCard title="Weekly sync" items={[]} className="mt-4" id="brief" ref={(node) => void (element = node)} />);
    expect(element).toBe(card);
    expect(card.id).toBe("brief");
    expect(getComputedStyle(card).marginTop).toBe("16px");
  });
});

describe("BriefingCard development messages", () => {
  it.each([
    ["a missing title", { title: undefined }, "title is missing, so the card has no heading or name", '<BriefingCard title="Weekly sync" items={rows}>'],
    ["a renamed tone", { status: "Late", statusTone: "danger" }, 'statusTone="danger" is not a tone', '<BriefingCard statusTone="destructive">'],
    ["an unknown tone", { status: "Late", statusTone: "pink" }, 'statusTone="pink" is not a tone; use "primary", "secondary", "destructive", "success", "warning"', '<BriefingCard statusTone="primary">'],
    ["sections", { sections: [] }, "sections is not a prop", "<BriefingCard items={rows}>"],
    ["heading", { heading: "Weekly sync" }, "heading is not a prop", '<BriefingCard title="Weekly sync">'],
  ])("names the fix for %s", async (_name, extra, problem, fix) => {
    const props = { title: "Weekly sync", items, ...extra } as unknown as BriefingCardProps;
    const { card } = await render(<BriefingCard {...props} />);
    expect(warn).toHaveBeenCalledWith(`[ouro-ui] BriefingCard: ${problem}. Fix: ${fix}.`);
    expect(card.hasAttribute("sections")).toBe(false);
  });

  it("warns of nothing when the props are right", async () => {
    await render(<BriefingCard title="Weekly sync" items={items} status="Up to date" />);
    await render(<BriefingCard title="Weekly sync" items={[]} status="Needs you" statusTone="warning" detail="In 25 min" />);
    expect(warn).not.toHaveBeenCalled();
  });

  it("renders an unknown tone as secondary, and missing items as none", async () => {
    const props = { title: "Weekly sync", status: "Late", statusTone: "pink" } as unknown as BriefingCardProps;
    const { card } = await render(<BriefingCard {...props} />);
    expect(card.querySelector('[data-ouro="badge"]')!.className).toContain("bg-muted");
    // The card passes the badge a tone it knows, so only the card's own message is shown.
    expect(warn.mock.calls.flat().join("\n")).not.toContain("Badge:");
    expect(card.querySelector("dl")).toBeNull();
  });

  it("checks the className", async () => {
    await render(<BriefingCard title="Weekly sync" items={[]} className="bg-blue-500" />);
    expect(warn).toHaveBeenCalledWith(
      '[ouro-ui] BriefingCard: "bg-blue-500" sets appearance, and className is for layout only. Fix: remove "bg-blue-500"; BriefingCard takes its colors from the theme and its statusTone.',
    );
  });
});
