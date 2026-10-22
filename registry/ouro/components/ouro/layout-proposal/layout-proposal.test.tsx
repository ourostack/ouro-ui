import { useState, type ReactNode } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { LayoutProposal, type LayoutProposalProps } from "@/registry/ouro/components/ouro/layout-proposal/layout-proposal";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { watchAnnouncements } from "@/registry/ouro/lib/ouro/testing/announcements";

const roots: Root[] = [];
let mounted: Element[] = [];

async function render(node: ReactNode) {
  const host = document.createElement("div");
  host.style.width = "640px";
  document.body.append(host);
  mounted.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
  return {
    host,
    rerender: (next: ReactNode) => act(async () => root.render(next)),
    get bar() {
      return host.querySelector<HTMLElement>('[data-ouro="layout-proposal"]')!;
    },
    button(name: string) {
      return [...host.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === name);
    },
  };
}

const base = { proposalId: "p1", title: "Customers first", by: "Ouro", onApply: () => {}, onDiscard: () => {} };

function Previewing({ onPreview }: { onPreview?: (previewing: boolean) => void }) {
  const [previewing, setPreviewing] = useState(false);
  return (
    <LayoutProposal
      {...base}
      reason="You open customer chats first most mornings."
      previewing={previewing}
      onPreview={() => {
        onPreview?.(true);
        setPreviewing(true);
      }}
      onEndPreview={() => {
        onPreview?.(false);
        setPreviewing(false);
      }}
    />
  );
}

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(async () => {
  vi.restoreAllMocks();
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  for (const node of mounted) node.remove();
  mounted = [];
});

describe("LayoutProposal", () => {
  it("is a region named by its badge and title, saying who proposed it, when and why", async () => {
    const { bar } = await render(
      <LayoutProposal {...base} time="2 min ago" reason="You open customer chats first most mornings.">
        <span>Customer chats | Conversation | Agenda</span>
      </LayoutProposal>,
    );
    await expect.element(page.getByRole("region", { name: "Proposed change Customers first" })).toBeVisible();
    expect(bar.dataset.proposalId).toBe("p1");
    expect(bar.querySelector("[data-ouro-proposal-by]")!.textContent).toBe("Ouro · 2 min ago");
    expect(bar.querySelector("[data-ouro-proposal-reason]")!.textContent).toBe("You open customer chats first most mornings.");
    expect(bar.textContent).toContain("Customer chats | Conversation | Agenda");
    expect([...bar.querySelectorAll("button")].map((button) => button.textContent)).toEqual(["Apply", "Discard"]);
  });

  it("marks the proposal as an agent's with a bar at its start edge", async () => {
    const { bar } = await render(<LayoutProposal {...base} />);
    const edge = getComputedStyle(bar, "::before");
    expect(edge.width).toBe("4px");
    expect(edge.insetInlineStart).toBe("0px");
    expect(edge.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
  });

  it("applies and discards with the proposal's id and the person's click", async () => {
    const onApply = vi.fn();
    const onDiscard = vi.fn();
    const { rerender } = await render(<LayoutProposal {...base} onApply={onApply} onDiscard={onDiscard} />);
    await userEvent.click(page.getByRole("button", { name: "Apply" }));
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply.mock.calls[0]![0]).toBe("p1");
    expect(onApply.mock.calls[0]![1].isTrusted).toBe(true);
    await rerender(<LayoutProposal {...base} proposalId="p2" onApply={onApply} onDiscard={onDiscard} />);
    await userEvent.click(page.getByRole("button", { name: "Discard" }));
    expect(onDiscard.mock.calls[0]![0]).toBe("p2");
    expect(onDiscard.mock.calls[0]![1].isTrusted).toBe(true);
  });

  it("decides a proposal once, until it changes or its save settles with it still shown", async () => {
    const onApply = vi.fn();
    const onDiscard = vi.fn();
    const { rerender, button } = await render(<LayoutProposal {...base} onApply={onApply} onDiscard={onDiscard} onPreview={() => {}} onEndPreview={() => {}} />);
    // Forced: Playwright waits for a button to be enabled, and these say they are not.
    await userEvent.dblClick(page.getByRole("button", { name: "Apply" }), { force: true });
    await userEvent.click(page.getByRole("button", { name: "Discard" }), { force: true });
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onDiscard).not.toHaveBeenCalled();
    expect(button("Apply")!.getAttribute("aria-disabled")).toBe("true");
    expect(button("Discard")!.getAttribute("aria-disabled")).toBe("true");
    // Nothing is pending, so nothing is busy.
    expect(button("Apply")!.hasAttribute("aria-busy")).toBe(false);
    // Preview is not a decision: it still works.
    expect(button("Preview")!.hasAttribute("aria-disabled")).toBe(false);
    // A new proposal can be decided.
    let settle!: () => void;
    const saving = vi.fn(() => new Promise<void>((resolve) => (settle = resolve)));
    await rerender(<LayoutProposal {...base} proposalId="p2" onApply={onApply} onDiscard={saving} />);
    expect(button("Apply")!.hasAttribute("aria-disabled")).toBe(false);
    await userEvent.click(page.getByRole("button", { name: "Discard" }));
    // The pressed button is busy while its save is pending; the other is only unavailable.
    expect(button("Discard")!.getAttribute("aria-busy")).toBe("true");
    expect(button("Discard")!.hasAttribute("data-loading")).toBe(true);
    expect(button("Apply")!.getAttribute("aria-disabled")).toBe("true");
    expect(button("Apply")!.hasAttribute("aria-busy")).toBe(false);
    await userEvent.click(page.getByRole("button", { name: "Discard" }), { force: true });
    expect(saving).toHaveBeenCalledTimes(1);
    // Its save settled and the app still shows it: it can be decided again.
    await act(async () => settle());
    expect(button("Discard")!.hasAttribute("aria-disabled")).toBe(false);
    expect(button("Discard")!.hasAttribute("aria-busy")).toBe(false);
    await userEvent.click(page.getByRole("button", { name: "Discard" }));
    expect(saving).toHaveBeenCalledTimes(2);
    // A save that settles once the proposal is gone changes nothing for the one after it.
    await rerender(<LayoutProposal {...base} proposalId="p3" onApply={onApply} onDiscard={saving} />);
    await userEvent.click(page.getByRole("button", { name: "Apply" }));
    await act(async () => settle());
    expect(button("Apply")!.getAttribute("aria-disabled")).toBe("true");
    // Shown again after another proposal (p3, p4, p3), it starts undecided.
    await rerender(<LayoutProposal {...base} proposalId="p4" onApply={onApply} onDiscard={saving} />);
    expect(button("Apply")!.hasAttribute("aria-disabled")).toBe(false);
    await rerender(<LayoutProposal {...base} proposalId="p3" onApply={onApply} onDiscard={saving} />);
    expect(button("Apply")!.hasAttribute("aria-disabled")).toBe(false);
    await userEvent.click(page.getByRole("button", { name: "Apply" }));
    expect(onApply).toHaveBeenCalledTimes(3);
  });

  it("leaves a refused or failed decision undecided, so the person can still decide", async () => {
    const proposal = { id: "p1" };
    const onApply = vi.fn((id: string, event: { isTrusted: boolean }) => event.isTrusted && id === proposal.id && "applied");
    const { button } = await render(<LayoutProposal {...base} onApply={onApply} onDiscard={() => {}} />);
    // A script's click is not the person's: the handler refuses it, and nothing is decided.
    await act(async () => button("Apply")!.click());
    expect(onApply).toHaveLastReturnedWith(false);
    expect(button("Apply")!.hasAttribute("aria-disabled")).toBe(false);
    expect(button("Discard")!.hasAttribute("aria-disabled")).toBe(false);
    await userEvent.click(page.getByRole("button", { name: "Apply" }));
    expect(onApply).toHaveLastReturnedWith("applied");
    expect(button("Apply")!.getAttribute("aria-disabled")).toBe("true");
  });

  it("rethrows a handler's error and leaves the proposal undecided", async () => {
    const thrown: unknown[] = [];
    const onError = (event: ErrorEvent) => {
      thrown.push(event.error);
      event.preventDefault();
    };
    window.addEventListener("error", onError);
    // The browser reports the uncaught error to the console as well.
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const boom = new Error("apply failed");
      const { button } = await render(
        <LayoutProposal
          {...base}
          onApply={() => {
            throw boom;
          }}
          onDiscard={() => {}}
        />,
      );
      await userEvent.click(page.getByRole("button", { name: "Apply" }));
      await expect.poll(() => thrown).toContain(boom);
      expect(button("Apply")!.hasAttribute("aria-disabled")).toBe(false);
      expect(button("Discard")!.hasAttribute("aria-disabled")).toBe(false);
    } finally {
      window.removeEventListener("error", onError);
      consoleError.mockRestore();
    }
  });

  it("passes the HTML id through to the region", async () => {
    const { bar } = await render(<LayoutProposal {...base} id="proposal" />);
    expect(bar.id).toBe("proposal");
    expect(bar.dataset.proposalId).toBe("p1");
  });

  it("passes the id that was on screen when the press began, so a swapped proposal can be refused", async () => {
    const onApply = vi.fn();
    const { rerender, button } = await render(<LayoutProposal {...base} onApply={onApply} />);
    const apply = button("Apply")!;
    await act(async () => apply.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })));
    // The agent replaces the proposal while the person's pointer is down.
    await rerender(<LayoutProposal {...base} proposalId="p2" title="Calendar first" onApply={onApply} />);
    await act(async () => {
      window.dispatchEvent(new PointerEvent("pointerup"));
      apply.click();
    });
    expect(onApply).toHaveBeenLastCalledWith("p1", expect.anything());
    // The next press is about the proposal now on screen.
    await act(async () => apply.click());
    expect(onApply).toHaveBeenLastCalledWith("p2", expect.anything());
    // A press that ends away from the button leaves nothing behind.
    await act(async () => {
      apply.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      window.dispatchEvent(new PointerEvent("pointerup"));
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    await rerender(<LayoutProposal {...base} proposalId="p3" onApply={onApply} />);
    await act(async () => apply.click());
    expect(onApply).toHaveBeenLastCalledWith("p3", expect.anything());
  });

  it("keeps the id from a key press too", async () => {
    const onDiscard = vi.fn();
    const { rerender, button } = await render(<LayoutProposal {...base} onDiscard={onDiscard} />);
    const discard = button("Discard")!;
    await act(async () => discard.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true })));
    await rerender(<LayoutProposal {...base} proposalId="p2" onDiscard={onDiscard} />);
    await act(async () => discard.click());
    expect(onDiscard).toHaveBeenLastCalledWith("p1", expect.anything());
  });

  it("turns Preview into Back to current in place, keeping focus, and speaks the preview note", async () => {
    const onPreview = vi.fn();
    const announced = watchAnnouncements();
    try {
      const { bar } = await render(<Previewing onPreview={onPreview} />);
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(announced.count("Nothing changes until you apply it")).toBe(0);
      const toggle = page.getByRole("button", { name: "Preview" });
      const element = toggle.element();
      await userEvent.click(toggle);
      expect(onPreview).toHaveBeenLastCalledWith(true);
      await expect.element(page.getByRole("button", { name: "Back to current" })).toBeVisible();
      expect(page.getByRole("button", { name: "Back to current" }).element()).toBe(element);
      expect(document.activeElement).toBe(element);
      expect(bar.dataset.previewing).toBe("");
      await expect.element(page.getByRole("region", { name: "Previewing Customers first" })).toBeVisible();
      expect(bar.querySelector("[data-ouro-proposal-note]")!.textContent).toBe("This is a preview. Nothing changes until you apply it.");
      expect(bar.querySelector("[data-ouro-proposal-reason]")).toBeNull();
      await expect.poll(() => announced.count("This is a preview. Nothing changes until you apply it.")).toBe(1);
      await userEvent.keyboard("{Enter}");
      expect(onPreview).toHaveBeenLastCalledWith(false);
      await expect.element(page.getByRole("button", { name: "Preview" })).toBeVisible();
      expect(bar.hasAttribute("data-previewing")).toBe(false);
    } finally {
      announced.stop();
    }
  });

  it("offers no preview without onPreview", async () => {
    const { button, rerender } = await render(<LayoutProposal {...base} />);
    expect(button("Preview")).toBeUndefined();
    // Without onEndPreview, which the types require with onPreview, as plain JavaScript may leave it.
    const previewOnly = { onPreview: () => {} } as object;
    await rerender(<LayoutProposal {...base} previewing {...previewOnly} />);
    expect(button("Back to current")).toBeUndefined();
  });

  it("takes other words for its badge, note and buttons", async () => {
    const { bar } = await render(
      <LayoutProposal
        {...base}
        previewing
        onPreview={() => {}}
        onEndPreview={() => {}}
        proposedLabel="Proposition"
        previewingLabel="Aperçu"
        previewNote="Rien ne change avant d'appliquer."
        previewLabel="Aperçu"
        endPreviewLabel="Revenir"
        applyLabel="Appliquer"
        discardLabel="Ignorer"
      />,
    );
    expect([...bar.querySelectorAll("button")].map((button) => button.textContent)).toEqual(["Revenir", "Appliquer", "Ignorer"]);
    expect(bar.querySelector("[data-ouro-proposal-note]")!.textContent).toBe("Rien ne change avant d'appliquer.");
    await expect.element(page.getByRole("region", { name: "Aperçu Customers first" })).toBeVisible();
  });

  it("leaves out the time and reason when there are none", async () => {
    const { bar } = await render(<LayoutProposal {...base} time={null} reason={null} />);
    expect(bar.querySelector("[data-ouro-proposal-by]")!.textContent).toBe("Ouro");
    expect(bar.querySelector("[data-ouro-proposal-reason]")).toBeNull();
  });

  it("renders in server HTML and hydrates without a warning", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const node = <LayoutProposal {...base} reason="Why" onPreview={() => {}} onEndPreview={() => {}} />;
    const html = renderToString(node);
    expect(html).toContain('data-proposal-id="p1"');
    const host = document.createElement("div");
    host.innerHTML = html;
    document.body.append(host);
    mounted.push(host);
    const recoverable = vi.fn();
    let root!: Root;
    await act(async () => {
      root = hydrateRoot(host, node, { onRecoverableError: recoverable });
    });
    roots.push(root);
    expect(recoverable).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it("forwards a ref and lets app layout classes win", async () => {
    let element: HTMLElement | null = null;
    const { bar } = await render(<LayoutProposal {...base} className="mt-4" ref={(node) => void (element = node)} />);
    expect(element).toBe(bar);
    expect(getComputedStyle(bar).marginTop).toBe("16px");
  });
});

describe("LayoutProposal, part by part", () => {
  it("sets who proposed it quieter than the title", async () => {
    const { bar } = await render(<LayoutProposal {...base} time="Just now" />);
    const by = bar.querySelector<HTMLElement>("[data-ouro-proposal-by]")!;
    expect(by.textContent).toBe("Ouro · Just now");
    expect(getComputedStyle(by).color).not.toBe(getComputedStyle(by.previousElementSibling!).color);
  });

  it.each([undefined, null])("leaves out the time, reason and preview when they are %s", async (missing) => {
    const { bar } = await render(
      <LayoutProposal {...base} time={missing} reason={missing}>
        {missing}
      </LayoutProposal>,
    );
    expect(bar.querySelector("[data-ouro-proposal-by]")!.textContent).toBe("Ouro");
    expect(bar.querySelector("[data-ouro-proposal-reason]")).toBeNull();
    // The title line alone, with no empty reason or preview after it.
    expect(bar.firstElementChild!.children).toHaveLength(1);
  });
});

describe("LayoutProposal presses", () => {
  it("forgets a press that ends away from the button, by pointer or by key", async () => {
    const onApply = vi.fn();
    const { button, rerender } = await render(<LayoutProposal {...base} onApply={onApply} />);
    const apply = button("Apply")!;
    await act(async () => {
      apply.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      window.dispatchEvent(new PointerEvent("pointerup"));
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    await rerender(<LayoutProposal {...base} proposalId="p2" onApply={onApply} />);
    await act(async () => apply.click());
    expect(onApply).toHaveBeenLastCalledWith("p2", expect.anything());
    await act(async () => {
      apply.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      window.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter" }));
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    await rerender(<LayoutProposal {...base} proposalId="p3" onApply={onApply} />);
    await act(async () => apply.click());
    expect(onApply).toHaveBeenLastCalledWith("p3", expect.anything());
  });
});

describe("LayoutProposal development messages", () => {
  it("warns of nothing when the props are right", async () => {
    await render(<LayoutProposal {...base} />);
    await render(<LayoutProposal {...base} reason="You open customer chats first." time="Just now" onPreview={() => {}} onEndPreview={() => {}} />);
    expect(warn).not.toHaveBeenCalled();
  });

  it.each([
    ["a missing proposalId", { proposalId: undefined }, "proposalId is missing, so the app cannot tell a replaced proposal from the one the person saw", '<LayoutProposal proposalId={proposal.id} title="Customers first" by="Ouro">'],
    ["onPreview without onEndPreview", { onPreview: () => {} }, "onPreview needs onEndPreview, so the person can leave the preview", "<LayoutProposal onPreview={(id) => preview(id)} onEndPreview={(id) => endPreview(id)}>"],
    ["onAccept", { onAccept: () => {} }, "onAccept is not a prop", "<LayoutProposal onApply={(id, event) => apply(id, event)}>"],
    ["onReject", { onReject: () => {} }, "onReject is not a prop", "<LayoutProposal onDiscard={(id) => discard(id)}>"],
    ["onDismiss", { onDismiss: () => {} }, "onDismiss is not a prop", "<LayoutProposal onDiscard={(id) => discard(id)}>"],
    ["onBack", { onBack: () => {} }, "onBack is not a prop", "<LayoutProposal onEndPreview={(id) => endPreview(id)}>"],
    ["note", { note: "Why" }, "note is not a prop", '<LayoutProposal reason="You open customer chats first.">'],
  ])("names the fix for %s", async (_name, extra, problem, fix) => {
    const props = { ...base, ...extra } as unknown as LayoutProposalProps;
    const { bar } = await render(<LayoutProposal {...props} />);
    expect(warn).toHaveBeenCalledWith(`[ouro-ui] LayoutProposal: ${problem}. Fix: ${fix}.`);
    expect(bar.hasAttribute("note")).toBe(false);
  });

  it("checks the className", async () => {
    await render(<LayoutProposal {...base} className="bg-blue-500" />);
    expect(warn).toHaveBeenCalledWith(
      '[ouro-ui] LayoutProposal: "bg-blue-500" sets appearance, and className is for layout only. Fix: remove "bg-blue-500"; LayoutProposal takes its colors from the theme.',
    );
  });
});
