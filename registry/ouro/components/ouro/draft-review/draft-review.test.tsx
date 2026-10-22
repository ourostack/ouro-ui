import { useState, type ReactNode } from "react";
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

describe("DraftReview, part by part", () => {
  const headerParts = (review: HTMLElement) => review.firstElementChild!.children;

  it("numbers a change after its last change run, whatever unchanged text carries its id", async () => {
    const carried: DraftReviewSegment[] = [
      { kind: "insert", text: "Friday", changeId: "day" },
      { kind: "same", text: " at ten", changeId: "day" },
    ];
    const { review } = await render(<DraftReview {...base} segments={carried} changes={[changes[0]!]} />);
    const text = review!.querySelector("[data-ouro-draft-review-text]")!;
    expect(text.querySelector("ins sup")!.textContent).toBe("1");
    // The unchanged run is plain text, with no number and no mark.
    const plain = text.lastElementChild!;
    expect(plain.localName).toBe("span");
    expect(plain.textContent).toBe(" at ten");
    expect(warn).not.toHaveBeenCalled();
  });

  it("shows the header's actions only when there is something to show", async () => {
    const one = [changes[0]!];
    const { review, rerender } = await render(<DraftReview {...base} changes={one} segments={segments.slice(0, 3)} onAcceptAll={() => {}} onRejectAll={() => {}} />);
    // One change: no Accept all or Reject all, and no empty actions.
    expect(headerParts(review!)).toHaveLength(1);
    await rerender(<DraftReview {...base} changes={one} segments={segments.slice(0, 3)} onAcceptAll={() => {}} actions={<button type="button">Send</button>} />);
    expect([...review!.querySelectorAll("button")].map((button) => button.textContent)).not.toContain("Accept all");
    await rerender(<DraftReview {...base} />);
    expect(headerParts(review!)).toHaveLength(1);
    await rerender(<DraftReview {...base} description={null} actions={null} />);
    expect(headerParts(review!)).toHaveLength(1);
    await rerender(<DraftReview {...base} onRejectAll={() => {}} />);
    expect(headerParts(review!)).toHaveLength(2);
  });

  it("sets the description and a change's time and source quieter than its name", async () => {
    const { review } = await render(<DraftReview {...base} description="From the agent" />);
    const name = getComputedStyle(review!.querySelector("li > .font-semibold:not([aria-hidden])")!).color;
    const [description] = [...headerParts(review!)].slice(1) as HTMLElement[];
    expect(getComputedStyle(description!).color).not.toBe(name);
    const quietParts = [...review!.querySelector("li")!.querySelectorAll<HTMLElement>(":scope > .text-xs:not([aria-hidden])")];
    expect(quietParts.map((part) => part.textContent)).toEqual(["2 min ago", "Based on 3 messages"]);
    for (const part of quietParts) expect(getComputedStyle(part).color).not.toBe(name);
  });

  it.each([undefined, null])("leaves out a change's time and source, and its Show button, when they are %s", async (missing) => {
    const { review } = await render(<DraftReview {...base} changes={[{ id: "day", author: "agent", name: "Ouro", time: missing, source: missing }]} segments={segments.slice(0, 3)} onShowSource={() => {}} />);
    const item = review!.querySelector("li")!;
    expect(item.querySelectorAll(":scope > .text-xs:not([aria-hidden])")).toHaveLength(0);
    expect([...item.querySelectorAll("button")].map((button) => button.textContent)).toEqual(["Accept", "Reject"]);
  });
});

describe("DraftReview", () => {
  it("keeps keyboard focus on the list as decided changes leave it", async () => {
    function Deciding({ keep = false }: { keep?: boolean }) {
      const [left, setLeft] = useState(changes);
      const drop = (id: string) => !keep && setLeft((current) => current.filter((change) => change.id !== id));
      return <DraftReview segments={segments} changes={left} onAccept={drop} onReject={drop} />;
    }
    const { review } = await render(<Deciding />);
    const accept = (n: number) => review!.querySelectorAll<HTMLButtonElement>("li [data-decision='accept']")[n]!;
    // Change 2 of 3, accepted from the keyboard: change 3 takes its place, and its Accept the focus.
    await act(async () => accept(1).focus());
    await userEvent.keyboard("{Enter}");
    expect(document.activeElement).toBe(accept(1));
    expect(accept(1).getAttribute("aria-label")).toBe("Accept, Change 2");
    expect(review!.querySelectorAll("li")[1]!.dataset.ouroDraftChange).toBe("thanks");
    // The last one, rejected: focus goes back to the one before it.
    const reject = review!.querySelectorAll<HTMLButtonElement>("li button")[3]!;
    expect(reject.textContent).toBe("Reject");
    await act(async () => reject.focus());
    await userEvent.keyboard("{Enter}");
    expect(document.activeElement).toBe(accept(0));
    // The last change: the review is gone, and moving focus on is the app's.
    await userEvent.keyboard("{Enter}");
    expect(document.querySelector('[data-ouro="draft-review"]')).toBeNull();
  });

  it("leaves focus where it is when a change stays, or the press did not focus its button", async () => {
    const onAccept = vi.fn();
    const { review, rerender } = await render(<DraftReview {...base} onAccept={onAccept} />);
    const accept = () => review!.querySelectorAll<HTMLButtonElement>("li [data-decision='accept']")[0]!;
    await act(async () => accept().focus());
    await userEvent.keyboard("{Enter}");
    expect(onAccept).toHaveBeenCalledWith("day", expect.anything());
    // The app kept the change (its save failed, say): focus stays on the button.
    await rerender(<DraftReview {...base} changes={[...changes]} onAccept={onAccept} />);
    expect(document.activeElement).toBe(accept());
    // A click that did not focus the button (Safari's) moves nothing when the change leaves.
    const elsewhere = document.createElement("button");
    document.body.append(elsewhere);
    mounted.push(elsewhere);
    await act(async () => elsewhere.focus());
    await act(async () => accept().click());
    await rerender(<DraftReview {...base} changes={changes.slice(1)} onAccept={onAccept} />);
    expect(document.activeElement).toBe(elsewhere);
  });

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
  it("warns of nothing when the props are right", async () => {
    await render(<DraftReview {...base} />);
    await render(<DraftReview {...base} onAcceptAll={() => {}} onRejectAll={() => {}} onShowSource={() => {}} description="From the agent" />);
    expect(warn).not.toHaveBeenCalled();
  });

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
