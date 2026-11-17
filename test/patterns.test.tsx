import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { DashboardPage } from "@/registry/ouro/patterns/dashboard-page/dashboard-page";
import { SettingsPage } from "@/registry/ouro/patterns/settings-page/settings-page";
import dashboardSource from "@/registry/ouro/patterns/dashboard-page/dashboard-page.tsx?raw";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { audit, axeExclude, describeFindings } from "@/registry/ouro/lib/ouro/testing/axe";

// The page patterns an app installs whole, in a real browser: each draws a whole page from the components with no
// stylesheet of its own, passes axe at a phone's and a laptop's width, and does what its words say.

const roots: Root[] = [];
let host: HTMLDivElement;

async function render(node: ReactNode) {
  host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
}

afterEach(async () => {
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  host?.remove();
  vi.restoreAllMocks();
});

/** axe over the page and anything it opened, at each width. */
async function passesAxe() {
  for (const [width, height] of [[390, 844], [1280, 800]] as const) {
    await page.viewport(width, height);
    expect(describeFindings(await audit({ include: [document.body], exclude: axeExclude.map((selector) => [selector]) }))).toBe("");
  }
}

const field = (name: string) => page.getByRole("textbox", { name, exact: true });
/** The page's own save status (an open dialog adds a status region of its own). */
const status = () => page.elementLocator(host.querySelector('p[role="status"]')!);

describe("SettingsPage", () => {
  it("is a whole page: a main landmark, its heading, the theme toggle, the profile form and the danger zone, and passes axe", async () => {
    await render(<SettingsPage />);
    expect(host.querySelector("main h1")?.textContent).toBe("Settings");
    await expect.element(page.getByRole("button", { name: "Save" })).toBeVisible();
    await expect.element(page.getByRole("button", { name: "Delete account" })).toBeVisible();
    expect(host.querySelector('[data-ouro="color-scheme-toggle"]')).not.toBeNull();
    await passesAxe();
  });

  it("saves only once the browser's checks and its own pass, shows a returned error on its field, and says when it saved", async () => {
    const onSave = vi.fn((settings: { email: string }) => (settings.email === "taken@example.com" ? { email: "That email is in use." } : undefined));
    await render(<SettingsPage onSave={onSave} initial={{ name: "", email: "", language: "fr", notifications: false }} />);
    await userEvent.click(page.getByRole("button", { name: "Save" }));
    expect(onSave).not.toHaveBeenCalled();
    await userEvent.fill(field("Display name"), "A");
    await userEvent.fill(field("Email"), "ada@example.com");
    await userEvent.click(page.getByRole("button", { name: "Save" }));
    await expect.element(field("Display name")).toHaveAttribute("aria-invalid", "true");
    await expect.element(field("Display name")).toHaveAccessibleDescription(/Use at least 2 letters\./);
    expect(onSave).not.toHaveBeenCalled();
    await userEvent.fill(field("Display name"), "Ada");
    await userEvent.fill(field("Email"), "taken@example.com");
    await userEvent.click(page.getByRole("button", { name: "Save" }));
    await expect.element(field("Email")).toHaveAccessibleDescription(/That email is in use\./);
    expect(status().element().textContent).toBe("");
    await userEvent.fill(field("Email"), "ada@example.com");
    await userEvent.click(page.getByRole("button", { name: "Save" }));
    await expect.element(status()).toHaveTextContent("Settings saved.");
    expect(onSave).toHaveBeenLastCalledWith({ name: "Ada", email: "ada@example.com", language: "fr", notifications: false });
  });

  it("deletes the account only once the person confirms, then starts the form over", async () => {
    const onDelete = vi.fn();
    await render(<SettingsPage onDelete={onDelete} initial={{ name: "Ada", email: "ada@example.com", language: "en", notifications: true }} />);
    await userEvent.click(page.getByRole("button", { name: "Save" }));
    await expect.element(status()).toHaveTextContent("Settings saved.");
    await userEvent.fill(field("Display name"), "Edited");
    await userEvent.click(page.getByRole("button", { name: "Delete account" }));
    await expect.element(page.getByRole("alertdialog")).toBeVisible();
    await passesAxe();
    await userEvent.click(page.getByRole("alertdialog").getByRole("button", { name: "Delete account" }));
    await expect.poll(() => onDelete.mock.calls.length).toBe(1);
    await expect.element(field("Display name")).toHaveValue("");
    await expect.element(field("Email")).toHaveValue("");
    expect(status().element().textContent).toBe("");
  });

  it("clears what it said while the next save runs, so each save is announced and a failed one never reads as saved", async () => {
    let finish = () => {};
    const onSave = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    await render(<SettingsPage onSave={onSave} initial={{ name: "Ada", email: "ada@example.com", language: "en", notifications: true }} />);
    await userEvent.click(page.getByRole("button", { name: "Save" }));
    finish();
    await expect.element(status()).toHaveTextContent("Settings saved.");
    await userEvent.click(page.getByRole("button", { name: "Save" }));
    await expect.poll(() => onSave.mock.calls.length).toBe(2);
    expect(status().element().textContent).toBe("");
    finish();
    await expect.element(status()).toHaveTextContent("Settings saved.");
  });

  it("empties its status for a frame before a repeat save that resolves at once, so a screen reader hears it again", async () => {
    await render(<SettingsPage initial={{ name: "Ada", email: "ada@example.com", language: "en", notifications: true }} />);
    await userEvent.click(page.getByRole("button", { name: "Save" }));
    await expect.element(status()).toHaveTextContent("Settings saved.");
    // What each frame shows, as a screen reader reads the page between tasks.
    const frames: string[] = [];
    let next: number;
    const sample = () => {
      frames.push(status().element().textContent ?? "");
      next = requestAnimationFrame(sample);
    };
    next = requestAnimationFrame(sample);
    try {
      await userEvent.click(page.getByRole("button", { name: "Save" }));
      await expect.poll(() => frames.lastIndexOf("") >= 0 && frames.at(-1) === "Settings saved.").toBe(true);
    } finally {
      cancelAnimationFrame(next);
    }
  });

  it("lets a save that finishes late change nothing once a later submit has answered", async () => {
    let finish = () => {};
    const onSave = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    await render(<SettingsPage onSave={onSave} initial={{ name: "Ada", email: "ada@example.com", language: "en", notifications: true }} />);
    await userEvent.click(page.getByRole("button", { name: "Save" }));
    await expect.poll(() => onSave.mock.calls.length).toBe(1);
    await userEvent.fill(field("Display name"), "A");
    await userEvent.click(page.getByRole("button", { name: "Save" }));
    await expect.element(field("Display name")).toHaveAttribute("aria-invalid", "true");
    finish();
    await act(async () => {
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
    });
    await expect.element(field("Display name")).toHaveAttribute("aria-invalid", "true");
    expect(status().element().textContent).toBe("");
  });

  it("works with no handlers, as installed", async () => {
    await render(<SettingsPage />);
    await userEvent.fill(field("Display name"), "Ada");
    await userEvent.fill(field("Email"), "ada@example.com");
    await userEvent.click(page.getByRole("button", { name: "Save" }));
    await expect.element(status()).toHaveTextContent("Settings saved.");
    await userEvent.click(page.getByRole("button", { name: "Delete account" }));
    await userEvent.click(page.getByRole("alertdialog").getByRole("button", { name: "Delete account" }));
    await expect.element(field("Display name")).toHaveValue("");
  });
});

describe("DashboardPage", () => {
  it("is a Server Component that hands no function to the client components it renders", () => {
    expect(dashboardSource.startsWith('"use client"')).toBe(false);
    // A prop or column field that is a function, such as Table's cell: (row) => …, can't cross to the client.
    expect(dashboardSource.match(/\b\w+(?::|=\{)\s*(?:async\s*)?\([^()]*\)\s*=>/g)).toBeNull();
  });

  it("is a whole page: a heading, a card per number, headed by the number with its label, with how it moved, a chart and the recent activity, and passes axe", async () => {
    await render(<DashboardPage />);
    expect(host.querySelector("main h1")?.textContent).toBe("Overview");
    for (const [label, value] of [["Revenue", "$48,200"], ["Orders", "1,284"], ["Returns", "38"]]) await expect.element(page.getByRole("heading", { name: `${label}: ${value}`, level: 2 })).toBeVisible();
    await expect.element(page.getByText("+12% from last month")).toBeVisible();
    await expect.element(page.getByRole("table", { name: "Recent activity" })).toBeVisible();
    await expect.element(page.getByRole("cell", { name: "Mara Lind" })).toBeVisible();
    expect(host.querySelector('[data-ouro="chart"]')).not.toBeNull();
    await passesAxe();
  });

  it("draws the numbers, months and rows it is given, and says when there is no activity", async () => {
    await render(
      <DashboardPage
        stats={[{ label: "Visitors", value: "9,120", change: "No change", trend: "flat" }]}
        months={[{ month: "Jul", orders: 10, returns: 1 }]}
        activity={[]}
      />,
    );
    await expect.element(page.getByRole("heading", { name: "Visitors: 9,120", level: 2 })).toBeVisible();
    await expect.element(page.getByText("No change")).toBeVisible();
    await expect.element(page.getByText("No activity yet.")).toBeVisible();
    expect(host.querySelector('[data-ouro="table"]')).toBeNull();
  });
});
