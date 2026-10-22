import { type ReactNode } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { DraftReview, type DraftChange, type DraftReviewProps, type DraftReviewSegment } from "@/registry/ouro/components/ouro/draft-review/draft-review";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

const roots: Root[] = [];
let mounted: Element[] = [];

async function render(node: ReactNode) {
  const host = document.createElement("div");
  host.style.width = "480px";
  document.body.append(host);
  mounted.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
  return {
    host,
    rerender: (next: ReactNode) => act(async () => root.render(next)),
    get review() {
      return host.querySelector<HTMLElement>('[data-ouro="draft-review"]');
    },
  };
}

const segments: DraftReviewSegment[] = [
  { kind: "same", text: "I can meet on " },
  { kind: "delete", text: "Thursday", changeId: "day" },
  { kind: "insert", text: "Friday", changeId: "day" },
  { kind: "same", text: " at ten" },
  { kind: "insert", text: " in room 4", changeId: "room" },
  { kind: "same", text: "." },
  { kind: "delete", text: " Thanks!", changeId: "thanks" },
];
const changes: DraftChange[] = [
  { id: "day", author: "agent", name: "Ouro", time: "2 min ago", source: "Based on 3 messages" },
  { id: "room", author: "human", name: "Ada Lovelace", time: "1 min ago" },
  { id: "thanks", author: "agent", name: "Ouro" },
];
const base = { segments, changes, onAccept: () => {}, onReject: () => {} };

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

describe("DraftReview", () => {
  it("is a named region with a heading that counts the changes", async () => {
    const { review, rerender } = await render(<DraftReview {...base} />);
    await expect.element(page.getByRole("region", { name: "Changes to review" })).toBeVisible();
    expect(review!.querySelector("[data-ouro-draft-review-heading]")!.textContent).toBe("3 changes to review");
    await rerender(<DraftReview {...base} changes={changes.slice(0, 1)} />);
    expect(review!.querySelector("[data-ouro-draft-review-heading]")!.textContent).toBe("1 change to review");
    await rerender(<DraftReview {...base} label="Modifications" heading="Trois modifications" description="Since you last edited" />);
    await expect.element(page.getByRole("region", { name: "Modifications" })).toBeVisible();
    expect(review!.textContent).toContain("Trois modificationsSince you last edited");
  });

  it("numbers each change and tells screen readers whether it adds or removes text", async () => {
    const { review } = await render(<DraftReview {...base} />);
    const text = review!.querySelector<HTMLElement>("[data-ouro-draft-review-text]")!;
    const removed = text.querySelectorAll("del");
    const added = text.querySelectorAll("ins");
    expect([...removed].map((node) => node.textContent)).toEqual(["[Change 1, removed: Thursday]", "[Change 3, removed:  Thanks!]3"]);
    expect([...added].map((node) => node.textContent)).toEqual(["[Change 1, added: Friday]1", "[Change 2, added:  in room 4]2"]);
    // The number follows each change's last run, and is not read: the screen reader text names it first.
    expect(added[0]!.querySelector("sup")!.getAttribute("aria-hidden")).toBe("true");
    expect(removed[0]!.querySelector("sup")).toBeNull();
    expect(getComputedStyle(removed[0]!).textDecorationLine).toBe("line-through");
    expect(getComputedStyle(added[0]!).textDecorationLine).toBe("underline");
  });

  it("tints an agent's added text and leaves a person's underlined only", async () => {
    const { review } = await render(<DraftReview {...base} />);
    const [agent, human] = [...review!.querySelectorAll<HTMLElement>("ins")];
    expect(agent!.dataset.author).toBe("agent");
    expect(getComputedStyle(agent!).backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
    expect(human!.dataset.author).toBe("human");
    expect(getComputedStyle(human!).backgroundColor).toBe("rgba(0, 0, 0, 0)");
  });

  it("says who made each change, marking an agent's, with when and what it was based on", async () => {
    const { review } = await render(<DraftReview {...base} />);
    const rows = [...review!.querySelectorAll<HTMLElement>("li")];
    expect(rows.map((row) => row.querySelector('[data-ouro="badge"]')?.textContent ?? null)).toEqual(["Agent", null, "Agent"]);
    expect(rows[0]!.textContent).toBe("1Change 1: OuroAgent2 min agoBased on 3 messagesAcceptReject");
    expect(rows[1]!.textContent).toBe("2Change 2: Ada Lovelace1 min agoAcceptReject");
  });

  it("accepts and rejects one change, with buttons named by their change and the click event", async () => {
    const onAccept = vi.fn();
    const onReject = vi.fn();
    await render(<DraftReview {...base} onAccept={onAccept} onReject={onReject} />);
    await userEvent.click(page.getByRole("button", { name: "Accept, Change 2" }));
    expect(onAccept).toHaveBeenCalledTimes(1);
    expect(onAccept.mock.calls[0]![0]).toBe("room");
    expect(onAccept.mock.calls[0]![1].isTrusted).toBe(true);
    await userEvent.click(page.getByRole("button", { name: "Reject, Change 3" }));
    expect(onReject.mock.calls[0]![0]).toBe("thanks");
    expect(onReject.mock.calls[0]![1].isTrusted).toBe(true);
    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  it("offers Accept all and Reject all only while there is more than one change", async () => {
    const onAcceptAll = vi.fn();
    const onRejectAll = vi.fn();
    const { rerender } = await render(<DraftReview {...base} onAcceptAll={onAcceptAll} onRejectAll={onRejectAll} />);
    await userEvent.click(page.getByRole("button", { name: "Accept all" }));
    await userEvent.click(page.getByRole("button", { name: "Reject all" }));
    expect(onAcceptAll).toHaveBeenCalledTimes(1);
    expect(onRejectAll).toHaveBeenCalledTimes(1);
    await rerender(<DraftReview {...base} changes={changes.slice(0, 1)} onAcceptAll={onAcceptAll} onRejectAll={onRejectAll} />);
    await expect.element(page.getByRole("button", { name: "Accept all" })).not.toBeInTheDocument();
    await expect.element(page.getByRole("button", { name: "Reject all" })).not.toBeInTheDocument();
    await rerender(<DraftReview {...base} onAcceptAll={onAcceptAll} />);
    await expect.element(page.getByRole("button", { name: "Accept all" })).toBeVisible();
    await expect.element(page.getByRole("button", { name: "Reject all" })).not.toBeInTheDocument();
  });

  it("puts the app's actions after the bulk buttons", async () => {
    const { review } = await render(<DraftReview {...base} changes={changes.slice(0, 1)} actions={<Button size="sm">Approve</Button>} />);
    await expect.element(page.getByRole("button", { name: "Approve" })).toBeVisible();
    expect(review!.querySelector("[data-ouro-draft-review-heading]")!.nextElementSibling!.textContent).toBe("Approve");
  });

  it("shows what a change was based on with onShowSource", async () => {
    const onShowSource = vi.fn();
    const { rerender } = await render(<DraftReview {...base} />);
    await expect.element(page.getByRole("button", { name: "Show, Change 1" })).not.toBeInTheDocument();
    await rerender(<DraftReview {...base} onShowSource={onShowSource} />);
    // Only a change with a source gets Show.
    expect(page.getByRole("button", { name: /^Show/ }).elements()).toHaveLength(1);
    await userEvent.click(page.getByRole("button", { name: "Show, Change 1" }));
    expect(onShowSource).toHaveBeenCalledWith("day");
  });

  it("takes other words for its buttons, marks and badge", async () => {
    const { review } = await render(
      <DraftReview
        {...base}
        onAcceptAll={() => {}}
        onRejectAll={() => {}}
        onShowSource={() => {}}
        acceptLabel="Accepter"
        rejectLabel="Refuser"
        acceptAllLabel="Tout accepter"
        rejectAllLabel="Tout refuser"
        showSourceLabel="Voir"
        agentLabel="Agent IA"
        changeLabel={(n) => `Modification ${n}`}
        insertedLabel="ajouté"
        deletedLabel="supprimé"
      />,
    );
    for (const name of ["Accepter, Modification 1", "Refuser, Modification 2", "Tout accepter", "Tout refuser", "Voir, Modification 1"]) {
      await expect.element(page.getByRole("button", { name })).toBeVisible();
    }
    expect(review!.querySelector("ins")!.textContent).toBe("[Modification 1, ajouté: Friday]1");
    expect(review!.querySelector("del")!.textContent).toBe("[Modification 1, supprimé: Thursday]");
    expect(review!.querySelector('[data-ouro="badge"]')!.textContent).toBe("Agent IA");
  });

  it("renders nothing with no changes", async () => {
    const { host } = await render(<DraftReview {...base} segments={[{ kind: "same", text: "Hi" }]} changes={[]} />);
    expect(host.childElementCount).toBe(0);
  });

  it("renders in server HTML and hydrates without a warning", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const node = <DraftReview {...base} onAcceptAll={() => {}} />;
    const html = renderToString(node);
    expect(html).toContain("<ins");
    expect(html).toContain("Accept all");
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
    const { review } = await render(<DraftReview {...base} id="review" className="mt-4" ref={(node) => void (element = node)} />);
    expect(element).toBe(review);
    expect(review!.id).toBe("review");
    expect(getComputedStyle(review!).marginTop).toBe("16px");
  });
});

describe("DraftReview development messages", () => {
  it("names the fix for a run without its change, and shows it as plain text", async () => {
    const { review: missing } = await render(<DraftReview {...base} segments={[{ kind: "delete", text: "Hi" }]} />);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("DraftReview: a delete run has no changeId, so it shows as unchanged text. Fix: "));
    expect(missing!.querySelector("del")).toBeNull();
    const { review } = await render(<DraftReview {...base} segments={[...segments, { kind: "insert", text: " Bye", changeId: "gone" }]} />);
    expect(warn).toHaveBeenCalledWith(
      '[ouro-ui] DraftReview: an insert run has changeId="gone", which no change has, so it shows as unchanged text. Fix: <DraftReview segments={[{ kind: "insert", text: "Friday", changeId: "c1" }]} changes={[{ id: "c1", author: "agent", name: "Ouro" }]}>.',
    );
    expect(review!.querySelectorAll("ins")).toHaveLength(2);
    expect(review!.querySelector("[data-ouro-draft-review-text]")!.lastElementChild!.outerHTML).toBe("<span> Bye</span>");
  });

  it.each([
    ["diff", { diff: [] }, "diff is not a prop", "<DraftReview segments={segments}>"],
    ["onApprove", { onApprove: () => {} }, "onApprove is not a prop; accept a change with onAccept, and put a whole-draft Approve in actions", "<DraftReview onAccept={(id) => accept(id)}>"],
    ["onDecline", { onDecline: () => {} }, "onDecline is not a prop", "<DraftReview onReject={(id) => reject(id)}>"],
  ])("names the fix for %s", async (_name, extra, problem, fix) => {
    const props = { ...base, ...extra } as unknown as DraftReviewProps;
    const { review } = await render(<DraftReview {...props} />);
    expect(warn).toHaveBeenCalledWith(`[ouro-ui] DraftReview: ${problem}. Fix: ${fix}.`);
    expect(review!.hasAttribute("diff")).toBe(false);
  });

  it("checks the className", async () => {
    await render(<DraftReview {...base} className="bg-blue-500" />);
    expect(warn).toHaveBeenCalledWith(
      '[ouro-ui] DraftReview: "bg-blue-500" sets appearance, and className is for layout only. Fix: remove "bg-blue-500"; DraftReview takes its colors from the theme.',
    );
  });
});
