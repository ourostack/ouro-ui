import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";
import { build } from "vite";

// Ouro UI's audit (registry/ouro/lib/ouro/testing/axe.ts) for a page Playwright drives: the kit,
// bundled for the browser with audit-browser.ts in place of vitest/browser. Every violation
// fails, and so does every result axe could not decide unless the kit measures it.

let bundle: Promise<string> | undefined;

function kitSource(): Promise<string> {
  bundle ??= build({
    configFile: false,
    logLevel: "silent",
    resolve: { alias: { "vitest/browser": fileURLToPath(new URL("./audit-browser.ts", import.meta.url)) } },
    build: {
      write: false,
      minify: false,
      lib: { entry: fileURLToPath(new URL("../../registry/ouro/lib/ouro/testing/axe.ts", import.meta.url)), formats: ["iife"], name: "ouroAudit" },
    },
  }).then((output) => (Array.isArray(output) ? output[0]! : (output as { output: { code: string }[] })).output[0]!.code);
  return bundle;
}

/** A Playwright key name for a vitest `userEvent.keyboard` string such as `{Shift>}{Tab}{/Shift}`. */
function chord(keys: string): string {
  const held = [...keys.matchAll(/\{(\w+)>\}/g)].map((match) => match[1]!);
  const key = [...keys.matchAll(/\{(\w+)\}/g)].map((match) => match[1]!).at(-1)!;
  return [...held, key].join("+");
}

/** Runs the kit's audit over the whole page; returns its findings as lines, empty when it passes. */
export async function auditPage(page: Page, browserName: string): Promise<string> {
  await page.exposeFunction("__ouroShot", async (timeout: number) => (await page.locator("[data-ouro-shot]").screenshot({ animations: "disabled", timeout })).toString("base64"));
  await page.exposeFunction("__ouroKeys", (keys: string) => page.keyboard.press(chord(keys)));
  await page.evaluate(
    ([platform, browser]) => {
      const exposed = window as unknown as { __ouroShot: (timeout: number) => Promise<string>; __ouroKeys: (keys: string) => Promise<void> };
      (window as unknown as { __ouroDriver: unknown }).__ouroDriver = { platform, browser, shot: exposed.__ouroShot, keys: exposed.__ouroKeys };
    },
    [process.platform, browserName] as const,
  );
  await page.addScriptTag({ content: await kitSource() });
  return page.evaluate(async () => {
    const kit = (window as unknown as { ouroAudit: typeof import("../../registry/ouro/lib/ouro/testing/axe") }).ouroAudit;
    return kit.describeFindings(await kit.audit({ include: [document.documentElement], exclude: kit.axeExclude.map((selector) => [selector]) }));
  });
}
