import { useState, type ReactNode } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { DraftEditor, type DraftEditorProps, type DraftSegment } from "@/registry/ouro/components/ouro/draft-editor/draft-editor";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

const roots: Root[] = [];
let mounted: Element[] = [];

async function render(node: ReactNode, width = 360) {
  const host = document.createElement("div");
  host.style.width = `${width}px`;
  document.body.append(host);
  mounted.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
  return {
    host,
    rerender: (next: ReactNode) => act(async () => root.render(next)),
    get editor() {
      return host.querySelector<HTMLElement>('[data-ouro="draft-editor"]')!;
    },
    get textarea() {
      return host.querySelector<HTMLTextAreaElement>("textarea")!;
    },
    get highlights() {
      return host.querySelector<HTMLElement>("[data-ouro-draft-highlights]");
    },
  };
}

const segments: DraftSegment[] = [
  { author: "human", text: "Thanks for the notes. " },
  { author: "agent", text: "I can meet on Friday at ten." },
];
const value = segments.map((segment) => segment.text).join("");

function Controlled({ initial = segments, onEdit, ...props }: { initial?: DraftSegment[]; onEdit?: (value: string, segments: DraftSegment[]) => void } & Partial<DraftEditorProps>) {
  const [draft, setDraft] = useState({ text: initial.map((segment) => segment.text).join(""), segments: initial });
  return (
    <DraftEditor
      label="Reply"
      {...props}
      value={draft.text}
      segments={draft.segments}
      onValueChange={(text, next) => {
        onEdit?.(text, next);
        setDraft({ text, segments: next });
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

describe("DraftEditor", () => {
  it("is a text box named by its label, with the draft as its value", async () => {
    const { textarea } = await render(<DraftEditor label="Reply" value={value} segments={segments} onValueChange={() => {}} placeholder="Write a reply" />);
    await expect.element(page.getByRole("textbox", { name: "Reply" })).toHaveValue(value);
    expect(textarea.placeholder).toBe("Write a reply");
  });

  it("highlights the agent's words in place, under the text, wrapped as the text wraps", async () => {
    const { textarea, highlights } = await render(<DraftEditor label="Reply" value={value} segments={segments} onValueChange={() => {}} />, 200);
    expect(highlights).not.toBeNull();
    expect(highlights!.getAttribute("aria-hidden")).toBe("true");
    const mark = highlights!.querySelector("mark")!;
    expect(mark.textContent).toBe("I can meet on Friday at ten.");
    // The layer covers the textarea exactly and wraps its text into the same lines.
    const area = textarea.getBoundingClientRect();
    const layer = highlights!.getBoundingClientRect();
    expect([layer.top, layer.left, layer.width]).toEqual([area.top, area.left, textarea.clientWidth]);
    expect(highlights!.firstElementChild!.getBoundingClientRect().height).toBe(textarea.scrollHeight);
    expect(mark.getClientRects().length).toBeGreaterThan(1);
    // The highlight shows through the textarea, and the text is drawn once, by the textarea.
    expect(getComputedStyle(textarea).backgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect(getComputedStyle(mark).backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
    expect(getComputedStyle(mark).color).toBe("rgba(0, 0, 0, 0)");
    expect(getComputedStyle(mark).textDecorationLine).toBe("underline");
    expect(getComputedStyle(textarea).color).not.toBe("rgba(0, 0, 0, 0)");
  });

  it("gives the person's typing to them and keeps the author of what they leave", async () => {
    const onChange = vi.fn();
    const { textarea } = await render(<Controlled onEdit={onChange} />);
    const start = value.indexOf("Friday");
    await act(async () => {
      textarea.focus();
      textarea.setSelectionRange(start, start + "Friday".length);
    });
    await userEvent.keyboard("Monday");
    expect(onChange).toHaveBeenLastCalledWith("Thanks for the notes. I can meet on Monday at ten.", [
      { author: "human", text: "Thanks for the notes. " },
      { author: "agent", text: "I can meet on " },
      { author: "human", text: "Monday" },
      { author: "agent", text: " at ten." },
    ]);
    await act(async () => textarea.setSelectionRange(textarea.value.length, textarea.value.length));
    await userEvent.keyboard("!");
    expect(onChange.mock.lastCall![1].at(-1)).toEqual({ author: "human", text: "!" });
    await userEvent.keyboard("{Backspace}{Backspace}");
    expect(onChange.mock.lastCall![1].at(-1)).toEqual({ author: "agent", text: " at ten" });
  });

  it("describes the box with the agent's words, for screen readers", async () => {
    await render(<DraftEditor label="Reply" value={value} segments={segments} onValueChange={() => {}} aria-describedby="hint" />);
    const hint = document.createElement("p");
    hint.id = "hint";
    hint.textContent = "Ctrl+Enter sends.";
    document.body.append(hint);
    mounted.push(hint);
    await expect
      .element(page.getByRole("textbox", { name: "Reply" }))
      .toHaveAccessibleDescription("Ctrl+Enter sends. Written by an agent: “I can meet on Friday at ten.”.");
  });

  it("shows a legend for the agent's words only when the agent wrote some", async () => {
    const { editor, rerender, highlights } = await render(<DraftEditor label="Reply" value="Hi" segments={[{ author: "human", text: "Hi" }]} onValueChange={() => {}} />);
    expect(highlights).toBeNull();
    expect(editor.querySelector("[data-ouro-draft-legend]")).toBeNull();
    expect(editor.querySelector("textarea")!.hasAttribute("aria-describedby")).toBe(false);
    await rerender(<DraftEditor label="Reply" value="Hi " segments={[{ author: "human", text: "Hi" }, { author: "agent", text: " " }]} onValueChange={() => {}} />);
    expect(editor.querySelector("[data-ouro-draft-legend]")).toBeNull();
    await rerender(<DraftEditor label="Reply" value={value} segments={segments} agentLabel="Écrit par l'agent" onValueChange={() => {}} />);
    expect(editor.querySelector("[data-ouro-draft-legend]")!.textContent).toBe("Écrit par l'agentÉcrit par l'agent: “I can meet on Friday at ten.”.");
  });

  it("shows where the draft stands, who said so and their note", async () => {
    const { editor, rerender } = await render(
      <DraftEditor
        label="Reply"
        value="Hi"
        segments={[{ author: "human", text: "Hi" }]}
        readiness="needs-input"
        readinessBy={{ author: "agent", name: "Ouro" }}
        readinessNote="Which day suits you?"
        onValueChange={() => {}}
      />,
    );
    const badge = () => editor.querySelector<HTMLElement>('[data-ouro="badge"]');
    expect(editor.dataset.readiness).toBe("needs-input");
    expect(badge()!.textContent).toBe("Needs your input");
    expect(badge()!.className).toContain("bg-warning/10");
    expect(editor.querySelector("[data-ouro-draft-readiness-by]")!.textContent).toBe("Ouro: Which day suits you?");
    await rerender(<DraftEditor label="Reply" value="Hi" segments={[{ author: "human", text: "Hi" }]} readiness="ready-for-review" onValueChange={() => {}} />);
    expect(badge()!.textContent).toBe("Ready for your review");
    expect(badge()!.className).toContain("bg-primary/10");
    expect(editor.querySelector("[data-ouro-draft-readiness-by]")).toBeNull();
    await rerender(
      <DraftEditor label="Reply" value="Hi" segments={[{ author: "human", text: "Hi" }]} readiness="ready-for-review" readinessLabel="Prêt" readinessBy={{ author: "agent", name: "Ouro" }} onValueChange={() => {}} />,
    );
    expect(badge()!.textContent).toBe("Prêt");
    expect(editor.querySelector("[data-ouro-draft-readiness-by]")!.textContent).toBe("Ouro");
    await rerender(<DraftEditor label="Reply" value="Hi" segments={[{ author: "human", text: "Hi" }]} readiness="drafting" onValueChange={() => {}} />);
    expect(badge()).toBeNull();
  });

  it("shows approval only from a person", async () => {
    const human = { author: "human", name: "You" } as const;
    const { editor, rerender } = await render(<DraftEditor label="Reply" value="Hi" segments={[{ author: "human", text: "Hi" }]} readiness="approved" readinessBy={human} onValueChange={() => {}} />);
    const badge = () => editor.querySelector<HTMLElement>('[data-ouro="badge"]');
    expect(badge()!.textContent).toBe("Approved");
    expect(badge()!.className).toContain("bg-success/10");
    expect(warn).not.toHaveBeenCalled();
    await rerender(
      <DraftEditor label="Reply" value="Hi" segments={[{ author: "human", text: "Hi" }]} readiness="approved" readinessBy={{ author: "agent", name: "Ouro" }} onValueChange={() => {}} />,
    );
    expect(badge()).toBeNull();
    expect(editor.textContent).not.toContain("Ouro");
    expect(warn).toHaveBeenCalledWith(
      '[ouro-ui] DraftEditor: readiness="approved" was set by an agent, so it is not shown; only a person approves a draft. Fix: <DraftEditor readiness="ready-for-review" readinessBy={{ author: "agent", name: "Ouro" }}>.',
    );
  });

  it("highlights nothing while the segments are out of step with the value, and gives the person the edit", async () => {
    const onValueChange = vi.fn();
    const { textarea, highlights } = await render(<DraftEditor label="Reply" value="Hello" segments={segments} onValueChange={onValueChange} />);
    expect(highlights).toBeNull();
    expect(warn).toHaveBeenCalledWith(
      "[ouro-ui] DraftEditor: segments do not join to value, so the agent's words are not highlighted. Fix: <DraftEditor value={text} segments={segments} onValueChange={(text, segments) => save(text, segments)}>.",
    );
    await act(async () => {
      textarea.focus();
      textarea.setSelectionRange(5, 5);
    });
    await userEvent.keyboard("!");
    expect(onValueChange).toHaveBeenLastCalledWith("Hello!", [{ author: "human", text: "Hello!" }]);
  });

  it("keeps the highlight under the text when the box scrolls", async () => {
    const long = Array.from({ length: 12 }, (_, line) => `Line ${line + 1} of the plan.`).join("\n");
    const { textarea, highlights } = await render(<DraftEditor label="Reply" value={long} segments={[{ author: "agent", text: long }]} maxRows={3} onValueChange={() => {}} />);
    expect(textarea.scrollHeight).toBeGreaterThan(textarea.clientHeight);
    await act(async () => {
      textarea.scrollTop = 40;
      textarea.dispatchEvent(new Event("scroll"));
    });
    expect(highlights!.firstElementChild!.getAttribute("style")).toContain(`translateY(-${textarea.scrollTop}px)`);
  });

  it("puts the actions in the box, after the text", async () => {
    const { textarea } = await render(<DraftEditor label="Reply" value="Hi" segments={[{ author: "human", text: "Hi" }]} actions={<Button>Send</Button>} onValueChange={() => {}} />);
    const send = page.getByRole("button", { name: "Send" }).element().getBoundingClientRect();
    expect(send.left).toBeGreaterThanOrEqual(textarea.getBoundingClientRect().right);
  });

  it("grows from rows to maxRows", async () => {
    const { textarea, rerender } = await render(<DraftEditor label="Reply" value="" segments={[]} rows={1} onValueChange={() => {}} />);
    const line = Number.parseFloat(getComputedStyle(textarea).lineHeight);
    expect(textarea.getBoundingClientRect().height).toBe(line);
    const many = "a\n".repeat(20);
    await rerender(<DraftEditor label="Reply" value={many} segments={[{ author: "human", text: many }]} rows={1} maxRows={4} onValueChange={() => {}} />);
    expect(textarea.getBoundingClientRect().height).toBe(line * 4);
  });

  it("renders in server HTML without the highlight layer, and hydrates without a warning", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const node = <DraftEditor label="Reply" value={value} segments={segments} readiness="ready-for-review" onValueChange={() => {}} />;
    const html = renderToString(node);
    expect(html).toContain("Ready for your review");
    expect(html).not.toContain("data-ouro-draft-highlights");
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
    expect(host.querySelector("[data-ouro-draft-highlights]")).not.toBeNull();
  });

  it("forwards a ref to the textarea, passes its attributes and lets app layout classes win", async () => {
    let element: HTMLTextAreaElement | null = null;
    const onScroll = vi.fn();
    const { editor, textarea } = await render(
      <DraftEditor label="Reply" value="Hi" segments={[{ author: "human", text: "Hi" }]} name="reply" className="mt-4" onScroll={onScroll} ref={(node) => void (element = node)} onValueChange={() => {}} />,
    );
    expect(element).toBe(textarea);
    expect(textarea.name).toBe("reply");
    expect(getComputedStyle(editor).marginTop).toBe("16px");
    await act(async () => textarea.dispatchEvent(new Event("scroll")));
    expect(onScroll).toHaveBeenCalledTimes(1);
    const objectRef = { current: null as HTMLTextAreaElement | null };
    await render(<DraftEditor label="Notes" value="" segments={[]} ref={objectRef} onValueChange={() => {}} />);
    expect(objectRef.current?.tagName).toBe("TEXTAREA");
  });
});

describe("DraftEditor development messages", () => {
  it.each([
    ["a missing label", { label: undefined }, "label is missing, so screen readers cannot name the draft", '<DraftEditor label="Reply" value={text} segments={segments} onValueChange={save}>'],
    [
      "an unknown readiness",
      { readiness: "done" },
      'readiness="done" is not a readiness; use "drafting", "needs-input", "ready-for-review" or "approved"',
      '<DraftEditor readiness="ready-for-review">',
    ],
    ["provenance", { provenance: [] }, "provenance is not a prop", "<DraftEditor segments={segments}>"],
    ["defaultValue", { defaultValue: "Hi" }, "defaultValue is not a prop; the draft is controlled", "<DraftEditor value={text} onValueChange={save}>"],
    ["onChange", { onChange: () => {} }, "onChange is not a prop", "<DraftEditor onValueChange={(text, segments) => save(text, segments)}>"],
  ])("names the fix for %s", async (_name, extra, problem, fix) => {
    const props = { label: "Reply", value: "Hi", segments: [{ author: "human", text: "Hi" }], onValueChange: () => {}, ...extra } as unknown as DraftEditorProps;
    const { textarea, editor } = await render(<DraftEditor {...props} />);
    expect(warn).toHaveBeenCalledWith(`[ouro-ui] DraftEditor: ${problem}. Fix: ${fix}.`);
    expect(textarea.hasAttribute("provenance")).toBe(false);
    expect(textarea.value).toBe("Hi");
    expect(editor.dataset.readiness).toBe("drafting");
  });

  it("checks the className", async () => {
    await render(<DraftEditor label="Reply" value="" segments={[]} className="bg-blue-500" onValueChange={() => {}} />);
    expect(warn).toHaveBeenCalledWith(
      '[ouro-ui] DraftEditor: "bg-blue-500" sets appearance, and className is for layout only. Fix: remove "bg-blue-500"; DraftEditor takes its colors from the theme.',
    );
  });
});
