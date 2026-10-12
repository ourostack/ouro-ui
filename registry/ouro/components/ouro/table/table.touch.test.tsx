import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import { page } from "vitest/browser";
import { Table } from "@/registry/ouro/components/ouro/table/table";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

// Runs in the `touch` project: Chromium as a 390x844 phone with a coarse pointer.

let root: Root | undefined;
const nodes: Element[] = [];
afterEach(async () => {
  await page.viewport(390, 844);
  await act(async () => root?.unmount());
  for (const node of nodes.splice(0)) node.remove();
});

const rows = [
  { id: "a", name: "Ribs", time: "4 h", href: "#a" },
  { id: "b", name: "Salad", time: "10 min", href: "#b" },
];

it.each([
  ["portrait", 390, 844],
  ["landscape", 844, 390],
])("makes a linked row at least 44px tall in %s, dense too, and keeps 16px text", async (_name, width, height) => {
  await page.viewport(width, height);
  expect(matchMedia("(pointer: coarse)").matches).toBe(true);
  const host = document.createElement("div");
  document.body.append(host);
  nodes.push(host);
  root = createRoot(host);
  await act(async () =>
    root!.render(
      <>
        <Table caption="Recipes" rowHref="href" columns={[{ key: "name", header: "Recipe" }, { key: "time", header: "Time" }]} rows={rows} />
        <Table caption="Dense" dense rowHref="href" columns={[{ key: "name", header: "Recipe" }, { key: "time", header: "Time" }]} rows={rows} />
      </>,
    ),
  );
  const linked = [...host.querySelectorAll("tbody tr")];
  expect(linked).toHaveLength(4);
  for (const row of linked) expect(row.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
  expect(getComputedStyle(host.querySelector("tbody td")!).fontSize).toBe("16px");
});
