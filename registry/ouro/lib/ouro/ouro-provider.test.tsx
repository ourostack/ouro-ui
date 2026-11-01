import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { commands } from "vitest/browser";
import { OuroProvider, type OuroLinkComponent } from "@/registry/ouro/lib/ouro/ouro-provider";
import { useOuro, useReducedMotion } from "@/registry/ouro/lib/ouro/use-ouro";
import { act } from "@/registry/ouro/lib/ouro/testing/act";


const roots: ReturnType<typeof createRoot>[] = [];
afterEach(async () => {
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  document.body.replaceChildren();
  vi.restoreAllMocks();
  await commands.emulateMedia({ reducedMotion: "no-preference" });
});

async function mount(node: ReactNode) {
  const container = document.body.appendChild(document.createElement("div"));
  const root = createRoot(container);
  roots.push(root);
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

describe("OuroProvider motion", () => {
  function Reduced({ id }: { id: string }) {
    return <output id={id}>{String(useReducedMotion())}</output>;
  }
  const answers = () => [...document.querySelectorAll("output")].map((output) => `${output.id}:${output.textContent}`);
  const settings = (
    <>
      <Reduced id="none" />
      <OuroProvider motion="system">
        <Reduced id="system" />
      </OuroProvider>
      <OuroProvider motion="reduced">
        <Reduced id="reduced" />
      </OuroProvider>
      <OuroProvider motion="full">
        <Reduced id="full" />
      </OuroProvider>
    </>
  );

  it("answers useReducedMotion by its motion, and by the device under system or no provider", async () => {
    await mount(settings);
    expect(answers()).toEqual(["none:false", "system:false", "reduced:true", "full:false"]);
    await commands.emulateMedia({ reducedMotion: "reduce" });
    await expect.poll(answers).toEqual(["none:true", "system:true", "reduced:true", "full:false"]);
  });

  it("marks its children's element with data-motion, adding no box, and adds no element without motion", async () => {
    const container = await mount(settings);
    const marked = [...container.querySelectorAll<HTMLElement>("[data-motion]")];
    expect(marked.map((element) => element.getAttribute("data-motion"))).toEqual(["system", "reduced", "full"]);
    for (const element of marked) expect(getComputedStyle(element).display).toBe("contents");
    expect(marked.map((element) => element.querySelector("output")!.id)).toEqual(["system", "reduced", "full"]);
    const plain = await mount(
      <OuroProvider>
        <Reduced id="plain" />
      </OuroProvider>,
    );
    expect(plain.firstElementChild!.tagName).toBe("OUTPUT");
  });

  it("keeps an outer provider's motion inside one that sets none", async () => {
    await mount(
      <OuroProvider motion="reduced">
        <OuroProvider>
          <Reduced id="inherited" />
        </OuroProvider>
        <OuroProvider motion="full">
          <Reduced id="overridden" />
        </OuroProvider>
      </OuroProvider>,
    );
    expect(answers()).toEqual(["inherited:true", "overridden:false"]);
  });

  it("ends CSS transitions at once under reduced, in a portal too, but not inside a provider set to full", async () => {
    const moving = "transition: opacity 1s, translate 1s; animation: none 2s";
    const container = await mount(
      <OuroProvider motion="reduced">
        <p id="inside" style={{ transition: "opacity 1s, translate 1s" }} />
        {createPortal(<p id="portal" style={{ transition: "opacity 1s" }} />, document.body)}
        <OuroProvider motion="full">
          <p id="full" style={{ transition: "opacity 1s" }} />
        </OuroProvider>
      </OuroProvider>,
    );
    const duration = (id: string) => getComputedStyle(document.getElementById(id)!).transitionDuration;
    expect([duration("inside"), duration("portal"), duration("full")]).toEqual(["0s, 0s", "0s", "1s"]);
    const elsewhere = document.body.appendChild(document.createElement("p"));
    elsewhere.style.cssText = moving;
    expect(getComputedStyle(elsewhere).animationDuration).toBe("0s");
    expect(getComputedStyle(elsewhere).scrollBehavior).toBe("auto");
    // Gone with the provider: the page moves again.
    await act(async () => roots.splice(0).forEach((root) => root.unmount()));
    expect(getComputedStyle(elsewhere).transitionDuration).toBe("1s, 1s");
    expect(container.querySelector("style")).toBeNull();
  });

  it("warns of a motion that is not a setting, and follows the device", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const props = { motion: "still", children: <Reduced id="unknown" /> } as unknown as Parameters<typeof OuroProvider>[0];
    await mount(<OuroProvider {...props} />);
    expect(warn).toHaveBeenCalledWith('[ouro-ui] OuroProvider: motion="still" is not a setting; use "system", "reduced" or "full". Fix: <OuroProvider motion="reduced">.');
    expect(answers()).toEqual(["unknown:false"]);
    expect(document.querySelector("[data-motion]")!.getAttribute("data-motion")).toBe("system");
    await commands.emulateMedia({ reducedMotion: "reduce" });
    await expect.poll(answers).toEqual(["unknown:true"]);
  });

  it("renders its setting on the server", () => {
    const html = renderToString(
      <OuroProvider motion="reduced">
        <Link />
      </OuroProvider>,
    );
    expect(html).toContain('data-motion="reduced"');
    expect(html).toContain("transition-duration: 0s !important");
  });
});
