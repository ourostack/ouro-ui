import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { UnreadDot } from "@/registry/ouro/components/ouro/unread-dot/unread-dot";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

const roots: Root[] = [];
const hosts: HTMLElement[] = [];

async function render(node: React.ReactNode) {
  const host = document.createElement("div");
  document.body.append(host);
  hosts.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
  return host;
}

afterEach(async () => {
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  hosts.splice(0).forEach((host) => host.remove());
});

describe("UnreadDot", () => {
  it("keeps its fixed sizes at a compact --spacing", async () => {
    const host = await render(<UnreadDot label="Unread" data-mark="" />);
    const dot = () => getComputedStyle(host.querySelector<HTMLElement>('[data-ouro="unread-dot"] > span[aria-hidden="true"]')!);
    expect([dot().width, dot().height]).toEqual(["8px", "8px"]);
    host.style.setProperty("--spacing", "0.2rem");
    expect([dot().width, dot().height]).toEqual(["8px", "8px"]);
  });
  it("draws a round primary dot that screen readers hear as its label", async () => {
    const host = await render(<UnreadDot label="Unread" data-mark="" />);
    const root = host.querySelector<HTMLElement>('[data-ouro="unread-dot"]')!;
    expect(root.hasAttribute("data-mark")).toBe(true);
    expect(root.textContent).toBe("Unread");
    const dot = root.querySelector<HTMLElement>('[aria-hidden="true"]')!;
    const box = dot.getBoundingClientRect();
    expect(box.width).toBe(8);
    expect(box.height).toBe(8);
    expect(getComputedStyle(dot).borderRadius).not.toBe("0px");
    expect(getComputedStyle(dot).backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
  });

  it("draws nothing but its spoken label when a mark takes its place", async () => {
    const host = await render(<UnreadDot label="Non lu" dot={false} />);
    const root = host.querySelector<HTMLElement>('[data-ouro="unread-dot"]')!;
    expect(root.textContent).toBe("Non lu");
    expect(root.querySelector('[aria-hidden="true"]')).toBeNull();
    expect(root.className).toContain("sr-only");
  });

  it("takes layout classes from the app", async () => {
    const host = await render(<UnreadDot label="Unread" className="ms-2" />);
    expect(host.querySelector('[data-ouro="unread-dot"]')!.className).toContain("ms-2");
  });
});
