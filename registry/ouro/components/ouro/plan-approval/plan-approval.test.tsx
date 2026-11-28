import { useState, type ReactNode } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { expectAxRendered } from "@/registry/ouro/ax/component";
import { PlanApproval, type PlanAnswer } from "@/registry/ouro/components/ouro/plan-approval/plan-approval";
import { planApprovalAx } from "@/registry/ouro/components/ouro/plan-approval/plan-approval-styles";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { watchAnnouncements } from "@/registry/ouro/lib/ouro/testing/announcements";

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
    get approval() {
      return host.querySelector<HTMLElement>('[data-ouro="plan-approval"]')!;
    },
    part(name: string) {
      return host.querySelector<HTMLElement>(`[data-slot="plan-approval-${name}"]`);
    },
    button(part: "approve" | "request-changes" | "send" | "cancel") {
      return host.querySelector<HTMLButtonElement>(`[data-ouro-control="plan-approval"][data-ouro-part="${part}"]`);
    },
    get field() {
      return host.querySelector<HTMLTextAreaElement>("textarea");
    },
  };
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

const said = () => warn.mock.calls.map((call: unknown[]) => String(call[0]));

const plan = <ol><li>Roast the lamb for an hour.</li><li>Start the rice at the end.</li></ol>;
const title = "Your agent's plan for dinner";

/** A theme colour, computed on a probe in the page. */
function themed(value: string) {
  const probe = document.createElement("span");
  probe.style.color = value;
  document.body.append(probe);
  mounted.push(probe);
  return getComputedStyle(probe).color;
}

describe("PlanApproval", () => {
  it("shows the plan as an article named by its title, with Request changes and Approve", async () => {
    const view = await render(<PlanApproval title={title}>{plan}</PlanApproval>);
    await expect.element(page.getByRole("article", { name: title })).toBeVisible();
    expect(view.part("plan")!.textContent).toBe("Roast the lamb for an hour.Start the rice at the end.");
    expect(view.button("approve")!.textContent).toContain("Approve");
    expect(view.button("request-changes")!.textContent).toContain("Request changes");
    expect(view.approval.querySelector("h3")!.textContent).toBe(title);
    await view.rerender(<PlanApproval title={title} headingLevel={2}>{plan}</PlanApproval>);
    expect(view.approval.querySelector("h2")!.textContent).toBe(title);
  });

  it("calls onApprove from Approve, and presses safely with no handlers", async () => {
    const onApprove = vi.fn();
    const view = await render(<PlanApproval title={title} onApprove={onApprove} approveLabel="Go">{plan}</PlanApproval>);
    await userEvent.click(page.getByRole("button", { name: "Go" }));
    expect(onApprove).toHaveBeenCalledTimes(1);
    const bare = await render(<PlanApproval title={title}>{plan}</PlanApproval>);
    await userEvent.click(bare.button("approve")!);
    await userEvent.click(bare.button("request-changes")!);
    await userEvent.fill(bare.field!, "Less rice");
    await userEvent.click(bare.button("send")!);
    expect(view.button("approve")).not.toBeNull();
  });

  it("opens a field for the person's feedback, sends what they wrote, and cancels back to the buttons", async () => {
    const onRequestChanges = vi.fn();
    const view = await render(<PlanApproval title={title} onRequestChanges={onRequestChanges}>{plan}</PlanApproval>);
    await userEvent.click(view.button("request-changes")!);
    expect(document.activeElement).toBe(view.field);
    expect(view.button("send")!.textContent).toContain("Send");
    expect(view.button("cancel")!.textContent).toContain("Cancel");
    await expect.element(page.getByRole("textbox", { name: "What should change?" })).toBeVisible();
    expect(view.button("send")!.getAttribute("aria-disabled")).toBe("true");
    await userEvent.fill(view.field!, "  Make it vegetarian.  ");
    expect(view.button("send")!.hasAttribute("aria-disabled")).toBe(false);
    await userEvent.click(view.button("send")!);
    expect(onRequestChanges).toHaveBeenCalledWith("Make it vegetarian.");
    await userEvent.click(view.button("cancel")!);
    expect(view.field).toBeNull();
    expect(document.activeElement).toBe(view.button("request-changes"));
    const labelled = await render(
      <PlanApproval title={title} requestChangesLabel="Change it" feedbackLabel="How?" sendLabel="Ask" cancelLabel="Never mind">
        {plan}
      </PlanApproval>,
    );
    await userEvent.click(labelled.button("request-changes")!);
    expect(labelled.button("send")!.textContent).toContain("Ask");
    expect(labelled.button("cancel")!.textContent).toContain("Never mind");
    await expect.element(page.getByRole("textbox", { name: "How?" })).toBeVisible();
  });

  it("comes back with its buttons and an empty field when the answer is cleared for a revised plan", async () => {
    const view = await render(<PlanApproval title={title}>{plan}</PlanApproval>);
    await userEvent.click(view.button("request-changes")!);
    await userEvent.fill(view.field!, "Make it vegetarian.");
    await view.rerender(<PlanApproval title={title} answer={{ decision: "changes-requested", by: "you" }}>{plan}</PlanApproval>);
    await view.rerender(<PlanApproval title={title}>{plan}</PlanApproval>);
    expect(view.field).toBeNull();
    expect(view.button("approve")).not.toBeNull();
    await userEvent.click(view.button("request-changes")!);
    expect(view.field!.value).toBe("");
  });

  it("shows the answer on its way as busy, and turns the other buttons off", async () => {
    const view = await render(<PlanApproval title={title} answering="approve">{plan}</PlanApproval>);
    expect(view.button("approve")!.getAttribute("aria-busy")).toBe("true");
    // The busy button keeps its own look; only the others turn off.
    expect(view.button("approve")!.hasAttribute("data-ouro-off")).toBe(false);
    expect(view.button("request-changes")!.getAttribute("aria-disabled")).toBe("true");
    expect(getComputedStyle(view.button("request-changes")!).opacity).toBe("0.5");
    await view.rerender(<PlanApproval title={title} answering="changes">{plan}</PlanApproval>);
    expect(view.button("request-changes")!.getAttribute("aria-busy")).toBe("true");
    expect(view.button("request-changes")!.hasAttribute("data-ouro-off")).toBe(false);
    expect(view.button("approve")!.getAttribute("aria-disabled")).toBe("true");
    expect(view.button("approve")!.hasAttribute("aria-busy")).toBe(false);
  });

  it("gives way to who answered and from where, which a screen reader hears, with the feedback under it", async () => {
    const view = await render(<PlanApproval title={title}>{plan}</PlanApproval>);
    const heard = watchAnnouncements();
    try {
      await view.rerender(<PlanApproval title={title} answer={{ decision: "approved", by: "Ana", app: "their phone", at: "9:41" }}>{plan}</PlanApproval>);
      expect(view.button("approve")).toBeNull();
      expect(view.part("answer-text")!.textContent).toBe("Approved by Ana from their phone · 9:41");
      expect(view.approval.getAttribute("data-decision")).toBe("approved");
      await expect.poll(() => heard.count("Approved by Ana from their phone · 9:41")).toBe(1);
    } finally {
      heard.stop();
    }
    expect(getComputedStyle(view.part("answer-icon")!).color).toBe(themed("var(--success)"));
    expect(view.part("answer-icon")!.firstElementChild!.getAttribute("d")).toBe("m3.5 8.5 3 3 6-7");
    expect(view.part("feedback")).toBeNull();
    await view.rerender(<PlanApproval title={title} answer={{ decision: "changes-requested", by: "you", feedback: "Make it vegetarian." }}>{plan}</PlanApproval>);
    expect(view.part("answer-text")!.textContent).toBe("Changes requested by you");
    expect(view.part("feedback")!.textContent).toBe("Make it vegetarian.");
    expect(getComputedStyle(view.part("feedback")!).borderInlineStartWidth).toBe("2px");
    expect(getComputedStyle(view.part("answer-icon")!).color).toBe(themed("var(--warning)"));
    expect(view.part("answer-icon")!.firstElementChild!.getAttribute("d")).toBe("M3 13h2.5l7-7-2.5-2.5-7 7z");
    expect(view.approval.getAttribute("data-decision")).toBe("changes-requested");
    expect(view.part("answer")!.tabIndex).toBe(-1);
  });

  it("moves focus to the answer when it arrives while a button or the field holds focus, and not when nothing did", async () => {
    const view = await render(<PlanApproval title={title}>{plan}</PlanApproval>);
    await act(async () => view.button("approve")!.focus());
    await view.rerender(<PlanApproval title={title} answer={{ decision: "approved", by: "Ana" }}>{plan}</PlanApproval>);
    expect(document.activeElement).toBe(view.part("answer"));
    function Prompt() {
      const [answer, setAnswer] = useState<PlanAnswer | undefined>(undefined);
      return (
        <PlanApproval title={title} onRequestChanges={(feedback) => setAnswer({ decision: "changes-requested", by: "you", feedback })} answer={answer}>
          {plan}
        </PlanApproval>
      );
    }
    const editing = await render(<Prompt />);
    await userEvent.click(editing.button("request-changes")!);
    await userEvent.fill(editing.field!, "Less rice");
    await act(async () => editing.field!.focus());
    await act(async () => editing.button("send")!.click());
    expect(document.activeElement).toBe(editing.part("answer"));
    const unfocused = await render(<PlanApproval title={title}>{plan}</PlanApproval>);
    await act(async () => (document.activeElement as HTMLElement).blur());
    await unfocused.rerender(<PlanApproval title={title} answer={{ decision: "approved", by: "Ana" }}>{plan}</PlanApproval>);
    expect(document.activeElement).toBe(document.body);
    // One that arrives already answered leaves focus alone too.
    await render(<PlanApproval title={title} answer={{ decision: "approved", by: "Ana" }}>{plan}</PlanApproval>);
    expect(document.activeElement).toBe(document.body);
  });

  it("declares approve and request-changes the person's, each on the button that does it", async () => {
    const view = await render(<PlanApproval title={title}>{plan}</PlanApproval>);
    expectAxRendered(planApprovalAx, view.host);
    expect(planApprovalAx.actions.map((action) => [action.id, "personOnly" in action && typeof action.personOnly === "string"])).toEqual([
      ["approve", true],
      ["request-changes", true],
    ]);
    expect(planApprovalAx.reads.map((read) => read.id)).toEqual(["plan"]);
    for (const entry of [...planApprovalAx.reads, ...planApprovalAx.actions]) expect(entry.summary).toMatch(/^[A-Z].{8,}\.$/);
  });

  it("says nothing in development for an approval with only its own props", async () => {
    await render(
      <PlanApproval title={title} onApprove={() => {}} onRequestChanges={() => {}} headingLevel={2} className="max-w-xl">
        {plan}
      </PlanApproval>,
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it("renders in server HTML and hydrates without a mismatch", async () => {
    const node = <PlanApproval title={title} answer={{ decision: "approved", by: "Ana", app: "their phone" }}>{plan}</PlanApproval>;
    const html = renderToString(node);
    expect(html).toContain('data-ouro="plan-approval"');
    expect(html).toContain("their phone");
    const host = document.createElement("div");
    host.innerHTML = html;
    document.body.append(host);
    mounted.push(host);
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    await act(async () => {
      roots.push(hydrateRoot(host, node));
    });
    expect(errors).not.toHaveBeenCalled();
  });

  it("names the fix for a guessed prop in development", async () => {
    // @ts-expect-error onAccept is not a prop.
    await render(<PlanApproval title={title} onAccept={() => {}}>{plan}</PlanApproval>);
    // @ts-expect-error onReject is not a prop.
    await render(<PlanApproval title={title} onReject={() => {}}>{plan}</PlanApproval>);
    // @ts-expect-error plan is not a prop.
    await render(<PlanApproval title={title} plan="Roast it">{plan}</PlanApproval>);
    // @ts-expect-error status is not a prop.
    await render(<PlanApproval title={title} status="approved">{plan}</PlanApproval>);
    expect(said()).toEqual(
      expect.arrayContaining([
        "[ouro-ui] PlanApproval: onAccept is not a prop. Fix: <PlanApproval onApprove={approve}>.",
        "[ouro-ui] PlanApproval: onReject is not a prop; a request for changes gets the person's feedback. Fix: <PlanApproval onRequestChanges={revise}>.",
        '[ouro-ui] PlanApproval: plan is not a prop; the plan is the children. Fix: <PlanApproval title="Plan">{plan}</PlanApproval>.',
        "[ouro-ui] PlanApproval: status is not a prop; the person's answer is answer. Fix: <PlanApproval answer={{ decision: \"approved\", by: \"Ana\" }}>.",
      ]),
    );
  });

  it("names the fix for an appearance class, and leaves a layout class alone", async () => {
    await render(<PlanApproval title={title} className="max-w-xl shadow-lg">{plan}</PlanApproval>);
    expect(said().some((line: string) => line.startsWith("[ouro-ui] PlanApproval: ") && line.includes('remove "shadow-lg"; PlanApproval sets its own look from the theme'))).toBe(true);
    expect(said().some((line: string) => line.includes("max-w-xl"))).toBe(false);
  });
});
