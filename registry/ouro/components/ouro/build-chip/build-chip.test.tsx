import { type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { BuildChip, type BuildChipBuild } from "@/registry/ouro/components/ouro/build-chip/build-chip";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

const builds: readonly BuildChipBuild[] = [
  { id: "official", label: "Official 1.2.3" },
  { id: "w1", label: "feature/x · a1b2c3d", dirty: true },
];

const roots: Root[] = [];
const hosts: Element[] = [];

async function render(node: ReactNode) {
  const host = document.createElement("div");
  document.body.append(host);
  hosts.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
  return { root, el: host.querySelector<HTMLElement>('[data-ouro="build-chip"]')! };
}

afterEach(async () => {
  for (const root of roots.splice(0)) await act(async () => root.unmount());
  for (const host of hosts.splice(0)) host.remove();
  vi.restoreAllMocks();
});

describe("BuildChip", () => {
  it("names the current build in the trigger", async () => {
    const { el } = await render(<BuildChip builds={builds} current="official" />);
    expect(page.getByRole("button", { name: "Official 1.2.3" }).element()).toBe(el.querySelector("button"));
  });

  it("adds the dirty word after a dirty build's label", async () => {
    await render(<BuildChip builds={builds} current="w1" />);
    expect(page.getByRole("button", { name: "feature/x · a1b2c3d + edits" }).element()).toBeTruthy();
  });

  it("opens a picker of every build, the official one included, with the current one marked", async () => {
    await render(<BuildChip builds={builds} current="official" />);
    await userEvent.click(page.getByRole("button", { name: "Official 1.2.3" }));
    await expect.element(page.getByRole("menuitemradio", { name: "Official 1.2.3" })).toHaveAttribute("aria-checked", "true");
    await expect.element(page.getByRole("menuitemradio", { name: "feature/x · a1b2c3d + edits" })).toHaveAttribute("aria-checked", "false");
    await expect.element(page.getByText("Build")).toBeVisible();
  });

  it("takes the picker's group label in another language", async () => {
    await render(<BuildChip builds={builds} current="official" labels={{ group: "Compilation" }} />);
    await userEvent.click(page.getByRole("button", { name: "Official 1.2.3" }));
    await expect.element(page.getByText("Compilation")).toBeVisible();
  });

  it("reports the id of the build a person chooses", async () => {
    const onSelect = vi.fn();
    await render(<BuildChip builds={builds} current="official" onSelect={onSelect} />);
    await userEvent.click(page.getByRole("button", { name: "Official 1.2.3" }));
    await userEvent.click(page.getByRole("menuitemradio", { name: "feature/x · a1b2c3d + edits" }));
    expect(onSelect).toHaveBeenCalledWith("w1");
  });

  it("shows the skew message and runs its fix, in no warning tone", async () => {
    const onFix = vi.fn();
    await render(<BuildChip builds={builds} current="w1" skew={{ message: "2 commits behind main", fixLabel: "Update", onFix }} />);
    await userEvent.click(page.getByRole("button", { name: "feature/x · a1b2c3d + edits" }));
    await expect.element(page.getByText("2 commits behind main")).toBeVisible();
    const fix = page.getByRole("menuitem", { name: "Update" });
    expect(getComputedStyle(fix.element()).color).toBe(getComputedStyle(page.getByRole("menuitemradio", { name: "Official 1.2.3" }).element()).color);
    await userEvent.click(fix);
    expect(onFix).toHaveBeenCalled();
  });

  it("takes the words in another language", async () => {
    await render(<BuildChip builds={builds} current="w1" labels={{ dirty: "(local edits)" }} />);
    expect(page.getByRole("button", { name: "feature/x · a1b2c3d (local edits)" }).element()).toBeTruthy();
  });

  it("names the fix for a current id that is not in builds, without the empty-list message", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await render(<BuildChip builds={builds} current="missing" />);
    const said = [...error.mock.calls, ...warn.mock.calls].map((c) => String(c[0])).join("\n");
    expect(said).toContain('[ouro-ui] BuildChip: current="missing" is not in builds, so the trigger shows no build. Fix: <BuildChip builds={builds} current={builds[0].id} />.');
    expect(said).not.toContain("builds is empty");
  });

  it("names the fix for an empty list, without the missing-current message", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await render(<BuildChip builds={[]} current="official" />);
    const said = [...error.mock.calls, ...warn.mock.calls].map((c) => String(c[0])).join("\n");
    expect(said).toContain('[ouro-ui] BuildChip: builds is empty, so there is nothing to choose. Fix: <BuildChip builds={[{ id: "official", label: "Official 1.2.3" }]} current="official" />.');
    expect(said).not.toContain("is not in builds");
  });

  it("names the fix for an appearance class", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await render(<BuildChip builds={builds} current="official" className="text-red-500" />);
    const said = [...error.mock.calls, ...warn.mock.calls].map((c) => String(c[0])).join("\n");
    expect(said).toContain('[ouro-ui] BuildChip: "text-red-500" sets appearance');
    expect(said).toContain('Fix: remove "text-red-500"; BuildChip takes its colors from the theme.');
  });
});
