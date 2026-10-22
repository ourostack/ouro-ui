import { type ReactNode } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { EventChip, type EventChipProps } from "@/registry/ouro/components/ouro/event-chip/event-chip";
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
    get chip() {
      return host.querySelector<HTMLElement>("[data-ouro-event-chip]")!;
    },
  };
}

const base = { title: "Weekly sync", when: "in 12 min" } as const;

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

describe("EventChip", () => {
  it("is a button named by its label, time, title and status", async () => {
    const onClick = vi.fn();
    const { chip } = await render(<EventChip {...base} label="Next meeting" status="Needs you" statusTone="warning" onClick={onClick} />);
    expect(chip.tagName).toBe("BUTTON");
    expect(chip.dataset.ouro).toBe("badge");
    await userEvent.click(page.getByRole("button", { name: "Next meeting: in 12 min Weekly sync , Needs you" }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(chip.querySelector("[data-ouro-touch-target]")).not.toBeNull();
  });

  it("is a link with href, and a static label with neither", async () => {
    const view = await render(<EventChip {...base} href="https://example.com/sync" />);
    expect(view.chip.tagName).toBe("A");
    expect(view.chip.getAttribute("href")).toBe("https://example.com/sync");
    await view.rerender(<EventChip {...base} />);
    expect(view.chip.tagName).toBe("SPAN");
  });

  it("draws the border and time in the primary color when soon or now", async () => {
    const { chip, rerender } = await render(<EventChip {...base} />);
    const when = () => chip.querySelector<HTMLElement>("[data-ouro-event-when]")!;
    expect(chip.dataset.state).toBe("upcoming");
    const quietBorder = getComputedStyle(chip).borderTopColor;
    const quietTime = getComputedStyle(when()).color;
    for (const state of ["soon", "now"] as const) {
      await rerender(<EventChip {...base} state={state} />);
      expect(chip.dataset.state).toBe(state);
      expect(getComputedStyle(chip).borderTopColor).not.toBe(quietBorder);
      expect(getComputedStyle(when()).color).not.toBe(quietTime);
    }
  });

  it("shows the status after a dot of its tone", async () => {
    const { chip, rerender } = await render(<EventChip {...base} />);
    expect(chip.querySelector("[data-ouro-event-status]")).toBeNull();
    await rerender(<EventChip {...base} status="Ready" statusTone="success" />);
    const dot = chip.querySelector<HTMLElement>('[data-ouro-event-status] [aria-hidden="true"]')!;
    expect(dot.className).toContain("bg-success");
    expect(dot.getBoundingClientRect().width).toBe(6);
  });

  it("cuts a long title to one line inside its container", async () => {
    const { chip, host } = await render(<EventChip {...base} title={"Quarterly planning ".repeat(10)} status="Needs you" onClick={() => {}} />);
    const title = chip.querySelector<HTMLElement>("[data-ouro-event-title]")!;
    expect(chip.getBoundingClientRect().right).toBeLessThanOrEqual(host.getBoundingClientRect().right);
    expect(title.scrollWidth).toBeGreaterThan(title.clientWidth);
    expect(chip.querySelector("[data-ouro-event-status]")!.getBoundingClientRect().right).toBeLessThanOrEqual(chip.getBoundingClientRect().right);
  });

  it("renders in server HTML and hydrates without a warning", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const node = <EventChip {...base} state="soon" status="Ready" onClick={() => {}} />;
    const html = renderToString(node);
    expect(html).toContain('data-state="soon"');
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
    let button: HTMLElement | null = null;
    let link: HTMLElement | null = null;
    const { chip } = await render(<EventChip {...base} className="ms-4" onClick={() => {}} ref={(node) => void (button = node)} />);
    expect(button).toBe(chip);
    expect(getComputedStyle(chip).marginInlineStart).toBe("16px");
    const linked = await render(<EventChip {...base} href="https://example.com/" ref={(node) => void (link = node)} />);
    expect(link).toBe(linked.chip);
  });
});

describe("EventChip development messages", () => {
  it.each([
    ["a missing title", { title: undefined }, "title is missing, so the chip does not say which event it is", '<EventChip title="Weekly sync" when="in 12 min">'],
    ["an unknown state", { state: "late" }, 'state="late" is not a state; use "upcoming", "soon" or "now"', '<EventChip state="soon">'],
    ["a renamed tone", { status: "Late", statusTone: "danger" }, 'statusTone="danger" is not a tone', '<EventChip statusTone="destructive">'],
    ["an unknown tone", { status: "Late", statusTone: "pink" }, 'statusTone="pink" is not a tone; use "primary", "secondary", "destructive", "success", "warning"', '<EventChip statusTone="primary">'],
    ["subject", { subject: "Weekly sync" }, "subject is not a prop", '<EventChip title="Weekly sync">'],
    ["onOpen", { onOpen: () => {} }, "onOpen is not a prop", "<EventChip onClick={open}>"],
    ["soon", { soon: true }, "soon is not a prop", '<EventChip state="soon">'],
  ])("names the fix for %s", async (_name, extra, problem, fix) => {
    const props = { ...base, ...extra } as unknown as EventChipProps;
    const { chip } = await render(<EventChip {...props} />);
    expect(warn).toHaveBeenCalledWith(`[ouro-ui] EventChip: ${problem}. Fix: ${fix}.`);
    expect(chip.hasAttribute("subject")).toBe(false);
  });

  it("renders an unknown state as upcoming, and an unknown tone as secondary", async () => {
    const props = { ...base, state: "late", status: "Late", statusTone: "pink" } as unknown as EventChipProps;
    const { chip } = await render(<EventChip {...props} />);
    expect(chip.dataset.state).toBe("upcoming");
    expect(chip.querySelector('[data-ouro-event-status] [aria-hidden="true"]')!.className).toContain("bg-muted-foreground");
  });

  it("checks the className", async () => {
    await render(<EventChip {...base} className="bg-blue-500" />);
    expect(warn).toHaveBeenCalledWith(
      '[ouro-ui] EventChip: "bg-blue-500" sets appearance, and className is for layout only. Fix: remove "bg-blue-500"; EventChip takes its colors from its state and statusTone.',
    );
  });
});
