import { type ReactNode } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { Line, LineChart, XAxis } from "recharts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { commands, page, userEvent } from "vitest/browser";
import { Chart, ChartContainer, ChartLegend, ChartTooltip, type ChartConfig } from "@/registry/ouro/components/ouro/chart/chart";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

const roots: Root[] = [];
let mounted: Element[] = [];

async function render(node: ReactNode, width = 600) {
  const host = document.createElement("div");
  host.style.width = `${width}px`;
  document.body.append(host);
  mounted.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
  return {
    host,
    rerender: (next: ReactNode) => act(async () => root.render(next)),
    get chart() {
      return host.querySelector<HTMLElement>('[data-ouro="chart"]')!;
    },
  };
}

const rows = [
  { month: "January", cooked: 12, saved: 4 },
  { month: "February", cooked: 18, saved: 9 },
  { month: "March", cooked: 1250, saved: 7 },
];

const config = {
  month: { label: "Month" },
  cooked: { label: "Recipes cooked", tone: "chart-1" },
  saved: { label: "Recipes saved", tone: "chart-2" },
} satisfies ChartConfig<(typeof rows)[number]>;

/** The color a CSS expression resolves to here, as getComputedStyle writes colors. */
function resolved(expression: string, within: Element = document.body): string {
  const probe = document.createElement("span");
  probe.style.color = expression;
  within.append(probe);
  const color = getComputedStyle(probe).color;
  probe.remove();
  return color;
}

const bars = (chart: HTMLElement, series: string) =>
  [...chart.querySelectorAll<SVGPathElement>(`.ouro-chart-series-${series} .recharts-bar-rectangle path`)];

/** Waits until recharts has drawn the plot (it measures its container first) and its marks stop moving. */
async function drawn(chart: HTMLElement) {
  const shapes = () => [...chart.querySelectorAll(".recharts-rectangle, .recharts-curve, [data-ouro-chart-dot]")].map((shape) => `${shape.getAttribute("d")}${shape.getAttribute("transform")}`).join("|");
  let last = "";
  await expect
    .poll(async () => {
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const now = shapes();
      const settled = now !== "" && now === last;
      last = now;
      return settled;
    })
    .toBe(true);
}

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(async () => {
  vi.restoreAllMocks();
  document.documentElement.classList.remove("dark");
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  for (const node of mounted) node.remove();
  mounted = [];
});

describe("Chart", () => {
  it("is a figure named by its title, with a focusable plot named the same", async () => {
    const { chart } = await render(<Chart title="Cooking this quarter" data={rows} categoryKey="month" config={config} />);
    await drawn(chart);
    await expect.element(page.getByRole("figure", { name: "Cooking this quarter" })).toBeVisible();
    const plot = chart.querySelector<SVGElement>(".recharts-surface")!;
    expect(plot.getAttribute("aria-label")).toBe("Cooking this quarter");
    expect(plot.getAttribute("tabindex")).toBe("0");
  });

  it("hides the title visually with hideTitle, keeping the name", async () => {
    const { chart } = await render(<Chart title="Cooking" hideTitle data={rows} categoryKey="month" config={config} />);
    await expect.element(page.getByRole("figure", { name: "Cooking" })).toBeInTheDocument();
    expect(chart.querySelector("figcaption")!.getBoundingClientRect().width).toBeLessThanOrEqual(1);
  });

  it("describes itself with a summary that points to the data table, which the app can translate", async () => {
    const { chart, rerender } = await render(<Chart title="Cooking" data={rows} categoryKey="month" config={config} />);
    const summary = () => chart.querySelector<HTMLElement>("[data-ouro-chart-summary]")!;
    await drawn(chart);
    // The plot points to the summary, so focusing it says where the values are.
    expect(chart.querySelector(".recharts-surface")!.getAttribute("aria-describedby")).toBe(summary().id);
    expect(summary().textContent).toBe("Bar chart of Recipes cooked and Recipes saved by Month, 3 points. The table that follows lists every value.");
    await rerender(
      <Chart
        title="Cooking"
        data={rows}
        categoryKey="month"
        config={config}
        summary={({ series, count }) => `${series.join(" et ")}, ${count} points.`}
      />,
    );
    expect(summary().textContent).toBe("Recipes cooked et Recipes saved, 3 points.");
  });

  it("lists every value in a table for screen readers, visible with showTable", async () => {
    const { chart, rerender } = await render(<Chart title="Cooking" data={rows} categoryKey="month" config={config} />);
    const table = page.getByRole("table", { name: "Cooking" });
    await expect.element(table).toBeInTheDocument();
    const element = table.element() as HTMLTableElement;
    const hidden = chart.querySelector<HTMLElement>("[data-ouro-chart-table]")!;
    expect(hidden.getBoundingClientRect().width).toBeLessThanOrEqual(1);
    expect(getComputedStyle(hidden).overflow).toBe("hidden");
    const cells = [...element.rows].map((row) => [...row.cells].map((cell) => cell.textContent));
    expect(cells).toEqual([
      ["Month", "Recipes cooked", "Recipes saved"],
      ["January", "12", "4"],
      ["February", "18", "9"],
      ["March", "1,250", "7"],
    ]);
    expect(element.rows[1]!.cells[0]!.tagName).toBe("TH");
    expect(element.rows[1]!.cells[0]!.getAttribute("scope")).toBe("row");

    await rerender(<Chart title="Cooking" data={rows} categoryKey="month" config={config} showTable />);
    expect(chart.querySelector("[data-ouro-chart-table]")!.getBoundingClientRect().width).toBeGreaterThan(100);
  });

  it("formats values with formatValue in the table, the axis and the tooltip", async () => {
    const formatValue = (value: number) => `${value} €`;
    const { chart } = await render(<Chart title="Spend" data={rows} categoryKey="month" config={config} formatValue={formatValue} />);
    await drawn(chart);
    expect(chart.querySelector("tbody tr td")!.textContent).toBe("12 €");
    await expect.poll(() => [...chart.querySelectorAll(".recharts-yAxis-tick-labels text")].some((tick) => tick.textContent?.endsWith(" €"))).toBe(true);
  });

  it("colors each series from the theme's chart tokens, in light and dark", async () => {
    const { chart } = await render(<Chart title="Cooking" data={rows} categoryKey="month" config={config} />);
    await drawn(chart);
    const fillOf = (series: string) => getComputedStyle(bars(chart, series)[0]!).fill;
    expect(fillOf("cooked")).toBe(resolved("var(--chart-1)"));
    expect(fillOf("saved")).toBe(resolved("var(--chart-2)"));
    const light = fillOf("cooked");
    document.documentElement.classList.add("dark");
    expect(fillOf("cooked")).toBe(resolved("var(--chart-1)"));
    expect(fillOf("cooked")).not.toBe(light);
  });

  it("maps tones to theme tokens and gives series without one the chart tokens in order", async () => {
    const { chart } = await render(
      <Chart
        title="Kitchen"
        data={[{ day: "Mon", burnt: 1, fine: 5, other: 2 }]}
        categoryKey="day"
        config={{ burnt: { label: "Burnt", tone: "destructive" }, fine: { label: "Fine" }, other: { label: "Other" } }}
      />,
    );
    await drawn(chart);
    expect(getComputedStyle(bars(chart, "burnt")[0]!).fill).toBe(resolved("var(--destructive)"));
    expect(getComputedStyle(bars(chart, "fine")[0]!).fill).toBe(resolved("var(--chart-2)"));
    expect(getComputedStyle(bars(chart, "other")[0]!).fill).toBe(resolved("var(--chart-3)"));
  });

  it("labels each series in a legend with a marker shape, so color is not the only cue", async () => {
    const { chart } = await render(<Chart title="Cooking" data={rows} categoryKey="month" config={config} />);
    await drawn(chart);
    await expect.poll(() => chart.querySelector("[data-ouro-chart-legend]")).not.toBeNull();
    const legend = chart.querySelector<HTMLElement>("[data-ouro-chart-legend]")!;
    const items = [...legend.querySelectorAll("li")];
    expect(items.map((item) => item.textContent)).toEqual(["Recipes cooked", "Recipes saved"]);
    const shapes = items.map((item) => item.querySelector("[data-ouro-chart-marker]")!.getAttribute("data-ouro-chart-marker"));
    expect(new Set(shapes).size).toBe(2);
  });

  it("gives five series five marker shapes", async () => {
    const { chart } = await render(
      <Chart
        title="Week"
        data={[{ day: "Mon", a: 1, b: 2, c: 3, d: 4, e: 5 }]}
        categoryKey="day"
        config={{ a: { label: "A" }, b: { label: "B" }, c: { label: "C" }, d: { label: "D" }, e: { label: "E" } }}
      />,
    );
    await drawn(chart);
    await expect.poll(() => chart.querySelectorAll("[data-ouro-chart-legend] [data-ouro-chart-marker]").length).toBe(5);
    const shapes = [...chart.querySelectorAll("[data-ouro-chart-legend] [data-ouro-chart-marker]")].map((marker) => marker.getAttribute("data-ouro-chart-marker"));
    expect(shapes).toEqual(["circle", "square", "triangle", "diamond", "cross"]);
    // Each shape draws something: a filled mark with its own outline.
    for (const marker of chart.querySelectorAll<SVGSVGElement>("[data-ouro-chart-legend] [data-ouro-chart-marker]")) {
      expect((marker.firstElementChild as SVGGraphicsElement).getBBox().width).toBeGreaterThan(6);
    }
  });

  it("shows a description under the title", async () => {
    const { chart } = await render(<Chart title="Cooking" description="January to March" data={rows} categoryKey="month" config={config} />);
    const caption = chart.querySelector("figcaption")!;
    const description = page.getByText("January to March").element();
    expect(description.getBoundingClientRect().top).toBeGreaterThanOrEqual(caption.getBoundingClientRect().bottom);
    await expect.element(page.getByRole("figure", { name: "Cooking" })).toBeVisible();
  });

  it("leaves out the legend for a single series, which the title already names", async () => {
    const { chart } = await render(<Chart title="Cooked" data={rows} categoryKey="month" config={{ cooked: { label: "Cooked" } }} />);
    await drawn(chart);
    expect(chart.querySelector("[data-ouro-chart-legend]")).toBeNull();
  });

  it("draws lines with a different point shape per series", async () => {
    const { chart } = await render(<Chart type="line" title="Cooking" data={rows} categoryKey="month" config={config} />);
    await drawn(chart);
    // The points themselves; a pointer left over the plot by an earlier test adds active dots elsewhere.
    await expect.poll(() => chart.querySelectorAll(".recharts-line-dots [data-ouro-chart-dot]").length).toBe(6);
    const shapeOf = (series: string) => chart.querySelector(`[data-ouro-chart-dot][data-ouro-chart-series="${series}"]`)!.getAttribute("data-ouro-chart-dot");
    expect(shapeOf("cooked")).not.toBe(shapeOf("saved"));
  });

  it("draws areas", async () => {
    const { chart } = await render(<Chart type="area" title="Cooking" data={rows} categoryKey="month" config={config} />);
    await drawn(chart);
    expect(chart.querySelectorAll(".recharts-area-area")).toHaveLength(2);
  });

  it("shows the tooltip from the keyboard: Tab to the plot, then the arrow keys", async () => {
    const { chart } = await render(<Chart title="Cooking" data={rows} categoryKey="month" config={config} />);
    await drawn(chart);
    // A pointer resting over the plot (left there by an earlier test) holds the tooltip at its
    // point, so park it in the page's corner, outside the chart.
    const parking = document.createElement("div");
    Object.assign(parking.style, { position: "fixed", top: "0", left: "0", width: "4px", height: "4px" });
    document.body.append(parking);
    mounted.push(parking);
    await userEvent.hover(parking);
    await userEvent.keyboard("{Tab}");
    expect(document.activeElement).toBe(chart.querySelector(".recharts-surface"));
    // Focus shows the first point; the arrow keys move along.
    const tooltip = () => chart.querySelector<HTMLElement>("[data-ouro-chart-tooltip]");
    await expect.poll(() => tooltip()?.textContent).toBe("JanuaryRecipes cooked12Recipes saved4");
    await userEvent.keyboard("{ArrowRight}");
    await expect.poll(() => tooltip()?.textContent).toBe("FebruaryRecipes cooked18Recipes saved9");
    const markers = [...tooltip()!.querySelectorAll("[data-ouro-chart-marker]")].map((marker) => marker.getAttribute("data-ouro-chart-marker"));
    expect(new Set(markers).size).toBe(2);
  });

  it("shows the tooltip when the pointer is over a bar", async () => {
    const { chart } = await render(<Chart title="Cooking" data={rows} categoryKey="month" config={config} />);
    await drawn(chart);
    await userEvent.hover(bars(chart, "cooked")[2]!);
    await expect.poll(() => chart.querySelector("[data-ouro-chart-tooltip]")?.textContent).toBe("MarchRecipes cooked1,250Recipes saved7");
  });

  it.each([
    ["reduce", true],
    ["no-preference", false],
  ] as const)("draws bars at full height from the first frame only under reduced motion (%s)", async (reducedMotion, still) => {
    await commands.emulateMedia({ reducedMotion });
    try {
      const { chart } = await render(<Chart title="Cooking" data={rows} categoryKey="month" config={config} />);
      await expect.poll(() => bars(chart, "cooked").length).toBe(3);
      const first = bars(chart, "cooked")[2]!.getBoundingClientRect().height;
      await drawn(chart);
      const final = bars(chart, "cooked")[2]!.getBoundingClientRect().height;
      expect(final).toBeGreaterThan(50);
      expect(first === final).toBe(still);
    } finally {
      await commands.emulateMedia({ reducedMotion: "no-preference" });
    }
  });

  it("marks the plot while its marks animate, so a screenshot can wait for them", async () => {
    const { chart } = await render(<Chart type="line" title="Cooking" data={rows} categoryKey="month" config={config} />);
    const plot = chart.querySelector("[data-ouro-chart-plot]")!;
    await expect.poll(() => plot.hasAttribute("data-ouro-chart-animating")).toBe(true);
    await expect.poll(() => plot.hasAttribute("data-ouro-chart-animating")).toBe(false);
    const curve = chart.querySelector<SVGPathElement>(".recharts-line-curve")!;
    // Drawn in full: no dash gap left from the line's draw-in.
    expect(curve.getAttribute("stroke-dasharray") ?? "").not.toMatch(/^0px/);
  });

  it("takes a recharts chart as children, giving it the data, the name and the theme", async () => {
    const { chart } = await render(
      <Chart title="Cooking trend" data={rows} categoryKey="month" config={config}>
        <LineChart>
          <XAxis dataKey="month" />
          <Line dataKey="cooked" stroke="var(--color-cooked)" />
          <ChartTooltip />
          <ChartLegend />
        </LineChart>
      </Chart>,
    );
    await drawn(chart);
    const plot = chart.querySelector(".recharts-surface")!;
    expect(plot.getAttribute("aria-label")).toBe("Cooking trend");
    expect(getComputedStyle(chart.querySelector<SVGPathElement>(".recharts-line-curve")!).stroke).toBe(resolved("var(--chart-1)"));
    await expect.poll(() => chart.querySelector("[data-ouro-chart-legend]")?.textContent).toBe("Recipes cooked");
    await userEvent.hover(plot);
    await expect.poll(() => chart.querySelector("[data-ouro-chart-tooltip]")?.textContent).toMatch(/^(January|February|March)Recipes cooked/);
  });

  it("leaves series that are not in config out of the tooltip and the legend", async () => {
    const { chart } = await render(
      <Chart title="Cooking" data={rows} categoryKey="month" config={{ month: { label: "Month" }, cooked: { label: "Recipes cooked" } }}>
        <LineChart>
          <XAxis dataKey="month" />
          <Line dataKey="cooked" stroke="var(--color-cooked)" />
          <Line dataKey="saved" stroke="currentColor" />
          <ChartTooltip />
          <ChartLegend />
        </LineChart>
      </Chart>,
    );
    await drawn(chart);
    await expect.poll(() => chart.querySelector("[data-ouro-chart-legend]")?.textContent).toBe("Recipes cooked");
    await userEvent.keyboard("{Tab}");
    // One row: the series in config. The other line is drawn but not described.
    await expect.poll(() => chart.querySelector("[data-ouro-chart-tooltip]")?.textContent).toMatch(/^(January|February|March)Recipes cooked[\d,]+$/);
  });

  it("is also exported as ChartContainer, shadcn's name", async () => {
    const { chart } = await render(<ChartContainer title="Cooking" data={rows} categoryKey="month" config={config} />);
    expect(chart.getAttribute("data-ouro")).toBe("chart");
  });

  it("renders its title, summary and table in server HTML and hydrates without a warning", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const node = <Chart title="Cooking" data={rows} categoryKey="month" config={config} />;
    const html = renderToString(node);
    expect(html).toContain("<figcaption");
    expect(html).toContain("Cooking");
    expect(html).toContain("<table");
    expect(html).toContain("1,250");
    const host = document.createElement("div");
    host.style.width = "600px";
    host.innerHTML = html;
    document.body.append(host);
    mounted.push(host);
    const recoverable = vi.fn();
    let root!: Root;
    await act(async () => {
      root = hydrateRoot(host, node, { onRecoverableError: recoverable });
    });
    roots.push(root);
    await drawn(host.querySelector<HTMLElement>('[data-ouro="chart"]')!);
    expect(recoverable).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it("forwards a ref and lets app layout classes win", async () => {
    let element: HTMLElement | null = null;
    const { chart } = await render(<Chart title="Cooking" data={rows} categoryKey="month" config={config} className="h-64" ref={(node) => void (element = node)} />);
    expect(element).toBe(chart);
    expect(chart.getBoundingClientRect().height).toBe(256);
  });
});

describe("Chart parts", () => {
  it.each([
    ["ChartTooltip", <ChartTooltip key="t" />, "<Chart title=\"Cooking\" data={rows} categoryKey=\"month\" config={config}><BarChart><ChartTooltip /></BarChart></Chart>"],
    ["ChartLegend", <ChartLegend key="l" />, "<Chart title=\"Cooking\" data={rows} categoryKey=\"month\" config={config}><BarChart><ChartLegend /></BarChart></Chart>"],
  ])("%s throws outside a Chart with the JSX it belongs in", async (part, node, shape) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const host = document.createElement("div");
    document.body.append(host);
    mounted.push(host);
    const root = createRoot(host);
    roots.push(root);
    let caught: unknown;
    await act(async () => {
      root.render(node);
    }).catch((error: unknown) => (caught = error));
    const message = caught instanceof Error ? caught.message : String(caught);
    expect(message).toBe(`[ouro-ui] ${part}: must be rendered inside <Chart>. Fix: ${shape}.`);
  });
});

describe("Chart development messages", () => {
  it.each([
    ["an unknown tone", { config: { cooked: { label: "Cooked", tone: "red" } } }, 'tone "red" for cooked is not a tone; use "chart-1" to "chart-5", "primary", "destructive", "success" or "warning"', '{ cooked: { label: "Cooked", tone: "chart-1" } }'],
    ["shadcn's color", { config: { cooked: { label: "Cooked", color: "#f00" } } }, "config.cooked.color is not a prop; series colors come from the theme", '{ cooked: { label: "Cooked", tone: "chart-1" } }'],
    ["shadcn's theme", { config: { cooked: { label: "Cooked", theme: { light: "#f00", dark: "#0f0" } } } }, "config.cooked.theme is not a prop; series colors come from the theme", '{ cooked: { label: "Cooked", tone: "chart-1" } }'],
    ["a series missing from the data", { config: { baked: { label: "Baked" } } }, 'config.baked has no values in data', "<Chart config={{ cooked: { label: \"Cooked\" } }}> with keys that are in each row"],
    ["a category missing from the data", { categoryKey: "week" }, 'categoryKey="week" is not a key of the rows', '<Chart categoryKey="month">'],
    ["an unknown type", { type: "pie" }, 'type="pie" is not a chart type; use "bar", "line" or "area"', '<Chart type="bar">'],
    ["a key that is not a CSS name", { data: [{ month: "Jan", "cooked count": 1 }], config: { "cooked count": { label: "Cooked" } } }, 'config key "cooked count" is not a CSS name, so var(--color-cooked count) cannot work', '{ cooked_count: { label: "Cooked" } }'],
    ["no series", { config: { month: { label: "Month" } } }, "config has no series to draw", '<Chart config={{ cooked: { label: "Cooked" } }}>'],
  ])("warns for %s with the fix", async (_name, extra, problem, fix) => {
    const props = { title: "Cooking", data: rows, categoryKey: "month", config, ...extra } as unknown as Parameters<typeof Chart>[0];
    await render(<Chart {...props} />);
    expect(warn).toHaveBeenCalledWith(`[ouro-ui] Chart: ${problem}. Fix: ${fix}.`);
  });

  it.each([
    ["ChartTooltip", "content is not a prop; ChartTooltip draws its content from config", "<ChartTooltip />"],
    ["ChartLegend", "content is not a prop; ChartLegend draws its content from config", "<ChartLegend />"],
  ])("warns when %s gets shadcn's content prop", async (part, problem, fix) => {
    const Part = (part === "ChartTooltip" ? ChartTooltip : ChartLegend) as (props: { content: unknown }) => ReactNode;
    await render(
      <Chart title="Cooking" data={rows} categoryKey="month" config={config}>
        <LineChart>
          <Line dataKey="cooked" />
          <Part content={<div />} />
        </LineChart>
      </Chart>,
    );
    expect(warn).toHaveBeenCalledWith(`[ouro-ui] ${part}: ${problem}. Fix: ${fix}.`);
  });

  it("draws an unknown tone and an unknown type with the defaults", async () => {
    const props = { title: "Cooking", data: rows, categoryKey: "month", type: "pie", config: { cooked: { label: "Cooked", tone: "red" } } } as unknown as Parameters<typeof Chart>[0];
    const { chart } = await render(<Chart {...props} />);
    await drawn(chart);
    expect(getComputedStyle(bars(chart, "cooked")[0]!).fill).toBe(resolved("var(--chart-1)"));
  });

  it("warns when title is missing", async () => {
    const props = { data: rows, categoryKey: "month", config } as unknown as Parameters<typeof Chart>[0];
    await render(<Chart {...props} />);
    expect(warn).toHaveBeenCalledWith('[ouro-ui] Chart: title is missing, so the chart has no name. Fix: <Chart title="Recipes cooked per month">.');
  });

  it("checks the className", async () => {
    await render(<Chart title="Cooking" data={rows} categoryKey="month" config={config} className="bg-muted" />);
    expect(warn).toHaveBeenCalledWith('[ouro-ui] Chart: "bg-muted" sets appearance, and className is for layout only. Fix: <div className="bg-muted"><Chart /></div>.');
  });
});
