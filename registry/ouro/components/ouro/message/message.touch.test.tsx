import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import { Message } from "@/registry/ouro/components/ouro/message/message";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

// Runs in the `touch` project: Chromium as a 390x844 phone with a coarse pointer.

let root: Root | undefined;
const nodes: Element[] = [];
afterEach(async () => {
  await act(async () => root?.unmount());
  for (const node of nodes.splice(0)) node.remove();
});

it("shows a message's action bar after a tap, letting taps through until then, with targets at least 44px square to a finger", async () => {
  expect(matchMedia("(pointer: coarse)").matches).toBe(true);
  const host = document.createElement("div");
  document.body.append(host);
  nodes.push(host);
  root = createRoot(host);
  await act(async () =>
    root!.render(
      <div style={{ paddingTop: 48 }}>
        <Message variant="chat" role="assistant" name="Mara Quill" actions={[{ key: "like", label: "Like", icon: "👍", onClick: () => {} }]} menu={[{ label: "Copy link", onClick: () => {} }]}>
          Morning!
        </Message>
      </div>,
    ),
  );
  const message = host.querySelector<HTMLElement>('[data-ouro="message"]')!;
  const bar = message.querySelector<HTMLElement>('[role="toolbar"]')!;
  expect(getComputedStyle(bar).opacity).toBe("0");
  // Hidden, it lets taps through to what is under it.
  expect(getComputedStyle(bar).pointerEvents).toBe("none");
  await act(async () => void message.querySelector("[data-ouro-message-content]")!.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerType: "touch" })));
  await expect.poll(() => getComputedStyle(bar).opacity).toBe("1");
  expect(getComputedStyle(bar).pointerEvents).toBe("auto");
  const buttons = [...bar.querySelectorAll<HTMLElement>('[data-ouro-control="message"]')];
  expect(buttons).toHaveLength(2);
  for (const button of buttons) {
    const rect = button.querySelector<HTMLElement>("[data-ouro-touch-target]")!.getBoundingClientRect();
    expect(rect.height).toBeGreaterThanOrEqual(44);
    expect(rect.width).toBeGreaterThanOrEqual(44);
  }
});
