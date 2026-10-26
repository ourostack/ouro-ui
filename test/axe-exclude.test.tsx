import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { Dialog } from "@/registry/ouro/components/ouro/dialog/dialog";
import { audit, axeExclude, describeFindings } from "@/registry/ouro/lib/ouro/testing/axe";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

// The ouro-testing kit's axeExclude names exactly what an app's axe scan must leave out
// while an Ouro overlay is open: Base UI's focus guards, which WebKit gives role="button"
// without a name on purpose. Runs in Chromium and WebKit.

it("matches the open dialog's focus guards, and with them excluded the accessibility gate finds nothing", async () => {
  // As an app places it: in the page's main, under its heading.
  const main = document.createElement("main");
  main.innerHTML = "<h1>Recipes</h1>";
  document.body.append(main);
  const host = document.createElement("div");
  main.append(host);
  const root = createRoot(host);
  await act(async () =>
    root.render(
      <Dialog title="Edit recipe" open onOpenChange={() => {}}>
        Body
      </Dialog>,
    ),
  );
  expect(axeExclude).toEqual(["[data-base-ui-focus-guard]"]);
  expect(document.querySelectorAll(axeExclude.join(",")).length).toBeGreaterThan(0);
  expect(describeFindings(await audit({ include: [document.documentElement], exclude: axeExclude.map((selector) => [selector]) }))).toBe("");
  await act(async () => root.unmount());
  main.remove();
});
