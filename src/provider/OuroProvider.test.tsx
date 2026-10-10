import { MotionConfigContext } from "motion/react";
import { useContext, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { OuroProvider, useOuro, type OuroLinkComponent } from "./OuroProvider.tsx";
import { act } from "../../test/act.ts";


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

  it("sets Motion's reducedMotion to user", async () => {
    function Reader() {
      return <output>{useContext(MotionConfigContext).reducedMotion}</output>;
    }
    const container = await mount(
      <OuroProvider>
        <Reader />
      </OuroProvider>,
    );
    expect(container.querySelector("output")?.textContent).toBe("user");
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
