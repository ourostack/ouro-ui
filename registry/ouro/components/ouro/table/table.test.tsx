import { type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Item } from "@/registry/ouro/components/ouro/item/item";
import { Table } from "@/registry/ouro/components/ouro/table/table";
import { TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/registry/ouro/components/ouro/table/table-parts";
import { OuroProvider, type OuroLinkComponent } from "@/registry/ouro/lib/ouro/ouro-provider";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

const roots: Root[] = [];
let mounted: Element[] = [];

async function render(node: ReactNode, width = 640) {
  const host = document.createElement("div");
  host.style.width = `${width}px`;
  document.body.append(host);
  mounted.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
  const table = host.querySelector<HTMLElement>('[data-ouro="table"]')!;
  return { host, table, viewport: table.querySelector<HTMLElement>("[data-scroll-viewport]")! };
}

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(async () => {
  vi.restoreAllMocks();
  await page.viewport(1280, 800);
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  for (const node of mounted) node.remove();
  mounted = [];
  if (location.hash) history.replaceState(null, "", location.pathname + location.search);
});

function center(element: Element) {
  const rect = element.getBoundingClientRect();
  return [rect.left + rect.width / 2, rect.top + rect.height / 2] as const;
}

const frame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

interface Recipe {
  id: string;
  name: string;
  time: string;
  serves: number;
  href?: string;
}

const recipes: Recipe[] = [
  { id: "ribs", name: "Braised short ribs", time: "4 h", serves: 6, href: "#ribs" },
  { id: "salad", name: "Herb salad", time: "10 min", serves: 2, href: "#salad" },
  { id: "bread", name: "Rye bread", time: "18 h", serves: 8 },
];

describe("Table", () => {
  it("renders a semantic table named by its caption, with column and row headers", async () => {
    const { table } = await render(
      <Table
        caption="Recipes"
        columns={[
          { key: "name", header: "Recipe" },
          { key: "time", header: "Time" },
          { key: "serves", header: "Serves", align: "end" },
          { key: "position", header: "Position", cell: (row, index) => `${row.id} #${index + 1}` },
        ]}
        rows={recipes}
      />,
    );
    await expect.element(page.getByRole("table", { name: "Recipes" })).toBeVisible();
    expect(page.getByRole("columnheader").elements().map((cell) => cell.textContent)).toEqual(["Recipe", "Time", "Serves", "Position"]);
    expect(page.getByRole("rowheader").elements().map((cell) => cell.textContent)).toEqual(["Braised short ribs", "Herb salad", "Rye bread"]);
    for (const header of page.getByRole("columnheader").elements()) expect(header.getAttribute("scope")).toBe("col");
    for (const header of page.getByRole("rowheader").elements()) expect(header.getAttribute("scope")).toBe("row");
    const body = [...table.querySelectorAll("tbody tr")].map((row) => [...row.children].map((cell) => cell.textContent));
    expect(body).toEqual([
      ["Braised short ribs", "4 h", "6", "ribs #1"],
      ["Herb salad", "10 min", "2", "salad #2"],
      ["Rye bread", "18 h", "8", "bread #3"],
    ]);
    const serves = table.querySelector("tbody tr td:nth-child(3)")!;
    expect(getComputedStyle(serves).textAlign).toMatch(/^(end|right)$/);
    expect(getComputedStyle(table.querySelector("thead th:nth-child(3)")!).textAlign).toMatch(/^(end|right)$/);
    expect(table.querySelector("a")).toBeNull();
  });

  it("makes the column marked rowHeader the row header, and keeps a hidden header's name", async () => {
    await render(
      <Table
        caption="Recipes"
        columns={[
          { key: "time", header: "Time" },
          { key: "name", header: "Recipe", rowHeader: true },
          { key: "act", header: "Actions", hideHeader: true, cell: () => <Button size="sm">Save</Button> },
        ]}
        rows={recipes}
      />,
    );
    expect(page.getByRole("rowheader").elements().map((cell) => cell.textContent)).toEqual(["Braised short ribs", "Herb salad", "Rye bread"]);
    const hidden = page.getByRole("columnheader", { name: "Actions" }).element();
    expect(hidden.querySelector("span")!.getBoundingClientRect().width).toBeLessThanOrEqual(1);
  });

  it("hides the caption visually with hideCaption, and keeps the name", async () => {
    const { table } = await render(<Table caption="Recipes" hideCaption columns={[{ key: "name", header: "Recipe" }]} rows={recipes} />);
    await expect.element(page.getByRole("table", { name: "Recipes" })).toBeInTheDocument();
    expect(table.querySelector("caption")!.getBoundingClientRect().width).toBeLessThanOrEqual(1);
    expect(table.querySelector("[data-table-caption]")).toBeNull();
    // Shown, the caption sits above the scrolling region, so it stays in view while the table scrolls sideways.
    const { table: shown, viewport } = await render(<Table caption="Pantry" columns={[{ key: "name", header: "Recipe" }]} rows={recipes} />);
    const visible = shown.querySelector("[data-table-caption]")!;
    expect(visible.textContent).toBe("Pantry");
    expect(visible.getBoundingClientRect().bottom).toBeLessThanOrEqual(viewport.getBoundingClientRect().top);
    await expect.element(page.getByRole("table", { name: "Pantry" })).toBeInTheDocument();
  });

  it("keys rows by id, by a rowKey field or function, and by index without an id", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await render(
      <>
        <Table caption="A" columns={[{ key: "name", header: "Recipe" }]} rows={recipes} />
        <Table caption="B" columns={[{ key: "name", header: "Recipe" }]} rows={recipes} rowKey="name" />
        <Table caption="C" columns={[{ key: "name", header: "Recipe" }]} rows={recipes} rowKey={(row) => row.name} />
        <Table caption="D" columns={[{ key: "label", header: "Label" }]} rows={[{ label: "One" }, { label: "Two" }]} />
      </>,
    );
    expect(page.getByRole("rowheader").elements().map((cell) => cell.textContent)).toEqual([
      ...Array(3).fill(recipes.map((recipe) => recipe.name)).flat(),
      "One",
      "Two",
    ]);
    expect(error).not.toHaveBeenCalled();
  });

  it("shows the empty message in one cell across every column", async () => {
    const columns = [
      { key: "name", header: "Recipe" },
      { key: "time", header: "Time" },
    ] as const;
    const { table } = await render(<Table caption="Recipes" columns={[...columns]} rows={[] as Recipe[]} />);
    const cell = table.querySelector("tbody td")!;
    expect(cell.textContent).toBe("Nothing here yet.");
    expect(cell.getAttribute("colspan")).toBe("2");
    const { table: custom } = await render(<Table caption="Recipes" columns={[...columns]} rows={[] as Recipe[]} empty="No recipes match." />);
    expect(custom.querySelector("tbody td")!.textContent).toBe("No recipes match.");
  });

  it("shades every other body row with striped", async () => {
    const { table } = await render(<Table caption="Recipes" striped columns={[{ key: "name", header: "Recipe" }]} rows={recipes} />);
    const [first, second, third] = [...table.querySelectorAll("tbody tr")].map((row) => getComputedStyle(row).backgroundColor);
    expect(first).toBe("rgba(0, 0, 0, 0)");
    expect(second).not.toBe("rgba(0, 0, 0, 0)");
    expect(third).toBe(first);
    const { table: plain } = await render(<Table caption="Recipes" columns={[{ key: "name", header: "Recipe" }]} rows={recipes} />);
    expect(getComputedStyle(plain.querySelectorAll("tbody tr")[1]!).backgroundColor).toBe("rgba(0, 0, 0, 0)");
  });

  it("tightens the cells with dense", async () => {
    const { table } = await render(<Table caption="Recipes" columns={[{ key: "name", header: "Recipe" }]} rows={recipes} />);
    const { table: dense } = await render(<Table caption="Recipes" dense columns={[{ key: "name", header: "Recipe" }]} rows={recipes} />);
    const pad = (root: HTMLElement) => parseFloat(getComputedStyle(root.querySelector("tbody th")!).paddingTop);
    expect(pad(dense)).toBeLessThan(pad(table));
    expect(dense.querySelector("tbody tr")!.getBoundingClientRect().height).toBeLessThan(table.querySelector("tbody tr")!.getBoundingClientRect().height);
  });

  it("lets a column with wrap break its text onto more lines, at least 192px wide", async () => {
    const long = "Seared hard, then braised low in red wine and stock until they fall apart";
    const { table } = await render(
      <Table
        caption="Recipes"
        columns={[
          { key: "name", header: "Recipe" },
          { key: "note", header: "Note", wrap: true },
          { key: "other", header: "Other" },
        ]}
        rows={[{ id: 1, name: "Ribs", note: long, other: long }]}
      />,
      358,
    );
    const [, note, other] = [...table.querySelectorAll("tbody tr > *")] as HTMLElement[];
    expect(getComputedStyle(note!).whiteSpace).toBe("normal");
    expect(note!.getBoundingClientRect().width).toBeGreaterThanOrEqual(192);
    // Several lines of text: a one-line row is 44px tall at this size.
    expect(note!.getBoundingClientRect().height).toBeGreaterThan(80);
    expect(getComputedStyle(other!).whiteSpace).toBe("nowrap");
  });

  it("passes attributes to the root, the ref to the table, and lets layout classes win", async () => {
    let element: HTMLTableElement | null = null;
    const { table } = await render(
      <Table caption="Recipes" id="recipes" className="mt-4" ref={(node) => void (element = node)} columns={[{ key: "name", header: "Recipe" }]} rows={recipes} />,
    );
    expect(table.id).toBe("recipes");
    expect(getComputedStyle(table).marginTop).toBe("16px");
    expect(element).toBe(table.querySelector("table"));
  });
});

describe("Table scrolling", () => {
  const wideColumns = Array.from({ length: 10 }, (_, index) => ({
    key: `c${index}`,
    header: `Column ${index + 1}`,
    cell: (row: { id: number }) => `Row ${row.id} cell ${index + 1}`,
  }));
  const manyRows = Array.from({ length: 40 }, (_, index) => ({ id: index + 1 }));

  it("scrolls sideways inside its own region on a phone, named by the caption, without widening the page", async () => {
    await page.viewport(390, 844);
    const { table, viewport } = await render(<Table caption="Prep log" columns={wideColumns} rows={manyRows.slice(0, 3)} />, 358);
    expect(table.getBoundingClientRect().width).toBe(358);
    expect(viewport.scrollWidth).toBeGreaterThan(viewport.clientWidth);
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(390);
    await expect.poll(() => viewport.tabIndex).toBe(0);
    await expect.element(page.getByRole("region", { name: "Prep log" })).toBeInTheDocument();
    viewport.scrollLeft = 300;
    expect(viewport.scrollLeft).toBe(300);
  });

  it("keeps the header at the top while the rows scroll under it, also scrolled sideways", async () => {
    await page.viewport(390, 844);
    const { viewport, table } = await render(
      <Table caption="Prep log" stickyHeader className="max-h-64" columns={wideColumns} rows={manyRows} rowHref={(row) => `#row-${row.id}`} />,
      358,
    );
    expect(viewport.scrollHeight).toBeGreaterThan(viewport.clientHeight);
    expect(viewport.scrollWidth).toBeGreaterThan(viewport.clientWidth);
    viewport.scrollTop = 400;
    viewport.scrollLeft = 200;
    await frame();
    const top = viewport.getBoundingClientRect().top;
    const header = table.querySelector<HTMLElement>("thead th:nth-child(2)")!;
    expect(Math.abs(header.getBoundingClientRect().top - top)).toBeLessThanOrEqual(1);
    // The header scrolls sideways with its column.
    const cell = table.querySelector("tbody tr td:nth-child(2)")!;
    expect(Math.abs(header.getBoundingClientRect().left - cell.getBoundingClientRect().left)).toBeLessThanOrEqual(1);
    // It sits above the rows and their row links where they pass under it.
    const box = viewport.getBoundingClientRect();
    const hit = document.elementFromPoint(box.left + box.width / 2, center(header)[1]);
    expect(table.querySelector("thead")!.contains(hit)).toBe(true);
  });

  it("lets the header scroll away without stickyHeader", async () => {
    const { viewport, table } = await render(<Table caption="Prep log" className="max-h-64" columns={wideColumns} rows={manyRows} />, 358);
    viewport.scrollTop = 400;
    await frame();
    expect(table.querySelector("thead th")!.getBoundingClientRect().bottom).toBeLessThan(viewport.getBoundingClientRect().top);
  });
});

describe("Table with rowHref", () => {
  it("makes each linked row one link named by its row header, with one tab stop, covering the row", async () => {
    const { table } = await render(
      <Table
        caption="Recipes"
        columns={[
          { key: "name", header: "Recipe" },
          { key: "time", header: "Time" },
        ]}
        rows={recipes}
        rowHref={(row) => row.href}
      />,
    );
    const links = [...table.querySelectorAll<HTMLAnchorElement>("a")];
    expect(links.map((link) => link.getAttribute("href"))).toEqual(["#ribs", "#salad"]);
    await expect.element(page.getByRole("link", { name: "Braised short ribs" })).toBeVisible();
    const [ribs] = table.querySelectorAll("tbody tr");
    const [x, y] = center(ribs!.querySelector("td")!);
    expect(document.elementFromPoint(x, y)).toBe(links[0]);
    // A row whose rowHref is undefined is not a link.
    expect(table.querySelectorAll("tbody tr")[2]!.hasAttribute("data-linked")).toBe(false);
    const before = document.createElement("button");
    table.parentElement!.prepend(before);
    before.focus();
    await userEvent.tab();
    expect(document.activeElement).toBe(links[0]);
    expect(getComputedStyle(links[0]!, "::after").outlineStyle).toBe("solid");
    await userEvent.tab();
    expect(document.activeElement).toBe(links[1]);
  });

  it("takes rowHref as the name of a field, as a Server Component passes it", async () => {
    const { table } = await render(<Table caption="Recipes" columns={[{ key: "name", header: "Recipe" }]} rows={recipes} rowHref="href" />);
    expect([...table.querySelectorAll("a")].map((link) => link.getAttribute("href"))).toEqual(["#ribs", "#salad"]);
  });

  it("opens the row from a real tap on any cell, and buttons, links and inputs in cells keep their own taps on a phone", async () => {
    await page.viewport(390, 844);
    const onSave = vi.fn();
    const { table } = await render(
      <Table
        caption="Recipes"
        columns={[
          { key: "name", header: "Recipe" },
          { key: "cook", header: "Cook", cell: () => <a href="#cook">Ari</a> },
          { key: "note", header: "Note", cell: () => <input aria-label="Note" defaultValue="" style={{ width: 80 }} /> },
          { key: "save", header: "Save", hideHeader: true, cell: () => <Button size="sm" onClick={onSave}>Save</Button> },
          { key: "time", header: "Time", cell: (row) => <span tabIndex={-1}>{row.time}</span> },
        ]}
        rows={recipes.slice(0, 1)}
        rowHref="href"
      />,
      358,
    );
    const viewport = table.querySelector<HTMLElement>("[data-scroll-viewport]")!;
    const link = table.querySelector("[data-stretched-link]")!;
    const save = page.getByRole("button", { name: "Save" }).element() as HTMLElement;
    const cook = page.getByRole("link", { name: "Ari" }).element() as HTMLElement;
    const note = page.getByRole("textbox", { name: "Note" }).element() as HTMLElement;
    for (const control of [save, cook, note]) {
      control.scrollIntoView({ block: "nearest", inline: "nearest" });
      const [x, y] = center(control);
      expect(control.contains(document.elementFromPoint(x, y))).toBe(true);
    }
    await userEvent.click(save);
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(location.hash).toBe("");
    await userEvent.click(note);
    expect(document.activeElement).toBe(note);
    expect(location.hash).toBe("");
    await userEvent.click(cook);
    expect(location.hash).toBe("#cook");
    // Text in an element that takes focus only from code still opens the row.
    const time = page.getByText("4 h").element();
    time.scrollIntoView({ block: "nearest", inline: "nearest" });
    const [tx, ty] = center(time);
    expect(document.elementFromPoint(tx, ty)).toBe(link);
    viewport.scrollLeft = 0;
    await userEvent.click(page.getByRole("link", { name: "Braised short ribs" }));
    expect(location.hash).toBe("#ribs");
  });

  it("keeps a linked Item in a cell its own link", async () => {
    const { table } = await render(
      <Table
        caption="Recipes"
        columns={[
          { key: "name", header: "Recipe" },
          { key: "cook", header: "Cook", cell: () => <Item href="#cook" title="Ari" size="sm" /> },
        ]}
        rows={recipes.slice(0, 1)}
        rowHref="href"
      />,
    );
    const itemLink = table.querySelector("[data-item-link]")!;
    const [x, y] = center(itemLink);
    expect(document.elementFromPoint(x, y)).toBe(itemLink);
  });

  it("renders the provider's linkComponent for row links", async () => {
    const RouterLink: OuroLinkComponent = (props) => <a data-router="" {...props} />;
    const { table } = await render(
      <OuroProvider linkComponent={RouterLink}>
        <Table caption="Recipes" columns={[{ key: "name", header: "Recipe" }]} rows={[{ id: "a", name: "Ribs", href: "/recipes/ribs" }]} rowHref="href" />
      </OuroProvider>,
    );
    expect(table.querySelector("a")!.hasAttribute("data-router")).toBe(true);
  });
});

describe("Table parts", () => {
  it("builds the same table from parts, with a linked row and a footer", async () => {
    const { table } = await render(
      <Table caption="Pantry" striped>
        <TableHeader>
          <TableRow>
            <TableHead>Item</TableHead>
            <TableHead align="end">Qty</TableHead>
            <TableHead hideHeader>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow href="#flour">
            <TableCell rowHeader>Flour</TableCell>
            <TableCell align="end">2 kg</TableCell>
            <TableCell>
              <Button size="sm">Use</Button>
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell rowHeader>Rice</TableCell>
            <TableCell align="end">1 kg</TableCell>
            <TableCell />
          </TableRow>
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell rowHeader>Total</TableCell>
            <TableCell align="end">3 kg</TableCell>
            <TableCell />
          </TableRow>
        </TableFooter>
      </Table>,
    );
    await expect.element(page.getByRole("table", { name: "Pantry" })).toBeVisible();
    await expect.element(page.getByRole("link", { name: "Flour" })).toHaveAttribute("href", "#flour");
    expect(page.getByRole("rowheader").elements().map((cell) => cell.textContent)).toEqual(["Flour", "Rice", "Total"]);
    expect(table.querySelector("tfoot")).not.toBeNull();
    const use = page.getByRole("button", { name: "Use" }).element();
    const [x, y] = center(use);
    expect(use.contains(document.elementFromPoint(x, y))).toBe(true);
  });

  it.each([
    ["TableHeader", <TableHeader key="x" />, "<Table caption=\"…\"><TableHeader>…</TableHeader></Table>"],
    ["TableBody", <TableBody key="x" />, "<Table caption=\"…\"><TableBody>…</TableBody></Table>"],
    ["TableFooter", <TableFooter key="x" />, "<Table caption=\"…\"><TableFooter>…</TableFooter></Table>"],
    ["TableRow", <TableRow key="x" />, "<Table caption=\"…\"><TableBody><TableRow>…</TableRow></TableBody></Table>"],
    ["TableHead", <TableHead key="x">x</TableHead>, "<Table caption=\"…\"><TableHeader><TableRow><TableHead>…</TableHead></TableRow></TableHeader></Table>"],
    ["TableCell", <TableCell key="x" />, "<Table caption=\"…\"><TableBody><TableRow><TableCell>…</TableCell></TableRow></TableBody></Table>"],
  ])("throws in development when %s is outside its parent", async (part, node, shape) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderToString(node)).toThrow(`[ouro-ui] ${part}: must be rendered inside`);
    expect(() => renderToString(node)).toThrow(shape);
  });

  it.each([
    ["TableRow", <Table key="x" caption="x"><TableRow /></Table>, "<TableBody>"],
    ["TableHead", <Table key="x" caption="x"><TableHeader><TableHead>x</TableHead></TableHeader></Table>, "<TableRow>"],
    ["TableCell", <Table key="x" caption="x"><TableBody><TableCell /></TableBody></Table>, "<TableRow>"],
  ])("throws in development when %s is in the Table but outside its parent", async (part, node, parent) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderToString(node)).toThrow(`[ouro-ui] ${part}: must be rendered inside ${parent}`);
  });

  it("warns for a linked row with no cells, with a placeholder in the fix", async () => {
    await render(
      <Table caption="Pantry">
        <TableBody>
          <TableRow href="#flour" />
        </TableBody>
      </Table>,
    );
    expect(warn).toHaveBeenCalledWith(
      '[ouro-ui] TableRow: href needs a row header cell, which holds the link and names it. Fix: <TableRow href="#flour"><TableCell rowHeader>…</TableCell>…</TableRow>.',
    );
  });

  it("warns when a linked row has no row header cell to hold its link", async () => {
    await render(
      <Table caption="Pantry">
        <TableBody>
          <TableRow href="#flour">
            <TableCell>Flour</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );
    expect(warn).toHaveBeenCalledWith(
      '[ouro-ui] TableRow: href needs a row header cell, which holds the link and names it. Fix: <TableRow href="#flour"><TableCell rowHeader>Flour</TableCell>…</TableRow>.',
    );
  });

  it("warns once for an unknown alignment on a part, and aligns to the start", async () => {
    const { table } = await render(
      <Table caption="Pantry">
        <TableHeader>
          <TableRow>
            <TableHead {...({ align: "left" } as object)}>Item</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell {...({ align: "right" } as object)}>Flour</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );
    expect(warn).toHaveBeenCalledWith('[ouro-ui] TableHead: align="left" is not an alignment; use "start", "center", "end". Fix: <TableHead align="start">.');
    expect(warn).toHaveBeenCalledWith('[ouro-ui] TableCell: align="right" is not an alignment; use "start", "center", "end". Fix: <TableCell align="end">.');
    expect(getComputedStyle(table.querySelector("td")!).textAlign).toMatch(/^(start|left)$/);
  });

  it("checks the parts' className", async () => {
    await render(
      <Table caption="Pantry">
        <TableBody>
          <TableRow className="bg-muted">
            <TableCell rowHeader className="text-right">
              Flour
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );
    expect(warn).toHaveBeenCalledWith('[ouro-ui] TableRow: "bg-muted" sets appearance, and className is for layout only. Fix: <Table striped>.');
    expect(warn).toHaveBeenCalledWith('[ouro-ui] TableCell: "text-right" aligns content, and className is for layout only. Fix: <TableCell align="end">.');
  });
});

describe("Table development messages", () => {
  const columns = [{ key: "name", header: "Recipe" }] as const;
  it.each([
    ["data", { data: recipes }, "data is not a prop", "<Table rows={recipes} columns={…}>"],
    ["onRowClick", { onRowClick: () => {} }, "onRowClick is not a prop; a row opens a link", "<Table rowHref={(row) => `/recipes/${row.id}`}>"],
    ["title", { title: "Recipes" }, "title is not a prop", '<Table caption="Recipes">'],
    ["sortable", { sortable: true }, "sortable is not a prop; Table does not sort", "<Table rows={sortedRows}>"],
    ["children with columns", { children: <TableBody /> }, "pass columns and rows, or parts as children, not both", "<Table caption=\"…\" columns={…} rows={…} />"],
    ["stickyHeader without a height", { stickyHeader: true }, "stickyHeader needs a height to scroll inside", '<Table stickyHeader className="max-h-96">'],
  ])("warns for %s with the fix", async (_name, extra, problem, fix) => {
    await render(<Table {...({ caption: "Recipes", columns, rows: recipes, ...extra } as unknown as Parameters<typeof Table>[0])} />);
    expect(warn).toHaveBeenCalledWith(`[ouro-ui] Table: ${problem}. Fix: ${fix}.`);
  });

  it.each([
    ["accessorKey", { accessorKey: "name" }, "a column's accessorKey is not a prop", '{ key: "name", header: "…" }'],
    ["title", { title: "Recipe" }, "a column's title is not a prop", '{ key: "…", header: "Recipe" }'],
    ["label", { label: "Recipe" }, "a column's label is not a prop", '{ key: "…", header: "Recipe" }'],
    ["render", { render: () => null }, "a column's render is not a prop", "{ key: \"…\", header: \"…\", cell: (row) => … }"],
    ["align left", { align: "left" }, 'align="left" is not an alignment; use "start", "center", "end"', '{ align: "start" }'],
    ["align", { align: "right" }, 'align="right" is not an alignment; use "start", "center", "end"', '{ align: "end" }'],
    ["duplicate keys", { key: "name" }, 'two columns have key "name"; keys name columns, so each is unique', '{ key: "name", … }, { key: "time", … }'],
    ["no header", { header: "" }, "every column needs a header; it names the column for screen readers", '{ key: "…", header: "Actions", hideHeader: true }'],
  ])("warns for a column's %s with the fix", async (_name, extra, problem, fix) => {
    const cols = [{ key: "name", header: "Recipe" }, { key: "time", header: "Time", ...extra }];
    await render(<Table {...({ caption: "Recipes", columns: cols, rows: recipes } as unknown as Parameters<typeof Table>[0])} />);
    expect(warn).toHaveBeenCalledWith(`[ouro-ui] Table: ${problem}. Fix: ${fix}.`);
  });

  it("warns when columns come without rows, and shows the empty message", async () => {
    const { table } = await render(<Table {...({ caption: "Recipes", columns } as unknown as Parameters<typeof Table>[0])} />);
    expect(warn).toHaveBeenCalledWith("[ouro-ui] Table: columns need rows. Fix: <Table columns={…} rows={recipes}>.");
    expect(table.querySelector("tbody td")!.textContent).toBe("Nothing here yet.");
  });

  it("warns when there is no caption", async () => {
    await render(<Table {...({ columns, rows: recipes } as unknown as Parameters<typeof Table>[0])} />);
    expect(warn).toHaveBeenCalledWith('[ouro-ui] Table: caption is required; it names the table. Fix: <Table caption="Recipes">, with hideCaption when a heading already shows it.');
  });

  it("aligns to the start for an unknown alignment, with one message from Table", async () => {
    const { table } = await render(
      <Table {...({ caption: "Recipes", columns: [{ key: "name", header: "Recipe", align: "right" }], rows: recipes } as unknown as Parameters<typeof Table>[0])} />,
    );
    expect(getComputedStyle(table.querySelector("tbody th")!).textAlign).toMatch(/^(start|left)$/);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("accepts a height from the style for stickyHeader", async () => {
    await render(<Table caption="Recipes" stickyHeader style={{ maxHeight: 200 }} columns={[...columns]} rows={recipes} />);
    await render(<Table caption="Recipes" stickyHeader className="h-full" columns={[...columns]} rows={recipes} />);
    expect(warn).not.toHaveBeenCalled();
  });

  it("checks the className", async () => {
    await render(<Table caption="Recipes" className="rounded-lg border" columns={[...columns]} rows={recipes} />);
    expect(warn).toHaveBeenCalledWith(
      '[ouro-ui] Table: "rounded-lg" sets appearance, and className is for layout only. Fix: put the Table inside a <Card> for a frame.',
    );
  });

  it("renders to a string without warnings", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const html = renderToString(
      <>
        <Table caption="Recipes" columns={[...columns]} rows={recipes} rowHref="href" striped dense stickyHeader className="max-h-64" />
        <Table caption="Pantry">
          <TableBody>
            <TableRow href="/flour">
              <TableCell rowHeader>Flour</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </>,
    );
    expect(html).toContain('data-ouro="table"');
    expect(html).toContain("<caption");
    expect(html).toContain('href="#ribs"');
    expect(html).toContain('href="/flour"');
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
});
