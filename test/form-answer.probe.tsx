import { StrictMode, useState, type ReactNode } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Form } from "@/registry/ouro/components/ouro/form/form";
import { TextField } from "@/registry/ouro/components/ouro/text-field/text-field";
import { formErrors, type FormErrors } from "@/registry/ouro/lib/ouro/form-errors";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

// Repo-only actual Router fixture: installed by form-answer-proof.yml into owned scratch.
const routerModule = `file://${process.cwd()}/.tmp/adopt-a-form-value/node_modules/react-router/dist/development/index.mjs`;
const { createMemoryRouter, RouterProvider, Form: RouterForm, useActionData, useNavigation } = await import(/* @vite-ignore */ routerModule);
type Answer = { errors: FormErrors; acceptedKey?: number };
let root: Root | undefined;
let host: HTMLDivElement | undefined;
let router: { state: { navigation: { state: string } }; dispose: () => void } | undefined;
afterEach(async () => {
  await act(async () => root?.unmount());
  router?.dispose();
  host?.remove();
  root = undefined;
  router = undefined;
  host = undefined;
  vi.restoreAllMocks();
});
const email = () => host!.querySelector<HTMLInputElement>('input[name="email"]')!;
const name = () => host!.querySelector<HTMLInputElement>('input[name="name"]')!;
const alert = () => host!.querySelector<HTMLElement>('[role="alert"]');
const messages = () => ({ email: "That email is taken.", form: "Could not save." });
const fields = <>
  <TextField label="Email" name="email" defaultValue="a@example.com" />
  <TextField label="Name" name="name" defaultValue="Ari" />
  <button type="submit">Save</button>
</>;
async function edit() {
  await act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(email(), "b@example.com");
    email().dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function render(node: ReactNode) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(() => root!.render(node));
}
async function route({ immediate = false, mapped = false, raw = false, cached = false, keyed = false, formOnly = false } = {}) {
  let release: (() => void) | undefined;
  let accepted = 0;
  const cachedAnswer: Answer = { errors: formOnly ? { form: "Could not save." } : messages() };
  function Page() {
    const data = useActionData() as Answer | undefined;
    const navigation = useNavigation();
    const projection = mapped ? { email: data?.errors.email, form: data?.errors.form } : data?.errors;
    const value = raw ? projection : keyed && data
      ? formErrors(cachedAnswer, projection, { key: data.acceptedKey! })
      : formErrors(data, projection);
    return <>
      <output>{navigation.state}</output>
      <Form method="post" render={<RouterForm />} errors={value}>{fields}</Form>
    </>;
  }
  const reply = () => {
    accepted += 1;
    if (keyed) return { ...cachedAnswer, acceptedKey: accepted };
    return cached ? cachedAnswer : { errors: { ...cachedAnswer.errors } };
  };
  router = createMemoryRouter([{
    path: "/subscribe", element: <Page />,
    action: () => immediate ? reply() : new Promise<Answer>((resolve) => { release = () => resolve(reply()); }),
  }], { initialEntries: ["/subscribe"] });
  await render(<RouterProvider router={router} />);
  return {
    submit: async () => {
      await act(() => host!.querySelector<HTMLButtonElement>('button[type="submit"]')!.click());
      await expect.poll(() => router!.state.navigation.state).toBe(immediate ? "idle" : "submitting");
      if (!immediate) expect(release).toBeDefined();
    },
    arrive: async () => {
      await act(() => release!());
      await expect.poll(() => router!.state.navigation.state).toBe("idle");
    },
  };
}

describe("Form answer value: actual Router 7.18.4 Node DOM", () => {
  it.each([false, true])("restores an equal direct answer, focuses once and replaces its alert for immediate=%s", async (immediate) => {
    const flow = await route({ immediate });
    await flow.submit();
    if (!immediate) await flow.arrive();
    expect(email().getAttribute("aria-invalid")).toBe("true");
    const first = alert();
    await edit();
    const focus = vi.spyOn(email(), "focus");
    name().focus();
    await flow.submit();
    if (!immediate) {
      expect(email().getAttribute("aria-invalid")).toBeNull();
      expect(alert()).toBe(first);
      expect(focus).not.toHaveBeenCalled();
      await flow.arrive();
    }
    expect(email().getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(email());
    expect(focus).toHaveBeenCalledTimes(1);
    expect(alert()).not.toBe(first);
  });

  it("rebuilds a mapped projection during pending without restoring a cleared error, then accepts the equal answer", async () => {
    const flow = await route({ mapped: true });
    await flow.submit(); await flow.arrive(); await edit();
    const first = alert();
    await flow.submit();
    expect(email().getAttribute("aria-invalid")).toBeNull();
    expect(alert()).toBe(first);
    name().focus();
    await flow.arrive();
    expect(email().getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(email());
    expect(alert()).not.toBe(first);
  });

  it("does not invent an arrival when an action returns the same cached answer object without a new acceptance key", async () => {
    const flow = await route({ cached: true });
    await flow.submit(); await flow.arrive(); await edit();
    const first = alert();
    await flow.submit(); await flow.arrive();
    expect(email().getAttribute("aria-invalid")).toBeNull();
    expect(alert()).toBe(first);
  });

  it("accepts a cached business payload once for each key actually produced at completed action acceptance", async () => {
    const flow = await route({ cached: true, keyed: true });
    await flow.submit(); await flow.arrive(); await edit();
    const first = alert();
    const focus = vi.spyOn(email(), "focus");
    await flow.submit();
    expect(email().getAttribute("aria-invalid")).toBeNull();
    expect(alert()).toBe(first);
    expect(focus).not.toHaveBeenCalled();
    await flow.arrive();
    expect(email().getAttribute("aria-invalid")).toBe("true");
    expect(alert()).not.toBe(first);
    expect(focus).toHaveBeenCalledTimes(1);
  });

  it("focuses a form-only equal answer's replacement alert, once", async () => {
    const flow = await route({ formOnly: true });
    await flow.submit(); await flow.arrive();
    const first = alert();
    await flow.submit();
    expect(alert()).toBe(first);
    await flow.arrive();
    expect(alert()).not.toBe(first);
    expect(document.activeElement).toBe(alert());
  });

  it("preserves the cleared mask on a client-prevented raw RouterForm submit that rebuilds its projection", async () => {
    const answer = {};
    function Page() {
      const [blocked, setBlocked] = useState(false);
      return <Form method="post" render={<RouterForm />}
        errors={formErrors(answer, { ...messages(), form: blocked ? "Client message." : "Could not save." })}
        onSubmit={(event) => { event.preventDefault(); setBlocked(true); }}>{fields}</Form>;
    }
    const action = vi.fn(() => { throw new Error("prevented submit reached the action"); });
    router = createMemoryRouter([{ path: "/", element: <Page />, action }], { initialEntries: ["/"] });
    await render(<RouterProvider router={router} />);
    const first = alert();
    await edit();
    name().focus();
    const focus = vi.spyOn(email(), "focus");
    await act(() => host!.querySelector<HTMLButtonElement>('button[type="submit"]')!.click());
    expect(action).not.toHaveBeenCalled();
    expect(email().getAttribute("aria-invalid")).toBeNull();
    expect(alert()).toBe(first);
    expect(alert()!.textContent).toBe("Client message.");
    expect(document.activeElement).toBe(name());
    expect(focus).not.toHaveBeenCalled();
  });

  it("retains the raw record's honest content-only limitation rather than treating equal allocations as answers", async () => {
    const flow = await route({ raw: true, mapped: true });
    await flow.submit(); await flow.arrive(); await edit();
    const first = alert();
    await flow.submit();
    expect(email().getAttribute("aria-invalid")).toBeNull();
    await flow.arrive();
    expect(email().getAttribute("aria-invalid")).toBeNull();
    expect(alert()).toBe(first);
  });
});

describe("Form answer value: projection, privacy and hydration boundaries", () => {
  const value = (answer: object | undefined, projection: FormErrors) =>
    <Form errors={formErrors(answer, projection)}>{fields}</Form>;
  const rerender = async (node: ReactNode) => act(() => root!.render(node));

  it("keeps a masked key cleared through omission, empty maps, absence and re-addition until a real new answer", async () => {
    const answer = {};
    await render(value(answer, messages())); await edit();
    for (const node of [value(answer, { form: "Could not save." }), value(answer, {}), value(undefined, {}), value(answer, messages())]) {
      await rerender(node);
      expect(email().getAttribute("aria-invalid")).toBeNull();
    }
    await rerender(value({}, messages()));
    expect(email().getAttribute("aria-invalid")).toBe("true");
  });

  it("renders fresh uncleared React node props and handlers without a new generation, focus or masked resurrection", async () => {
    const answer = {};
    const firstHandler = vi.fn();
    const nextHandler = vi.fn();
    const projection = (href: string, handler: () => void): FormErrors => ({
      email: "Taken.", form: <a href={href} onClick={handler}>Help</a>,
    });
    await render(value(answer, projection("/first", firstHandler)));
    const first = alert();
    await edit(); name().focus();
    const focus = vi.spyOn(email(), "focus");
    await rerender(value(answer, projection("#changed", nextHandler)));
    expect(email().getAttribute("aria-invalid")).toBeNull();
    expect(alert()).toBe(first);
    expect(alert()!.querySelector("a")!.getAttribute("href")).toBe("#changed");
    await act(() => alert()!.querySelector("a")!.click());
    expect(nextHandler).toHaveBeenCalledTimes(1);
    expect(firstHandler).not.toHaveBeenCalled();
    expect(focus).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(name());
  });

  it("coalesces changed content and a genuine accepted answer into one focus and one alert insertion in StrictMode", async () => {
    await render(<StrictMode>{value(undefined, {})}</StrictMode>);
    const focus = vi.spyOn(email(), "focus");
    let inserted = 0;
    const observer = new MutationObserver((records) => {
      for (const record of records) for (const node of record.addedNodes) {
        if (node instanceof HTMLElement && node.matches('[role="alert"]')) inserted += 1;
      }
    });
    observer.observe(host!, { childList: true, subtree: true });
    const answer = {};
    try {
      await rerender(<StrictMode>{value(answer, { email: "New refusal.", form: "New message." })}</StrictMode>);
      expect(focus).toHaveBeenCalledTimes(1);
      expect(inserted).toBe(1);
      const first = alert();
      name().focus();
      await rerender(<StrictMode>{value(answer, { email: "Other presentation.", form: "Updated text." })}</StrictMode>);
      expect(alert()).toBe(first);
      expect(inserted).toBe(1);
      expect(focus).toHaveBeenCalledTimes(1);
      expect(document.activeElement).toBe(name());
    } finally { observer.disconnect(); }
  });

  it("treats same explicit key with a new source as presentation and a changed key with reused source as an answer", async () => {
    const source = {};
    const keyed = (answer: object, key: number) => <Form errors={formErrors(answer, messages(), { key })}>{fields}</Form>;
    await render(keyed(source, 0)); await edit();
    const first = alert();
    await rerender(keyed({}, 0));
    expect(email().getAttribute("aria-invalid")).toBeNull();
    expect(alert()).toBe(first);
    await rerender(keyed(source, 1));
    expect(email().getAttribute("aria-invalid")).toBe("true");
    expect(alert()).not.toBe(first);
  });

  it("accepts a keyed successful null answer without an empty alert or error-focus target", async () => {
    await render(value({}, messages())); await edit();
    name().focus();
    await rerender(<Form errors={formErrors(null, { email: undefined, form: null }, { key: "success" })}>
      <>
        <TextField label="Email" name="email" error="Local-only check." />
        <TextField label="Name" name="name" />
      </>
    </Form>);
    expect(alert()).toBeNull();
    expect(document.activeElement).toBe(name());
    await rerender(value({}, messages()));
    expect(email().getAttribute("aria-invalid")).toBe("true");
  });

  it("preserves receipt identity across reconstruction only when a safe acceptance key is supplied separately", async () => {
    const answer = { secret: "UNSELECTED_SERIALIZATION_SENTINEL" };
    const transport = () => JSON.parse(JSON.stringify({
      key: 0, messages: formErrors(answer, messages(), { key: 0 }),
    })) as { key: number; messages: FormErrors };
    const node = (copy: { key: number; messages: FormErrors }) =>
      <Form errors={formErrors({}, copy.messages, { key: copy.key })}>{fields}</Form>;
    await render(node(transport())); await edit();
    const first = alert();
    await rerender(node(transport()));
    expect(email().getAttribute("aria-invalid")).toBeNull();
    expect(alert()).toBe(first);
    expect(JSON.stringify(transport())).not.toContain("UNSELECTED_SERIALIZATION_SENTINEL");
    await rerender(node({ ...transport(), key: 1 }));
    expect(email().getAttribute("aria-invalid")).toBe("true");
    expect(alert()).not.toBe(first);
  });

  it("does not derive an arrival from raw/opaque representation switching or discard a cleared mask", async () => {
    const answer = {};
    await render(value(answer, messages())); await edit();
    const first = alert();
    name().focus();
    await rerender(<Form errors={{ ...messages() }}>{fields}</Form>);
    expect(email().getAttribute("aria-invalid")).toBeNull();
    expect(alert()).toBe(first);
    await rerender(value(answer, messages()));
    expect(email().getAttribute("aria-invalid")).toBeNull();
    expect(alert()).toBe(first);
    expect(document.activeElement).toBe(name());
  });

  it("only masks a changed field that actually held a Form error, not every edited field", async () => {
    const answer = {};
    await render(value(answer, { email: "Taken." }));
    await act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(name(), "Changed");
      name().dispatchEvent(new Event("input", { bubbles: true }));
    });
    await rerender(value(answer, { email: "Taken.", name: "New presentation." }));
    expect(name().getAttribute("aria-invalid")).toBe("true");
  });

  it.each([undefined, { private: "IGNORED_RESULT_SENTINEL" }])("ignores and diagnoses the removed result input %s without a second arrival authority", async (result) => {
    const answer = {};
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const node = (projection: FormErrors) => <Form errors={formErrors(answer, projection)} result={result as never}>{fields}</Form>;
    await render(node(messages())); await edit();
    const first = alert();
    name().focus();
    const focus = vi.spyOn(email(), "focus");
    await rerender(node({ ...messages(), form: "Updated presentation." }));
    expect(email().getAttribute("aria-invalid")).toBeNull();
    expect(alert()).toBe(first);
    expect(focus).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(name());
    expect(host!.querySelector("form")!.hasAttribute("result")).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith("[ouro-ui] Form: result is not a prop. Fix: errors={formErrors(answer, messages)}.");
    expect(JSON.stringify(warn.mock.calls)).not.toContain("IGNORED_RESULT_SENTINEL");
  });

  it("keeps the non-owning form unchanged when callers select different accepted sources", async () => {
    const unchanged = {};
    const node = (answer: object | undefined) => <>
      {value(answer, messages())}
      <Form data-other="" errors={formErrors(unchanged, { form: "Other form." })}><span /></Form>
    </>;
    await render(node(undefined));
    const other = host!.querySelector('[data-other] [role="alert"]');
    await rerender(node({}));
    expect(host!.querySelector('[data-other] [role="alert"]')).toBe(other);
    expect(document.activeElement).toBe(email());
  });

  it("renders payload-free native SSR and hydrates locally reconstructed values without load focus or mismatches", async () => {
    const serverAnswer = { secret: "SERVER_PRIVATE_SENTINEL" };
    const node = (answer: object) => <StrictMode><Form action="/subscribe" method="post" errors={formErrors(answer, messages())}>{fields}</Form></StrictMode>;
    host = document.createElement("div");
    host.innerHTML = renderToString(node(serverAnswer));
    document.body.append(host);
    const html = host.innerHTML;
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('aria-describedby=');
    expect(html).toContain('role="alert"');
    expect(html).not.toContain("SERVER_PRIVATE_SENTINEL");
    const first = alert();
    const recoverable = vi.fn();
    await act(() => { root = hydrateRoot(host!, node({ secret: "CLIENT_PRIVATE_SENTINEL" }), { onRecoverableError: recoverable }); });
    expect(recoverable).not.toHaveBeenCalled();
    expect(alert()).toBe(first);
    expect(host.contains(document.activeElement)).toBe(false);
    await edit();
    await rerender(<Form key="native-response" action="/subscribe" method="post" errors={formErrors({}, messages())}>{fields}</Form>);
    expect(email().getAttribute("aria-invalid")).toBe("true");
    expect(host.contains(document.activeElement)).toBe(false);
  });
});
