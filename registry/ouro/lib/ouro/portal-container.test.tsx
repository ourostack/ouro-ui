import { Popover } from "@base-ui/react/popover";
import { createRef, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { OuroProvider } from "@/registry/ouro/lib/ouro/ouro-provider";
import { PortalScope, usePortalContainer } from "@/registry/ouro/lib/ouro/portal-container";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

// A floating layer as Ouro UI's own are built: its Portal takes usePortalContainer's props,
// and what renders inside it sits in a PortalScope.
function Layer({ name, children }: { name: string; children?: ReactNode }) {
  const portal = usePortalContainer("Layer");
  return (
    <Popover.Root defaultOpen>
      <Popover.Trigger>{`Open ${name}`}</Popover.Trigger>
      <Popover.Portal {...portal} data-layer={name}>
        <PortalScope>
          <Popover.Positioner>
            <Popover.Popup aria-label={name}>
              {name}
              {children}
            </Popover.Popup>
          </Popover.Positioner>
        </PortalScope>
      </Popover.Portal>
    </Popover.Root>
  );
}

const roots: Root[] = [];
let warn: MockInstance<typeof console.warn>;

beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(async () => {
  for (const root of roots.splice(0)) await act(async () => root.unmount());
  document.body.replaceChildren();
  warn.mockRestore();
});

/** Renders `node` into a fresh element appended to `parent`. */
async function render(node: ReactNode, parent: Element = document.body) {
  const host = parent.appendChild(document.createElement("div"));
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
  return host;
}

/** A page with a main landmark, and the element inside it popups render into. */
function page() {
  const main = document.body.appendChild(document.createElement("main"));
  const popups = main.appendChild(document.createElement("div"));
  return { main, popups };
}

const portalOf = (name: string) => document.querySelector(`[data-layer="${name}"]`)!;

describe("usePortalContainer", () => {
  it("leaves a popup at the end of <body>, Base UI's default, without a portalContainer", async () => {
    await render(<Layer name="Tags" />);
    expect(portalOf("Tags").parentElement).toBe(document.body);
  });

  it("renders a popup into OuroProvider's portalContainer, given as an element", async () => {
    const { popups } = page();
    await render(
      <OuroProvider portalContainer={popups}>
        <Layer name="Tags" />
      </OuroProvider>,
    );
    expect(portalOf("Tags").parentElement).toBe(popups);
  });

  it("renders a popup into OuroProvider's portalContainer, given as a ref", async () => {
    const { popups } = page();
    const ref = createRef<HTMLElement>();
    ref.current = popups;
    await render(
      <OuroProvider portalContainer={ref}>
        <Layer name="Tags" />
      </OuroProvider>,
    );
    expect(portalOf("Tags").parentElement).toBe(popups);
  });

  it("keeps the portalContainer of an outer OuroProvider inside one that does not set it", async () => {
    const { popups } = page();
    await render(
      <OuroProvider portalContainer={popups}>
        <OuroProvider>
          <Layer name="Tags" />
        </OuroProvider>
      </OuroProvider>,
    );
    expect(portalOf("Tags").parentElement).toBe(popups);
  });

  it("renders a popup opened from inside another popup into that popup's portal, not the portalContainer", async () => {
    const { popups } = page();
    await render(
      <OuroProvider portalContainer={popups}>
        <Layer name="Outer">
          <Layer name="Inner" />
        </Layer>
      </OuroProvider>,
    );
    expect(portalOf("Outer").parentElement).toBe(popups);
    expect(portalOf("Inner").parentElement).toBe(portalOf("Outer"));
  });

  it("warns once, in development, when a popup opens outside every landmark of a page that has a main", async () => {
    page();
    await render(
      <>
        <Layer name="Tags" />
        <Layer name="Sort" />
      </>,
    );
    expect(warn.mock.calls).toEqual([
      [
        "[ouro-ui] Layer: the open popup renders outside every landmark, so screen reader users who move by landmark miss it. Fix: <OuroProvider portalContainer={popups}> around the app, with <div ref={popups} /> inside <main>.",
      ],
    ]);
  });

  it("does not warn on a page without a main, or for a popup inside a landmark", async () => {
    await render(<Layer name="Tags" />);
    const { popups } = page();
    await render(
      <OuroProvider portalContainer={popups}>
        <Layer name="Sort" />
      </OuroProvider>,
    );
    const nav = document.body.appendChild(document.createElement("nav"));
    await render(
      <OuroProvider portalContainer={nav}>
        <Layer name="Filter" />
      </OuroProvider>,
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it("does not warn for a popup inside a dialog or another popup", async () => {
    page();
    const dialog = document.body.appendChild(document.createElement("div"));
    dialog.setAttribute("role", "dialog");
    await render(
      <OuroProvider portalContainer={dialog}>
        <Layer name="Outer">
          <Layer name="Inner" />
        </Layer>
      </OuroProvider>,
    );
    expect(warn).not.toHaveBeenCalled();
  });
});
