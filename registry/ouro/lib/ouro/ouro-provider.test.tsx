import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { OuroProvider, type OuroLinkComponent } from "@/registry/ouro/lib/ouro/ouro-provider";
import { useOuro } from "@/registry/ouro/lib/ouro/use-ouro";
import { act } from "@/registry/ouro/lib/ouro/testing/act";


afterEach(() => document.body.replaceChildren());

async function mount(node: ReactNode) {
  const container = document.body.appendChild(document.createElement("div"));
  const root = createRoot(container);
  await act(async () => root.render(node));
  return container;
}

function Link() {
  const { linkComponent: LinkComponent } = useOuro();
  return (
    <LinkComponent href="/recipes" className="mt-2">
      Recipes
    </LinkComponent>
  );
}

describe("OuroProvider and useOuro", () => {
  it("defaults to a plain anchor without a provider", async () => {
    const container = await mount(<Link />);
    const anchor = container.querySelector("a");
    expect(anchor?.getAttribute("href")).toBe("/recipes");
    expect(anchor?.className).toBe("mt-2");
    expect(anchor?.textContent).toBe("Recipes");
  });

  it("defaults to a plain anchor inside a provider with no linkComponent", async () => {
    const container = await mount(
      <OuroProvider>
        <Link />
      </OuroProvider>,
    );
    expect(container.querySelector("a")?.getAttribute("href")).toBe("/recipes");
  });

  it("supplies a custom linkComponent, including a ref", async () => {
    let received: HTMLAnchorElement | null = null;
    const RouterLink: OuroLinkComponent = ({ ref, ...props }) => (
      <a
        {...props}
        data-router
        ref={(node) => {
          received = node;
          if (typeof ref === "function") ref(node);
        }}
      />
    );
    const container = await mount(
      <OuroProvider linkComponent={RouterLink}>
        <Link />
      </OuroProvider>,
    );
    expect(container.querySelector("a[data-router]")).not.toBeNull();
    expect(received).toBe(container.querySelector("a"));
  });

  it("gives its portalContainer to what it wraps, keeps an outer one when it sets none, and drops it when it sets null", async () => {
    const popups = document.body.appendChild(document.createElement("div"));
    const seen: unknown[] = [];
    function Read() {
      seen.push(useOuro().portalContainer);
      return null;
    }
    await mount(
      <>
        <Read />
        <OuroProvider portalContainer={popups}>
          <Read />
          <OuroProvider>
            <Read />
            <OuroProvider portalContainer={null}>
              <Read />
            </OuroProvider>
          </OuroProvider>
        </OuroProvider>
      </>,
    );
    expect(seen).toEqual([undefined, popups, popups, undefined]);
  });

  it("renders on the server without a crash", () => {
    const html = renderToString(
      <OuroProvider>
        <Link />
      </OuroProvider>,
    );
    expect(html).toBe('<a href="/recipes" class="mt-2">Recipes</a>');
  });
});

describe("OuroProvider quiet", () => {
  function Quiet({ id }: { id: string }) {
    return <output data-testid={id}>{String(useOuro().quiet === true)}</output>;
  }
  const marked = () => document.documentElement.hasAttribute("data-ouro-quiet");
  const read = (container: Element, id: string) => container.querySelector(`[data-testid="${id}"]`)!.textContent;

  it("tells components the person asked for less, and marks the page while it is on", async () => {
    const container = document.body.appendChild(document.createElement("div"));
    const root = createRoot(container);
    await act(async () => root.render(<Quiet id="none" />));
    expect(read(container, "none")).toBe("false");
    expect(marked()).toBe(false);
    await act(async () => root.render(<OuroProvider quiet><Quiet id="on" /></OuroProvider>));
    expect(read(container, "on")).toBe("true");
    expect(document.documentElement.getAttribute("data-ouro-quiet")).toBe("");
    await act(async () => root.render(<OuroProvider quiet={false}><Quiet id="off" /></OuroProvider>));
    expect(read(container, "off")).toBe("false");
    expect(marked()).toBe(false);
    await act(async () => root.render(<OuroProvider quiet><Quiet id="again" /></OuroProvider>));
    expect(marked()).toBe(true);
    await act(async () => root.unmount());
    expect(marked()).toBe(false);
  });

  it("keeps an outer provider's quiet inside one that sets none, and lets an inner one turn it off", async () => {
    const container = document.body.appendChild(document.createElement("div"));
    const root = createRoot(container);
    await act(async () =>
      root.render(
        <OuroProvider quiet>
          <OuroProvider>
            <Quiet id="inherited" />
          </OuroProvider>
          <OuroProvider quiet={false}>
            <Quiet id="off" />
          </OuroProvider>
        </OuroProvider>,
      ),
    );
    expect(read(container, "inherited")).toBe("true");
    expect(read(container, "off")).toBe("false");
    await act(async () => root.unmount());
    expect(marked()).toBe(false);
  });

  it("keeps the page marked until the last quiet provider goes", async () => {
    const first = document.body.appendChild(document.createElement("div"));
    const second = document.body.appendChild(document.createElement("div"));
    const [a, b] = [createRoot(first), createRoot(second)];
    await act(async () => a.render(<OuroProvider quiet><Quiet id="a" /></OuroProvider>));
    await act(async () => b.render(<OuroProvider quiet><Quiet id="b" /></OuroProvider>));
    await act(async () => a.unmount());
    expect(marked()).toBe(true);
    await act(async () => b.unmount());
    expect(marked()).toBe(false);
  });

  it("hides what an app marks with data-ouro-quiet-hide, with the rule its docs give", async () => {
    const style = document.head.appendChild(document.createElement("style"));
    style.textContent = "[data-ouro-quiet] [data-ouro-quiet-hide] { display: none; }";
    const container = document.body.appendChild(document.createElement("div"));
    const root = createRoot(container);
    try {
      await act(async () => root.render(<OuroProvider quiet><span data-ouro-quiet-hide="">Riders</span></OuroProvider>));
      expect(getComputedStyle(container.querySelector("span")!).display).toBe("none");
      await act(async () => root.render(<OuroProvider><span data-ouro-quiet-hide="">Riders</span></OuroProvider>));
      expect(getComputedStyle(container.querySelector("span")!).display).toBe("inline");
    } finally {
      await act(async () => root.unmount());
      style.remove();
    }
  });
});
