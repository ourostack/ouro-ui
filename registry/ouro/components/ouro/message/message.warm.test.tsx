import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { Message } from "@/registry/ouro/components/ouro/message/message";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

// Its own file, so Menu's code is not in the page until a bar asks for it.
const roots: Root[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await act(async () => root.unmount());
  document.body.replaceChildren();
});

/** The module addresses the page fetches from now on. */
function watchRequests() {
  const urls: string[] = [];
  const observer = new PerformanceObserver((list) => urls.push(...list.getEntries().map((entry) => entry.name)));
  observer.observe({ type: "resource" });
  return { menu: () => urls.some((url) => /\/components\/ouro\/menu\/menu\.tsx/.test(url)), stop: () => observer.disconnect() };
}

async function render(node: ReactNode) {
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
  return host;
}

const menu = [{ label: "Copy link", onClick: () => {} }];

describe("Message's menu code", () => {
  it("is not fetched for a bar without a menu", async () => {
    const requests = watchRequests();
    const host = await render(
      <Message variant="chat" role="assistant" name="Mara Quill" actions={[{ key: "like", label: "Like", icon: "♥", onClick: () => {} }]}>
        Morning!
      </Message>,
    );
    await expect.poll(() => host.querySelector('[role="toolbar"]')).not.toBeNull();
    await act(() => new Promise((resolve) => setTimeout(resolve, 100)));
    expect(requests.menu()).toBe(false);
    requests.stop();
  });

  it("is fetched as a bar with a menu mounts, before anyone presses its button", async () => {
    const requests = watchRequests();
    await render(
      <Message variant="chat" role="assistant" name="Mara Quill" menu={menu}>
        Morning!
      </Message>,
    );
    await expect.poll(requests.menu).toBe(true);
    expect(page.getByRole("menu").query()).toBeNull();
    requests.stop();
  });
});
