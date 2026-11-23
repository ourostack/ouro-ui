import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { cleanupPage, describeViolations, pageScanTimeout, renderPage, scan, setScheme } from "../../test/render";
import { clearComposerDrafts } from "@/registry/ouro/components/ouro/composer/composer-styles";
import { watchAnnouncements } from "@/registry/ouro/lib/ouro/testing/announcements";
import { routes } from "../routes";

beforeAll(async () => {
  // Load the page's modules once here, so the first test's own budget does not carry them.
  await import("./chat-demo");
});

afterEach(async () => {
  await cleanupPage();
  clearComposerDrafts();
  setScheme("light");
});

describe("the chat app page", () => {
  it("has a route", () => {
    expect(routes.some((route) => route.path === "/docs/chat-demo/")).toBe(true);
  });

  it("shows the conversations", async () => {
    await renderPage("/docs/chat-demo/");
    await expect.element(page.getByRole("heading", { level: 1, name: "A chat app" })).toBeInTheDocument();
    await expect.element(page.getByLabelText("Conversations")).toBeInTheDocument();
  });

  it("opens a conversation from the list", async () => {
    await renderPage("/docs/chat-demo/");
    await page.getByRole("button", { name: /Launch crew/ }).click();
    await expect.element(page.getByLabelText("Messages in Launch crew")).toBeInTheDocument();
  });

  it("goes back to the list from a conversation on a narrow screen", async () => {
    await renderPage("/docs/chat-demo/");
    await page.getByRole("button", { name: /Ana Lind/ }).click();
    await page.getByRole("button", { name: /back/i }).click();
    await expect.element(page.getByLabelText("Conversations")).toBeInTheDocument();
  });

  it("keeps a draft when a narrow screen goes back to the list and returns", async () => {
    await renderPage("/docs/chat-demo/");
    await page.getByRole("button", { name: /Launch crew/ }).click();
    await page.getByLabelText("Message Launch crew").click();
    await userEvent.keyboard("Bring tape");
    await page.getByRole("button", { name: /back/i }).click();
    await page.getByRole("button", { name: /Launch crew/ }).click();
    await expect.element(page.getByLabelText("Message Launch crew")).toHaveTextContent("Bring tape");
  });

  it("opens a thread from its summary and shows the empty state from the state switch", async () => {
    await renderPage("/docs/chat-demo/");
    await page.getByRole("button", { name: /Launch crew/ }).click();
    await page.getByRole("button", { name: /repl/i }).first().click();
    await expect.element(page.getByLabelText("Replies").first()).toBeInTheDocument();
    const rail = page.getByRole("complementary", { name: "Replies" });
    await expect.element(rail.getByText("Mara Quill").first()).toBeInTheDocument();
    await expect.element(rail.getByPlaceholder("Reply to the thread")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await page.getByRole("radio", { name: "Empty" }).click();
    await expect.element(page.getByRole("radio", { name: "Empty" })).toBeChecked();
    await expect.element(page.getByRole("list", { name: "Conversations" })).not.toBeInTheDocument();
  });

  it("draws the empty state with art, centred in its pane, and the loading state centred in the frame", async () => {
    await page.viewport(1280, 800);
    await renderPage("/docs/chat-demo/");
    await page.getByRole("radio", { name: "Empty" }).click();
    const empty = document.querySelector<HTMLElement>('[data-ouro="moment"][data-moment="empty"]')!;
    expect(empty.querySelector("[data-moment-art]")).not.toBeNull();
    expect(empty.querySelector("svg")).not.toBeNull();
    const pane = empty.parentElement!.getBoundingClientRect();
    const box = empty.getBoundingClientRect();
    expect(Math.abs(box.top - pane.top - (pane.bottom - box.bottom))).toBeLessThan(2);
    await page.getByRole("radio", { name: "Loading" }).click();
    const loading = document.querySelector<HTMLElement>('[data-ouro="moment"][data-moment="loading"]')!;
    const frame = loading.parentElement!.getBoundingClientRect();
    const spot = loading.getBoundingClientRect();
    expect(Math.abs(spot.top - frame.top - (frame.bottom - spot.bottom))).toBeLessThan(2);
  });

  it("shows one empty state on a phone, the pane's, and the list's empty line beside it on a laptop", async () => {
    try {
      await page.viewport(390, 844);
      await renderPage("/docs/chat-demo/");
      await page.getByRole("radio", { name: "Empty" }).click();
      const drawn = (text: string) => [...document.querySelectorAll("body *")].some((el) => el.textContent === text && el.getClientRects().length > 0);
      await expect.poll(() => drawn("Nothing here yet")).toBe(true);
      expect(drawn("Conversations appear here")).toBe(false);
      await page.viewport(1280, 800);
      await expect.poll(() => drawn("Conversations appear here")).toBe(true);
      const line = [...document.querySelectorAll("body *")].findLast((el) => el.textContent === "Conversations appear here" && el.getClientRects().length > 0)!;
      const column = line.closest("[data-ouro=conversation-list]")!.parentElement!.getBoundingClientRect();
      const text = line.getBoundingClientRect();
      expect(Math.abs(text.top - column.top - (column.bottom - text.bottom))).toBeLessThan(4);
      await page.getByRole("button", { name: "Start a conversation" }).click();
      await expect.element(page.getByRole("list", { name: "Conversations" })).toBeVisible();
    } finally {
      await page.viewport(390, 844);
    }
  });

  it("hands focus to the list's tab stop when Start a conversation brings the list back", async () => {
    await page.viewport(390, 844);
    await renderPage("/docs/chat-demo/");
    await page.getByRole("radio", { name: "Empty" }).click();
    await page.getByRole("button", { name: "Start a conversation" }).click();
    await expect.poll(() => document.activeElement?.getAttribute("data-ouro-part")).toBe("row");
    expect(document.activeElement?.textContent).toContain("Launch crew");
  });

  it("keeps an unsent draft for each conversation when the person switches", async () => {
    await page.viewport(1280, 800);
    try {
      await renderPage("/docs/chat-demo/");
      await page.getByLabelText("Message Launch crew").click();
      await userEvent.keyboard("Bring tape");
      await expect.element(page.getByRole("button", { name: /Launch crew.*Draft: Bring tape/ })).toBeVisible();
      await page.getByRole("button", { name: /Ana Lind/ }).click();
      await expect.element(page.getByLabelText("Message Ana Lind")).toHaveTextContent("");
      await page.getByRole("button", { name: /Launch crew/ }).click();
      await expect.element(page.getByLabelText("Message Launch crew")).toHaveTextContent("Bring tape");
    } finally {
      await page.viewport(390, 844);
    }
  });

  it("drops the list's Draft line once the message is sent", async () => {
    await renderPage("/docs/chat-demo/");
    await page.getByRole("button", { name: /Ana Lind/ }).click();
    await page.getByLabelText("Message Ana Lind").click();
    await userEvent.keyboard("On my way");
    const rows = () => [...document.querySelectorAll('[data-ouro-part="row"]')].map((row) => row.textContent ?? "").join(" | ");
    await expect.poll(rows).toContain("Draft: On my way");
    await userEvent.keyboard("{Enter}");
    await expect.poll(rows).not.toContain("Draft:");
  });

  it("says Sent and then who has seen a message, once each", async () => {
    await renderPage("/docs/chat-demo/");
    await page.getByRole("button", { name: /Ana Lind/ }).click();
    const said = watchAnnouncements();
    await page.getByLabelText("Message Ana Lind").click();
    await userEvent.keyboard("On my way");
    await userEvent.keyboard("{Enter}");
    try {
      await expect.poll(() => said.count("Sent")).toBe(1);
      await expect.poll(() => said.count("Seen by Ana Lind")).toBe(1);
    } finally {
      said.stop();
    }
  });

  it.each(["light", "dark"] as const)("passes the accessibility scan in %s", async (scheme) => {
    setScheme(scheme);
    await renderPage("/docs/chat-demo/");
    const violations = await scan();
    expect(violations, describeViolations(violations)).toEqual([]);
  }, pageScanTimeout);
});
