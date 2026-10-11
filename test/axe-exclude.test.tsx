import axe from "axe-core";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { Dialog } from "@/registry/ouro/components/ouro/dialog/dialog";
import { axeExclude } from "@/registry/ouro/lib/ouro/testing/axe";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

// The ouro-testing kit's axeExclude names exactly what an app's axe scan must leave out
// while an Ouro overlay is open: Base UI's focus guards, which WebKit gives role="button"
// without a name on purpose. Runs in Chromium and WebKit.

it("matches the open dialog's focus guards, and with them excluded axe finds nothing", async () => {
  const host = document.createElement("div");
  document.body.append(host);
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
  const result = await axe.run(
    { include: [document.documentElement], exclude: axeExclude.map((selector) => [selector]) },
    { resultTypes: ["violations"], rules: { region: { enabled: false }, "landmark-one-main": { enabled: false }, "page-has-heading-one": { enabled: false } } },
  );
  expect(result.violations.map((violation) => violation.id)).toEqual([]);
  await act(async () => root.unmount());
  host.remove();
});
