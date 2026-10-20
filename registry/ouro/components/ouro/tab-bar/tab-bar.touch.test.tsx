import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import { TabBar } from "@/registry/ouro/components/ouro/tab-bar/tab-bar";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

// Runs in the `touch` project: Chromium as a 390x844 phone with a coarse pointer.

let root: Root | undefined;
const nodes: Element[] = [];
afterEach(async () => {
  await act(async () => root?.unmount());
  for (const node of nodes.splice(0)) node.remove();
});

const icon = <svg viewBox="0 0 24 24" />;

it("fits five tabs and an accessory on a phone, each well over 44px, and a tap reaches the tab under the finger", async () => {
  expect(matchMedia("(pointer: coarse)").matches).toBe(true);
  const host = document.createElement("div");
  document.body.append(host);
  nodes.push(host);
  root = createRoot(host);
  const labels = ["Home", "Recipes", "Cookbooks", "Shopping", "Profile"];
  await act(async () =>
    root!.render(
      <TabBar
        label="Main"
        items={labels.map((label) => ({ label, href: `/${label.toLowerCase()}`, icon }))}
        accessory={{ label: "Search", href: "/search", icon }}
      />,
    ),
  );
  const links = [...host.querySelectorAll<HTMLAnchorElement>("[data-ouro-control]")];
  expect(links).toHaveLength(6);
  for (const link of links) {
    const rect = link.getBoundingClientRect();
    expect(rect.width).toBeGreaterThanOrEqual(44);
    expect(rect.height).toBeGreaterThanOrEqual(44);
    expect(rect.right).toBeLessThanOrEqual(390);
    expect(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)?.closest("a")).toBe(link);
    // No label is cut to nothing.
    expect(link.textContent!.length).toBeGreaterThan(0);
  }
});
