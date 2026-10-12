import { forwardRef, useState, type ComponentPropsWithRef, type FormEvent, type ReactNode } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { Field } from "@/registry/ouro/components/ouro/field/field";
import { FieldControl } from "@/registry/ouro/components/ouro/field/field-parts";
import { Form, type FormErrors } from "@/registry/ouro/components/ouro/form/form";
import { TextArea } from "@/registry/ouro/components/ouro/text-field/text-area";
import { TextField } from "@/registry/ouro/components/ouro/text-field/text-field";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

const roots: Root[] = [];
let mounted: Element[] = [];

async function render(node: ReactNode) {
  const host = document.createElement("div");
  host.style.padding = "24px";
  host.style.maxWidth = "420px";
  document.body.append(host);
  mounted.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
  return {
    host,
    rerender: (next: ReactNode) => act(async () => root.render(next)),
    get form() {
      return host.querySelector<HTMLFormElement>("form")!;
    },
    input(name: string) {
      return host.querySelector<HTMLInputElement>(`[name="${name}"]`)!;
    },
  };
}

/** The ids an element's `aria-describedby` lists. */
const describedBy = (element: Element) => (element.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean);
/** The text of the elements an element's `aria-describedby` names. */
const description = (element: Element) => describedBy(element).map((id) => element.ownerDocument.getElementById(id)?.textContent ?? "");

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(async () => {
  vi.restoreAllMocks();
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  for (const node of mounted) node.remove();
  mounted = [];
  await page.viewport(414, 896);
});

/**
 * A page with a React Router style action: submitting sends the form (here, a promise that
 * resolves on the next task) and the action's errors come back as a prop.
 */
function ActionPage({ result, onSent }: { result: FormErrors | undefined; onSent?: (data: FormData) => void }) {
  const [errors, setErrors] = useState<FormErrors | undefined>();
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    onSent?.(data);
    setTimeout(() => setErrors(result));
  };
  return (
    <Form method="post" errors={errors} onSubmit={submit}>
      <TextField label="Name" name="name" defaultValue="Ari" />
      <TextField label="Email" name="email" type="email" description="We never share it." defaultValue="ari@example.com" />
      <TextArea label="Bio" name="bio" />
      <button type="submit">Save</button>
    </Form>
  );
}

describe("Form", () => {
  it("renders a form that passes action and method through", async () => {
    const { form } = await render(
      <Form action="/recipes/new" method="post" className="mt-4">
        <TextField label="Name" name="name" />
      </Form>,
    );
    expect(form.getAttribute("action")).toBe("/recipes/new");
    expect(form.getAttribute("method")).toBe("post");
    expect(form.getAttribute("data-ouro")).toBe("form");
    expect(getComputedStyle(form).marginTop).toBe("16px");
  });

  it("renders a router's form through render, so its submit handling runs", async () => {
    const routerSubmit = vi.fn();
    // A stand-in for React Router's <Form>: its own submit handler runs after the one it is given.
    const RouterForm = forwardRef<HTMLFormElement, ComponentPropsWithRef<"form">>(function RouterForm({ onSubmit, ...props }, ref) {
      return (
        <form
          {...props}
          ref={ref}
          data-router=""
          onSubmit={(event) => {
            onSubmit?.(event);
            if (event.defaultPrevented) return;
            event.preventDefault();
            routerSubmit(new FormData(event.currentTarget).get("name"));
          }}
        />
      );
    });
    const { form } = await render(
      <Form render={<RouterForm />} method="post">
        <TextField label="Name" name="name" required />
        <button type="submit">Save</button>
      </Form>,
    );
    expect(form.hasAttribute("data-router")).toBe(true);
    expect(form.getAttribute("method")).toBe("post");
    // An empty required field stops the submit before the router sees it.
    await userEvent.click(page.getByRole("button", { name: "Save" }));
    expect(routerSubmit).not.toHaveBeenCalled();
    await userEvent.fill(page.getByRole("textbox", { name: "Name" }), "Pasta");
    await userEvent.click(page.getByRole("button", { name: "Save" }));
    expect(routerSubmit).toHaveBeenCalledWith("Pasta");
  });

  it("validates with the browser's constraints and focuses the first invalid control", async () => {
    const submitted = vi.fn((event: FormEvent) => event.preventDefault());
    const { input } = await render(
      <Form onSubmit={submitted}>
        <TextField label="Name" name="name" />
        <TextField label="Email" name="email" type="email" required />
        <TextField label="Phone" name="phone" type="tel" required />
        <button type="submit">Save</button>
      </Form>,
    );
    await userEvent.click(page.getByRole("button", { name: "Save" }));
    expect(submitted).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(input("email"));
    expect(input("email").getAttribute("aria-invalid")).toBe("true");
    await expect.poll(() => description(input("email")).join(" ")).toContain(input("email").validationMessage);
  });

  it("shows each error on the field with that name, linked and marked invalid", async () => {
    const { input } = await render(
      <Form errors={{ email: "That email is taken.", bio: ["Too long.", "No links."] }}>
        <TextField label="Name" name="name" />
        <TextField label="Email" name="email" description="We never share it." />
        <TextArea label="Bio" name="bio" />
      </Form>,
    );
    expect(input("name").getAttribute("aria-invalid")).toBeNull();
    expect(input("email").getAttribute("aria-invalid")).toBe("true");
    expect(description(input("email"))).toEqual(["We never share it.", "That email is taken."]);
    expect(input("bio").getAttribute("aria-invalid")).toBe("true");
    expect(description(input("bio"))).toEqual(["Too long.No links."]);
  });

  it("lets a field's own error prop win over the form's", async () => {
    const { input } = await render(
      <Form errors={{ email: "From the form." }}>
        <TextField label="Email" name="email" error="From the field." />
        <TextField label="Name" name="name" error="" />
      </Form>,
    );
    expect(description(input("email"))).toEqual(["From the field."]);
  });

  it("clears a field's form error once the user changes it", async () => {
    const { input } = await render(
      <Form errors={{ email: "That email is taken.", name: "Required." }}>
        <TextField label="Name" name="name" />
        <TextField label="Email" name="email" />
      </Form>,
    );
    await userEvent.fill(page.getByRole("textbox", { name: "Email" }), "new@example.com");
    expect(input("email").getAttribute("aria-invalid")).toBeNull();
    expect(describedBy(input("email"))).toEqual([]);
    // The other field keeps its error.
    expect(input("name").getAttribute("aria-invalid")).toBe("true");
  });

  it("shows new errors when the errors prop changes, even after the user cleared one", async () => {
    const first = { email: "That email is taken." };
    const { input, rerender } = await render(
      <Form errors={first}>
        <TextField label="Email" name="email" />
      </Form>,
    );
    await userEvent.fill(page.getByRole("textbox", { name: "Email" }), "x");
    expect(input("email").getAttribute("aria-invalid")).toBeNull();
    // The same object again changes nothing.
    await rerender(
      <Form errors={first}>
        <TextField label="Email" name="email" />
      </Form>,
    );
    expect(input("email").getAttribute("aria-invalid")).toBeNull();
    await rerender(
      <Form errors={{ email: "Still taken." }}>
        <TextField label="Email" name="email" />
      </Form>,
    );
    expect(description(input("email"))).toEqual(["Still taken."]);
  });

  it("ignores a change in a field without a form error", async () => {
    const { input } = await render(
      <Form errors={{ email: "That email is taken." }}>
        <TextField label="Name" name="name" />
        <TextField label="Email" name="email" />
        <Field label="Unnamed">
          <FieldControl />
        </Field>
      </Form>,
    );
    await userEvent.fill(page.getByRole("textbox", { name: "Name" }), "Ari");
    await userEvent.fill(page.getByRole("textbox", { name: "Unnamed" }), "x");
    expect(input("email").getAttribute("aria-invalid")).toBe("true");
  });

  it("moves focus to the first invalid field when a submit comes back with errors (Review Focus 2)", async () => {
    const sent = vi.fn();
    const { input } = await render(<ActionPage result={{ bio: "Too short.", email: "That email is taken." }} onSent={sent} />);
    await userEvent.click(page.getByRole("button", { name: "Save" }));
    expect(sent).toHaveBeenCalledOnce();
    expect((sent.mock.calls[0]![0] as FormData).get("email")).toBe("ari@example.com");
    // Email comes first in the page, so it gets focus, though the action listed Bio first.
    await expect.poll(() => document.activeElement).toBe(input("email"));
    expect(input("email").getAttribute("aria-invalid")).toBe("true");
    expect(description(input("email"))).toEqual(["We never share it.", "That email is taken."]);
    expect(input("bio").getAttribute("aria-invalid")).toBe("true");
    expect(input("name").getAttribute("aria-invalid")).toBeNull();
  });

  it("leaves focus alone when a submit comes back without errors", async () => {
    await render(<ActionPage result={undefined} />);
    const save = page.getByRole("button", { name: "Save" });
    await userEvent.click(save);
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(document.activeElement).toBe(save.element());
  });

  it("does not move focus when the user clears an error while typing", async () => {
    const { input } = await render(<ActionPage result={{ email: "That email is taken.", bio: "Too short." }} />);
    await userEvent.click(page.getByRole("button", { name: "Save" }));
    await expect.poll(() => document.activeElement).toBe(input("email"));
    await userEvent.fill(page.getByRole("textbox", { name: "Email" }), "new@example.com");
    expect(document.activeElement).toBe(input("email"));
    expect(input("bio").getAttribute("aria-invalid")).toBe("true");
  });
});

describe("Form development messages", () => {
  it("names errors when an app passes validationErrors", async () => {
    const props = { validationErrors: { email: "Taken." } } as unknown as Parameters<typeof Form>[0];
    const { form } = await render(
      <Form {...props}>
        <TextField label="Email" name="email" />
      </Form>,
    );
    expect(warn).toHaveBeenCalledWith("[ouro-ui] Form: validationErrors is not a prop. Fix: <Form errors={actionData?.errors}>.");
    expect(form.hasAttribute("validationerrors")).toBe(false);
  });

  it("warns for an appearance class", async () => {
    await render(
      <Form className="bg-muted">
        <TextField label="Email" name="email" />
      </Form>,
    );
    expect(warn).toHaveBeenCalledWith(
      '[ouro-ui] Form: "bg-muted" sets appearance, and className is for layout only. Fix: style fields in your theme (--input, --ring, --radius).',
    );
  });
});

describe("Form server rendering", () => {
  it("links a form error to its control in the server HTML (task 1 review, finding 1)", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const html = renderToString(
      <Form errors={{ email: "Taken." }}>
        <TextField label="Email" name="email" description="We never share it." />
        <TextField label="Name" name="name" />
      </Form>,
    );
    const doc = new DOMParser().parseFromString(html, "text/html");
    const email = doc.querySelector<HTMLInputElement>('input[name="email"]')!;
    expect(email.getAttribute("aria-invalid")).toBe("true");
    const ids = describedBy(email);
    expect(ids.map((id) => doc.getElementById(id)?.textContent)).toEqual(["We never share it.", "Taken."]);
    expect(ids[1]).toMatch(/-error$/);
    const name = doc.querySelector<HTMLInputElement>('input[name="name"]')!;
    expect(name.getAttribute("aria-invalid")).toBeNull();
    expect(name.hasAttribute("aria-describedby")).toBe(false);
    expect(error).not.toHaveBeenCalled();
  });

  it("hydrates a form with errors with the same ids and no hydration warning", async () => {
    const node = (
      <Form errors={{ email: "Taken." }}>
        <TextField label="Email" name="email" description="We never share it." />
      </Form>
    );
    const host = document.createElement("div");
    host.innerHTML = renderToString(node);
    document.body.append(host);
    mounted.push(host);
    const snapshot = () =>
      [...host.querySelectorAll("input, label, p, div")].map((el) => [el.id, el.getAttribute("for"), el.getAttribute("aria-describedby")]);
    const before = snapshot();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const recoverable = vi.fn();
    let root!: Root;
    await act(async () => {
      root = hydrateRoot(host, node, { onRecoverableError: recoverable });
    });
    roots.push(root);
    expect(snapshot()).toEqual(before);
    expect(recoverable).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
});
