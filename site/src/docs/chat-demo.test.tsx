import { afterEach, describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { cleanupPage, describeViolations, pageScanTimeout, renderPage, scan, setScheme } from "../../test/render";
import { routes } from "../routes";

afterEach(async () => {
  await cleanupPage();
  setScheme("light");
});

describe("the chat app page", () => {
  it("has a route and opens a conversation, and on a narrow screen goes back to the list", async () => {
    expect(routes.some((route) => route.path === "/docs/chat-demo/")).toBe(true);
    await renderPage("/docs/chat-demo/");
    await expect.element(page.getByRole("heading", { level: 1, name: "A chat app" })).toBeInTheDocument();
    await expect.element(page.getByLabelText("Messages in Launch crew")).toBeInTheDocument();
    await page.getByRole("button", { name: /back/i }).click();
    await expect.element(page.getByLabelText("Conversations")).toBeInTheDocument();
  });

  it("opens a thread from its summary and shows the empty state from the state switch", async () => {
    await renderPage("/docs/chat-demo/");
    await page.getByRole("button", { name: /repl/i }).first().click();
    await expect.element(page.getByLabelText("Replies").first()).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await page.getByRole("radio", { name: "Empty" }).click();
    await expect.element(page.getByRole("radio", { name: "Empty" })).toBeChecked();
    await expect.element(page.getByRole("list", { name: "Conversations" })).not.toBeInTheDocument();
  });

  it.each(["light", "dark"] as const)("passes the accessibility scan in %s", async (scheme) => {
    setScheme(scheme);
    await renderPage("/docs/chat-demo/");
    const violations = await scan();
    expect(violations, describeViolations(violations)).toEqual([]);
  }, pageScanTimeout);
});
