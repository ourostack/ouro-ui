import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { Button, type ButtonProps } from "@/registry/ouro/components/ouro/button/button";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { cleanupPage, renderPage } from "../../test/render";
import { agentExamples } from "./examples";
import generated from "../generated/agent-messages.json";

// "Agents read the types" quotes real output. The type errors and hover text come from
// the TypeScript compiler (site/scripts/agent-messages.mts, checked by its --check mode);
// these tests prove each quoted dev message is exactly what the component logs.

afterEach(async () => {
  await cleanupPage();
  vi.restoreAllMocks();
});

it.each(agentExamples)("$id: the quoted dev message is what Button logs", async ({ devProps, devMessage }) => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(() => root.render(<Button {...(devProps as unknown as ButtonProps)}>Label</Button>));
  await act(() => root.unmount());
  host.remove();
  expect(warn.mock.calls.map((call) => call.join(" "))).toEqual([devMessage]);
});

it("has generated compiler output for every example", () => {
  expect(Object.keys(generated).sort()).toEqual(agentExamples.map((example) => example.id).sort());
});

it.each(agentExamples)("$id: the landing page shows the code, the type error, the prop's source and the dev message", async (example) => {
  await renderPage("/");
  const output = generated[example.id as keyof typeof generated];
  const card = page.getByTestId(`agent-example-${example.id}`);
  await expect.element(card.getByText(example.code, { exact: true })).toBeInTheDocument();
  await expect.element(card.getByText(output.error, { exact: true })).toBeInTheDocument();
  await expect.element(card.getByText(output.source.code, { exact: true })).toBeInTheDocument();
  await expect.element(card.getByText(`/** ${output.source.doc} */`, { exact: true })).toBeInTheDocument();
  await expect.element(card.getByText(example.devMessage, { exact: true })).toBeInTheDocument();
});
