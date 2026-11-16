import { DirectionProvider, useDirection } from "@base-ui/react/direction-provider";
import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { PageDirection } from "@/registry/ouro/lib/ouro/page-direction";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

const roots: Root[] = [];
const hosts: HTMLElement[] = [];

function Shown({ id }: { id: string }) {
  return <output data-testid={id}>{useDirection()}</output>;
}

async function render(node: ReactNode) {
  const host = document.createElement("div");
  document.body.append(host);
  hosts.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
  return { host, root };
}

const shown = (id: string) => document.querySelector(`[data-testid="${id}"]`)?.textContent;

afterEach(async () => {
  document.documentElement.removeAttribute("dir");
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  for (const host of hosts.splice(0)) host.remove();
});

describe("PageDirection", () => {
  it("gives its parts the page's direction, and follows the page when its dir changes", async () => {
    document.documentElement.dir = "rtl";
    const first = await render(
      <PageDirection>
        <Shown id="a" />
      </PageDirection>,
    );
    await render(
      <PageDirection>
        <Shown id="b" />
      </PageDirection>,
    );
    expect([shown("a"), shown("b")]).toEqual(["rtl", "rtl"]);
    await act(async () => void (document.documentElement.dir = "ltr"));
    await expect.poll(() => [shown("a"), shown("b")]).toEqual(["ltr", "ltr"]);
    // One component gone, the other still follows the page.
    await act(async () => first.root.unmount());
    await act(async () => void (document.documentElement.dir = "RTL"));
    await expect.poll(() => shown("b")).toBe("rtl");
  });

  it("leaves an app's own direction in a left-to-right page, and renders left to right on the server", async () => {
    await render(
      <DirectionProvider direction="rtl">
        <PageDirection>
          <Shown id="own" />
        </PageDirection>
      </DirectionProvider>,
    );
    expect(shown("own")).toBe("rtl");
    document.documentElement.dir = "rtl";
    expect(
      renderToString(
        <PageDirection>
          <Shown id="server" />
        </PageDirection>,
      ),
    ).toContain(">ltr<");
  });
});
