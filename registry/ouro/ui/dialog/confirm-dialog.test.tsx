import { useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { Button } from "@/registry/ouro/ui/button/button";
import { ConfirmDialog, type ConfirmDialogProps } from "@/registry/ouro/ui/dialog/confirm-dialog";
import { act } from "@/registry/ouro/testing/act";

// Runs in Chromium and WebKit.


const FIX =
  "Pass trigger={<Button>…</Button>} for an uncontrolled confirmation, or open and onOpenChange to control it.";

const roots: Root[] = [];
let mounted: Element[] = [];

async function render(node: ReactNode) {
  const host = document.createElement("div");
  document.body.append(host);
  mounted.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
}

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(async () => {
  await page.viewport(1280, 800);
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(async () => {
  vi.restoreAllMocks();
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  for (const node of mounted) node.remove();
  mounted = [];
});

const popup = () => document.querySelector<HTMLElement>('[data-ouro="dialog"]');
const trigger = () => document.querySelector<HTMLElement>('[data-ouro="button"]')!;
const button = (name: string) => page.getByRole("alertdialog").getByRole("button", { name });

async function settled() {
  await expect
    .poll(
      () => {
        const element = popup();
        return Boolean(element && !element.hasAttribute("data-starting-style") && element.getAnimations().length === 0);
      },
      { timeout: 3000, interval: 50 },
    )
    .toBe(true);
}

async function open(props: Partial<ConfirmDialogProps> = {}) {
  await render(
    <ConfirmDialog
      title="Delete recipe?"
      description="This can't be undone."
      confirmLabel="Delete"
      onConfirm={() => {}}
      trigger={<Button>Delete</Button>}
      {...(props as object)}
    />,
  );
  await userEvent.click(trigger());
  await settled();
  return popup()!;
}

const deferred = () => {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe("ConfirmDialog", () => {
  it("is an alert dialog named by its title and described by its description", async () => {
    const element = await open();
    await expect.element(page.getByRole("alertdialog", { name: "Delete recipe?" })).toBeVisible();
    const describedBy = element.getAttribute("aria-describedby")!;
    expect(document.getElementById(describedBy)!.textContent).toBe("This can't be undone.");
  });

  it("gives Cancel focus on open", async () => {
    await open();
    expect(document.activeElement).toBe(button("Cancel").element());
  });

  it("does not close on an outside press", async () => {
    await open();
    await userEvent.click(document.body, { position: { x: 10, y: 10 } });
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(popup()).not.toBeNull();
  });

  it("closes from Cancel without confirming, and takes cancelLabel", async () => {
    const onConfirm = vi.fn();
    await open({ onConfirm, cancelLabel: "Keep it" });
    await userEvent.click(button("Keep it"));
    await expect.poll(() => popup(), { timeout: 3000 }).toBeNull();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("closes right away when onConfirm returns nothing", async () => {
    const onConfirm = vi.fn();
    await open({ onConfirm });
    await userEvent.click(button("Delete"));
    expect(onConfirm).toHaveBeenCalledOnce();
    await expect.poll(() => popup(), { timeout: 3000 }).toBeNull();
  });

  it("shows aria-busy on confirm while the promise is pending, then closes when it resolves", async () => {
    await open({ onConfirm: () => new Promise((resolve) => setTimeout(resolve, 50)) });
    await userEvent.click(button("Delete"));
    expect(button("Delete").element().getAttribute("aria-busy")).toBe("true");
    expect(popup()).not.toBeNull();
    await expect.poll(() => popup(), { timeout: 3000 }).toBeNull();
  });

  it("stays open when the promise rejects, clears busy, and warns with the error", async () => {
    const pending = deferred();
    await open({ onConfirm: () => pending.promise });
    await userEvent.click(button("Delete"));
    await act(async () => pending.reject(new Error("Network down")));
    await expect.poll(() => button("Delete").element().hasAttribute("aria-busy")).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(popup()).not.toBeNull();
    expect(warn).toHaveBeenCalledWith(
      '[ouro-ui] ConfirmDialog: onConfirm rejected with "Network down", so the dialog stayed open. Fix: onConfirm={() => remove().catch((error) => { setError(error.message); throw error; })} description={error}.',
    );
  });

  it("warns with a rejection that is not an Error", async () => {
    await open({ onConfirm: () => Promise.reject("offline") });
    await userEvent.click(button("Delete"));
    await expect.poll(() => warn.mock.calls.length).toBe(1);
    expect(String(warn.mock.calls[0]![0])).toContain('onConfirm rejected with "offline"');
  });

  it("ignores a promise that settles after the user cancelled", async () => {
    const first = deferred();
    const onOpenChange = vi.fn();
    function Controlled() {
      const [openState, setOpen] = useState(true);
      return (
        <ConfirmDialog
          title="Delete recipe?"
          confirmLabel="Delete"
          onConfirm={() => first.promise}
          open={openState}
          onOpenChange={(next) => {
            onOpenChange(next);
            setOpen(next);
          }}
        />
      );
    }
    await render(<Controlled />);
    await settled();
    await userEvent.click(button("Delete"));
    await userEvent.click(button("Cancel"));
    await expect.poll(() => popup(), { timeout: 3000 }).toBeNull();
    await act(async () => first.resolve());
    expect(onOpenChange.mock.calls).toEqual([[false]]);
  });

  it("keeps a newer confirm busy when an older attempt rejects after the user left it", async () => {
    const first = deferred();
    const second = deferred();
    const onConfirm = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    await open({ onConfirm });
    await userEvent.click(button("Delete"));
    await userEvent.keyboard("{Escape}");
    await expect.poll(() => popup(), { timeout: 3000 }).toBeNull();
    await userEvent.click(trigger());
    await settled();
    await userEvent.click(button("Delete"));
    expect(button("Delete").element().getAttribute("aria-busy")).toBe("true");
    await act(() => first.reject(new Error("first failed")));
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(button("Delete").element().getAttribute("aria-busy")).toBe("true");
    expect(warn).toHaveBeenCalledWith(
      '[ouro-ui] ConfirmDialog: onConfirm rejected with "first failed" after the user had left that confirmation. Fix: onConfirm={() => remove().catch((error) => { setError(error.message); throw error; })} description={error}.',
    );
    await act(() => second.resolve());
    await expect.poll(() => popup(), { timeout: 3000 }).toBeNull();
  });

  it("treats a synchronous throw from onConfirm like a rejection: stays open and warns", async () => {
    const windowErrors: string[] = [];
    const onError = (event: ErrorEvent) => windowErrors.push(event.message);
    window.addEventListener("error", onError);
    await open({
      onConfirm: () => {
        throw new Error("sync boom");
      },
    });
    await userEvent.click(button("Delete"));
    await expect.poll(() => warn.mock.calls.length).toBe(1);
    window.removeEventListener("error", onError);
    expect(String(warn.mock.calls[0]![0])).toContain('onConfirm rejected with "sync boom", so the dialog stayed open');
    expect(popup()).not.toBeNull();
    expect(button("Delete").element().hasAttribute("aria-busy")).toBe(false);
    expect(windowErrors).toEqual([]);
  });

  it("closes a controlled confirmation through onOpenChange when the promise resolves", async () => {
    const onOpenChange = vi.fn();
    await render(
      <ConfirmDialog
        title="Delete recipe?"
        confirmLabel="Delete"
        onConfirm={() => Promise.resolve()}
        open
        onOpenChange={onOpenChange}
      />,
    );
    await settled();
    await userEvent.click(button("Delete"));
    await expect.poll(() => onOpenChange.mock.calls).toEqual([[false]]);
  });

  it('gives the confirm button data-tone="destructive" with tone="destructive", and primary by default', async () => {
    await open({ tone: "destructive" });
    expect(button("Delete").element().getAttribute("data-tone")).toBe("destructive");
    await act(async () => roots.splice(0).forEach((root) => root.unmount()));
    await open();
    expect(button("Delete").element().getAttribute("data-tone")).toBe("primary");
  });

  it.each([
    ["danger", 'tone="danger" is not a tone. Fix: <ConfirmDialog tone="destructive">.'],
    ["success", 'tone="success" is not a tone; use "primary", "destructive". Fix: <ConfirmDialog tone="primary">.'],
  ])("renders a primary confirm button for tone=%j and warns once with the fix", async (tone, message) => {
    await open({ tone } as object);
    expect(button("Delete").element().getAttribute("data-tone")).toBe("primary");
    expect(warn.mock.calls.map((call: unknown[]) => call[0])).toEqual([`[ouro-ui] ConfirmDialog: ${message}`]);
  });

  it("stays centered on a phone with side margins and stacks its actions with confirm at the bottom", async () => {
    await page.viewport(390, 844);
    const element = await open();
    expect(element.getAttribute("data-ouro-presentation")).toBe("dialog");
    const rect = element.getBoundingClientRect();
    expect(rect.left).toBeGreaterThanOrEqual(16);
    expect(innerWidth - rect.right).toBeGreaterThanOrEqual(16);
    expect(Math.abs(rect.top + rect.height / 2 - innerHeight / 2)).toBeLessThanOrEqual(1);
    const cancel = button("Cancel").element().getBoundingClientRect();
    const confirm = button("Delete").element().getBoundingClientRect();
    expect(cancel.bottom).toBeLessThanOrEqual(confirm.top);
    expect(confirm.width).toBe(cancel.width);
  });

  it("renders on the server without throwing", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const html = renderToString(
      <ConfirmDialog title="Delete?" confirmLabel="Delete" onConfirm={() => {}} trigger={<Button>Delete</Button>} />,
    );
    expect(html).toContain(">Delete<");
    expect(error).not.toHaveBeenCalled();
  });
});

describe("ConfirmDialog dev messages", () => {
  it("throws the exact fix when neither trigger nor open is passed", () => {
    // @ts-expect-error -- neither trigger nor open
    const dialog = <ConfirmDialog title="Delete?" confirmLabel="Delete" onConfirm={() => {}} />;
    expect(() => renderToString(dialog)).toThrow(
      `[ouro-ui] ConfirmDialog: needs trigger or open with onOpenChange. Fix: ${FIX}`,
    );
  });

  it("throws the exact fix when both trigger and open are passed", () => {
    const dialog = (
      // @ts-expect-error -- both trigger and open
      <ConfirmDialog title="Delete?" confirmLabel="Delete" onConfirm={() => {}} trigger={<Button>D</Button>} open onOpenChange={() => {}} />
    );
    expect(() => renderToString(dialog)).toThrow(`[ouro-ui] ConfirmDialog: takes trigger or open, not both. Fix: ${FIX}`);
  });

  it("throws the exact fix when open comes without onOpenChange", () => {
    // @ts-expect-error -- open without onOpenChange
    const dialog = <ConfirmDialog title="Delete?" confirmLabel="Delete" onConfirm={() => {}} open />;
    expect(() => renderToString(dialog)).toThrow(`[ouro-ui] ConfirmDialog: open needs onOpenChange. Fix: ${FIX}`);
  });

  it("warns once about guessed props and drops them from the DOM", async () => {
    const guessed = {
      isOpen: true,
      onClose: () => {},
      onCancel: () => {},
      destructive: true,
      confirmText: "Go",
      cancelText: "Keep",
    } as object;
    const element = await open(guessed);
    expect(warn.mock.calls.map((call: unknown[]) => call[0])).toEqual([
      "[ouro-ui] ConfirmDialog: isOpen is not a prop. Fix: <ConfirmDialog open={open} onOpenChange={setOpen}>.",
      "[ouro-ui] ConfirmDialog: onClose is not a prop. Fix: <ConfirmDialog open={open} onOpenChange={setOpen}>.",
      "[ouro-ui] ConfirmDialog: onCancel is not a prop; Cancel calls onOpenChange(false). Fix: <ConfirmDialog open={open} onOpenChange={setOpen}>.",
      '[ouro-ui] ConfirmDialog: destructive is not a prop. Fix: <ConfirmDialog tone="destructive">.',
      '[ouro-ui] ConfirmDialog: confirmText is not a prop. Fix: <ConfirmDialog confirmLabel="Delete">.',
      '[ouro-ui] ConfirmDialog: cancelText is not a prop. Fix: <ConfirmDialog cancelLabel="Keep">.',
    ]);
    for (const name of ["isopen", "destructive", "confirmtext", "canceltext"]) expect(element.hasAttribute(name)).toBe(false);
  });
});
