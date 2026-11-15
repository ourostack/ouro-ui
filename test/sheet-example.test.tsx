import { composeStories } from "@storybook/react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import * as stories from "@/registry/ouro/components/ouro/sheet/sheet.stories";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

const { WithDescription } = composeStories(stories);
let root: Root | null = null;
let host: HTMLElement | null = null;
afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
});

describe("the Sheet's cookbook example", () => {
  it("lists its cookbooks from the leading edge, with the saved one marked", async () => {
    host = document.body.appendChild(document.createElement("div"));
    root = createRoot(host);
    await act(async () => root!.render(<WithDescription />));
    await userEvent.click(page.getByRole("button", { name: "Save", exact: true }));
    const sheet = page.getByRole("dialog", { name: "Save to cookbook" });
    await expect.element(sheet).toBeVisible();
    const rows = [...sheet.element().querySelectorAll<HTMLElement>("[aria-pressed]")];
    expect(rows.length).toBeGreaterThan(1);
    for (const row of rows) {
      const range = document.createRange();
      range.selectNodeContents(row);
      // The label starts at the row's padding, not in its middle.
      expect(range.getBoundingClientRect().left - row.getBoundingClientRect().left).toBeLessThanOrEqual(24);
    }
    expect(rows.filter((row) => row.getAttribute("aria-pressed") === "true").map((row) => row.textContent)).toEqual(["Baking (saved)"]);
  });
});
