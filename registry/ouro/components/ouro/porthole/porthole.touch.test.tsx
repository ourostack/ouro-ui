import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import { Porthole } from "@/registry/ouro/components/ouro/porthole/porthole";
import type { PortholeItem } from "@/registry/ouro/lib/ouro/porthole-view";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { rotate } from "@/registry/ouro/lib/ouro/testing/rotate";

// Runs in the `touch` project: Chromium as a 390x844 phone with a coarse pointer.

let root: Root | undefined;
const nodes: Element[] = [];
afterEach(async () => {
  await act(async () => root?.unmount());
  for (const node of nodes.splice(0)) node.remove();
  await rotate(390, 844);
});

const fixed = (items: PortholeItem[]) => ({ snapshot: { version: 1 as const, items, areas: { chats: { lastVerifiedAt: Date.now(), troubleSince: null } } }, lastBeatAt: Date.now() });

it("keeps the action and the dismiss button 44px to a finger at a compact --spacing", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  nodes.push(host);
  root = createRoot(host);
  const update: PortholeItem = { id: "update", priority: "action", label: "Version 2.4 is ready", since: Date.now(), action: { id: "restart", label: "Restart" } };
  await act(async () => root!.render(<Porthole label="Status" source={fixed([update])} onAction={() => {}} />));
  const action = host.querySelector<HTMLElement>('[data-ouro-part="act"]')!;
  const measureAction = () => [action.getBoundingClientRect().height, action.getBoundingClientRect().width >= 44];
  expect(measureAction()).toEqual([44, true]);
  host.style.setProperty("--spacing", "0.2rem");
  expect(measureAction()).toEqual([44, true]);
  const dismissable: PortholeItem = { id: "current", priority: "rest", label: "Updated to version 2.4", since: Date.now(), dismissable: true };
  host.style.removeProperty("--spacing");
  await act(async () => root!.render(<Porthole label="Status" source={fixed([dismissable])} onDismiss={() => {}} />));
  const dismissed = host.querySelector<HTMLElement>('[data-ouro-part="dismiss"]')!;
  const measureDismiss = () => [dismissed.getBoundingClientRect().width, dismissed.getBoundingClientRect().height];
  expect(measureDismiss()).toEqual([44, 44]);
  host.style.setProperty("--spacing", "0.2rem");
  expect(measureDismiss()).toEqual([44, 44]);
});
