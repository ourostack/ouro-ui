import { type ReactNode } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { MeetingRow, type MeetingRowProps } from "@/registry/ouro/components/ouro/meeting-row/meeting-row";
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
    get row() {
      return host.querySelector<HTMLElement>('[data-ouro="meeting-row"]')!;
    },
  };
}

const base = { title: "Weekly sync", time: "10:00", state: "upcoming" } as const;

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

describe("MeetingRow", () => {
  it("is an article named by its time and title, and Now while it is happening", async () => {
    const { row, rerender } = await render(<MeetingRow {...base} />);
    expect(row.tagName).toBe("ARTICLE");
    await expect.element(page.getByRole("article", { name: "10:00 Weekly sync" })).toBeVisible();
    await rerender(<MeetingRow {...base} state="now" nowLabel="En cours" />);
    await expect.element(page.getByRole("article", { name: "10:00 Weekly sync En cours" })).toBeVisible();
  });

  it("marks a meeting happening now with a bar at its start edge", async () => {
    const { row, rerender } = await render(<MeetingRow {...base} />);
    expect(getComputedStyle(row, "::before").content).toBe("none");
    expect(row.querySelector('[data-ouro="badge"]')).toBeNull();
    await rerender(<MeetingRow {...base} state="now" />);
    expect(row.dataset.state).toBe("now");
    const bar = getComputedStyle(row, "::before");
    expect(bar.width).toBe("2px");
    expect(bar.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
    expect(bar.insetInlineStart).toBe("0px");
    const badge = row.querySelector<HTMLElement>('[data-ouro="badge"]')!;
    expect(badge.textContent).toBe("Now");
    expect(badge.className).toContain("bg-success/10");
  });

  it("quiets a past meeting with color, not opacity", async () => {
    const { row, rerender } = await render(<MeetingRow {...base} />);
    const title = () => row.querySelector<HTMLElement>(".font-semibold")!;
    const upcoming = getComputedStyle(title()).color;
    await rerender(<MeetingRow {...base} state="past" />);
    expect(row.dataset.state).toBe("past");
    expect(getComputedStyle(title()).color).not.toBe(upcoming);
    expect(getComputedStyle(row).opacity).toBe("1");
  });

  it("shows the duration, the person's status in its tone, a detail line and actions", async () => {
    const { row } = await render(
      <MeetingRow {...base} duration="30 min" status="Tentative" statusTone="warning" detail="Ada Lovelace" actions={<Button size="sm">Join</Button>} />,
    );
    expect(row.textContent).toBe("10:0030 minWeekly syncTentativeAda LovelaceJoin");
    const badge = row.querySelector<HTMLElement>('[data-ouro="badge"]')!;
    expect(badge.textContent).toBe("Tentative");
    expect(badge.className).toContain("border-warning");
    await expect.element(page.getByRole("button", { name: "Join" })).toBeVisible();
  });

  it("writes the start in a <time> with dateTime", async () => {
    const { row } = await render(<MeetingRow {...base} dateTime="2026-06-01T10:00" />);
    const time = row.querySelector("time")!;
    expect(time.dateTime).toBe("2026-06-01T10:00");
    expect(time.textContent).toBe("10:00");
  });

  it("keeps a long title to two lines inside the row", async () => {
    const { row, host } = await render(<MeetingRow {...base} title={"Planning ".repeat(40)} />);
    const title = row.querySelector<HTMLElement>(".font-semibold")!;
    const line = Number.parseFloat(getComputedStyle(title).lineHeight);
    expect(title.getBoundingClientRect().height).toBeLessThanOrEqual(line * 2 + 1);
    expect(row.getBoundingClientRect().right).toBeLessThanOrEqual(host.getBoundingClientRect().right);
  });

  it("renders in server HTML and hydrates without a warning", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const node = <MeetingRow {...base} state="now" status="Organizer" dateTime="2026-06-01T10:00" />;
    const html = renderToString(node);
    expect(html).toContain("<article");
    expect(html).toContain("Organizer");
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
    await expect.element(page.getByRole("article", { name: "10:00 Weekly sync Now" })).toBeVisible();
  });

  it("forwards a ref and lets app layout classes win", async () => {
    let element: HTMLElement | null = null;
    const { row } = await render(<MeetingRow {...base} className="mt-4" ref={(node) => void (element = node)} />);
    expect(element).toBe(row);
    expect(getComputedStyle(row).marginTop).toBe("16px");
  });
});

describe("MeetingRow development messages", () => {
  it.each([
    ["a missing title", { title: undefined }, "title is missing, so the row does not say which meeting it is", '<MeetingRow title="Weekly sync" time="10:00" state="upcoming">'],
    ["an unknown state", { state: "live" }, 'state="live" is not a state; use "past", "now" or "upcoming"', '<MeetingRow state="upcoming">'],
    ["a renamed tone", { status: "Declined", statusTone: "danger" }, 'statusTone="danger" is not a tone', '<MeetingRow statusTone="destructive">'],
    [
      "an unknown tone",
      { status: "Declined", statusTone: "pink" },
      'statusTone="pink" is not a tone; use "primary", "secondary", "destructive", "success", "warning"',
      '<MeetingRow statusTone="primary">',
    ],
    ["subject", { subject: "Weekly sync" }, "subject is not a prop", '<MeetingRow title="Weekly sync">'],
    ["start", { start: "10:00" }, "start is not a prop; the start is time, and dateTime for the machine-readable start", '<MeetingRow time="10:00" dateTime="2026-06-01T10:00">'],
  ])("names the fix for %s", async (_name, extra, problem, fix) => {
    const props = { ...base, ...extra } as unknown as MeetingRowProps;
    const { row } = await render(<MeetingRow {...props} />);
    expect(warn).toHaveBeenCalledWith(`[ouro-ui] MeetingRow: ${problem}. Fix: ${fix}.`);
    expect(row.hasAttribute("subject")).toBe(false);
    expect(row.hasAttribute("start")).toBe(false);
  });

  it("renders an unknown state as upcoming, and an unknown tone as secondary", async () => {
    const props = { ...base, state: "live", status: "Declined", statusTone: "pink" } as unknown as MeetingRowProps;
    const { row } = await render(<MeetingRow {...props} />);
    expect(row.dataset.state).toBe("upcoming");
    expect(row.querySelector('[data-ouro="badge"]')!.className).toContain("border-border");
  });

  it("checks the className", async () => {
    await render(<MeetingRow {...base} className="bg-blue-500" />);
    expect(warn).toHaveBeenCalledWith(
      '[ouro-ui] MeetingRow: "bg-blue-500" sets appearance, and className is for layout only. Fix: remove "bg-blue-500"; MeetingRow takes its colors from the theme and its state.',
    );
  });
});
