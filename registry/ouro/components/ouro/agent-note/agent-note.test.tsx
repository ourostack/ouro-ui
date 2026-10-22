import { useState, type ReactNode } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { AgentNote, type AgentNoteProps } from "@/registry/ouro/components/ouro/agent-note/agent-note";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

const roots: Root[] = [];
let mounted: Element[] = [];

async function render(node: ReactNode) {
  const host = document.createElement("div");
  host.style.width = "420px";
  document.body.append(host);
  mounted.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
  return {
    host,
    rerender: (next: ReactNode) => act(async () => root.render(next)),
    get note() {
      return host.querySelector<HTMLElement>('[data-ouro="agent-note"]')!;
    },
    button(name: string) {
      return [...host.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === name);
    },
  };
}

const base = { text: "Sam asks for the rollout numbers before the review.", author: "agent", name: "Ouro" } as const;

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

// These read the DOM at once, with no wait for an element: a broken part fails here quickly.
describe("AgentNote at a glance", () => {
  const names = (note: HTMLElement) => [...note.querySelectorAll("button")].map((button) => button.textContent);
  const press = (target: Element, type: "pointerdown" | "keydown") =>
    act(async () => {
      target.dispatchEvent(type === "pointerdown" ? new PointerEvent(type, { bubbles: true }) : new KeyboardEvent(type, { key: "Enter", bubbles: true }));
    });

  it("shows its parts, its attribution and the person's buttons in each state", async () => {
    const handlers = { onPin: vi.fn(), onUnpin: vi.fn(), onSave: vi.fn(), onDismiss: vi.fn() };
    const agent = await render(<AgentNote {...base} time="5 min ago" source="Based on 3 messages" {...handlers} />);
    expect(names(agent.note)).toEqual(["Pin", "Edit", "Dismiss"]);
    const parts = agent.note.getAttribute("aria-labelledby")!.split(" ");
    expect(parts.map((part) => document.getElementById(part)!.textContent)).toEqual(["Note", "OuroAgent"]);
    expect(agent.note.dataset.author).toBe("agent");
    expect(agent.note.hasAttribute("data-pinned")).toBe(false);
    expect(agent.note.hasAttribute("aria-busy")).toBe(false);
    expect(agent.note.textContent).not.toContain("Pinned");
    expect(agent.note.querySelector("[data-ouro-note-kept]")).toBeNull();
    expect(agent.note.querySelector("[data-ouro-note-changed]")).toBeNull();
    expect(agent.note.querySelector("[data-ouro-note-source]")!.textContent).toBe("Based on 3 messages");

    const pinned = await render(<AgentNote {...base} pinned {...handlers} />);
    expect(names(pinned.note)).toEqual(["Unpin", "Edit", "Dismiss"]);
    expect(pinned.note.hasAttribute("data-pinned")).toBe(true);
    expect(pinned.note.querySelector('[data-ouro="badge"][class*="success"]')!.textContent).toBe("Pinned");
    expect(pinned.note.querySelector("[data-ouro-note-kept]")!.textContent).toBe("Kept: your agent won't change this note.");

    const human = await render(<AgentNote {...base} author="human" onPin={handlers.onPin} />);
    expect(names(human.note)).toEqual(["Pin"]);
    expect(human.note.querySelector("[data-ouro-note-author]")!.textContent).toBe("Edited by you");
    expect(human.note.querySelector("[data-ouro-note-kept]")).not.toBeNull();

    expect(names((await render(<AgentNote {...base} pinned onPin={handlers.onPin} />)).note)).toEqual([]);
    expect(names((await render(<AgentNote {...base} onUnpin={handlers.onUnpin} onDismiss={handlers.onDismiss} />)).note)).toEqual(["Dismiss"]);
  });

  it("reports the revision on screen when a press began", async () => {
    const onPin = vi.fn();
    const { note, rerender, button } = await render(<AgentNote {...base} revision="r1" onPin={onPin} />);
    await press(button("Pin")!, "pointerdown");
    await rerender(<AgentNote {...base} revision="r2" onPin={onPin} />);
    await act(async () => button("Pin")!.click());
    expect(onPin).toHaveBeenLastCalledWith("r1", expect.objectContaining({ type: "click" }));
    // The click used up the press, so the next click reports the note it finds.
    await rerender(<AgentNote {...base} revision="r3" onPin={onPin} />);
    await act(async () => button("Pin")!.click());
    expect(onPin).toHaveBeenLastCalledWith("r3", expect.anything());
    await press(button("Pin")!, "keydown");
    await rerender(<AgentNote {...base} revision="r4" onPin={onPin} />);
    await act(async () => button("Pin")!.click());
    expect(onPin).toHaveBeenLastCalledWith("r3", expect.anything());
    expect(note.isConnected).toBe(true);
  });

  it("edits in place: saves, stays open when the save fails, is busy while saving, and cancels", async () => {
    const onSave = vi.fn<NonNullable<AgentNoteProps["onSave"]>>();
    const { note, rerender, button } = await render(<AgentNote {...base} revision="r1" onSave={onSave} />);
    const area = () => note.querySelector("textarea")!;
    await act(async () => button("Edit")!.click());
    expect(names(note)).toEqual(["Save", "Cancel"]);
    expect(note.querySelector("[data-ouro-note-text]")).toBeNull();
    expect(area().value).toBe(base.text);
    expect(document.activeElement).toBe(area());
    expect(area().selectionStart).toBe(base.text.length);
    expect(button("Save")!.disabled).toBe(false);
    expect(note.querySelector("[data-ouro-note-changed]")).toBeNull();

    // The agent replaces the note while the person edits: their words stay, and a notice says so.
    await rerender(<AgentNote {...base} text="Newer words" revision="r2" onSave={onSave} />);
    expect(note.querySelector("[data-ouro-note-changed]")!.textContent).toContain("Your agent changed this note while you were editing.");
    expect(area().value).toBe(base.text);
    await userEvent.fill(area(), "   ");
    expect(button("Save")!.disabled).toBe(true);
    await userEvent.fill(area(), "Short");
    onSave.mockReturnValueOnce(false);
    await act(async () => button("Save")!.click());
    expect(onSave).toHaveBeenLastCalledWith("Short", "r2", expect.anything());
    expect(area()).not.toBeNull();

    let finish!: (value: boolean) => void;
    onSave.mockImplementationOnce(() => new Promise<boolean>((resolve) => (finish = resolve)));
    await act(async () => button("Save")!.click());
    expect(note.getAttribute("aria-busy")).toBe("true");
    expect(button("Save")!.getAttribute("aria-disabled")).toBe("true");
    await act(async () => finish(true));
    expect(note.hasAttribute("aria-busy")).toBe(false);
    expect(note.querySelector("textarea")).toBeNull();
    expect(document.activeElement).toBe(button("Edit"));

    await act(async () => button("Edit")!.click());
    const other = new KeyboardEvent("keydown", { key: "a", bubbles: true, cancelable: true });
    await act(async () => area().dispatchEvent(other));
    expect(other.defaultPrevented).toBe(false);
    expect(note.querySelector("textarea")).not.toBeNull();
    const escape = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    await act(async () => area().dispatchEvent(escape));
    expect(escape.defaultPrevented).toBe(true);
    expect(note.querySelector("textarea")).toBeNull();
    expect(document.activeElement).toBe(button("Edit"));

    await act(async () => button("Edit")!.click());
    await act(async () => button("Cancel")!.click());
    expect(note.querySelector("textarea")).toBeNull();
    expect(note.querySelector("[data-ouro-note-text]")!.textContent).toBe("Newer words");
  });
});

describe("AgentNote", () => {
  it("is an article named by its label and author, saying when and what the agent read", async () => {
    const { note } = await render(<AgentNote {...base} time="5 min ago" source="Based on 3 messages and a transcript" />);
    expect(note.tagName).toBe("ARTICLE");
    await expect.element(page.getByRole("article", { name: "Note Ouro Agent" })).toBeVisible();
    expect(note.querySelector("[data-ouro-note-text]")!.textContent).toBe(base.text);
    expect(note.querySelector("[data-ouro-note-source]")!.textContent).toBe("Based on 3 messages and a transcript");
    expect(note.textContent).toContain("· 5 min ago");
    expect(note.querySelectorAll("button")).toHaveLength(0);
    // The source is quieter than the note's words.
    const source = note.querySelector<HTMLElement>("[data-ouro-note-source]")!;
    expect(getComputedStyle(source).color).not.toBe(getComputedStyle(note.querySelector("[data-ouro-note-text]")!).color);
  });

  it.each([undefined, null])("leaves out the time and source when they are %s", async (missing) => {
    const { note } = await render(<AgentNote {...base} time={missing} source={missing} />);
    expect(note.textContent).not.toContain("·");
    expect(note.querySelector("[data-ouro-note-source]")).toBeNull();
  });

  it("does not take focus when it appears", async () => {
    await render(<AgentNote {...base} onSave={() => {}} />);
    expect(document.activeElement).toBe(document.body);
  });

  it("attributes the agent's words with a badge and a bar, and the person's edit to them", async () => {
    const { note, rerender } = await render(<AgentNote {...base} />);
    expect(note.dataset.author).toBe("agent");
    expect(note.querySelector('[data-ouro="badge"]')!.textContent).toBe("Agent");
    const bar = getComputedStyle(note, "::before");
    expect(bar.width).toBe("4px");
    expect(bar.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
    await rerender(<AgentNote {...base} author="human" text="My own words." />);
    expect(note.dataset.author).toBe("human");
    expect(note.querySelector("[data-ouro-note-author]")!.textContent).toBe("Edited by you");
    expect(note.querySelector('[data-ouro="badge"]')).toBeNull();
    expect(getComputedStyle(note, "::before").content).toBe("none");
    await expect.element(page.getByRole("article", { name: "Note Edited by you" })).toBeVisible();
  });

  it("shows the text as text, never markup, keeping its line breaks", async () => {
    const { note } = await render(<AgentNote {...base} text={"<b>Bold</b>\nSecond line"} />);
    const text = note.querySelector<HTMLElement>("[data-ouro-note-text]")!;
    expect(text.querySelector("b")).toBeNull();
    expect(text.textContent).toBe("<b>Bold</b>\nSecond line");
    expect(getComputedStyle(text).whiteSpace).toBe("pre-wrap");
  });

  it("says a pinned or edited note is kept", async () => {
    const { note, rerender } = await render(<AgentNote {...base} />);
    expect(note.querySelector("[data-ouro-note-kept]")).toBeNull();
    await rerender(<AgentNote {...base} pinned />);
    expect(note.dataset.pinned).toBe("");
    expect(note.querySelector("[data-ouro-note-kept]")!.textContent).toBe("Kept: your agent won't change this note.");
    expect([...note.querySelectorAll('[data-ouro="badge"]')].map((badge) => badge.textContent)).toEqual(["Agent", "Pinned"]);
    await rerender(<AgentNote {...base} author="human" keptLabel="Gardée." />);
    expect(note.querySelector("[data-ouro-note-kept]")!.textContent).toBe("Gardée.");
  });

  it("pins, unpins and dismisses with the revision and the person's click", async () => {
    const onPin = vi.fn();
    const onUnpin = vi.fn();
    const onDismiss = vi.fn();
    const { rerender } = await render(<AgentNote {...base} revision="r1" onPin={onPin} onUnpin={onUnpin} onDismiss={onDismiss} />);
    await expect.element(page.getByRole("button", { name: "Unpin" })).not.toBeInTheDocument();
    await userEvent.click(page.getByRole("button", { name: "Pin" }));
    expect(onPin.mock.calls[0]![0]).toBe("r1");
    expect(onPin.mock.calls[0]![1].isTrusted).toBe(true);
    await rerender(<AgentNote {...base} revision="r1" pinned onPin={onPin} onUnpin={onUnpin} onDismiss={onDismiss} />);
    await expect.element(page.getByRole("button", { name: "Pin", exact: true })).not.toBeInTheDocument();
    await userEvent.click(page.getByRole("button", { name: "Unpin" }));
    expect(onUnpin.mock.calls[0]![0]).toBe("r1");
    await userEvent.click(page.getByRole("button", { name: "Dismiss" }));
    expect(onDismiss.mock.calls[0]![0]).toBe("r1");
    expect(onDismiss.mock.calls[0]![1].isTrusted).toBe(true);
    await rerender(<AgentNote {...base} pinned onPin={onPin} />);
    expect(page.getByRole("button").elements()).toHaveLength(0);
  });

  it("passes the revision on screen when the press began, so a replaced note can be refused", async () => {
    const onPin = vi.fn();
    const { rerender, button } = await render(<AgentNote {...base} revision="r1" onPin={onPin} />);
    const pin = button("Pin")!;
    await act(async () => pin.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })));
    // The agent rewrites the note while the person's pointer is down.
    await rerender(<AgentNote {...base} text="Newer words." revision="r2" onPin={onPin} />);
    await act(async () => {
      window.dispatchEvent(new PointerEvent("pointerup"));
      pin.click();
    });
    expect(onPin).toHaveBeenLastCalledWith("r1", expect.anything());
    await act(async () => pin.click());
    expect(onPin).toHaveBeenLastCalledWith("r2", expect.anything());
    // A press that ends away from the button, by pointer or by key, leaves nothing behind.
    await act(async () => {
      pin.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      window.dispatchEvent(new PointerEvent("pointerup"));
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    await rerender(<AgentNote {...base} revision="r3" onPin={onPin} />);
    await act(async () => pin.click());
    expect(onPin).toHaveBeenLastCalledWith("r3", expect.anything());
    await act(async () => {
      pin.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      window.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter" }));
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    await rerender(<AgentNote {...base} revision="r4" onPin={onPin} />);
    await act(async () => pin.click());
    expect(onPin).toHaveBeenLastCalledWith("r4", expect.anything());
  });

  it("edits in place: Edit focuses the text box, Save passes the words and returns focus to Edit", async () => {
    const onSave = vi.fn();
    const { note } = await render(<AgentNote {...base} revision="r1" onSave={onSave} maxLength={80} />);
    await userEvent.click(page.getByRole("button", { name: "Edit" }));
    const box = page.getByRole("textbox", { name: "Edit" });
    await expect.element(box).toHaveFocus();
    await expect.element(box).toHaveValue(base.text);
    expect(box.element().getAttribute("maxlength")).toBe("80");
    expect(note.querySelector("[data-ouro-note-text]")).toBeNull();
    await expect.element(page.getByRole("button", { name: "Cancel" })).toBeVisible();
    await userEvent.clear(box);
    await expect.element(page.getByRole("button", { name: "Save" })).toBeDisabled();
    await userEvent.keyboard("   ");
    await expect.element(page.getByRole("button", { name: "Save" })).toBeDisabled();
    await userEvent.clear(box);
    await userEvent.type(box, "Bring the rollout numbers.");
    await userEvent.click(page.getByRole("button", { name: "Save" }));
    expect(onSave.mock.calls[0]![0]).toBe("Bring the rollout numbers.");
    expect(onSave.mock.calls[0]![1]).toBe("r1");
    expect(onSave.mock.calls[0]![2].isTrusted).toBe(true);
    await expect.element(page.getByRole("button", { name: "Edit" })).toHaveFocus();
  });

  it("keeps the editor open when onSave returns false, and busy while it saves", async () => {
    let finish!: (value: boolean) => void;
    const onSave = vi.fn(() => new Promise<boolean>((resolve) => (finish = resolve)));
    const { note } = await render(<AgentNote {...base} onSave={onSave} />);
    await userEvent.click(page.getByRole("button", { name: "Edit" }));
    await userEvent.click(page.getByRole("button", { name: "Save" }));
    expect(note.getAttribute("aria-busy")).toBe("true");
    await expect.element(page.getByRole("button", { name: "Save" })).toBeDisabled();
    await act(async () => finish(false));
    expect(note.hasAttribute("aria-busy")).toBe(false);
    await expect.element(page.getByRole("textbox", { name: "Edit" })).toBeVisible();
  });

  it("keeps focus on Save while it saves and after the save fails", async () => {
    let finish!: (value: boolean) => void;
    const onSave = vi.fn(() => new Promise<boolean>((resolve) => (finish = resolve)));
    await render(<AgentNote {...base} onSave={onSave} />);
    await userEvent.click(page.getByRole("button", { name: "Edit" }));
    const save = page.getByRole("button", { name: "Save" }).element() as HTMLButtonElement;
    await act(async () => save.focus());
    await userEvent.keyboard("{Enter}");
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(save);
    await act(async () => finish(false));
    expect(document.activeElement).toBe(save);
    expect(save.hasAttribute("aria-disabled")).toBe(false);
  });

  it.each([
    ["throws", () => {
      throw new Error("offline");
    }],
    ["rejects", () => Promise.reject(new Error("offline"))],
  ])("stays open and can save again when onSave %s", async (_name, failing) => {
    const onSave = vi.fn<NonNullable<AgentNoteProps["onSave"]>>(failing);
    const { note } = await render(<AgentNote {...base} onSave={onSave} />);
    await userEvent.click(page.getByRole("button", { name: "Edit" }));
    await userEvent.click(page.getByRole("button", { name: "Save" }));
    expect(note.hasAttribute("aria-busy")).toBe(false);
    await expect.element(page.getByRole("textbox", { name: "Edit" })).toHaveValue(base.text);
    expect(warn).toHaveBeenCalledWith('[ouro-ui] AgentNote: onSave threw "offline", so the editor stayed open. Fix: onSave={(text) => save(text).catch(() => false)}.');
    onSave.mockImplementation(() => {});
    await userEvent.click(page.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledTimes(2);
    expect(note.querySelector("textarea")).toBeNull();
  });

  it("ignores a save that settles after the person cancelled and began another edit", async () => {
    const pending: ((value: boolean | void) => void)[] = [];
    const onSave = vi.fn(() => new Promise<boolean | void>((resolve) => pending.push(resolve)));
    const { note } = await render(<AgentNote {...base} onSave={onSave} />);
    await userEvent.click(page.getByRole("button", { name: "Edit" }));
    await userEvent.click(page.getByRole("button", { name: "Save" }));
    expect(note.getAttribute("aria-busy")).toBe("true");
    await userEvent.click(page.getByRole("button", { name: "Cancel" }));
    expect(note.hasAttribute("aria-busy")).toBe(false);
    await userEvent.click(page.getByRole("button", { name: "Edit" }));
    await userEvent.click(page.getByRole("button", { name: "Save" }));
    // The first save succeeds late: the newer edit stays open and busy with its own save.
    await act(async () => pending[0]!());
    expect(note.querySelector("textarea")).not.toBeNull();
    expect(note.getAttribute("aria-busy")).toBe("true");
    await act(async () => pending[1]!(false));
    expect(note.hasAttribute("aria-busy")).toBe(false);
    expect(note.querySelector("textarea")).not.toBeNull();
  });

  it("cancels with Cancel or Escape, keeping the note's words", async () => {
    const onSave = vi.fn();
    const { note } = await render(<AgentNote {...base} onSave={onSave} editButtonLabel="Modifier" cancelButtonLabel="Annuler" />);
    await userEvent.click(page.getByRole("button", { name: "Modifier" }));
    await userEvent.type(page.getByRole("textbox", { name: "Modifier" }), " Extra");
    await userEvent.click(page.getByRole("button", { name: "Annuler" }));
    expect(note.querySelector("[data-ouro-note-text]")!.textContent).toBe(base.text);
    await expect.element(page.getByRole("button", { name: "Modifier" })).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    await expect.element(page.getByRole("textbox", { name: "Modifier" })).toHaveValue(base.text);
    // Another key leaves the editor open.
    await userEvent.keyboard("{ArrowLeft}");
    await act(async () => page.getByRole("textbox", { name: "Modifier" }).element().focus());
    // Escape is the editor's, so a dialog around the note stays open.
    const seen = vi.fn((event: KeyboardEvent) => event.defaultPrevented);
    document.addEventListener("keydown", seen);
    await userEvent.keyboard("{Escape}");
    document.removeEventListener("keydown", seen);
    expect(seen.mock.results[0]!.value).toBe(true);
    await expect.element(page.getByRole("button", { name: "Modifier" })).toHaveFocus();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("cancels safely when the app takes Edit away while the person edits", async () => {
    const { rerender, note } = await render(<AgentNote {...base} onSave={() => {}} />);
    await userEvent.click(page.getByRole("button", { name: "Edit" }));
    await rerender(<AgentNote {...base} />);
    // With nothing to save to, Save goes and Cancel stays.
    expect([...note.querySelectorAll("button")].map((button) => button.textContent)).toEqual(["Cancel"]);
    await userEvent.click(page.getByRole("button", { name: "Cancel" }));
    expect(note.querySelector("[data-ouro-note-text]")!.textContent).toBe(base.text);
    expect(note.querySelectorAll("button")).toHaveLength(0);
  });

  it("keeps the person's words when the note changes while they edit, and says so", async () => {
    const onSave = vi.fn();
    const { note, rerender } = await render(<AgentNote {...base} revision="r1" onSave={onSave} />);
    await userEvent.click(page.getByRole("button", { name: "Edit" }));
    const box = page.getByRole("textbox", { name: "Edit" });
    // The caret starts at the end of the note.
    await userEvent.keyboard(" Mine.");
    expect(note.querySelector("[data-ouro-note-changed]")).toBeNull();
    await rerender(<AgentNote {...base} text="The agent's newer words." revision="r2" onSave={onSave} />);
    await expect.element(box).toHaveValue(`${base.text} Mine.`);
    await expect
      .element(page.getByText("Your agent changed this note while you were editing. Your words stay here; Save replaces the new version.", { exact: true }))
      .toHaveAttribute("role", "status");
    await userEvent.click(page.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith(`${base.text} Mine.`, "r2", expect.anything());
  });

  it("renders in server HTML and hydrates without a warning", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const node = <AgentNote {...base} pinned source="Based on 3 messages" onPin={() => {}} onUnpin={() => {}} onSave={() => {}} onDismiss={() => {}} />;
    const html = renderToString(node);
    expect(html).toContain('data-author="agent"');
    expect(html).toContain("Kept: your agent");
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
    const { note } = await render(<AgentNote {...base} className="mt-4" ref={(node) => void (element = node)} />);
    expect(element).toBe(note);
    expect(getComputedStyle(note).marginTop).toBe("16px");
  });
});

describe("AgentNote development messages", () => {
  it("says when a kept note comes back with the agent's words", async () => {
    function Overwriting() {
      const [note, setNote] = useState({ text: "Mine.", author: "human" as "human" | "agent" });
      return (
        <>
          <AgentNote text={note.text} author={note.author} name="Ouro" />
          <button type="button" onClick={() => setNote({ text: "The agent's words.", author: "agent" })}>
            Overwrite
          </button>
        </>
      );
    }
    await render(<Overwriting />);
    expect(warn).not.toHaveBeenCalled();
    await userEvent.click(page.getByRole("button", { name: "Overwrite" }));
    expect(warn).toHaveBeenCalledWith(
      `[ouro-ui] AgentNote: a pinned or edited note came back with the agent's words; once the person keeps a note, the agent leaves it. Fix: <AgentNote pinned author="human" text={keptText}>.`,
    );
  });

  it("does not warn when the person edits a kept note, or the agent rewrites one not kept", async () => {
    const { rerender } = await render(<AgentNote {...base} pinned />);
    await rerender(<AgentNote {...base} pinned author="human" text="Mine." />);
    await rerender(<AgentNote {...base} pinned author="human" text="Mine, again." />);
    const fresh = await render(<AgentNote {...base} pinned />);
    // Unpinned, the note is the agent's to rewrite again.
    await fresh.rerender(<AgentNote {...base} />);
    await fresh.rerender(<AgentNote {...base} text="Fresh." />);
    expect(warn).not.toHaveBeenCalled();
  });

  it.each([
    ["a missing author", { author: undefined }, "author and name are required, so the note says who wrote it", '<AgentNote text={note.text} author="agent" name="Ouro">'],
    ["a missing name", { name: undefined }, "author and name are required, so the note says who wrote it", '<AgentNote text={note.text} author="agent" name="Ouro">'],
    ["children", { children: "Hi" }, "children is not a prop; the note is text", "<AgentNote text={note.text}>"],
    ["by", { by: "agent" }, "by is not a prop", '<AgentNote author="agent" name="Ouro">'],
    ["basis", { basis: "Based on" }, "basis is not a prop", '<AgentNote source="Based on 3 messages">'],
    ["onEdit", { onEdit: () => {} }, "onEdit is not a prop", "<AgentNote onSave={(text, revision, event) => save(text)}>"],
  ])("names the fix for %s", async (_name, extra, problem, fix) => {
    const props = { ...base, ...extra } as unknown as AgentNoteProps;
    const { note } = await render(<AgentNote {...props} />);
    expect(warn).toHaveBeenCalledWith(`[ouro-ui] AgentNote: ${problem}. Fix: ${fix}.`);
    expect(note.hasAttribute("by")).toBe(false);
    expect(note.querySelector("[data-ouro-note-text]")!.textContent).toBe(base.text);
  });

  it("checks the className", async () => {
    await render(<AgentNote {...base} className="bg-blue-500" />);
    expect(warn).toHaveBeenCalledWith(
      '[ouro-ui] AgentNote: "bg-blue-500" sets appearance, and className is for layout only. Fix: remove "bg-blue-500"; AgentNote takes its colors from the theme.',
    );
  });
});
