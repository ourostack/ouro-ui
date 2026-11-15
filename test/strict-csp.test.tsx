import { Suspense, type JSX, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { Select } from "@/registry/ouro/components/ouro/select/select";
import { OuroProvider } from "@/registry/ouro/lib/ouro/ouro-provider";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

// A page whose Content Security Policy refuses inline styles, as an app on a strict host serves it
// (`style-src 'self'`). The policy goes in before anything renders, as a <meta>, which Chromium and
// WebKit enforce from then on: an inline <style> is refused, while styles set from script and
// constructed stylesheets apply. Every docs demo, an open Select and a provider set to reduced
// motion must add no <style> under OuroProvider strictCsp, and break no rule of the policy.

const modules = import.meta.glob<{ default: () => JSX.Element }>("../site/src/docs/demos/*.demo.tsx");
const names = Object.keys(modules)
  .map((path) => path.replace(/^.*\/(.+)\.demo\.tsx$/, "$1"))
  .toSorted();

const refused: string[] = [];
const added: string[] = [];

beforeAll(() => {
  const policy = document.createElement("meta");
  policy.httpEquiv = "Content-Security-Policy";
  policy.content = "style-src 'self'";
  document.head.append(policy);
  // The test runner's own stylesheet (Vite's, marked data-vite-dev-id) is the harness, not the app.
  const harness = (node: unknown) => node instanceof Element && node.hasAttribute("data-vite-dev-id");
  document.addEventListener("securitypolicyviolation", (event) => {
    if (!harness(event.target)) refused.push(`${event.violatedDirective}: ${event.sample || event.sourceFile}`);
  });
  new MutationObserver((records) => {
    for (const record of records)
      for (const node of record.addedNodes) if (node instanceof HTMLStyleElement && !harness(node)) added.push(node.outerHTML.slice(0, 160));
  }).observe(document, { childList: true, subtree: true });
});

const roots: ReturnType<typeof createRoot>[] = [];
afterEach(async () => {
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  document.body.replaceChildren();
  refused.length = 0;
  added.length = 0;
});

async function mount(node: ReactNode) {
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(<Suspense fallback={null}>{node}</Suspense>));
  return host;
}

// Violation reports are queued as tasks, so a test waits a task for them before it reads.
const reported = () => new Promise((resolve) => setTimeout(resolve, 0));

const courses = [
  { value: "starter", label: "Starter" },
  { value: "main", label: "Main" },
];

describe("under style-src 'self'", () => {
  it("refuses the <style> an open Select adds without strictCsp, so the policy is live", async () => {
    await mount(<Select label="Course" options={courses} placeholder="Choose a course" />);
    await userEvent.click(page.getByRole("combobox", { name: "Course" }));
    await expect.element(page.getByRole("option", { name: "Main" })).toBeVisible();
    await reported();
    expect(added.length).toBeGreaterThan(0);
    expect(refused.length).toBeGreaterThan(0);
  });

  it("OuroProvider strictCsp adds no <style> element, and the page breaks no rule of its policy, in every part that would add one", async () => {
    await mount(
      <OuroProvider strictCsp motion="reduced">
        <Select label="Course" options={courses} placeholder="Choose a course" />
        <p id="moving" style={{ transition: "opacity 1s" }} />
      </OuroProvider>,
    );
    await userEvent.click(page.getByRole("combobox", { name: "Course" }));
    await expect.element(page.getByRole("option", { name: "Main" })).toBeVisible();
    // Reduced motion still holds, from a constructed stylesheet.
    expect(getComputedStyle(document.getElementById("moving")!).transitionDuration).toBe("0s");
    await reported();
    expect(added).toEqual([]);
    expect(refused).toEqual([]);
  });

  it.each(names)("OuroProvider strictCsp keeps the %s demo inside the policy", async (name) => {
    const Demo = (await modules[`../site/src/docs/demos/${name}.demo.tsx`]!()).default;
    await mount(
      <OuroProvider strictCsp>
        <Demo />
      </OuroProvider>,
    );
    await reported();
    expect(added).toEqual([]);
    expect(refused).toEqual([]);
  });
});
