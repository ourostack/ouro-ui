import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { Table } from "@/registry/ouro/components/ouro/table/table";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { rotate } from "@/registry/ouro/lib/ouro/testing/rotate";

// Runs in the `touch` project: Chromium as a 390x844 phone with a coarse pointer.

let root: Root | undefined;
const nodes: Element[] = [];
afterEach(async () => {
  await rotate(390, 844);
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
  await rotate(width, height);
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

it("makes a sortable header at least 44px tall, dense too, and sorts from a tap anywhere on it", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  nodes.push(host);
  root = createRoot(host);
  const columns = [
    { key: "name", header: "Recipe", sortable: true },
    { key: "time", header: "Time", sortable: true },
  ] as const;
  await act(async () =>
    root!.render(
      <>
        <Table caption="Recipes" columns={[...columns]} rows={rows} />
        <Table caption="Dense" dense columns={[...columns]} rows={rows} />
      </>,
    ),
  );
  const headers = [...host.querySelectorAll("thead th")];
  expect(headers).toHaveLength(4);
  for (const header of headers) expect(header.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
  const dense = headers[3]!;
  const box = dense.getBoundingClientRect();
  await userEvent.click(dense, { position: { x: box.width - 4, y: box.height - 4 } });
  expect(dense.getAttribute("aria-sort")).toBe("ascending");
  await userEvent.click(dense, { position: { x: 4, y: 4 } });
  expect(dense.getAttribute("aria-sort")).toBe("descending");
  expect([...host.querySelectorAll("table")[1]!.querySelectorAll("tbody th")].map((cell) => cell.textContent)).toEqual(["Salad", "Ribs"]);
});
