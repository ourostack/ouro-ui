import { type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { Alert } from "@/registry/ouro/components/ouro/alert/alert";
import { Badge } from "@/registry/ouro/components/ouro/badge/badge";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Card } from "@/registry/ouro/components/ouro/card/card";
import { Checkbox } from "@/registry/ouro/components/ouro/checkbox/checkbox";
import { Dialog } from "@/registry/ouro/components/ouro/dialog/dialog";
import { TextField } from "@/registry/ouro/components/ouro/text-field/text-field";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

// Part names (docs/guides/part-names.md): an app that styles with plain CSS, or ports shadcn/ui code,
// reaches a part by the `data-slot` name shadcn gives it. scripts/part-names.test.mjs holds that every
// styled element of the named components has one; these tests hold the names a rendered component carries
// and what an app's stylesheet can do with them. Repository-only: it spans several items.

const roots: Root[] = [];
const nodes: Element[] = [];

async function render(node: ReactNode, css = "") {
  const style = document.createElement("style");
  style.textContent = css;
  document.head.append(style);
  const host = document.createElement("div");
  document.body.append(host);
  nodes.push(style, host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
  return host;
}

afterEach(async () => {
  for (const root of roots.splice(0)) await act(async () => root.unmount());
  for (const node of nodes.splice(0)) node.remove();
});

describe("part names", () => {
  it("name the roots and parts of Button, Card, Badge and Alert as shadcn names them", async () => {
    const host = await render(
      <div>
        <Button>Save</Button>
        <Card title="Braising" description="Low heat, a lid" action={<Button>Edit</Button>} footer={<span>Saved</span>}>
          Two hours.
        </Card>
        <Badge>Beta</Badge>
        <Alert title="Saved" description="The recipe is in your cookbook." />
      </div>,
    );
    expect(host.querySelector('[data-ouro="card"][data-slot="card"]'), "Card's root names itself as shadcn does, beside its data-ouro").not.toBeNull();
    for (const selector of [
      '[data-slot="button"]',
      '[data-slot="card"]',
      '[data-slot="card-header"] [data-slot="card-title"]',
      '[data-slot="card-description"]',
      '[data-slot="card-action"]',
      '[data-slot="card-content"]',
      '[data-slot="card-footer"]',
      '[data-slot="badge"]',
      '[data-slot="alert"] [data-slot="alert-title"]',
      '[data-slot="alert"] [data-slot="alert-description"]',
    ]) {
      expect(host.querySelector(selector), selector).not.toBeNull();
    }
  });

  it("name an open Dialog's popup, title, description, header, footer and close as shadcn names them", async () => {
    await render(
      <Dialog title="Edit recipe" description="Change the words." presentation="dialog" open onOpenChange={() => {}} footer={<Button>Save</Button>}>
        Two hours.
      </Dialog>,
    );
    await expect.poll(() => document.querySelector('[data-slot="dialog-content"]')).not.toBeNull();
    const popup = document.querySelector<HTMLElement>('[data-slot="dialog-content"]');
    expect(popup, "dialog-content").not.toBeNull();
    expect(popup!.querySelector('[data-slot="dialog-title"]')?.textContent).toBe("Edit recipe");
    expect(popup!.querySelector('[data-slot="dialog-description"]')?.textContent).toBe("Change the words.");
    expect(popup!.querySelector('[data-slot="dialog-header"]'), "dialog-header").not.toBeNull();
    expect(popup!.querySelector('[data-slot="dialog-footer"]'), "dialog-footer").not.toBeNull();
    expect(popup!.querySelector('[data-slot="dialog-close"]'), "dialog-close").not.toBeNull();
    expect(document.querySelector('[data-slot="dialog-overlay"]'), "dialog-overlay").not.toBeNull();
  });

  it("name a TextField's input and label, and a Checkbox's box and indicator, as shadcn names them", async () => {
    const host = await render(
      <div>
        <TextField label="Search" name="q" description="Words to find." />
        <Checkbox label="Basil" />
      </div>,
    );
    const label = host.querySelector<HTMLElement>('[data-slot="label"]');
    expect(label?.textContent).toBe("Search");
    expect(host.querySelector('[data-slot="field-description"]')?.textContent).toBe("Words to find.");
    expect(host.querySelector('[data-slot="text-field"] input[data-slot="input"]'), "input").not.toBeNull();
    expect(host.querySelector('[data-slot="checkbox"]'), "checkbox").not.toBeNull();
    expect(host.querySelector('[data-slot="checkbox"] [data-slot="checkbox-indicator"]'), "checkbox-indicator").not.toBeNull();
  });

  it("keep a name a parent passes, so an app can rename a part of a component", async () => {
    const host = await render(<Button data-slot="save-button">Save</Button>);
    expect(host.querySelector('[data-slot="save-button"]')).not.toBeNull();
    expect(host.querySelector('[data-slot="button"]')).toBeNull();
  });

  it("let an app's plain CSS, outside any layer, restyle a named part over the component's own utilities", async () => {
    const host = await render(
      <Card title="Braising">Two hours.</Card>,
      '[data-slot="card-title"] { color: rgb(4, 5, 6); letter-spacing: 3px; }',
    );
    const title = host.querySelector<HTMLElement>('[data-slot="card-title"]')!;
    expect(title.textContent).toBe("Braising");
    expect(getComputedStyle(title).color).toBe("rgb(4, 5, 6)");
    expect(getComputedStyle(title).letterSpacing).toBe("3px");
  });
});
