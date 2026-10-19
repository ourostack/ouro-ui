import { useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { commands, page } from "vitest/browser";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Dialog } from "@/registry/ouro/components/ouro/dialog/dialog";
import { Inspector } from "@/registry/ouro/components/ouro/inspector/inspector";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

// Runs in the `touch` project: Chromium as a 390x844 phone with a coarse pointer.

let root: Root | undefined;
const nodes: Element[] = [];
afterEach(async () => {
  await act(async () => root?.unmount());
  for (const node of nodes.splice(0)) node.remove();
});

const tags = () => [...document.querySelectorAll('[data-ouro-control="inspector"][data-ouro-part="tag"]')].map((tag) => tag.textContent);

function Host({ onCopy }: { onCopy: () => void }) {
  const [xray, setXray] = useState(true);
  return (
    <div style={{ display: "grid", gap: 16, padding: 16 }}>
      <Button>Save recipe</Button>
      <Dialog title="Share" trigger={<Button data-testid="share">Share</Button>}>
        <Button onClick={onCopy}>Copy link</Button>
      </Dialog>
      <Inspector open={xray} onOpenChange={setXray} />
    </div>
  );
}

it("leaves a phone's open dialog within reach of a tap, and outlines only what is in it", async () => {
  const onCopy = vi.fn();
  const host = document.createElement("div");
  document.body.append(host);
  nodes.push(host);
  root = createRoot(host);
  await act(async () => root!.render(<Host onCopy={onCopy} />));
  await expect.poll(tags).toEqual(["button", "button"]);
  await commands.tap('[data-testid="share"]');
  await expect.element(page.getByRole("button", { name: "Copy link" })).toBeVisible();
  await expect.poll(() => document.getAnimations().filter((animation) => animation.playState === "running").length).toBe(0);
  await expect.poll(tags).toEqual(["sheet", "button"]);
  await commands.tap('[role="dialog"] [data-ouro="button"]');
  expect(onCopy).toHaveBeenCalledOnce();
}, 15_000);
