import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { cleanupPage, describeViolations, loadPageCode, pageScanTimeout, renderPage, scan, setScheme } from "../../test/render";
import { redirects, routes } from "../routes";
import { setXray, watchXray } from "../voyage/xray-store";
import mcp from "./evidence/core-shopping.mcp.json";

const PAGES = [
  { path: "/actions/", title: "Write an action once." },
  { path: "/composed-ui/", title: "Your agent sends a card as data." },
  { path: "/xray/", title: "See inside." },
  { path: "/hackamore/", title: "Reins for apps that never had any." },
] as const;

beforeAll(async () => {
  await Promise.all(PAGES.map(({ path }) => loadPageCode(path)));
});

afterEach(async () => {
  setXray(false);
  await cleanupPage();
  setScheme("light");
});

describe("the part pages", () => {
  it.each(PAGES)("$path has a route and leads with its title", async ({ path, title }) => {
    expect(routes.some((route) => route.path === path)).toBe(true);
    await renderPage(path);
    await expect.element(page.getByRole("heading", { level: 1, name: title })).toBeInTheDocument();
  });

  it("sends /composed/ on to /composed-ui/", () => {
    expect(redirects).toContainEqual({ from: "/composed/", to: "/composed-ui/" });
  });

  it.each(PAGES.flatMap(({ path }) => (["light", "dark"] as const).map((scheme) => ({ path, scheme }))))(
    "$path passes the accessibility scan in $scheme",
    async ({ path, scheme }) => {
      setScheme(scheme);
      await renderPage(path);
      const violations = await scan();
      expect(violations, describeViolations(violations)).toEqual([]);
    },
    pageScanTimeout,
  );
});

describe("the Actions page's demo", () => {
  it("answers the agent's call to a person-only action with core's generated refusal", async () => {
    await renderPage("/actions/");
    await userEvent.click(page.getByRole("radio", { name: "Person only" }));
    await userEvent.click(page.getByRole("button", { name: "Call it as the agent" }));
    await expect.element(page.getByRole("main").getByText(mcp.refusals.place_grocery_order.summary, { exact: false })).toBeInTheDocument();
  });

  it("asks the person first before sharing, with the declared question", async () => {
    await renderPage("/actions/");
    await userEvent.click(page.getByRole("radio", { name: "Asks first" }));
    await userEvent.click(page.getByRole("button", { name: "Share list" }));
    const question = "Share your list with this person? They will be able to see it and change it.";
    await expect.poll(() => document.querySelector('[role="alertdialog"]')?.textContent ?? "").toContain(question);
  });
});

describe("the Composed UI page's tricks", () => {
  it.each(["Make “Order ingredients” one tap", "Relabel Share as “Pay now”", "Add a button the app never offered", "Slip in a web page"])(
    "the validator refuses %s and names the node",
    async (trick) => {
      await renderPage("/composed-ui/");
      await userEvent.click(page.getByRole("button", { name: trick }));
      await expect.element(page.getByRole("main").getByText(/Refused\. Nothing drew\.\n\/children\//)).toBeInTheDocument();
    },
  );
});

describe("the X-ray page", () => {
  it("turns HX X-ray on over the page from its own button", async () => {
    let on = false;
    const stop = watchXray((next) => (on = next));
    await renderPage("/xray/");
    await userEvent.click(page.getByRole("button", { name: "X-ray this page" }));
    await expect.poll(() => on).toBe(true);
    stop();
  });

  it("shows AX X-ray's report for a conformant tool", async () => {
    await renderPage("/xray/");
    await userEvent.click(page.getByRole("radio", { name: "With the kit" }));
    await expect.element(page.getByRole("main").getByText(/^Conforms: every applicable must claim holds/)).toBeInTheDocument();
  });
});

describe("the Hackamore page's terminal", () => {
  it("prints hackamore's own refusal when Allow isn't on the screen", async () => {
    await renderPage("/hackamore/");
    await userEvent.click(page.getByRole("button", { name: "Press Allow" }));
    await expect.element(page.getByRole("main").getByText("hackamore: do click: click isn't available on screen. Fix: use one of: type_text, press_key, open_app, activate.")).toBeInTheDocument();
  });
});
