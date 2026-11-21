import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Link } from "@/registry/ouro/components/ouro/link/link";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

const roots: Root[] = [];
const nodes: Element[] = [];

afterEach(async () => {
  for (const root of roots.splice(0)) await act(async () => root.unmount());
  for (const node of nodes.splice(0)) node.remove();
});

describe("Link prefetch", () => {
  it("prefetches an internal link on intent, and never an external, download or reloadDocument one", async () => {
    const prefetch = vi.fn();
    const onFocus = vi.fn();
    const own = { onPointerEnter: vi.fn(), onPointerLeave: vi.fn(), onTouchStart: vi.fn() };
    const host = document.createElement("div");
    document.body.append(host);
    nodes.push(host);
    const root = createRoot(host);
    roots.push(root);
    await act(async () =>
      root.render(
        <>
          <Link href="/recipes" prefetch={prefetch} onFocus={onFocus} {...own}>
            Recipes
          </Link>
          <Link href="https://ouro.bot" prefetch={prefetch}>
            Site
          </Link>
          <Link href="/out" external prefetch={prefetch}>
            Out
          </Link>
          <Link href="/feed.xml" reloadDocument prefetch={prefetch}>
            Feed
          </Link>
          <Link href="/file.pdf" download prefetch={prefetch}>
            File
          </Link>
        </>,
      ),
    );
    const links = [...host.querySelectorAll("a")];
    for (const link of links.slice(1)) await act(async () => link.dispatchEvent(new Event("touchstart", { bubbles: true })));
    expect(prefetch).not.toHaveBeenCalled();
    await act(async () => links[0]!.dispatchEvent(new Event("touchstart", { bubbles: true })));
    expect(prefetch).toHaveBeenCalledExactlyOnceWith("/recipes");
    await act(async () => links[0]!.dispatchEvent(new FocusEvent("focusin", { bubbles: true })));
    expect(onFocus).toHaveBeenCalledOnce();
    await act(async () => links[0]!.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType: "mouse", relatedTarget: null })));
    await act(async () => links[0]!.dispatchEvent(new PointerEvent("pointerout", { bubbles: true, pointerType: "mouse", relatedTarget: null })));
    expect(own.onPointerEnter).toHaveBeenCalledOnce();
    expect(own.onPointerLeave).toHaveBeenCalledOnce();
    expect(own.onTouchStart).toHaveBeenCalledOnce();
  });

  it("takes a pointer leaving a link that has no handlers of its own", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    nodes.push(host);
    const root = createRoot(host);
    roots.push(root);
    await act(async () => root.render(<Link href="/recipes">Recipes</Link>));
    const link = host.querySelector("a")!;
    await act(async () => link.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType: "mouse", relatedTarget: null })));
    await act(async () => link.dispatchEvent(new PointerEvent("pointerout", { bubbles: true, pointerType: "mouse", relatedTarget: null })));
    expect(link.isConnected).toBe(true);
  });
});
