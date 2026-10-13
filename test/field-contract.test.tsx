import { useState, type FormEvent, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { ColorField } from "@/registry/ouro/components/ouro/color-field/color-field";
import { FileField } from "@/registry/ouro/components/ouro/file-field/file-field";
import { Form, type FormErrors } from "@/registry/ouro/components/ouro/form/form";
import { OtpField } from "@/registry/ouro/components/ouro/otp-field/otp-field";
import { TextArea } from "@/registry/ouro/components/ouro/text-field/text-area";
import { TextField } from "@/registry/ouro/components/ouro/text-field/text-field";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

// Every control on the Field contract, under the rule that errors are display-only: an error
// shows and marks the control, but never blocks a submit; the browser's constraints still do.
// Repository-only: it spans several items, so no single item ships it.

const roots: Root[] = [];
const nodes: Element[] = [];
async function render(node: ReactNode) {
  const host = document.createElement("div");
  document.body.append(host);
  nodes.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
  return host;
}
afterEach(async () => {
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  for (const node of nodes.splice(0)) node.remove();
});

const save = () => page.getByRole("button", { name: "Save" });

const controls: [string, (error?: string) => ReactNode, string][] = [
  ["TextField", (error) => <TextField label="X" name="x" defaultValue="a" error={error} />, "input[name=x]"],
  ["TextArea", (error) => <TextArea label="X" name="x" defaultValue="a" error={error} />, "textarea"],
  ["OtpField", (error) => <OtpField label="X" name="x" length={4} defaultValue="1234" error={error} />, '[data-ouro="otp-field"] input:not([type=hidden])'],
  ["FileField", (error) => <FileField label="X" name="x" error={error} />, "input[type=file]"],
  ["ColorField", (error) => <ColorField label="X" name="x" defaultValue="#3366ff" error={error} />, '[data-ouro="color-field"] input[type=text]'],
];

describe.each(controls)("%s with display-only errors", (_name, make, selector) => {
  it("shows a Form error, marks and focuses the control, and resubmits unchanged", async () => {
    const sent = vi.fn();
    function Page() {
      const [errors, setErrors] = useState<FormErrors | undefined>();
      return (
        <Form
          errors={errors}
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            sent();
            setErrors({ x: "Server says no." });
          }}
        >
          <TextField label="Before" name="before" defaultValue="b" />
          {make()}
          <button type="submit">Save</button>
        </Form>
      );
    }
    const host = await render(<Page />);
    await userEvent.click(save());
    await expect.poll(() => host.textContent).toContain("Server says no.");
    const control = host.querySelector<HTMLElement>(selector)!;
    const root = control.closest("[data-ouro]")!;
    expect(control.getAttribute("aria-invalid")).toBe("true");
    expect(root.hasAttribute("data-invalid")).toBe(true);
    await expect.poll(() => document.activeElement?.closest("[data-ouro]")).toBe(root);
    await userEvent.click(save());
    await act(async () => {});
    expect(sent).toHaveBeenCalledTimes(2);
  });

  it("shows its own error prop, marks the control, and resubmits unchanged", async () => {
    const sent = vi.fn();
    const host = await render(
      <Form
        onSubmit={(event: FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          sent();
        }}
      >
        {make("Own error.")}
        <button type="submit">Save</button>
      </Form>,
    );
    expect(host.textContent).toContain("Own error.");
    expect(host.querySelector(selector)!.getAttribute("aria-invalid")).toBe("true");
    await userEvent.click(save());
    await userEvent.click(save());
    await act(async () => {});
    expect(sent).toHaveBeenCalledTimes(2);
  });
});

describe("constraints still block under display-only errors", () => {
  it("blocks and focuses an empty required TextField, even with a server error on another field", async () => {
    const sent = vi.fn();
    function Page() {
      const [errors, setErrors] = useState<FormErrors | undefined>({ b: "x" });
      return (
        <Form
          errors={errors}
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            sent();
            setErrors({});
          }}
        >
          <TextField label="B" name="b" defaultValue="b" />
          <TextField label="Req" name="req" required />
          <button type="submit">Save</button>
        </Form>
      );
    }
    await render(<Page />);
    await userEvent.click(save());
    await act(async () => {});
    expect(sent).toHaveBeenCalledTimes(0);
    expect(document.activeElement?.getAttribute("name")).toBe("req");
    const req = page.getByRole("textbox", { name: "Req" });
    await userEvent.fill(req, "ok");
    // The browser's message keeps its space while it fades out, and Save moves up when it goes:
    // a click that presses before the move and releases after it clicks nothing.
    await expect.poll(() => !req.element().hasAttribute("aria-invalid") && document.querySelector("[data-ending-style]") === null).toBe(true);
    await userEvent.click(save());
    await act(async () => {});
    expect(sent).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["OtpField", <OtpField key="otp" label="X" name="x" length={4} required />],
    ["FileField", <FileField key="file" label="X" name="x" required />],
  ])("blocks an empty required %s", async (_name, node) => {
    const sent = vi.fn();
    await render(
      <Form
        onSubmit={(event: FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          sent();
        }}
      >
        {node}
        <button type="submit">Save</button>
      </Form>,
    );
    await userEvent.click(save());
    await act(async () => {});
    expect(sent).toHaveBeenCalledTimes(0);
  });
});
