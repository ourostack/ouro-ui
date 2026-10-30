import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import { TimeGrid } from "@/registry/ouro/components/ouro/time-grid/time-grid";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

// Runs in the `touch` project: Chromium as a 390x844 phone with a coarse pointer.

let root: Root | undefined;
const nodes: Element[] = [];
afterEach(async () => {
  await act(async () => root?.unmount());
  for (const node of nodes.splice(0)) node.remove();
});

it("gives a short event a 44px touch target, and the hours more room on a phone", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  nodes.push(host);
  root = createRoot(host);
  await act(async () =>
    root!.render(
      <TimeGrid
        label="Team calendar"
        view="day"
        date="2026-03-12"
        timeZone="America/New_York"
        now="2026-03-12T08:00:00-04:00"
        events={[{ id: "standup", title: "Standup", start: "2026-03-12T09:30:00-04:00", end: "2026-03-12T09:45:00-04:00" }]}
      />,
    ),
  );
  expect(host.querySelector<HTMLElement>("[data-ouro-time-grid-body]")!.offsetHeight).toBe(56 * 24);
  const event = host.querySelector<HTMLElement>("[data-ouro-event-key]")!;
  event.scrollIntoView({ block: "center" });
  const box = event.getBoundingClientRect();
  const target = event.querySelector("[data-ouro-touch-target]")!.getBoundingClientRect();
  expect(target.height).toBeGreaterThanOrEqual(44);
  expect(target.width).toBeGreaterThanOrEqual(44);
  const cx = box.left + box.width / 2;
  const cy = box.top + box.height / 2;
  for (const [x, y] of [
    [cx, cy - 21],
    [cx, cy + 21],
  ] as const) {
    expect(document.elementFromPoint(x, y)?.closest("[data-ouro-event-key]")).toBe(event);
  }
});
