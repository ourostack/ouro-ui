import { useState, type FormEvent, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { commands, page, server, userEvent } from "vitest/browser";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { EditSheet, type EditSheetProps } from "@/registry/ouro/components/ouro/form/edit-sheet";
import { Form, type FormErrors } from "@/registry/ouro/components/ouro/form/form";
import { Select } from "@/registry/ouro/components/ouro/select/select";
import { TextField } from "@/registry/ouro/components/ouro/text-field/text-field";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

// Runs in Chromium and WebKit.

const FIX = "Pass trigger={<Button>…</Button>} for an uncontrolled edit sheet, or open and onOpenChange to control it.";

const roots: Root[] = [];
let mounted: Element[] = [];

async function render(node: ReactNode) {
  const host = document.createElement("div");
  document.body.append(host);
  mounted.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
  return host;
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

const popup = () => document.querySelector<HTMLElement>('[role="dialog"]');
const trigger = () => document.querySelector<HTMLElement>("[data-edit-trigger]")!;
const dialogButton = (name: string) => page.getByRole("dialog").getByRole("button", { name });
const field = (name: string) => document.querySelector<HTMLInputElement>(`[role="dialog"] input[name="${name}"]`)!;
/** The text of the elements an element's `aria-describedby` names. */
const description = (element: Element) =>
  (element.getAttribute("aria-describedby") ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => element.ownerDocument.getElementById(id)?.textContent ?? "");

async function settled() {
  await expect
    .poll(
      () => {
        const element = popup();
        return Boolean(element && !element.hasAttribute("data-starting-style") && element.getAnimations().length === 0);
      },
      { interval: 50 },
    )
    .toBe(true);
}

function Fields() {
  return (
    <>
      <TextField label="Name" name="name" defaultValue="Pasta" required />
      <TextField label="Servings" name="servings" defaultValue="4" description="How many it feeds." />
    </>
  );
}

async function open(props: Partial<EditSheetProps> = {}) {
  await render(
    <EditSheet title="Edit recipe" onSubmit={() => {}} trigger={<Button data-edit-trigger="">Edit</Button>} {...(props as object)}>
      <Fields />
    </EditSheet>,
  );
  await userEvent.click(trigger());
  await settled();
  return popup()!;
}

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe("EditSheet", () => {
  it("opens a dialog named by its title, with the fields in a form and Cancel and Save", async () => {
    const dialog = await open({ description: "Change the name or servings." });
    expect(dialog.getAttribute("aria-labelledby")).toBeTruthy();
    await expect.element(page.getByRole("dialog", { name: "Edit recipe" })).toBeVisible();
    const form = dialog.querySelector("form")!;
    expect(form.getAttribute("data-ouro")).toBe("form");
    expect(form.contains(field("name"))).toBe(true);
    const save = dialogButton("Save").element() as HTMLButtonElement;
    expect(save.type).toBe("submit");
    expect(save.form).toBe(form);
    await expect.element(dialogButton("Cancel")).toBeVisible();
  });

  it("submits the fields as FormData, closes and returns focus to the trigger", async () => {
    const onSubmit = vi.fn();
    await open({ onSubmit });
    await userEvent.fill(page.getByRole("textbox", { name: "Name" }), "Pasta bake");
    await userEvent.click(dialogButton("Save"));
    expect(onSubmit).toHaveBeenCalledOnce();
    const data = onSubmit.mock.calls[0]![0] as FormData;
    expect(data.get("name")).toBe("Pasta bake");
    expect(data.get("servings")).toBe("4");
    await expect.poll(() => popup()).toBeNull();
    await expect.poll(() => document.activeElement).toBe(trigger());
  });

  it("submits when Enter is pressed in a field", async () => {
    const onSubmit = vi.fn();
    await open({ onSubmit, submitLabel: "Save recipe" });
    await userEvent.type(page.getByRole("textbox", { name: "Servings" }), "{Enter}");
    expect(onSubmit).toHaveBeenCalledOnce();
    await expect.poll(() => popup()).toBeNull();
  });

  it("takes the button labels as props", async () => {
    await open({ submitLabel: "Save recipe", cancelLabel: "Keep editing" });
    await expect.element(dialogButton("Save recipe")).toBeVisible();
    await expect.element(dialogButton("Keep editing")).toBeVisible();
  });

  it("checks the fields with the browser's constraints before calling onSubmit", async () => {
    const onSubmit = vi.fn();
    await open({ onSubmit });
    await userEvent.clear(page.getByRole("textbox", { name: "Name" }));
    await userEvent.click(dialogButton("Save"));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(field("name"));
    expect(popup()).not.toBeNull();
  });

  it("puts returned errors on the matching fields, stays open and focuses the first", async () => {
    await open({ onSubmit: () => ({ servings: "Use a whole number.", name: ["Too short.", "Taken."] }) });
    await userEvent.click(dialogButton("Save"));
    await expect.poll(() => field("name").getAttribute("aria-invalid")).toBe("true");
    expect(description(field("servings"))).toEqual(["How many it feeds.", "Use a whole number."]);
    await expect.poll(() => document.activeElement).toBe(field("name"));
    expect(popup()!.hasAttribute("data-open")).toBe(true);
  });

  it.each(["fresh", "reused", "async fresh", "async reused"])("restores a cleared field for each accepted equal refusal (%s)", async (mode) => {
    const refusal = { name: "Taken." };
    const onSubmit = vi.fn(() => {
      const answer = mode.endsWith("reused") ? refusal : { ...refusal };
      return mode.startsWith("async") ? Promise.resolve(answer) : answer;
    });
    await open({ onSubmit });
    await userEvent.click(dialogButton("Save"));
    await expect.poll(() => field("name").getAttribute("aria-invalid")).toBe("true");
    await userEvent.fill(page.getByRole("textbox", { name: "Name" }), "Stew");
    expect(field("name").getAttribute("aria-invalid")).toBeNull();
    expect(description(field("name"))).not.toContain("Taken.");
    await userEvent.click(dialogButton("Save"));
    expect(onSubmit).toHaveBeenCalledTimes(2);
    await expect.poll(() => field("name").getAttribute("aria-invalid")).toBe("true");
    expect(description(field("name"))).toContain("Taken.");
    expect(document.activeElement).toBe(field("name"));
  });

  it("keeps a field cleared while an equal refusal is pending, then restores it on acceptance", async () => {
    const first = deferred<FormErrors>();
    const second = deferred<FormErrors>();
    const refusal = { name: "Taken." };
    const onSubmit = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    await open({ onSubmit });
    await userEvent.click(dialogButton("Save"));
    await act(async () => first.resolve(refusal));
    await expect.poll(() => field("name").getAttribute("aria-invalid")).toBe("true");
    await userEvent.fill(page.getByRole("textbox", { name: "Name" }), "Stew");
    const focus = vi.spyOn(field("name"), "focus");
    await userEvent.click(dialogButton("Save"));
    expect(dialogButton("Save").element().getAttribute("aria-busy")).toBe("true");
    expect(field("name").getAttribute("aria-invalid")).toBeNull();
    expect(focus).not.toHaveBeenCalled();
    await act(async () => second.resolve(refusal));
    await expect.poll(() => field("name").getAttribute("aria-invalid")).toBe("true");
    expect(focus).toHaveBeenCalledTimes(1);
  });

  it("closes when the returned errors are empty", async () => {
    await open({ onSubmit: () => ({}) });
    await userEvent.click(dialogButton("Save"));
    await expect.poll(() => popup()).toBeNull();
  });

  it("shows loading on Save while a promise is pending, then closes when it resolves", async () => {
    const pending = deferred<void>();
    await open({ onSubmit: () => pending.promise });
    await userEvent.click(dialogButton("Save"));
    await expect.poll(() => dialogButton("Save").element().getAttribute("aria-busy")).toBe("true");
    expect(popup()!.hasAttribute("data-open")).toBe(true);
    await act(async () => pending.resolve());
    await expect.poll(() => popup()).toBeNull();
    await expect.poll(() => document.activeElement).toBe(trigger());
  });

  it("shows errors from a promise, clears loading and stays open", async () => {
    const pending = deferred<FormErrors>();
    await open({ onSubmit: () => pending.promise });
    await userEvent.click(dialogButton("Save"));
    await act(async () => pending.resolve({ servings: "Use a whole number." }));
    await expect.poll(() => field("servings").getAttribute("aria-invalid")).toBe("true");
    expect(dialogButton("Save").element().hasAttribute("aria-busy")).toBe(false);
    await expect.poll(() => document.activeElement).toBe(field("servings"));
    // Fixing the field clears its error.
    await userEvent.fill(page.getByRole("textbox", { name: "Servings" }), "6");
    expect(field("servings").getAttribute("aria-invalid")).toBeNull();
  });

  it("ignores a second submit while the first is pending", async () => {
    const pending = deferred<void>();
    const onSubmit = vi.fn(() => pending.promise);
    await open({ onSubmit });
    await userEvent.click(dialogButton("Save"));
    await expect.poll(() => dialogButton("Save").element().getAttribute("aria-busy")).toBe("true");
    await act(async () => field("name").form!.requestSubmit());
    expect(onSubmit).toHaveBeenCalledOnce();
    await act(async () => pending.resolve());
  });

  it("stays open when the promise rejects, clears loading and warns with the error", async () => {
    const pending = deferred<void>();
    await open({ onSubmit: () => pending.promise });
    await userEvent.click(dialogButton("Save"));
    await act(async () => pending.reject(new Error("Network down")));
    await expect.poll(() => dialogButton("Save").element().hasAttribute("aria-busy")).toBe(false);
    expect(popup()!.hasAttribute("data-open")).toBe(true);
    expect(warn).toHaveBeenCalledWith(
      '[ouro-ui] EditSheet: onSubmit rejected with "Network down", so the sheet stayed open. Fix: return the message as an error for a field: onSubmit={async (data) => (await save(data)).errors}.',
    );
  });

  it("treats a synchronous throw like a rejection, and warns with a value that is not an Error", async () => {
    await open({
      onSubmit: () => {
        throw "offline";
      },
    });
    await userEvent.click(dialogButton("Save"));
    await expect.poll(() => warn.mock.calls.length).toBe(1);
    expect(String(warn.mock.calls[0]![0])).toContain('onSubmit rejected with "offline"');
    expect(popup()!.hasAttribute("data-open")).toBe(true);
  });

  it("ignores a save that settles after the app closed the sheet", async () => {
    const pending = deferred<FormErrors>();
    // The app closes the sheet itself, from a button outside it.
    function Controlled() {
      const [openState, setOpen] = useState(false);
      return (
        <>
          <Button onClick={() => setOpen(true)}>Open</Button>
          <button type="button" data-app-close="" onClick={() => setOpen(false)} />
          <EditSheet title="Edit recipe" open={openState} onOpenChange={setOpen} onSubmit={() => pending.promise}>
            <Fields />
          </EditSheet>
        </>
      );
    }
    await render(<Controlled />);
    await userEvent.click(page.getByRole("button", { name: "Open" }));
    await settled();
    await userEvent.click(dialogButton("Save"));
    await act(async () => document.querySelector<HTMLElement>("[data-app-close]")!.click());
    await expect.poll(() => popup()).toBeNull();
    // Reopen: the late result neither closes it nor shows its errors, and nothing is loading.
    await userEvent.click(page.getByRole("button", { name: "Open" }));
    await settled();
    await act(async () => pending.resolve({ name: "Taken." }));
    expect(popup()!.hasAttribute("data-open")).toBe(true);
    expect(field("name").getAttribute("aria-invalid")).toBeNull();
    expect(dialogButton("Save").element().hasAttribute("aria-busy")).toBe(false);
  });

  it.each(["sync", "resolve", "reject"])("does not mark a new opening when onSubmit closes and reopens its own lifetime (%s)", async (mode) => {
    const pending = deferred<FormErrors>();
    function Controlled() {
      const [shown, setShown] = useState(true);
      return (
        <EditSheet title="Edit recipe" open={shown} onOpenChange={setShown} onSubmit={() => {
          flushSync(() => setShown(false));
          flushSync(() => setShown(true));
          return mode === "sync" ? { name: "Old refusal." } : pending.promise;
        }}>
          <Fields />
        </EditSheet>
      );
    }
    await render(<Controlled />);
    await settled();
    await userEvent.click(dialogButton("Save"));
    await settled();
    expect(field("name").getAttribute("aria-invalid")).toBeNull();
    expect(dialogButton("Save").element().hasAttribute("aria-busy")).toBe(false);
    if (mode === "resolve") await act(async () => pending.resolve({ name: "Old refusal." }));
    if (mode === "reject") {
      await act(async () => pending.reject(new Error("Old failure")));
      await expect.poll(() => warn.mock.calls.some((call: unknown[]) => String(call[0]).includes("after the user had left"))).toBe(true);
    }
    expect(field("name").getAttribute("aria-invalid")).toBeNull();
    expect(popup()!.querySelector('[role="alert"]')).toBeNull();
    expect(dialogButton("Save").element().hasAttribute("aria-busy")).toBe(false);
  });

  it("invalidates a promise when onSubmit unmounts its sheet", async () => {
    const pending = deferred<FormErrors>();
    function Controlled() {
      const [mounted, setMounted] = useState(true);
      return mounted ? (
        <EditSheet title="Edit recipe" open onOpenChange={() => {}} onSubmit={() => {
          flushSync(() => setMounted(false));
          return pending.promise;
        }}><Fields /></EditSheet>
      ) : null;
    }
    await render(<Controlled />);
    await settled();
    await userEvent.click(dialogButton("Save"));
    expect(popup()).toBeNull();
    await act(async () => pending.reject(new Error("Old failure")));
    await expect.poll(() => warn.mock.calls.some((call: unknown[]) => String(call[0]).includes("after the user had left"))).toBe(true);
  });

  it("ignores a rejection that settles after the app closed the sheet, but still warns", async () => {
    const pending = deferred<void>();
    function Controlled() {
      const [openState, setOpen] = useState(true);
      return (
        <>
          <button type="button" data-app-close="" onClick={() => setOpen(false)} />
          <EditSheet title="Edit recipe" open={openState} onOpenChange={setOpen} onSubmit={() => pending.promise}>
            <Fields />
          </EditSheet>
        </>
      );
    }
    await render(<Controlled />);
    await settled();
    await userEvent.click(dialogButton("Save"));
    await act(async () => document.querySelector<HTMLElement>("[data-app-close]")!.click());
    await expect.poll(() => popup()).toBeNull();
    await act(async () => pending.reject(new Error("Network down")));
    expect(warn).toHaveBeenCalledWith(
      '[ouro-ui] EditSheet: onSubmit rejected with "Network down" after the user had left that edit. Fix: return the message as an error for a field: onSubmit={async (data) => (await save(data)).errors}.',
    );
  });

  it("starts each opening without the last opening's errors", async () => {
    await open({ onSubmit: () => ({ name: "Taken." }) });
    await userEvent.click(dialogButton("Save"));
    await expect.poll(() => field("name").getAttribute("aria-invalid")).toBe("true");
    await userEvent.keyboard("{Escape}");
    await expect.poll(() => popup()).toBeNull();
    await userEvent.click(trigger());
    await settled();
    expect(field("name").getAttribute("aria-invalid")).toBeNull();
  });

  it("closes a controlled sheet through onOpenChange when the save succeeds", async () => {
    const onOpenChange = vi.fn();
    function Controlled() {
      const [openState, setOpen] = useState(false);
      return (
        <>
          <Button onClick={() => setOpen(true)}>Open</Button>
          <EditSheet
            title="Edit recipe"
            open={openState}
            onOpenChange={(next) => {
              onOpenChange(next);
              setOpen(next);
            }}
            onSubmit={() => {}}
          >
            <Fields />
          </EditSheet>
        </>
      );
    }
    await render(<Controlled />);
    await userEvent.click(page.getByRole("button", { name: "Open" }));
    await settled();
    await userEvent.click(dialogButton("Save"));
    await expect.poll(() => popup()).toBeNull();
    expect(onOpenChange.mock.calls).toEqual([[false]]);
  });

  it("is a bottom sheet on a phone, through Dialog", async () => {
    await page.viewport(390, 844);
    await open();
    expect(popup()!.getAttribute("data-ouro-presentation")).toBe("sheet");
    expect(popup()!.querySelector("form")).not.toBeNull();
    await userEvent.click(dialogButton("Save"));
    await expect.poll(() => popup()).toBeNull();
  });

  it("takes a Select whose list opens above the sheet, and submits its value", async () => {
    const onSubmit = vi.fn();
    await render(
      <EditSheet title="Edit recipe" onSubmit={onSubmit} trigger={<Button data-edit-trigger="">Edit</Button>}>
        <Select label="Course" name="course" options={[{ value: "main", label: "Main" }]} />
      </EditSheet>,
    );
    await userEvent.click(trigger());
    await settled();
    await userEvent.click(page.getByRole("combobox", { name: "Course" }));
    await userEvent.click(page.getByRole("option", { name: "Main" }));
    await userEvent.click(dialogButton("Save"));
    expect((onSubmit.mock.calls[0]![0] as FormData).get("course")).toBe("main");
  });

  it("renders on the server without throwing", () => {
    expect(() =>
      renderToString(
        <EditSheet title="Edit recipe" onSubmit={() => {}} trigger={<Button>Edit</Button>}>
          <Fields />
        </EditSheet>,
      ),
    ).not.toThrow();
  });
});

describe("EditSheet in a page Form (review fix round 1, finding 2)", () => {
  it("saves without submitting the page Form it sits in", async () => {
    const outer = vi.fn((event: FormEvent) => event.preventDefault());
    const inner = vi.fn();
    await render(
      <Form onSubmit={outer}>
        <TextField label="Title" name="title" required />
        <EditSheet title="Edit ingredient" trigger={<Button data-edit-trigger="">Edit</Button>} onSubmit={inner}>
          <TextField label="Qty" name="qty" defaultValue="1" />
        </EditSheet>
      </Form>,
    );
    await userEvent.click(trigger());
    await settled();
    await userEvent.click(dialogButton("Save"));
    await expect.poll(() => popup()).toBeNull();
    expect(inner).toHaveBeenCalledOnce();
    expect(outer).not.toHaveBeenCalled();
    // Focus went back to the trigger, not to the page form's empty required field.
    expect(document.activeElement).toBe(trigger());
  });
});

describe("EditSheet failures outside a field (review fix round 1, finding 3)", () => {
  const alert = () => popup()!.querySelector<HTMLElement>('[role="alert"]')!;

  it.each(["throw", "reject"])("replaces and focuses the alert for each accepted equal failure (%s)", async (mode) => {
    const onSubmit = vi.fn(() => {
      if (mode === "throw") throw new Error("offline");
      return Promise.reject(new Error("offline"));
    });
    await open({ onSubmit });
    await userEvent.click(dialogButton("Save"));
    await expect.poll(() => alert()?.textContent).toBe("Couldn't save. Try again.");
    const first = alert();
    await userEvent.click(dialogButton("Save"));
    expect(onSubmit).toHaveBeenCalledTimes(2);
    await expect.poll(alert).not.toBe(first);
    expect(alert().textContent).toBe("Couldn't save. Try again.");
    expect(document.activeElement).toBe(alert());
  });

  it("keeps the existing failure alert through pending renders and replaces it only when the next rejection arrives", async () => {
    const first = deferred<void>();
    const second = deferred<void>();
    await open({ onSubmit: vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise) });
    await userEvent.click(dialogButton("Save"));
    await act(async () => first.reject(new Error("offline")));
    await expect.poll(() => alert()?.textContent).toBe("Couldn't save. Try again.");
    const oldAlert = alert();
    const focus = vi.spyOn(oldAlert, "focus");
    await userEvent.click(dialogButton("Save"));
    expect(dialogButton("Save").element().getAttribute("aria-busy")).toBe("true");
    expect(alert()).toBe(oldAlert);
    expect(focus).not.toHaveBeenCalled();
    await act(async () => second.reject(new Error("offline")));
    await expect.poll(alert).not.toBe(oldAlert);
    expect(document.activeElement).toBe(alert());
  });

  it("shows the failure message in an alert and focuses it when onSubmit rejects", async () => {
    await open({ onSubmit: () => Promise.reject(new Error("Network down")) });
    await userEvent.click(dialogButton("Save"));
    await expect.poll(() => alert().textContent).toBe("Couldn't save. Try again.");
    expect(document.activeElement).toBe(alert());
    expect(popup()!.hasAttribute("data-open")).toBe(true);
  });

  it("takes the failure message as a prop, and shows it when onSubmit throws", async () => {
    await open({
      failureMessage: "Speichern fehlgeschlagen.",
      onSubmit: () => {
        throw new Error("offline");
      },
    });
    await userEvent.click(dialogButton("Save"));
    await expect.poll(() => alert().textContent).toBe("Speichern fehlgeschlagen.");
  });

  it("shows a returned error that matches no field in the alert, and warns", async () => {
    await open({ onSubmit: () => ({ form: "The server is down.", nmae: "Typo key." }) });
    await userEvent.click(dialogButton("Save"));
    await expect.poll(() => alert().textContent).toBe("The server is down.Typo key.");
    expect(popup()!.hasAttribute("data-open")).toBe(true);
    await expect.poll(() => warn.mock.calls.map((call: unknown[]) => String(call[0])).join("\n")).toContain('errors has the key "nmae"');
  });
});

describe("EditSheet with unsaved edits (review fix round 1, rulings 4 and 5)", () => {
  const confirmRow = () => popup()?.querySelector<HTMLElement>('[data-ouro="edit-sheet-discard"]') ?? null;

  it("closes at once from Escape and Cancel when nothing changed", async () => {
    await open();
    await userEvent.keyboard("{Escape}");
    await expect.poll(() => popup()).toBeNull();
    await userEvent.click(trigger());
    await settled();
    await userEvent.click(dialogButton("Cancel"));
    await expect.poll(() => popup()).toBeNull();
  });

  it("asks before Escape discards edits, inside the sheet, and keeps editing on request", async () => {
    await open();
    await userEvent.fill(page.getByRole("textbox", { name: "Name" }), "Soup");
    await userEvent.keyboard("{Escape}");
    await expect.poll(confirmRow).not.toBeNull();
    expect(popup()!.hasAttribute("data-open")).toBe(true);
    expect(document.querySelectorAll('[role="dialog"], [role="alertdialog"]').length).toBe(1);
    expect(confirmRow()!.textContent).toContain("Discard your changes?");
    // Focus goes to the safe choice.
    expect(document.activeElement).toBe(dialogButton("Keep editing").element());
    await userEvent.click(dialogButton("Keep editing"));
    await expect.poll(confirmRow).toBeNull();
    expect(field("name").value).toBe("Soup");
    expect(popup()!.hasAttribute("data-open")).toBe(true);
  });

  it("goes back to the form when Escape is pressed while it asks", async () => {
    await open();
    await userEvent.fill(page.getByRole("textbox", { name: "Name" }), "Soup");
    await userEvent.click(dialogButton("Cancel"));
    await expect.poll(confirmRow).not.toBeNull();
    await userEvent.keyboard("{Escape}");
    await expect.poll(confirmRow).toBeNull();
    expect(popup()!.hasAttribute("data-open")).toBe(true);
    expect(field("name").value).toBe("Soup");
  });

  it("counts an untouched file input as unchanged", async () => {
    await render(
      <EditSheet title="Edit recipe" onSubmit={() => {}} trigger={<Button data-edit-trigger="">Edit</Button>}>
        <TextField label="Name" name="name" defaultValue="Pasta" />
        <input type="file" name="photo" aria-label="Photo" />
      </EditSheet>,
    );
    await userEvent.click(trigger());
    await settled();
    await userEvent.click(dialogButton("Cancel"));
    await expect.poll(() => popup()).toBeNull();
  });

  it("discards edits from Cancel after confirming, and returns focus to the trigger", async () => {
    const onSubmit = vi.fn();
    await open({ onSubmit });
    await userEvent.fill(page.getByRole("textbox", { name: "Servings" }), "6");
    await userEvent.click(dialogButton("Cancel"));
    await expect.poll(confirmRow).not.toBeNull();
    await userEvent.click(dialogButton("Discard"));
    await expect.poll(() => popup()).toBeNull();
    await expect.poll(() => document.activeElement).toBe(trigger());
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("asks before a tap outside discards edits", async () => {
    await open();
    await userEvent.fill(page.getByRole("textbox", { name: "Name" }), "Soup");
    await page.elementLocator(document.body).click({ position: { x: 10, y: 10 } });
    await expect.poll(confirmRow).not.toBeNull();
    expect(popup()!.hasAttribute("data-open")).toBe(true);
  });

  it("counts a changed Select as an edit", async () => {
    await render(
      <EditSheet title="Edit recipe" onSubmit={() => {}} trigger={<Button data-edit-trigger="">Edit</Button>}>
        <Select label="Course" name="course" defaultValue="main" options={[{ value: "main", label: "Main" }, { value: "side", label: "Side" }]} />
      </EditSheet>,
    );
    await userEvent.click(trigger());
    await settled();
    await userEvent.click(page.getByRole("combobox", { name: "Course" }));
    await userEvent.click(page.getByRole("option", { name: "Side" }));
    await userEvent.click(dialogButton("Cancel"));
    await expect.poll(confirmRow).not.toBeNull();
  });

  it("takes the confirmation's labels as props", async () => {
    await open({ discardMessage: "Änderungen verwerfen?", discardLabel: "Verwerfen", keepEditingLabel: "Weiter bearbeiten" });
    await userEvent.fill(page.getByRole("textbox", { name: "Name" }), "Suppe");
    await userEvent.click(dialogButton("Cancel"));
    await expect.poll(confirmRow).not.toBeNull();
    expect(confirmRow()!.textContent).toContain("Änderungen verwerfen?");
    await userEvent.click(dialogButton("Verwerfen"));
    await expect.poll(() => popup()).toBeNull();
  });

  it.skipIf(server.browser !== "chromium")("asks before a swipe down on the phone sheet discards edits, and stays open", async () => {
    await page.viewport(390, 844);
    await open();
    await userEvent.fill(page.getByRole("textbox", { name: "Name" }), "Soup");
    (document.activeElement as HTMLElement).blur();
    const rect = popup()!.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    await commands.drag({ from: [x, rect.top + 10], to: [x, rect.top + 10 + rect.height * 0.8], steps: 12, durationMs: 600 });
    await expect.poll(confirmRow).not.toBeNull();
    expect(popup()!.hasAttribute("data-open")).toBe(true);
    // The sheet springs back to rest at the bottom edge, with the edits, and asking did not
    // scroll it out of place.
    await expect.poll(() => getComputedStyle(popup()!).transform).toBe("matrix(1, 0, 0, 1, 0, 0)");
    await expect.poll(() => Math.round(popup()!.getBoundingClientRect().bottom)).toBe(844);
    expect(field("name").value).toBe("Soup");
  });

  it("disables Cancel and ignores Escape while a save is pending", async () => {
    const pending = deferred<void>();
    await open({ onSubmit: () => pending.promise });
    await userEvent.click(dialogButton("Save"));
    expect(dialogButton("Save").element().getAttribute("aria-busy")).toBe("true");
    expect(dialogButton("Cancel").element().hasAttribute("disabled")).toBe(true);
    await userEvent.keyboard("{Escape}");
    await act(async () => new Promise((resolve) => setTimeout(resolve, 50)));
    expect(popup()!.hasAttribute("data-open")).toBe(true);
    await act(async () => pending.resolve());
    await expect.poll(() => popup()).toBeNull();
  });
});

describe("EditSheet's discard guard keeps the opening's values (review fix round 2, re-review finding)", () => {
  const confirmRow = () => popup()?.querySelector<HTMLElement>('[data-ouro="edit-sheet-discard"]') ?? null;
  const nameBox = () => page.getByRole("dialog").getByRole("textbox", { name: "Name" });

  function Controlled({ onSubmit }: { onSubmit: EditSheetProps["onSubmit"] }) {
    const [name, setName] = useState("Soup");
    return (
      <EditSheet title="Edit" trigger={<Button data-edit-trigger="">Edit</Button>} onSubmit={onSubmit}>
        <TextField label="Name" name="name" value={name} onValueChange={setName} />
      </EditSheet>
    );
  }
  const uncontrolled = (onSubmit: EditSheetProps["onSubmit"]) => (
    <EditSheet title="Edit" trigger={<Button data-edit-trigger="">Edit</Button>} onSubmit={onSubmit}>
      <TextField label="Name" name="name" defaultValue="Soup" />
    </EditSheet>
  );

  it("asks before Cancel discards an edit to a controlled field", async () => {
    await render(<Controlled onSubmit={() => {}} />);
    await userEvent.click(trigger());
    await settled();
    await userEvent.fill(nameBox(), "Stew");
    expect(field("name").value).toBe("Stew");
    await userEvent.click(dialogButton("Cancel"));
    await expect.poll(confirmRow).not.toBeNull();
  });

  it("still asks after a save that returned errors", async () => {
    await render(uncontrolled(() => ({ name: "Taken." })));
    await userEvent.click(trigger());
    await settled();
    await userEvent.fill(nameBox(), "Stew");
    await userEvent.click(dialogButton("Save"));
    await expect.poll(() => popup()!.textContent).toContain("Taken.");
    await userEvent.click(dialogButton("Cancel"));
    await expect.poll(confirmRow).not.toBeNull();
  });

  it("still asks after a save that was rejected", async () => {
    await render(uncontrolled(() => Promise.reject(new Error("down"))));
    await userEvent.click(trigger());
    await settled();
    await userEvent.fill(nameBox(), "Stew");
    await userEvent.click(dialogButton("Save"));
    await expect.poll(() => popup()!.textContent).toContain("Couldn't save");
    await userEvent.click(dialogButton("Cancel"));
    await expect.poll(confirmRow).not.toBeNull();
  });

  it("starts the next opening clean after a successful save", async () => {
    await render(<Controlled onSubmit={() => {}} />);
    await userEvent.click(trigger());
    await settled();
    await userEvent.fill(nameBox(), "Stew");
    await userEvent.click(dialogButton("Save"));
    await expect.poll(() => popup()).toBeNull();
    await userEvent.click(trigger());
    await settled();
    expect(field("name").value).toBe("Stew");
    await userEvent.click(dialogButton("Cancel"));
    await expect.poll(() => popup()).toBeNull();
  });

  it("starts clean when reopened before the close animation ends (round 3)", async () => {
    await render(uncontrolled(() => {}));
    await userEvent.click(trigger());
    await settled();
    const firstForm = popup()!.querySelector("form");
    // Cancel, then reopen at once: Base UI keeps the popup mounted through the exit, and the
    // new opening gets a fresh form inside it.
    await act(async () => (dialogButton("Cancel").element() as HTMLButtonElement).click());
    await act(async () => trigger().click());
    await settled();
    expect(popup()!.querySelector("form")).not.toBe(firstForm);
    await userEvent.click(dialogButton("Cancel"));
    await expect.poll(() => popup()).toBeNull();
    expect(confirmRow()).toBeNull();
  });

  it("drops a discarded edit when reopened before the close animation ends (round 4)", async () => {
    const onSubmit = vi.fn();
    await render(uncontrolled(onSubmit));
    await userEvent.click(trigger());
    await settled();
    await userEvent.fill(nameBox(), "Stew");
    await userEvent.click(dialogButton("Cancel"));
    await expect.poll(confirmRow).not.toBeNull();
    await act(async () => (dialogButton("Discard").element() as HTMLButtonElement).click());
    await act(async () => trigger().click());
    await settled();
    expect(field("name").value).toBe("Soup");
    await userEvent.click(dialogButton("Save"));
    expect((onSubmit.mock.calls[0]![0] as FormData).get("name")).toBe("Soup");
  });

  it("calls onDiscard when the user discards, so an app resets its controlled fields", async () => {
    const onDiscard = vi.fn();
    function Reset() {
      const [name, setName] = useState("Soup");
      return (
        <EditSheet title="Edit" trigger={<Button data-edit-trigger="">Edit</Button>} onSubmit={() => {}} onDiscard={() => (onDiscard(), setName("Soup"))}>
          <TextField label="Name" name="name" value={name} onValueChange={setName} />
        </EditSheet>
      );
    }
    await render(<Reset />);
    await userEvent.click(trigger());
    await settled();
    await userEvent.fill(nameBox(), "Stew");
    await userEvent.click(dialogButton("Cancel"));
    await expect.poll(confirmRow).not.toBeNull();
    // Keep editing is not a discard.
    await userEvent.click(dialogButton("Keep editing"));
    expect(onDiscard).not.toHaveBeenCalled();
    await userEvent.click(dialogButton("Cancel"));
    await userEvent.click(dialogButton("Discard"));
    await expect.poll(() => popup()).toBeNull();
    expect(onDiscard).toHaveBeenCalledTimes(1);
    // The next opening starts from the reset value, and a clean Cancel closes without asking.
    await userEvent.click(trigger());
    await settled();
    expect(field("name").value).toBe("Soup");
    await userEvent.click(dialogButton("Cancel"));
    await expect.poll(() => popup()).toBeNull();
  });

  it("does not call onDiscard when nothing changed or the save succeeds", async () => {
    const onDiscard = vi.fn();
    await render(
      <EditSheet title="Edit" trigger={<Button data-edit-trigger="">Edit</Button>} onSubmit={() => {}} onDiscard={onDiscard}>
        <TextField label="Name" name="name" defaultValue="Soup" />
      </EditSheet>,
    );
    await userEvent.click(trigger());
    await settled();
    await userEvent.click(dialogButton("Cancel"));
    await expect.poll(() => popup()).toBeNull();
    await userEvent.click(trigger());
    await settled();
    await userEvent.fill(nameBox(), "Stew");
    await userEvent.click(dialogButton("Save"));
    await expect.poll(() => popup()).toBeNull();
    expect(onDiscard).not.toHaveBeenCalled();
  });

  it("keeps the opening's values when a resize swaps the dialog for the sheet", async () => {
    await render(<Controlled onSubmit={() => {}} />);
    await userEvent.click(trigger());
    await settled();
    await userEvent.fill(nameBox(), "Stew");
    await page.viewport(390, 844);
    await expect.poll(() => popup()?.getAttribute("data-ouro-presentation")).toBe("sheet");
    await settled();
    await userEvent.click(dialogButton("Cancel"));
    await expect.poll(confirmRow).not.toBeNull();
  });
});

describe("EditSheet's close button while a save is pending (review fix round 2, finding 1)", () => {
  const close = () => popup()!.querySelector<HTMLButtonElement>("[data-ouro-dialog-close], [data-ouro-sheet-close]")!;

  it.each([
    ["centered dialog", 1280, 800],
    ["phone sheet", 390, 844],
  ] as const)("is disabled and looks it in the %s, then comes back after the save", async (_name, width, height) => {
    await page.viewport(width, height);
    const pending = deferred<FormErrors>();
    await open({ onSubmit: () => pending.promise });
    expect(close().disabled).toBe(false);
    const enabledOpacity = getComputedStyle(close()).opacity;
    await userEvent.click(dialogButton("Save"));
    await expect.poll(() => close().disabled).toBe(true);
    expect(close().hasAttribute("data-disabled")).toBe(true);
    if (width > 640) {
      // The close button's opacity eases with the press utility, so wait for it to arrive.
      await expect.poll(() => getComputedStyle(close()).opacity).not.toBe(enabledOpacity);
      expect(getComputedStyle(close()).cursor).toBe("not-allowed");
    }
    await act(async () => close().click());
    expect(popup()!.hasAttribute("data-open")).toBe(true);
    await act(async () => pending.resolve({ servings: "Use a whole number." }));
    await expect.poll(() => close().disabled).toBe(false);
  });
});

describe("EditSheet's footer keeps focus in the field (review fix round 3, ruling 1)", () => {
  it.each(["Save", "Cancel"])("cancels the mousedown on %s that would take focus, but not the pointerdown", async (name) => {
    const onSubmit = vi.fn();
    await open({ onSubmit });
    const button = dialogButton(name).element();
    const pointer = new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerType: "touch" });
    const mouse = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    button.dispatchEvent(pointer);
    button.dispatchEvent(mouse);
    // A cancelled pointerdown would stop WebKit from sending the tap's click.
    expect(pointer.defaultPrevented).toBe(false);
    expect(mouse.defaultPrevented).toBe(true);
  });

  it("leaves focus in the field when Save is clicked, and saves", async () => {
    const pending = deferred<void>();
    await open({ onSubmit: () => pending.promise });
    field("servings").focus();
    await userEvent.click(dialogButton("Save"));
    expect(dialogButton("Save").element().getAttribute("aria-busy")).toBe("true");
    expect(document.activeElement).toBe(field("servings"));
    await act(async () => pending.resolve());
    await expect.poll(() => popup()).toBeNull();
  });
});

describe("EditSheet dev messages", () => {
  it("throws the exact fix when neither trigger nor open is passed", () => {
    const props = { title: "Edit recipe", onSubmit: () => {}, children: null } as unknown as EditSheetProps;
    expect(() => renderToString(<EditSheet {...props} />)).toThrow(`[ouro-ui] EditSheet: needs trigger or open with onOpenChange. Fix: ${FIX}`);
  });

  it("warns once about guessed props and an empty title, and drops them from the DOM", async () => {
    const props = {
      title: "",
      onSubmit: () => {},
      trigger: <Button data-edit-trigger="">Edit</Button>,
      onSave: () => {},
      saveLabel: "Save",
      submitText: "Save",
      errors: { name: "Taken." },
      isOpen: true,
      onClose: () => {},
      children: <Fields />,
    } as unknown as EditSheetProps;
    await render(<EditSheet {...props} />);
    await userEvent.click(trigger());
    await settled();
    const messages = warn.mock.calls.map((call: unknown[]) => String(call[0]));
    expect(messages).toEqual([
      '[ouro-ui] EditSheet: title is required; it names the sheet for screen readers. Fix: <EditSheet title="Edit recipe">.',
      "[ouro-ui] EditSheet: onSave is not a prop. Fix: <EditSheet onSubmit={(data) => save(data)}>.",
      '[ouro-ui] EditSheet: saveLabel is not a prop. Fix: <EditSheet submitLabel="Save">.',
      '[ouro-ui] EditSheet: submitText is not a prop. Fix: <EditSheet submitLabel="Save">.',
      "[ouro-ui] EditSheet: errors is not a prop; return them from onSubmit. Fix: <EditSheet onSubmit={async (data) => (await save(data)).errors}>.",
      "[ouro-ui] EditSheet: isOpen is not a prop. Fix: <EditSheet open={open} onOpenChange={setOpen}>.",
      "[ouro-ui] EditSheet: onClose is not a prop. Fix: <EditSheet open={open} onOpenChange={setOpen}>.",
    ]);
    expect(popup()!.hasAttribute("onsave")).toBe(false);
  });
});
