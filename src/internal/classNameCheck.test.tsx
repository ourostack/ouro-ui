import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { findAppearanceClass, useAppearanceClassNameCheck } from "./classNameCheck.ts";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];
async function render(node: ReactNode) {
  const root = createRoot(document.createElement("div"));
  roots.push(root);
  await act(async () => root.render(node));
  return { rerender: (next: ReactNode) => act(async () => root.render(next)) };
}

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(async () => {
  vi.restoreAllMocks();
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
});

function Probe({ className }: { className?: string | undefined }) {
  useAppearanceClassNameCheck("Button", className, 'Use tone="danger" instead');
  return null;
}

describe("findAppearanceClass", () => {
  it.each([
    ["bg-red-500", "bg-red-500"],
    ["mt-4 hover:text-red-500", "hover:text-red-500"],
    ["md:hover:rounded-lg", "md:hover:rounded-lg"],
    ["dark:bg-black", "dark:bg-black"],
    ["text-center", "text-center"],
    ["p-2 shadow-md", "shadow-md"],
  ])("flags %s", (input, token) => expect(findAppearanceClass(input)).toBe(token));

  it.each(["mt-4 w-full", "grid col-span-2", "", undefined, "bgx-1 context-menu"])(
    "allows %s",
    (input) => expect(findAppearanceClass(input)).toBeUndefined(),
  );
});

describe("useAppearanceClassNameCheck", () => {
  it("does not warn for layout classes", async () => {
    await render(<Probe className="mt-4 w-full" />);
    expect(warn).not.toHaveBeenCalled();
  });

  it("does not warn without a className", async () => {
    await render(<Probe />);
    expect(warn).not.toHaveBeenCalled();
  });

  it("warns, quoting the first offending token and the hint", async () => {
    await render(<Probe className="mt-4 bg-red-500 text-white" />);
    expect(warn).toHaveBeenCalledTimes(1);
    const message = String(warn.mock.calls[0]?.[0]);
    expect(message).toContain('"bg-red-500"');
    expect(message).toContain('Use tone="danger" instead');
    expect(message).toMatch(/^\[ouro-ui\] Button: .+\. Fix: .+\.$/);
  });

  it("warns for dark: classes", async () => {
    await render(<Probe className="dark:bg-black" />);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("warns once per instance, and again for another instance", async () => {
    const screen = await render(<Probe className="bg-red-500" />);
    await screen.rerender(<Probe className="bg-blue-500" />);
    expect(warn).toHaveBeenCalledTimes(1);
    await render(<Probe className="bg-red-500" />);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("warns when a later render adds an appearance class", async () => {
    const screen = await render(<Probe className="mt-4" />);
    expect(warn).not.toHaveBeenCalled();
    await screen.rerender(<Probe className="mt-4 rounded-full" />);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("never warns during server rendering", () => {
    renderToString(<Probe className="bg-red-500" />);
    expect(warn).not.toHaveBeenCalled();
  });
});
