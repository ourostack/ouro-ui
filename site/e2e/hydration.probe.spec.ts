import { expect, test } from "@playwright/test";

declare global {
  interface Window {
    __siteHydrationProbe: { timeOrigin: number; records: unknown[] };
  }
}

for (const timing of ["before hydration", "after hydration"] as const) {
  test(`real delayed demo input ${timing}`, async ({ page }, info) => {
    const diagnostics: string[] = [];
    page.on("pageerror", (error) => diagnostics.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error" || message.type() === "warning") diagnostics.push(message.text());
    });
    await page.addInitScript(() => {
      window.__siteHydrationProbe = { timeOrigin: performance.timeOrigin, records: [] };
      for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
        document.addEventListener(type, (event) => {
          if (!(event.target instanceof Element)) return;
          const control = event.target.closest('[role="combobox"]');
          if (!control) return;
          window.__siteHydrationProbe.records.push({
            event: event.type, trusted: event.isTrusted, at: performance.now(),
            hydrated: document.querySelector<HTMLElement>('[data-site-demo="form"]')?.dataset["siteDemoHydrated"],
            expanded: control.getAttribute("aria-expanded"),
            target: event.target.tagName,
          });
        }, true);
      }
      new MutationObserver((changes) => {
        for (const change of changes) {
          if (change.attributeName !== "data-site-demo-hydrated" || !(change.target instanceof HTMLElement)) continue;
          window.__siteHydrationProbe.records.push({
            event: "hydration-commit", at: performance.now(),
            hydrated: change.target.dataset["siteDemoHydrated"],
          });
        }
      }).observe(document, { subtree: true, attributes: true, attributeFilter: ["data-site-demo-hydrated"] });
    });
    let allowResponse!: () => void;
    let sawRequest!: () => void;
    const gate = new Promise<void>((done) => { allowResponse = done; });
    const request = new Promise<void>((done) => { sawRequest = done; });
    const network: { phase: string; at: number }[] = [];
    await page.route("**/assets/form.demo-*.js", async (route) => {
      network.push({ phase: "chunk-requested", at: Date.now() });
      sawRequest();
      await gate;
      network.push({ phase: "chunk-continued", at: Date.now() });
      await route.continue();
    });
    try {
      await page.goto("docs/form/", { waitUntil: "domcontentloaded" });
      await request;
      const name = page.getByRole("textbox", { name: "Recipe name", exact: true });
      await expect(name).toHaveValue("Pasta");
      const before = await name.getAttribute("id");
      expect(before).not.toBeNull();
      await expect(page.locator(`label[for="${before}"]`)).toHaveText("Recipe name");
      await expect(page.locator("[data-site-demo-loading]")).toHaveCount(0);
      if (timing === "after hydration") {
        allowResponse();
        await expect(page.locator('[data-site-demo="form"]')).toHaveAttribute("data-site-demo-hydrated", "true");
      }
      await page.getByRole("combobox", { name: "Course", exact: true }).click();
      if (timing === "before hydration") allowResponse();
      await page.getByRole("option", { name: "Main", exact: true }).click();
      await page.getByRole("button", { name: "Save recipe", exact: true }).click();
      await expect(page.getByText("A recipe called Pasta already exists.", { exact: true })).toBeVisible();
      await expect(name).toHaveAttribute("id", before!);
      await expect(name).toHaveAttribute("aria-invalid", "true");
      const describedBy = await name.getAttribute("aria-describedby");
      expect(describedBy).not.toBeNull();
      const messages = await page.locator("body").evaluate((_body, ids) =>
        ids.split(/\s+/).map((id) => document.getElementById(id)?.textContent),
      describedBy!);
      expect(messages).toContain("A recipe called Pasta already exists.");
      expect(diagnostics).toEqual([]);
    } finally {
      allowResponse();
      const browser = await page.evaluate(() => ({
        timeline: window.__siteHydrationProbe,
        hydrated: document.querySelector<HTMLElement>('[data-site-demo="form"]')?.dataset["siteDemoHydrated"],
        expanded: document.querySelector('[role="combobox"]')?.getAttribute("aria-expanded"),
        options: [...document.querySelectorAll('[role="option"]')].map((option) => option.textContent),
      }));
      await info.attach("native-hydration-timeline", {
        body: JSON.stringify({ timing, network, diagnostics, browser }, null, 2),
        contentType: "application/json",
      });
    }
  });
}
