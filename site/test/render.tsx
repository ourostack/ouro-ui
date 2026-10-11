import axe from "axe-core";
import { createRoot, type Root } from "react-dom/client";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { App } from "../src/app";
import { axeExclude } from "@/registry/ouro/lib/ouro/testing/axe";

let mounted: { root: Root; host: HTMLElement } | undefined;

/** Renders a site page, as the prerendered HTML hydrates it, into a fresh host. */
export async function renderPage(path: string): Promise<HTMLElement> {
  await cleanupPage();
  const host = document.createElement("div");
  host.id = "root";
  document.body.append(host);
  const root = createRoot(host);
  await act(() => root.render(<App path={path} />));
  mounted = { root, host };
  return host;
}

export async function cleanupPage(): Promise<void> {
  if (!mounted) return;
  const { root, host } = mounted;
  mounted = undefined;
  await act(() => root.unmount());
  host.remove();
}

/** shadcn's `.dark` class on <html>, as the site's head script sets it from the OS setting. */
export function setScheme(scheme: "light" | "dark"): void {
  document.documentElement.classList.toggle("dark", scheme === "dark");
}

/** Waits for transitions started by a render or a click to finish. */
export async function settle(ms = 900): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/** axe's violations as readable lines. */
export function describeViolations(violations: axe.Result[]): string {
  return violations
    .map(
      (violation) =>
        `${violation.id} (${violation.impact}): ${violation.help}\n` +
        violation.nodes.map((node) => `  ${node.target.join(" ")}: ${node.failureSummary}`).join("\n"),
    )
    .join("\n");
}

/** Runs axe over the whole document: a site page is a full page, so every rule applies. */
export async function scan(): Promise<axe.Result[]> {
  // Base UI's focus guards are excluded for the reason given in test/stories.test.tsx.
  const result = await axe.run(
    { include: [document.documentElement], exclude: axeExclude.map((selector) => [selector]) },
    { resultTypes: ["violations"] },
  );
  return result.violations;
}
