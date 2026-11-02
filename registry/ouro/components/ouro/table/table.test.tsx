import { useState, type ReactNode } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Item } from "@/registry/ouro/components/ouro/item/item";
import { Table, type TableSort } from "@/registry/ouro/components/ouro/table/table";
import { TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRoot, TableRow } from "@/registry/ouro/components/ouro/table/table-parts";
import { OuroProvider, type OuroLinkComponent } from "@/registry/ouro/lib/ouro/ouro-provider";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { watchAnnouncements } from "@/registry/ouro/lib/ouro/testing/announcements";
import { pressTab } from "@/registry/ouro/lib/ouro/testing/tab";

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

  it("breaks a long URL in a wrap column instead of widening it", async () => {
    const url = "https://example.com/recipes/braisedshortribswithredwineandaverylongslugindeedthatneverbreaks";
    const { table } = await render(
      <Table caption="Links" columns={[{ key: "name", header: "Recipe" }, { key: "url", header: "Link", wrap: true }]} rows={[{ id: 1, name: "Ribs", url }]} />,
      358,
    );
    const cell = table.querySelector("tbody td")!;
    expect(cell.getBoundingClientRect().width).toBeLessThan(300);
    expect(cell.scrollWidth).toBeLessThanOrEqual(cell.clientWidth);
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
    await page.viewport(1280, 800);
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
    await pressTab();
    expect(document.activeElement).toBe(links[0]);
    expect(getComputedStyle(links[0]!, "::after").outlineStyle).toBe("solid");
    await pressTab();
    expect(document.activeElement).toBe(links[1]);
  });

  it("puts the row link in the first column without a cell renderer, past a leading checkbox", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { table } = await render(
      <Table
        caption="Recipes"
        columns={[
          { key: "pick", header: "Pick", cell: (row) => <input type="checkbox" aria-label={`Pick ${row.name}`} /> },
          { key: "name", header: "Recipe" },
          { key: "time", header: "Time" },
        ]}
        rows={recipes.slice(0, 1)}
        rowHref="href"
      />,
    );
    const link = page.getByRole("link", { name: "Braised short ribs" }).element();
    expect(link.closest("th")!.getAttribute("scope")).toBe("row");
    expect(table.querySelector("a input")).toBeNull();
    expect(page.getByRole("rowheader").elements().map((cell) => cell.textContent)).toEqual(["Braised short ribs"]);
    const box = page.getByRole("checkbox").element();
    const [x, y] = center(box);
    expect(box.contains(document.elementFromPoint(x, y))).toBe(true);
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it("opens external row links in a new tab, safely, and says so with a translatable label", async () => {
    const { table } = await render(
      <>
        <Table caption="Sites" columns={[{ key: "name", header: "Site" }]} rows={[{ id: 1, name: "Ouro", href: "https://ouro.bot" }]} rowHref="href" rowExternal />
        <Table
          caption="Sitios"
          columns={[{ key: "name", header: "Sitio" }]}
          rows={[{ id: 1, name: "Ouro", href: "https://ouro.bot" }]}
          rowHref="href"
          rowExternal
          externalLabel="(se abre en una pestaña nueva)"
        />
      </>,
    );
    const link = table.querySelector("a")!;
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    await expect.element(page.getByRole("link", { name: "Ouro (opens in a new tab)" })).toBeInTheDocument();
    await expect.element(page.getByRole("link", { name: "Ouro (se abre en una pestaña nueva)" })).toBeInTheDocument();
  });

  it("keeps internal row links in the same tab", async () => {
    const { table } = await render(<Table caption="Recipes" columns={[{ key: "name", header: "Recipe" }]} rows={recipes.slice(0, 1)} rowHref="href" />);
    expect(table.querySelector("a")!.hasAttribute("target")).toBe(false);
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

/** The text of each body row's cells in one column, top to bottom. */
function column(table: Element, index: number) {
  return [...table.querySelectorAll("tbody tr")].map((row) => row.children[index]!.textContent);
}

/** Each column header's `aria-sort`, or null where it has none. */
function sortMarks() {
  return page.getByRole("columnheader").elements().map((cell) => cell.getAttribute("aria-sort"));
}

const sortColumns = [
  { key: "name", header: "Recipe", sortable: true },
  { key: "time", header: "Time" },
  { key: "serves", header: "Serves", align: "end", sortable: true },
] as const;

describe("Table sorting", () => {
  it("sorts by a sortable column from its header, and reverses on the next press, with aria-sort and an arrow", async () => {
    const onSortChange = vi.fn();
    const { table } = await render(<Table caption="Recipes" columns={[...sortColumns]} rows={recipes} onSortChange={onSortChange} />);
    // Only sortable columns are buttons; nothing is sorted yet, so the rows keep their order.
    expect(page.getByRole("columnheader", { name: "Time" }).element().querySelector("button")).toBeNull();
    expect(table.querySelectorAll("thead button")).toHaveLength(2);
    expect(sortMarks()).toEqual([null, null, null]);
    expect([...table.querySelectorAll("[data-sort-icon]")].map((icon) => icon.getAttribute("data-sort-icon"))).toEqual(["none", "none"]);
    expect(column(table, 0)).toEqual(["Braised short ribs", "Herb salad", "Rye bread"]);

    const serves = page.getByRole("button", { name: "Serves" });
    await userEvent.click(serves);
    expect(column(table, 2)).toEqual(["2", "6", "8"]);
    expect(sortMarks()).toEqual([null, null, "ascending"]);
    expect(onSortChange).toHaveBeenLastCalledWith({ key: "serves", direction: "ascending" });
    const servesHead = page.getByRole("columnheader", { name: "Serves" }).element();
    expect(servesHead.querySelector("[data-sort-icon]")!.getAttribute("data-sort-icon")).toBe("ascending");
    // The sorted header reads in the foreground colour, as the rows do, and the others stay muted.
    const foreground = getComputedStyle(table.querySelector("tbody td")!).color;
    expect(getComputedStyle(servesHead).color).toBe(foreground);
    expect(getComputedStyle(page.getByRole("columnheader", { name: "Recipe" }).element()).color).not.toBe(foreground);
    expect(getComputedStyle(page.getByRole("columnheader", { name: "Time" }).element()).color).not.toBe(foreground);
    // The arrow is a shape for each state, not only a colour.
    const shape = (name: string) => page.getByRole("columnheader", { name }).element().querySelector("path")!.getAttribute("d");
    const unsortedShape = shape("Recipe");
    const ascendingShape = shape("Serves");

    await userEvent.click(serves);
    expect(column(table, 2)).toEqual(["8", "6", "2"]);
    expect(sortMarks()).toEqual([null, null, "descending"]);
    expect(servesHead.querySelector("[data-sort-icon]")!.getAttribute("data-sort-icon")).toBe("descending");
    expect(new Set([unsortedShape, ascendingShape, shape("Serves")]).size).toBe(3);
    for (const d of [unsortedShape, ascendingShape, shape("Serves")]) expect(d).toMatch(/^M/);
    expect(onSortChange).toHaveBeenLastCalledWith({ key: "serves", direction: "descending" });

    await userEvent.click(serves);
    expect(column(table, 2)).toEqual(["2", "6", "8"]);

    // Another column starts ascending, and the first loses its mark.
    await userEvent.click(page.getByRole("button", { name: "Recipe" }));
    expect(column(table, 0)).toEqual(["Braised short ribs", "Herb salad", "Rye bread"]);
    expect(sortMarks()).toEqual(["ascending", null, null]);
    expect(onSortChange).toHaveBeenCalledTimes(4);
    expect(warn).not.toHaveBeenCalled();
  });

  it("sorts with Enter and Space and keeps focus on the header, whose layer covers the cell", async () => {
    const { table } = await render(<Table caption="Recipes" columns={[...sortColumns]} rows={recipes} />);
    const button = page.getByRole("button", { name: "Serves" }).element() as HTMLElement;
    const before = document.createElement("button");
    table.parentElement!.prepend(before);
    before.focus();
    await pressTab();
    expect(document.activeElement).toBe(page.getByRole("button", { name: "Recipe" }).element());
    await pressTab();
    expect(document.activeElement).toBe(button);
    await userEvent.keyboard("{Enter}");
    expect(column(table, 2)).toEqual(["2", "6", "8"]);
    await userEvent.keyboard(" ");
    expect(column(table, 2)).toEqual(["8", "6", "2"]);
    expect(document.activeElement).toBe(button);
    expect(getComputedStyle(button, "::after").outlineStyle).toBe("solid");
    // A press anywhere on the header cell lands on the button's layer.
    const cell = button.closest("th")!.getBoundingClientRect();
    expect(document.elementFromPoint(cell.left + 4, cell.top + 4)).toBe(button);
    expect(document.elementFromPoint(cell.right - 4, cell.bottom - 4)).toBe(button);
    // The name stays over the numbers in an end-aligned column, with the arrow before it.
    const label = button.querySelector("span")!.getBoundingClientRect();
    expect(button.querySelector("svg")!.getBoundingClientRect().right).toBeLessThanOrEqual(label.left);
    expect(Math.abs(label.right - table.querySelector("tbody td:nth-child(3)")!.getBoundingClientRect().right)).toBeLessThanOrEqual(17);
    // In a start-aligned column the arrow follows the name.
    const recipe = page.getByRole("button", { name: "Recipe" }).element();
    expect(recipe.querySelector("svg")!.getBoundingClientRect().left).toBeGreaterThanOrEqual(recipe.querySelector("span")!.getBoundingClientRect().right);
  });

  it("sorts numbers, dates and text with numbers in order, and puts empty values last both ways", async () => {
    const rows = [
      { id: "a", step: "Step 10", amount: 12, added: new Date("2026-03-01"), done: true },
      { id: "b", step: "Step 2", amount: null, added: new Date("invalid"), done: false },
      { id: "c", step: "", amount: 3, added: new Date("2025-12-24"), done: undefined },
      { id: "d", step: "step 1", amount: Number.NaN, added: new Date("2026-01-15"), done: true },
    ];
    const { table } = await render(
      <Table
        caption="Steps"
        columns={[
          { key: "step", header: "Step", sortable: true },
          { key: "amount", header: "Amount", sortable: true, cell: (row) => String(row.amount) },
          { key: "added", header: "Added", sortValue: (row) => row.added, cell: (row) => row.id },
          { key: "done", header: "Done", sortValue: (row) => row.done, cell: (row) => String(row.done) },
        ]}
        rows={rows}
      />,
    );
    const ids = () => [...table.querySelectorAll("tbody tr")].map((row) => row.children[2]!.textContent);
    const press = (name: string) => userEvent.click(page.getByRole("button", { name }));
    await press("Step");
    expect(ids()).toEqual(["d", "b", "a", "c"]);
    await press("Step");
    expect(ids()).toEqual(["a", "b", "d", "c"]);
    await press("Amount");
    expect(ids()).toEqual(["c", "a", "b", "d"]);
    await press("Amount");
    expect(ids()).toEqual(["a", "c", "b", "d"]);
    await press("Added");
    expect(ids()).toEqual(["c", "d", "a", "b"]);
    await press("Added");
    expect(ids()).toEqual(["a", "d", "c", "b"]);
    await press("Done");
    expect(ids()).toEqual(["b", "a", "d", "c"]);
    await press("Done");
    expect(ids()).toEqual(["a", "d", "b", "c"]);
  });

  it("sorts decimals and negative numbers as numbers, not as text", async () => {
    const rows = [
      { id: "a", amount: 1.5 },
      { id: "b", amount: -2 },
      { id: "c", amount: 1.25 },
      { id: "d", amount: 10 },
    ];
    const { table } = await render(<Table caption="Amounts" columns={[{ key: "id", header: "Id" }, { key: "amount", header: "Amount", sortable: true }]} rows={rows} />);
    await userEvent.click(page.getByRole("button", { name: "Amount" }));
    expect(column(table, 0)).toEqual(["b", "c", "a", "d"]);
  });

  it("puts numbers before text when a column mixes them, and after it when reversed", async () => {
    // "(any)" sorts before digits as text, so the numbers come first because they are numbers.
    // Text after a number and numbers after text, so the rows are compared both ways round.
    const rows = [
      { id: "b", size: 4 },
      { id: "a", size: "Large" },
      { id: "e", size: "(any)" },
      { id: "d", size: 2 },
      { id: "c", size: "Small" },
    ];
    const { table } = await render(<Table caption="Sizes" columns={[{ key: "id", header: "Id" }, { key: "size", header: "Size", sortable: true }]} rows={rows} />);
    await userEvent.click(page.getByRole("button", { name: "Size" }));
    expect(column(table, 0)).toEqual(["d", "b", "e", "a", "c"]);
    await userEvent.click(page.getByRole("button", { name: "Size" }));
    expect(column(table, 0)).toEqual(["c", "a", "e", "b", "d"]);
  });

  it("sorts a long list with empty values scattered through it, keeping equal and empty rows in their order", async () => {
    // Long enough that the browser merges sorted runs, comparing rows in either order.
    const rows = Array.from({ length: 120 }, (_, index) => ({ id: `r${index}`, value: index % 4 === 0 ? null : (index * 37) % 23 }));
    const { table } = await render(<Table caption="Values" columns={[{ key: "id", header: "Id" }, { key: "value", header: "Value", sortable: true, cell: (row) => String(row.value) }]} rows={rows} />);
    const expected = (sign: number) => [
      ...rows.filter((row) => row.value !== null).sort((a, b) => sign * (a.value! - b.value!) || Number(a.id.slice(1)) - Number(b.id.slice(1))),
      ...rows.filter((row) => row.value === null),
    ];
    await userEvent.click(page.getByRole("button", { name: "Value" }));
    expect(column(table, 0)).toEqual(expected(1).map((row) => row.id));
    await userEvent.click(page.getByRole("button", { name: "Value" }));
    expect(column(table, 0)).toEqual(expected(-1).map((row) => row.id));
  });

  it("keeps rows with equal values in their order, both ways", async () => {
    const rows = [
      { id: "a", cook: "Tess" },
      { id: "b", cook: "Ari" },
      { id: "c", cook: "Tess" },
      { id: "d", cook: "Ari" },
      { id: "e", cook: "Tess" },
    ];
    const { table } = await render(<Table caption="Cooks" columns={[{ key: "id", header: "Id" }, { key: "cook", header: "Cook", sortable: true }]} rows={rows} />);
    await userEvent.click(page.getByRole("button", { name: "Cook" }));
    expect(column(table, 0)).toEqual(["b", "d", "a", "c", "e"]);
    await userEvent.click(page.getByRole("button", { name: "Cook" }));
    expect(column(table, 0)).toEqual(["a", "c", "e", "b", "d"]);
  });

  it("sorts a cell column by its sortValue, which makes it sortable", async () => {
    const { table } = await render(
      <Table
        caption="Recipes"
        columns={[
          { key: "name", header: "Recipe" },
          { key: "size", header: "Size", cell: (row) => `${row.serves} people`, sortValue: (row) => row.serves },
          { key: "plain", header: "Plain", cell: (row) => row.id, sortValue: (row) => row.id, sortable: false },
        ]}
        rows={recipes}
      />,
    );
    expect(page.getByRole("columnheader", { name: "Plain" }).element().querySelector("button")).toBeNull();
    await userEvent.click(page.getByRole("button", { name: "Size" }));
    expect(column(table, 1)).toEqual(["2 people", "6 people", "8 people"]);
    expect(warn).not.toHaveBeenCalled();
  });

  it("tells screen readers how the rows are sorted, once per press, in the words sortedLabel gives", async () => {
    const announced = watchAnnouncements();
    try {
      await render(<Table caption="Recipes" columns={[...sortColumns]} rows={recipes} />);
      await userEvent.click(page.getByRole("button", { name: "Serves" }));
      await expect.poll(() => announced.count("Sorted by Serves, ascending")).toBe(1);
      expect(announced.matching("Sorted by Serves, ascending")[0]!.region.getAttribute("aria-live")).toBe("polite");
      await userEvent.click(page.getByRole("button", { name: "Serves" }));
      await expect.poll(() => announced.count("Sorted by Serves, descending")).toBe(1);
      await act(async () => roots.splice(0).forEach((root) => root.unmount()));
      await render(
        <Table caption="Rezepte" columns={[...sortColumns]} rows={recipes} sortedLabel={(header, direction) => `${header}: ${direction === "ascending" ? "aufsteigend" : "absteigend"}`} />,
      );
      await userEvent.click(page.getByRole("button", { name: "Recipe" }));
      await expect.poll(() => announced.count("Recipe: aufsteigend")).toBe(1);
      await userEvent.click(page.getByRole("button", { name: "Recipe" }));
      await expect.poll(() => announced.count("Recipe: absteigend")).toBe(1);
      expect(announced.count("Sorted by Serves, ascending")).toBe(1);
    } finally {
      announced.stop();
    }
  });

  it("with sort, marks the header and keeps the rows in the order passed, and asks for the next sort", async () => {
    const onSortChange = vi.fn();
    const { table } = await render(
      <Table caption="Recipes" columns={[...sortColumns]} rows={recipes} sort={{ key: "serves", direction: "descending" }} onSortChange={onSortChange} />,
    );
    expect(sortMarks()).toEqual([null, null, "descending"]);
    expect(column(table, 2)).toEqual(["6", "2", "8"]);
    await userEvent.click(page.getByRole("button", { name: "Serves" }));
    expect(onSortChange).toHaveBeenLastCalledWith({ key: "serves", direction: "ascending" });
    expect(sortMarks()).toEqual([null, null, "descending"]);
    expect(column(table, 2)).toEqual(["6", "2", "8"]);
    await userEvent.click(page.getByRole("button", { name: "Recipe" }));
    expect(onSortChange).toHaveBeenLastCalledWith({ key: "name", direction: "ascending" });

    // An app that sorts its own rows from the sort it is given.
    function Sorted() {
      const [sort, setSort] = useState<TableSort | null>(null);
      const rows = sort ? [...recipes].sort((a, b) => (sort.direction === "ascending" ? a.serves - b.serves : b.serves - a.serves)) : recipes;
      return <Table caption="Mine" columns={[...sortColumns]} rows={rows} sort={sort} onSortChange={setSort} />;
    }
    const mine = await render(<Sorted />);
    expect(column(mine.table, 2)).toEqual(["6", "2", "8"]);
    await userEvent.click(page.getByRole("table", { name: "Mine" }).getByRole("button", { name: "Serves" }));
    expect(column(mine.table, 2)).toEqual(["2", "6", "8"]);
    expect(mine.table.querySelector('th[aria-sort="ascending"]')!.textContent).toBe("Serves");
    expect(warn).not.toHaveBeenCalled();
  });

  it("starts sorted by defaultSort, and renders it on the server", async () => {
    const node = <Table caption="Recipes" columns={[...sortColumns]} rows={recipes} defaultSort={{ key: "serves", direction: "descending" }} />;
    const html = renderToString(node);
    expect(html).toContain('aria-sort="descending"');
    expect(html.indexOf("Rye bread")).toBeLessThan(html.indexOf("Braised short ribs"));
    expect(html.indexOf("Braised short ribs")).toBeLessThan(html.indexOf("Herb salad"));
    // The server's order hydrates with no mismatch.
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const host = document.createElement("div");
    host.innerHTML = html;
    document.body.append(host);
    mounted.push(host);
    await act(async () => {
      roots.push(hydrateRoot(host, node, { onRecoverableError: (cause) => console.error(cause) }));
    });
    expect(error).not.toHaveBeenCalled();
    expect(column(host, 2)).toEqual(["8", "6", "2"]);
    await userEvent.click(page.getByRole("button", { name: "Serves" }));
    expect(column(host, 2)).toEqual(["2", "6", "8"]);
  });

  it("sorts text in English on the server, so its order is the same in every locale", () => {
    const rows = [
      { id: "z", name: "Zucchini" },
      { id: "a", name: "Ärtsoppa" },
      { id: "b", name: "Apple" },
    ];
    const html = renderToString(<Table caption="Soups" columns={[{ key: "name", header: "Name", sortable: true }]} rows={rows} defaultSort={{ key: "name", direction: "ascending" }} />);
    expect(["Apple", "Ärtsoppa", "Zucchini"].map((name) => html.indexOf(name))).toEqual(
      ["Apple", "Ärtsoppa", "Zucchini"].map((name) => html.indexOf(name)).sort((a, b) => a - b),
    );
  });

  it("keeps each row's link, buttons and key with the row as it moves", async () => {
    const { table } = await render(
      <Table
        caption="Recipes"
        rowHref="href"
        columns={[...sortColumns, { key: "save", header: "Save", hideHeader: true, cell: (row) => <Button size="sm">{`Save ${row.name}`}</Button> }]}
        rows={recipes}
        striped
        dense
      />,
    );
    const ribs = page.getByRole("link", { name: "Braised short ribs" }).element();
    await userEvent.click(page.getByRole("button", { name: "Serves" }));
    await userEvent.click(page.getByRole("button", { name: "Serves" }));
    // The same link element moved with its row, so focus and state stay with the row.
    expect(page.getByRole("link", { name: "Braised short ribs" }).element()).toBe(ribs);
    const first = table.querySelector("tbody tr")!;
    expect(first.querySelector("a")).toBeNull();
    expect(first.querySelector("button")!.textContent).toBe("Save Rye bread");
    expect(table.querySelectorAll("tbody tr")[1]!.querySelector("a")!.getAttribute("href")).toBe("#ribs");
  });

  it("sorts inside the sideways scroll on a phone, with the header still at the top", async () => {
    await page.viewport(390, 844);
    const wide = recipes.map((recipe) => ({ ...recipe, note: "A long note that keeps the table wider than a phone screen" }));
    const { table, viewport } = await render(
      <Table caption="Recipes" stickyHeader className="max-h-40" columns={[...sortColumns, { key: "note", header: "Note" }]} rows={[...wide, ...wide.map((row) => ({ ...row, id: `${row.id}-2` }))]} />,
      390,
    );
    viewport.scrollTop = 60;
    viewport.scrollLeft = 80;
    await frame();
    const button = page.getByRole("button", { name: "Serves" });
    await userEvent.click(button);
    expect(column(table, 2)).toEqual(["2", "2", "6", "6", "8", "8"]);
    expect(Math.abs(button.element().closest("th")!.getBoundingClientRect().top - viewport.getBoundingClientRect().top)).toBeLessThanOrEqual(1);
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(390);
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

  it("builds a table in TableRoot, with its own checks", async () => {
    let element: HTMLTableElement | null = null;
    const { table } = await render(
      <TableRoot caption="Pantry" dense className="mt-4 bg-muted" ref={(node) => void (element = node)}>
        <TableBody>
          <TableRow>
            <TableCell rowHeader>Flour</TableCell>
          </TableRow>
        </TableBody>
      </TableRoot>,
    );
    await expect.element(page.getByRole("table", { name: "Pantry" })).toBeVisible();
    expect(element).toBe(table.querySelector("table"));
    expect(getComputedStyle(table).marginTop).toBe("16px");
    expect(warn).toHaveBeenCalledWith('[ouro-ui] TableRoot: "bg-muted" sets appearance, and className is for layout only. Fix: put the table inside a <Card> for a frame.');
    await render(<TableRoot {...({ children: null } as unknown as Parameters<typeof TableRoot>[0])} />);
    expect(warn).toHaveBeenCalledWith('[ouro-ui] TableRoot: caption is required; it names the table. Fix: <TableRoot caption="Pantry">, with hideCaption when a heading already shows it.');
  });

  it("warns when the row link would hold a control, or has no text to name it", async () => {
    await render(
      <Table caption="Pantry">
        <TableBody>
          <TableRow href="#flour">
            <TableCell rowHeader>
              <input type="checkbox" aria-label="Pick flour" />
            </TableCell>
            <TableCell>Flour</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );
    expect(warn).toHaveBeenCalledWith(
      '[ouro-ui] TableRow: the row link holds a control, and a link can\'t contain one. Fix: { key: "name", header: "Recipe", rowHeader: true }, or <TableCell rowHeader>Name</TableCell>.',
    );
    warn.mockClear();
    await render(
      <Table caption="Pantry">
        <TableBody>
          <TableRow href="#flour">
            <TableCell rowHeader />
            <TableCell>Flour</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );
    expect(warn).toHaveBeenCalledWith('[ouro-ui] TableRow: the row link has no text to name it. Fix: { key: "name", header: "Recipe", rowHeader: true }, or <TableCell rowHeader>Name</TableCell>.');
  });

  it("keeps one row link when two cells are row headers, and warns", async () => {
    const { table } = await render(
      <Table caption="Pantry">
        <TableBody>
          <TableRow href="#flour">
            <TableCell rowHeader>Flour</TableCell>
            <TableCell rowHeader>Baking</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );
    expect([...table.querySelectorAll("a")].map((link) => link.textContent)).toEqual(["Flour"]);
    expect(warn).toHaveBeenCalledWith(
      '[ouro-ui] TableRow: two cells are row headers, and only the first holds the row link. Fix: <TableCell rowHeader> on the name cell only.',
    );
  });

  it("warns that href works on body rows only", async () => {
    const { table } = await render(
      <Table caption="Pantry">
        <TableHeader>
          <TableRow href="#head">
            <TableHead>Item</TableHead>
          </TableRow>
        </TableHeader>
        <TableFooter>
          <TableRow href="#foot">
            <TableCell rowHeader>Total</TableCell>
          </TableRow>
        </TableFooter>
      </Table>,
    );
    expect(table.querySelector("a")).toBeNull();
    expect(warn).toHaveBeenCalledWith("[ouro-ui] TableRow: href works on body rows only. Fix: <TableBody><TableRow href=\"…\">…</TableRow></TableBody>.");
    expect(warn).toHaveBeenCalledTimes(2);
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

  it("sorts from a TableHead with onSort, which the app sorts and marks with sorted", async () => {
    const announced = watchAnnouncements();
    const pantry = [
      { name: "Rice", qty: 1 },
      { name: "Flour", qty: 2 },
      { name: "Oats", qty: 3 },
    ];
    function Pantry() {
      const [sort, setSort] = useState<{ key: "name" | "qty"; direction: "ascending" | "descending" }>({ key: "qty", direction: "descending" });
      const sign = sort.direction === "ascending" ? 1 : -1;
      const rows = [...pantry].sort((a, b) => sign * (sort.key === "qty" ? a.qty - b.qty : a.name.localeCompare(b.name)));
      return (
        <TableRoot caption="Pantry" sortedLabel={(header, direction) => `${header} ${direction}`}>
          <TableHeader>
            <TableRow>
              <TableHead sorted={sort.key === "name" ? sort.direction : undefined} onSort={(direction) => setSort({ key: "name", direction })}>
                Item
              </TableHead>
              <TableHead align="end" sorted={sort.key === "qty" ? sort.direction : undefined} onSort={(direction) => setSort({ key: "qty", direction })}>
                Qty
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.name}>
                <TableCell rowHeader>{row.name}</TableCell>
                <TableCell align="end">{row.qty}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </TableRoot>
      );
    }
    try {
      const { table } = await render(<Pantry />);
      expect(sortMarks()).toEqual([null, "descending"]);
      expect(column(table, 1)).toEqual(["3", "2", "1"]);
      await userEvent.click(page.getByRole("button", { name: "Qty" }));
      expect(sortMarks()).toEqual([null, "ascending"]);
      expect(column(table, 1)).toEqual(["1", "2", "3"]);
      await expect.poll(() => announced.count("Qty ascending")).toBe(1);
      await userEvent.click(page.getByRole("button", { name: "Item" }));
      expect(sortMarks()).toEqual(["ascending", null]);
      expect(column(table, 0)).toEqual(["Flour", "Oats", "Rice"]);
      await expect.poll(() => announced.count("Item ascending")).toBe(1);
    } finally {
      announced.stop();
    }
  });

  it("marks a sorted header without onSort with aria-sort and an arrow, and no button", async () => {
    const { table } = await render(
      <Table caption="Pantry">
        <TableHeader>
          <TableRow>
            <TableHead sorted="descending">Item</TableHead>
            <TableHead>Qty</TableHead>
            <TableHead hideHeader onSort={() => {}}>
              Actions
            </TableHead>
          </TableRow>
        </TableHeader>
      </Table>,
    );
    const item = page.getByRole("columnheader", { name: "Item" }).element();
    expect(item.getAttribute("aria-sort")).toBe("descending");
    expect(item.querySelector("button")).toBeNull();
    expect(item.querySelector("[data-sort-icon]")!.getAttribute("data-sort-icon")).toBe("descending");
    expect(item.querySelector("svg")!.parentElement!.localName).toBe("span");
    // A header that neither sorts nor is sorted holds its name alone.
    expect(page.getByRole("columnheader", { name: "Qty" }).element().childElementCount).toBe(0);
    // A hidden header that sorts keeps its name for screen readers and shows only its arrow.
    const actions = page.getByRole("button", { name: "Actions" }).element();
    expect(actions.querySelector(".sr-only")!.getBoundingClientRect().width).toBeLessThanOrEqual(1);
    expect(actions.querySelector("[data-sort-icon]")!.getAttribute("data-sort-icon")).toBe("none");
    expect(table.querySelectorAll("[data-ouro-part='sort']")).toHaveLength(1);
  });

  it.each([
    ["asc", "ascending"],
    ["desc", "descending"],
  ])('warns once for sorted="%s", and reads it as ascending', async (value, fix) => {
    const { table } = await render(
      <Table caption="Pantry">
        <TableHeader>
          <TableRow>
            <TableHead {...({ sorted: value } as object)}>Item</TableHead>
          </TableRow>
        </TableHeader>
      </Table>,
    );
    expect(table.querySelector("th")!.getAttribute("aria-sort")).toBe("ascending");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(`[ouro-ui] TableHead: "${value}" is not a sort direction; use "ascending" or "descending". Fix: <TableHead sorted="${fix}">.`);
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
  const columns = [{ key: "name", header: "Recipe", sortable: true }] as const;
  it.each([
    ["data", { data: recipes }, "data is not a prop", "<Table rows={recipes} columns={…}>"],
    ["onRowClick", { onRowClick: () => {} }, "onRowClick is not a prop; a row opens a link", "<Table rowHref={(row) => `/recipes/${row.id}`}>"],
    ["title", { title: "Recipes" }, "title is not a prop", '<Table caption="Recipes">'],
    ["sortable", { sortable: true }, "sortable is not a Table prop; it goes on a column", '{ key: "name", header: "Recipe", sortable: true }'],
    ["sort without onSortChange", { sort: null }, "sort needs onSortChange, or its headers can't change it", "<Table sort={sort} onSortChange={setSort}>, or defaultSort={…} for Table to sort the rows"],
    ["a sort direction", { defaultSort: { key: "name", direction: "desc" } }, '"desc" is not a sort direction; use "ascending" or "descending"', '{ key: "name", direction: "descending" }'],
    ["an ascending abbreviation", { defaultSort: { key: "name", direction: "asc" } }, '"asc" is not a sort direction; use "ascending" or "descending"', '{ key: "name", direction: "ascending" }'],
    ["a sort of a column that does not sort", { columns: [{ key: "name", header: "Recipe" }], defaultSort: { key: "name", direction: "ascending" } }, 'the sort names "name", which is not a sortable column', '{ key: "name", header: "…", sortable: true }'],
    ["a sort of no column", { sort: { key: "cook", direction: "ascending" }, onSortChange: () => {} }, 'the sort names "cook", which is not a sortable column', '{ key: "cook", header: "…", sortable: true }'],
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
    ["enableSorting", { enableSorting: true }, "a column's enableSorting is not a prop", '{ key: "time", header: "…", sortable: true }'],
    ["align left", { align: "left" }, 'align="left" is not an alignment; use "start", "center", "end"', '{ align: "start" }'],
    ["align", { align: "right" }, 'align="right" is not an alignment; use "start", "center", "end"', '{ align: "end" }'],
    ["duplicate keys", { key: "name" }, 'two columns have key "name"; keys name columns, so each is unique', '{ key: "name", … }, { key: "time", … }'],
    ["no header", { header: "" }, "every column needs a header; it names the column for screen readers", '{ key: "…", header: "Actions", hideHeader: true }'],
  ])("warns for a column's %s with the fix", async (_name, extra, problem, fix) => {
    const cols = [{ key: "name", header: "Recipe" }, { key: "time", header: "Time", ...extra }];
    // Two columns with one key are two children with one key, which React reports itself.
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await render(<Table {...({ caption: "Recipes", columns: cols, rows: recipes } as unknown as Parameters<typeof Table>[0])} />);
    expect(warn).toHaveBeenCalledWith(`[ouro-ui] Table: ${problem}. Fix: ${fix}.`);
    expect(error.mock.calls.length > 0).toBe("key" in extra);
    error.mockRestore();
  });

  it("reads an unknown sort direction as ascending", async () => {
    const { table } = await render(
      <Table {...({ caption: "Recipes", columns: sortColumns, rows: recipes, defaultSort: { key: "serves", direction: "desc" } } as unknown as Parameters<typeof Table>[0])} />,
    );
    expect(column(table, 2)).toEqual(["2", "6", "8"]);
    expect(sortMarks()).toEqual([null, null, "ascending"]);
  });

  it.each([
    ["a cell column whose key is no field", { key: "size", header: "Size", sortable: true, cell: () => "…" }],
    ["a field that holds an element", { key: "badge", header: "Badge", sortable: true }],
  ])("warns for %s that sorts with no sortValue, with the fix", async (_name, extra) => {
    // One element among text is enough to warn.
    const rows = recipes.map((recipe, index) => ({ ...recipe, badge: index === 1 ? <b>{recipe.name}</b> : recipe.name, added: new Date(0), none: null }));
    await render(
      <Table
        {...({
          caption: "Recipes",
          columns: [{ key: "name", header: "Recipe" }, extra, { key: "added", header: "Added", sortable: true, cell: () => "…" }, { key: "none", header: "None", sortable: true }],
          rows,
        } as unknown as Parameters<typeof Table>[0])}
      />,
    );
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      `[ouro-ui] Table: column "${extra.key}" has no text, number or date to sort by. Fix: { key: "${extra.key}", header: "…", sortable: true, sortValue: (row) => row.name }.`,
    );
  });

  it("does not check a sortable column's values without rows", async () => {
    await render(<Table caption="Recipes" columns={[{ key: "size", header: "Size", sortable: true, cell: () => "…" }]} rows={[] as Recipe[]} />);
    expect(warn).not.toHaveBeenCalled();
  });

  it("sorts by a field some rows leave out, without a message, and puts those rows last", async () => {
    const { table } = await render(<Table caption="Recipes" columns={[{ key: "name", header: "Recipe" }, { key: "href", header: "Link", sortable: true }]} rows={recipes} />);
    await userEvent.click(page.getByRole("button", { name: "Link" }));
    expect(column(table, 0)).toEqual(["Braised short ribs", "Herb salad", "Rye bread"]);
    await userEvent.click(page.getByRole("button", { name: "Link" }));
    expect(column(table, 0)).toEqual(["Herb salad", "Braised short ribs", "Rye bread"]);
    expect(warn).not.toHaveBeenCalled();
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
