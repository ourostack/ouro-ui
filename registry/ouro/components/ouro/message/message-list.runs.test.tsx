import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { Message } from "@/registry/ouro/components/ouro/message/message";
import { MessageList } from "@/registry/ouro/components/ouro/message/message-list";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

const roots: Root[] = [];
const hosts: HTMLElement[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) root.unmount();
  for (const host of hosts.splice(0)) host.remove();
});

async function render(node: ReactNode, dir: "ltr" | "rtl" = "ltr") {
  const host = document.createElement("div");
  host.dir = dir;
  document.body.append(host);
  hosts.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
  return host;
}

const corners = ["top-left", "top-right", "bottom-right", "bottom-left"] as const;
const radii = (bubble: Element) => {
  const style = getComputedStyle(bubble);
  return Object.fromEntries(corners.map((corner) => [corner, Number.parseFloat(style.getPropertyValue(`border-${corner}-radius`))])) as Record<(typeof corners)[number], number>;
};
const bubbles = (host: HTMLElement) => [...host.querySelectorAll("[data-ouro-message-content]")];

const run = (role: "user" | "assistant", count: number) => (
  <MessageList label="Run" style={{ height: 400 }}>
    {Array.from({ length: count }, (_, index) => (
      <Message key={index} variant="chat" role={role} name="Mara" continued={index > 0}>
        Message {index}
      </Message>
    ))}
  </MessageList>
);

describe("Message runs", () => {
  it("rounds a lone bubble's four corners equally, whichever side it sits", async () => {
    for (const role of ["user", "assistant"] as const) {
      const host = await render(run(role, 1));
      const { "top-left": a, "top-right": b, "bottom-right": c, "bottom-left": d } = radii(bubbles(host)[0]!);
      expect([b, c, d]).toEqual([a, a, a]);
      expect(a).toBeGreaterThan(0);
    }
  });

  it("rounds the corners where a run of three meets less than its outer corners, with the run gap between them", async () => {
    const host = await render(run("assistant", 3));
    const [first, middle, last] = bubbles(host).map(radii) as [ReturnType<typeof radii>, ReturnType<typeof radii>, ReturnType<typeof radii>];
    const outer = first["top-left"];
    expect(first["top-right"]).toBe(outer);
    expect(first["bottom-right"]).toBe(outer);
    expect(first["bottom-left"]).toBeLessThan(outer);
    expect(middle["top-left"]).toBeLessThan(outer);
    expect(middle["bottom-left"]).toBe(middle["top-left"]);
    expect(middle["top-right"]).toBe(outer);
    expect(middle["bottom-right"]).toBe(outer);
    expect(last["top-left"]).toBeLessThan(outer);
    expect(last["bottom-left"]).toBe(outer);
    host.style.setProperty("--ouro-message-run-gap", "10px");
    await act(async () => undefined);
    const boxes = bubbles(host).map((bubble) => bubble.getBoundingClientRect());
    const gap = 10;
    expect(boxes[1]!.top - boxes[0]!.bottom).toBeCloseTo(gap, 0);
    expect(boxes[2]!.top - boxes[1]!.bottom).toBeCloseTo(gap, 0);
  });

  it("joins the user's own run on the end side, and mirrors it in right-to-left", async () => {
    const host = await render(run("user", 2), "rtl");
    const [first, last] = bubbles(host).map(radii) as [ReturnType<typeof radii>, ReturnType<typeof radii>];
    // The end side is the left in right-to-left.
    expect(first["bottom-left"]).toBeLessThan(first["bottom-right"]);
    expect(last["top-left"]).toBeLessThan(last["top-right"]);
    expect(first["top-left"]).toBe(first["top-right"]);
  });

  it("keeps its corners squircles", async () => {
    const host = await render(run("assistant", 2));
    for (const bubble of bubbles(host)) {
      if (CSS.supports("corner-shape", "squircle")) expect(getComputedStyle(bubble).getPropertyValue("corner-shape")).toContain("squircle");
    }
  });
});
