import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { Form } from "@/registry/ouro/components/ouro/form/form";
import { TextField } from "@/registry/ouro/components/ouro/text-field/text-field";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

// docs/guides/testing.md, "Finding fields in tests", states each lookup below. They are how
// an app's own tests find Ouro UI's fields, so a change to a field's label, required marker,
// password button, error or the form's message region changes this file and that section
// together. Vitest's `getByLabelText` is Playwright's `getByLabel`; the rest share names.

const roots: Root[] = [];

afterEach(async () => {
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  document.body.innerHTML = "";
});

async function render(node: ReactNode) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
  return host;
}

const count = (locator: { elements: () => Element[] }) => locator.elements().length;

describe("Finding fields in tests, as the Testing page says", () => {
  it("finds a labelled field by role and name, or by its exact label", async () => {
    await render(<TextField label="Email" name="email" />);
    const input = document.querySelector('input[name="email"]')!;
    expect(page.getByRole("textbox", { name: "Email", exact: true }).element()).toBe(input);
    expect(page.getByLabelText("Email", { exact: true }).element()).toBe(input);
  });

  it("finds a required field by role and name; its label's text ends with the marker", async () => {
    await render(<TextField label="Email" name="email" required />);
    const input = document.querySelector('input[name="email"]')!;
    expect(page.getByRole("textbox", { name: "Email", exact: true }).element()).toBe(input);
    // The marker is hidden from assistive technology but is part of the label's text.
    expect(count(page.getByLabelText("Email", { exact: true }))).toBe(0);
    expect(page.getByLabelText("Email*", { exact: true }).element()).toBe(input);
    expect(input.hasAttribute("required")).toBe(true);
  });

  it("finds a password field by role and name too, required or not, apart from its show button", async () => {
    await render(<TextField label="Password" name="password" type="password" required />);
    const input = document.querySelector('input[name="password"]')!;
    // Playwright and Vitest give a password input the textbox role (Testing Library gives it none).
    expect(page.getByRole("textbox", { name: "Password", exact: true }).element()).toBe(input);
    expect(page.getByLabelText("Password*", { exact: true }).element()).toBe(input);
    const button = page.getByRole("button", { name: "Show password" }).element();
    expect(button).not.toBe(input);
    expect(button.getAttribute("aria-label")).toBe("Show password");
  });

  it("finds a field's error by its text and as the field's description; it is not an alert", async () => {
    await render(<TextField label="Email" name="email" error="Enter an email address." />);
    const input = document.querySelector<HTMLInputElement>('input[name="email"]')!;
    const error = page.getByText("Enter an email address.", { exact: true }).element();
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect((input.getAttribute("aria-describedby") ?? "").split(" ")).toContain(error.id);
    expect(error.closest('[role="alert"]')).toBeNull();
  });

  it("finds the form's message in its alert region, which is in the page even when empty", async () => {
    const host = await render(
      <Form>
        <TextField label="Email" name="email" />
      </Form>,
    );
    // The region is always rendered, so a bare getByRole("alert") finds it with no message.
    expect(count(page.getByRole("alert"))).toBe(1);
    expect(page.getByRole("alert").element().textContent).toBe("");
    await act(async () => roots[0]!.render(
      <Form errors={{ form: "We could not save your changes." }}>
        <TextField label="Email" name="email" />
      </Form>,
    ));
    expect(host.querySelector('[role="alert"]')!.textContent).toBe("We could not save your changes.");
    expect(count(page.getByRole("alert").filter({ hasText: "We could not save your changes." }))).toBe(1);
  });
});
