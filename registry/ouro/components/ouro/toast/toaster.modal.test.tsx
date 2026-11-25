import { useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { Popover } from "@/registry/ouro/components/ouro/popover/popover";
import { OuroProvider } from "@/registry/ouro/lib/ouro/ouro-provider";
import { Toaster } from "@/registry/ouro/components/ouro/toast/toaster";
import { toast } from "@/registry/ouro/lib/ouro/toast";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { pressTab } from "@/registry/ouro/lib/ouro/testing/tab";

let root: Root | undefined;

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.replaceChildren();
});

describe("Toaster beside a modal", () => {
  it("stays in the accessibility tree while a modal popover is open, so its Undo button can be reached", async () => {
    function Example({ open }: { open: boolean }) {
      const anchor = useRef<HTMLButtonElement>(null);
      return (
        <>
          <button ref={anchor}>Anchor</button>
          <Toaster />
          <Popover title="Go to date" open={open} onOpenChange={() => {}} anchor={anchor} presentation="popover">
            <button>Pick</button>
          </Popover>
        </>
      );
    }
    const host = document.body.appendChild(document.createElement("div"));
    root = createRoot(host);
    await act(async () => root!.render(<Example open={false} />));
    await act(async () => void toast("Event deleted", { duration: 0, action: { label: "Undo", onClick: () => {} } }));
    await expect.element(page.getByRole("button", { name: "Undo" })).toBeVisible();
    await act(async () => root!.render(<Example open />));
    await expect.element(page.getByRole("button", { name: "Pick" })).toBeVisible();
    // getByRole leaves out what aria-hidden or inert hides, as a screen reader's tree does.
    await expect.element(page.getByRole("button", { name: "Undo" })).toBeVisible();
    expect(document.querySelector('[data-ouro="toaster"]')?.closest('[aria-hidden="true"], [inert]')).toBeNull();
  });

  for (const modal of [false, true]) {
    it(`reaches Undo from the keyboard ${modal ? "while a modal popover is open" : "with no modal open"}, by Tab`, async () => {
      function Example() {
        const anchor = useRef<HTMLButtonElement>(null);
        return (
          <>
            <button ref={anchor}>Anchor</button>
            <Toaster />
            {modal ? (
              <Popover title="Go to date" open onOpenChange={() => {}} anchor={anchor} presentation="popover">
                <button>Pick</button>
              </Popover>
            ) : null}
          </>
        );
      }
      const host = document.body.appendChild(document.createElement("div"));
      root = createRoot(host);
      await act(async () => root!.render(<Example />));
      await act(async () => void toast("Event deleted", { duration: 0, action: { label: "Undo", onClick: () => {} } }));
      await expect.element(page.getByRole("button", { name: "Undo" })).toBeVisible();
      const seen: string[] = [];
      for (let press = 0; press < 12 && document.activeElement?.textContent !== "Undo"; press++) {
        await pressTab();
        seen.push(document.activeElement?.textContent ?? document.activeElement?.tagName ?? "");
      }
      expect(seen).toContain("Undo");
      if (modal) {
        // Past the last toast control Tab returns to the dialog, and Shift+Tab from its first control comes back to the toast.
        for (let press = 0; press < 4 && document.activeElement?.closest('[data-ouro="toaster"]'); press++) await pressTab();
        expect(document.activeElement?.closest('[role="dialog"][data-open]:not([data-ouro="toast"])')).not.toBeNull();
        await pressTab({ shift: true });
        expect(document.activeElement?.closest('[data-ouro="toaster"]')).not.toBeNull();
      }
    });
  }

  it("hands Tab to Undo from a modal popover whose app and popup share one container, and keeps Tab in the popover", async () => {
    const host = document.body.appendChild(document.createElement("div"));
    function Example() {
      const anchor = useRef<HTMLButtonElement>(null);
      return (
        <OuroProvider portalContainer={host}>
          <button ref={anchor}>Anchor</button>
          <Toaster />
          <Popover title="Go to date" open onOpenChange={() => {}} anchor={anchor} presentation="popover">
            <button>Pick</button>
          </Popover>
        </OuroProvider>
      );
    }
    root = createRoot(host);
    await act(async () => root!.render(<Example />));
    await act(async () => void toast("Event deleted", { duration: 0, action: { label: "Undo", onClick: () => {} } }));
    await expect.element(page.getByRole("button", { name: "Undo" })).toBeVisible();
    const inPopover = () => document.activeElement?.closest('[role="dialog"][data-open]:not([data-ouro="toast"])') != null;
    const inToast = () => document.activeElement?.closest('[data-ouro="toaster"]') != null;
    (page.getByRole("button", { name: "Pick" }).element() as HTMLElement).focus();
    const visited: string[] = [];
    for (let press = 0; press < 12 && document.activeElement?.textContent !== "Undo"; press++) {
      await pressTab();
      visited.push(inPopover() ? "popover" : inToast() ? "toast" : `page:${document.activeElement?.tagName}`);
    }
    expect(visited.filter((where) => where.startsWith("page"))).toEqual([]);
    expect(document.activeElement?.textContent).toBe("Undo");
  });

  it("leaves Tab alone in a popover that is not modal", async () => {
    function Example() {
      const anchor = useRef<HTMLButtonElement>(null);
      return (
        <>
          <button ref={anchor}>Anchor</button>
          <Toaster />
          <Popover title="Pick a day" open onOpenChange={() => {}} anchor={anchor} presentation="popover" modal={false}>
            <button>Pick</button>
          </Popover>
        </>
      );
    }
    const host = document.body.appendChild(document.createElement("div"));
    root = createRoot(host);
    await act(async () => root!.render(<Example />));
    await act(async () => void toast("Event deleted", { duration: 0, action: { label: "Undo", onClick: () => {} } }));
    await expect.element(page.getByRole("button", { name: "Undo" })).toBeVisible();
    const pick = page.getByRole("button", { name: "Pick" }).element() as HTMLElement;
    pick.focus();
    await pressTab();
    expect(document.activeElement?.closest('[data-ouro="toaster"]')).toBeNull();
  });
});
