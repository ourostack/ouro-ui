import { type ReactNode } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { renderToString } from "react-dom/server";
import { Line, LineChart, Tooltip, XAxis } from "recharts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { commands, page, userEvent } from "vitest/browser";
import { Chart, ChartContainer, ChartLegend, ChartTooltip, type ChartConfig } from "@/registry/ouro/components/ouro/chart/chart";
import { barSlots, curvePath, niceTicks } from "@/registry/ouro/components/ouro/chart/chart-styles";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { expectMotion, expectNoMotion, parseDuration } from "@/registry/ouro/lib/ouro/testing/motion";
import { pressTab } from "@/registry/ouro/lib/ouro/testing/tab";

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

const bars = (chart: HTMLElement, series: string) => [...chart.querySelectorAll<SVGRectElement>(`.ouro-chart-series-${series} [data-ouro-chart-bar]`)];

/** The plot's SVG: Chart's own for a chart with `type`, Recharts' for one passed as children. */
const surface = (chart: HTMLElement) => chart.querySelector<SVGSVGElement>("[data-ouro-chart-surface], .recharts-surface");

/** Waits until the plot is drawn (a Recharts chart passed as children measures its container first) and its marks stop moving. */
async function drawn(chart: HTMLElement) {
  const shapes = () =>
    [...chart.querySelectorAll("[data-ouro-chart-bar], [data-ouro-chart-line], [data-ouro-chart-area], .recharts-rectangle, .recharts-curve, [data-ouro-chart-dot]")]
      .map((shape) => ["d", "transform", "y", "height"].map((name) => shape.getAttribute(name)).join())
      .join("|");
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
  it("keeps its tooltip 8rem wide at least at a compact --spacing", async () => {
    const { chart } = await render(<Chart title="Spend" data={rows} categoryKey="month" config={config} />);
    await drawn(chart);
    await userEvent.hover(bars(chart, "cooked")[0]!);
    await expect.poll(() => chart.querySelector("[data-ouro-chart-tooltip]")).not.toBeNull();
    const minWidth = () => getComputedStyle(chart.querySelector<HTMLElement>("[data-ouro-chart-tooltip]")!).minWidth;
    expect(minWidth()).toBe("128px");
    document.documentElement.style.setProperty("--spacing", "0.2rem");
    try {
      expect(minWidth()).toBe("128px");
    } finally {
      document.documentElement.style.removeProperty("--spacing");
    }
  });

  it("keeps its legend markers 12px at a compact --spacing", async () => {
    const { host } = await render(<Chart title="Cooking" data={rows} categoryKey="month" config={config} />);
    const marker = () => getComputedStyle(host.querySelector<SVGElement>("[data-ouro-chart-marker]")!);
    expect([marker().width, marker().height]).toEqual(["12px", "12px"]);
    host.style.setProperty("--spacing", "0.2rem");
    expect([marker().width, marker().height]).toEqual(["12px", "12px"]);
  });
  it("draws its plot with the page, in the frame the figure first shows, and nothing under it moves", async () => {
    // Frames counted from before the mount, and the frame each of the figure and its plot was put in the page.
    let frames = 0;
    let counting = true;
    const tick = () => {
      frames++;
      if (counting) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    const seen: { figure?: number; plot?: number; height?: number; whole?: number; emptyLegend?: boolean } = {};
    const observer = new MutationObserver(() => {
      const figure = document.querySelector('[data-ouro="chart"]');
      if (figure && seen.figure === undefined) {
        seen.figure = frames;
        seen.height = figure.querySelector("[data-ouro-chart-plot]")!.getBoundingClientRect().height;
        seen.whole = figure.getBoundingClientRect().height;
      }
      if (document.querySelector('[data-ouro="chart"] [data-ouro-chart-bar]') && seen.plot === undefined) seen.plot = frames;
      if (figure && figure.querySelector("[data-ouro-chart-legend-slot]")!.textContent === "") seen.emptyLegend = true;
    });
    observer.observe(document.body, { childList: true, subtree: true });
    try {
      const { chart } = await render(<Chart title="Cooking" data={rows} categoryKey="month" config={config} />);
      await drawn(chart);
      expect(seen.plot! - seen.figure!, "frames between the figure and its bars").toBe(0);
      expect(seen.height).toBeGreaterThan(100);
      expect(chart.querySelector("[data-ouro-chart-plot]")!.getBoundingClientRect().height).toBe(seen.height);
      expect(chart.getBoundingClientRect().height).toBe(seen.whole);
      expect(seen.emptyLegend, "an empty legend slot").toBeUndefined();
    } finally {
      counting = false;
      observer.disconnect();
    }
  });

  it("draws a recharts chart passed as children after the first paint, in the room the plot box keeps", async () => {
    let frames = 0;
    let counting = true;
    const tick = () => {
      frames++;
      if (counting) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    const seen: { figure?: number; plot?: number; height?: number; emptyLegend?: boolean } = {};
    const observer = new MutationObserver(() => {
      const figure = document.querySelector('[data-ouro="chart"]');
      if (figure && seen.figure === undefined) [seen.figure, seen.height] = [frames, figure.getBoundingClientRect().height];
      if (document.querySelector('[data-ouro="chart"] .recharts-surface') && seen.plot === undefined) seen.plot = frames;
      // The legend swaps in one commit: its slot is never empty once the figure is in the page.
      if (figure && figure.querySelector("[data-ouro-chart-legend-slot]")!.textContent === "") seen.emptyLegend = true;
    });
    observer.observe(document.body, { childList: true, subtree: true });
    try {
      const { chart } = await render(
        <Chart title="Cooking" data={rows} categoryKey="month" config={config}>
          <LineChart>
            <Line dataKey="cooked" />
            <Line dataKey="saved" />
            <ChartTooltip />
            <ChartLegend />
          </LineChart>
        </Chart>,
      );
      await drawn(chart);
      expect(seen.plot! - seen.figure!, "frames between the figure and its plot").toBeGreaterThanOrEqual(1);
      expect(chart.getBoundingClientRect().height).toBe(seen.height);
      expect(seen.emptyLegend, "an empty legend slot between the placeholder and recharts' legend").toBeUndefined();
    } finally {
      counting = false;
      observer.disconnect();
    }
  });

  it("holds a custom chart's ChartLegend in place before the plot draws, and no legend for one without it", async () => {
    const custom = (legend: boolean) => (
      <Chart title="Cooking" data={rows} categoryKey="month" config={config}>
        <LineChart>
          {/* Text among the parts is no series. */}
          {"Cooked per month"}
          <Line dataKey="cooked" />
          {legend && <ChartLegend />}
        </LineChart>
      </Chart>
    );
    const { chart } = await render(custom(true));
    const before = chart.getBoundingClientRect().height;
    // Only the series the chart draws, as recharts' own legend lists them.
    expect(chart.querySelector("[data-ouro-chart-legend-slot]")!.textContent).toBe("Recipes cooked");
    await drawn(chart);
    expect(chart.getBoundingClientRect().height).toBe(before);
    // A chart of one series has no legend, before the plot draws or after.
    const single = await render(<Chart title="Cooking" data={rows} categoryKey="month" config={{ month: config.month, cooked: config.cooked }} />);
    const one = single.chart.getBoundingClientRect().height;
    expect(single.chart.querySelector("[data-ouro-chart-legend-slot]")!.textContent).toBe("");
    await drawn(single.chart);
    expect(single.chart.getBoundingClientRect().height).toBe(one);
    const bare = await render(custom(false));
    expect(bare.chart.querySelector("[data-ouro-chart-legend-slot]")!.textContent).toBe("");
  });

  it("is a figure named by its title, with a focusable plot named the same", async () => {
    const { chart } = await render(<Chart title="Cooking this quarter" data={rows} categoryKey="month" config={config} />);
    await drawn(chart);
    await expect.element(page.getByRole("figure", { name: "Cooking this quarter" })).toBeVisible();
    const plot = surface(chart)!;
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
    expect(surface(chart)!.getAttribute("aria-describedby")).toBe(summary().id);
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

  it("keeps an aria-describedby the app passes, after its own summary", async () => {
    const { chart } = await render(
      <>
        <Chart title="Cooking" data={rows} categoryKey="month" config={config} aria-describedby="chart-note" />
        <p id="chart-note">Counts are for this year.</p>
      </>,
    );
    const summary = chart.querySelector<HTMLElement>("[data-ouro-chart-summary]")!;
    expect(chart.getAttribute("aria-describedby")).toBe(`${summary.id} chart-note`);
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

  it("fades its visible table out at the side that hides more, and the hidden one never", async () => {
    const { chart, rerender } = await render(<Chart title="Cooking" data={rows} categoryKey="month" config={config} />, 120);
    const wrapper = chart.querySelector<HTMLElement>("[data-ouro-chart-table]")!;
    await act(async () => new Promise(requestAnimationFrame));
    expect(wrapper.hasAttribute("data-ouro-scroll-fade")).toBe(false);
    await rerender(<Chart title="Cooking" data={rows} categoryKey="month" config={config} showTable />);
    await expect.poll(() => wrapper.hasAttribute("data-ouro-scroll-fade")).toBe(true);
    expect(getComputedStyle(wrapper).maskImage).toContain("linear-gradient");
  });

  it("formats values with formatValue in the table, the axis and the tooltip", async () => {
    const formatValue = (value: number) => `${value} €`;
    const { chart } = await render(<Chart title="Spend" data={rows} categoryKey="month" config={config} formatValue={formatValue} />);
    await drawn(chart);
    expect(chart.querySelector("tbody tr td")!.textContent).toBe("12 €");
    expect([...chart.querySelectorAll('[data-ouro-chart-axis="y"] text')].map((tick) => tick.textContent)).toEqual(["0 €", "350 €", "700 €", "1050 €", "1400 €"]);
    await userEvent.hover(bars(chart, "cooked")[0]!);
    await expect.poll(() => chart.querySelector("[data-ouro-chart-tooltip]")?.textContent).toBe("JanuaryRecipes cooked12 €Recipes saved4 €");
  });

  it("colors each series from the theme's chart tokens, in light and dark", async () => {
    const { host, chart } = await render(<Chart title="Cooking" data={rows} categoryKey="month" config={config} />);
    await drawn(chart);
    const fillOf = (series: string) => getComputedStyle(bars(chart, series)[0]!).fill;
    expect(fillOf("cooked")).toBe(resolved("var(--chart-1)"));
    expect(fillOf("saved")).toBe(resolved("var(--chart-2)"));
    document.documentElement.classList.add("dark");
    expect(fillOf("cooked")).toBe(resolved("var(--chart-1)"));
    // The fill follows the token live, whatever the app's theme sets it to.
    host.style.setProperty("--chart-1", "rgb(1, 2, 3)");
    expect(fillOf("cooked")).toBe("rgb(1, 2, 3)");
  });

  it("writes the axis labels in the theme's muted text color, not recharts' gray, in light and dark", async () => {
    const { chart } = await render(<Chart title="Cooking" data={rows} categoryKey="month" config={config} />);
    await drawn(chart);
    const labels = [...chart.querySelectorAll("[data-ouro-chart-tick]")];
    expect(labels.length).toBe(8);
    const fills = () => new Set(labels.map((label) => getComputedStyle(label).fill));
    expect(fills()).toEqual(new Set([resolved("var(--muted-foreground)")]));
    document.documentElement.classList.add("dark");
    expect(fills()).toEqual(new Set([resolved("var(--muted-foreground)")]));
  });

  it("draws each axis label whole, though its ink, like a 1's flag in some fonts, reaches past the label's box", async () => {
    // A stroke makes every label's ink reach 3px past its box, whatever the font; the host's padding is a card's.
    const { chart } = await render(
      <div style={{ padding: 16 }}>
        <style>{".chart-ink text { stroke: currentColor; stroke-width: 6px; }"}</style>
        <Chart title="Cooking" data={rows} categoryKey="month" config={config} className="chart-ink" />
      </div>,
      320,
    );
    await drawn(chart);
    const measure = document.createElement("canvas").getContext("2d")!;
    const labels = [...chart.querySelectorAll<SVGTextElement>("[data-ouro-chart-tick]")];
    expect(labels.map((label) => label.textContent)).toContain("1,400");
    for (const label of labels) {
      const style = getComputedStyle(label);
      measure.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      const ink = measure.measureText(label.textContent!);
      const stroke = parseFloat(style.strokeWidth) / 2;
      const box = label.getBoundingClientRect();
      // The nearest box that clips what the label draws.
      let clip: Element = label.ownerSVGElement!;
      while (getComputedStyle(clip).overflowX === "visible" && clip.parentElement) clip = clip.parentElement;
      const edge = clip.getBoundingClientRect();
      expect(box.left - ink.actualBoundingBoxLeft - stroke, label.textContent!).toBeGreaterThanOrEqual(edge.left);
      expect(box.left + ink.actualBoundingBoxRight + stroke, label.textContent!).toBeLessThanOrEqual(edge.right);
    }
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
    // The legend's markers draw in their series' colors too.
    await expect.poll(() => chart.querySelectorAll("[data-ouro-chart-legend] [data-ouro-chart-marker]").length).toBe(3);
    const markers = [...chart.querySelectorAll<SVGElement>("[data-ouro-chart-legend] [data-ouro-chart-marker]")].map((marker) => getComputedStyle(marker).color);
    expect(markers).toEqual([resolved("var(--destructive)"), resolved("var(--chart-2)"), resolved("var(--chart-3)")]);
  });

  it("follows a new config: its labels in the table and the legend, and its tones in the colors", async () => {
    const { chart, rerender } = await render(<Chart title="Cooking" data={rows} categoryKey="month" config={config} />);
    await drawn(chart);
    const renamed = {
      month: { label: "Month" },
      cooked: { label: "Dishes cooked", tone: "destructive" },
      saved: { label: "Dishes saved", tone: "chart-2" },
    } satisfies ChartConfig<(typeof rows)[number]>;
    await rerender(<Chart title="Cooking" data={rows} categoryKey="month" config={renamed} />);
    await drawn(chart);
    const header = [...chart.querySelector<HTMLTableElement>("[data-ouro-chart-table] table")!.rows[0]!.cells].map((cell) => cell.textContent);
    expect(header).toEqual(["Month", "Dishes cooked", "Dishes saved"]);
    await expect.poll(() => [...chart.querySelectorAll("[data-ouro-chart-legend] li")].map((item) => item.textContent)).toEqual(["Dishes cooked", "Dishes saved"]);
    expect(resolved("var(--color-cooked)", chart)).toBe(resolved("var(--destructive)"));
    await userEvent.hover(bars(chart, "cooked")[0]!);
    await expect.poll(() => chart.querySelector("[data-ouro-chart-tooltip]")?.textContent).toBe("JanuaryDishes cooked12Dishes saved4");
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

  it("keeps every legend item out of the chart's SVG, for a chart with type and one with children", async () => {
    const withType = await render(<Chart title="Cooking" data={rows} categoryKey="month" config={config} />);
    await drawn(withType.chart);
    const withChildren = await render(
      <Chart title="Cooking trend" data={rows} categoryKey="month" config={config}>
        <LineChart>
          <XAxis dataKey="month" />
          <Line dataKey="cooked" stroke="var(--color-cooked)" />
          <Line dataKey="saved" stroke="var(--color-saved)" />
          <ChartLegend />
        </LineChart>
      </Chart>,
    );
    await drawn(withChildren.chart);
    for (const { chart } of [withType, withChildren]) {
      await expect.poll(() => chart.querySelectorAll("[data-ouro-chart-legend] li").length).toBe(2);
      const plot = surface(chart)!.getBoundingClientRect();
      for (const item of chart.querySelectorAll("[data-ouro-chart-legend] li")) {
        const box = item.getBoundingClientRect();
        const overlaps = box.left < plot.right && box.right > plot.left && box.top < plot.bottom && box.bottom > plot.top;
        expect(overlaps, `${item.textContent} over the plot`).toBe(false);
      }
    }
  });

  it("lists the series of a fragment, and a legend in a wrapper component, outside the SVG", async () => {
    const LegendInWrapper = () => <ChartLegend />;
    const { chart } = await render(
      <Chart title="Cooking trend" data={rows} categoryKey="month" config={config}>
        <LineChart>
          <>
            <XAxis dataKey="month" />
            <Line dataKey="cooked" stroke="var(--color-cooked)" />
            <Line dataKey="saved" stroke="var(--color-saved)" />
          </>
          <LegendInWrapper />
        </LineChart>
      </Chart>,
    );
    await drawn(chart);
    await expect.poll(() => [...chart.querySelectorAll("[data-ouro-chart-legend] li")].map((item) => item.textContent)).toEqual(["Recipes cooked", "Recipes saved"]);
    const plot = surface(chart)!.getBoundingClientRect();
    for (const item of chart.querySelectorAll("[data-ouro-chart-legend] li")) {
      const box = item.getBoundingClientRect();
      expect(box.top >= plot.bottom || box.bottom <= plot.top || box.left >= plot.right || box.right <= plot.left, `${item.textContent} outside the plot`).toBe(true);
    }
  });

  it("server HTML holds the legend of the series in config in its slot, before recharts draws its own", () => {
    const html = renderToString(
      <Chart title="Cooking" data={rows} categoryKey="month" config={config}>
        <LineChart>
          <Line dataKey="cooked" />
          <Line dataKey="saved" />
          <ChartLegend />
        </LineChart>
      </Chart>,
    );
    expect(html).toContain("data-ouro-chart-legend-slot");
    expect(html).not.toContain("recharts-legend-wrapper");
    expect(html).toMatch(/data-ouro-chart-legend-slot="".*data-ouro-chart-legend="".*Recipes cooked.*Recipes saved/);
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
    expect(chart.querySelectorAll("[data-ouro-chart-dots] [data-ouro-chart-dot]").length).toBe(6);
    const shapeOf = (series: string) => chart.querySelector(`[data-ouro-chart-dot][data-ouro-chart-series="${series}"]`)!.getAttribute("data-ouro-chart-dot");
    expect(shapeOf("cooked")).not.toBe(shapeOf("saved"));
  });

  it("draws areas", async () => {
    const { chart } = await render(<Chart type="area" title="Cooking" data={rows} categoryKey="month" config={config} />);
    await drawn(chart);
    expect(chart.querySelectorAll("[data-ouro-chart-area]")).toHaveLength(2);
    // Each area is its line, closed down to 0.
    const area = chart.querySelector('.ouro-chart-series-cooked [data-ouro-chart-area]')!.getAttribute("d")!;
    expect(area.startsWith(chart.querySelector('.ouro-chart-series-cooked [data-ouro-chart-line]')!.getAttribute("d")!)).toBe(true);
    expect(area).toMatch(/Z$/);
  });

  it("shows the tooltip from the keyboard: Tab to the plot, then the arrow keys", async () => {
    const { chart, rerender } = await render(<Chart title="Cooking" data={rows} categoryKey="month" config={config} />);
    await drawn(chart);
    // A pointer resting over the plot (left there by an earlier test) holds the tooltip at its
    // point, so park it on the chart's own caption, above the plot. A spot outside the chart, such
    // as the frame's corner, can lie outside what Playwright counts as the viewport when many test
    // files share the browser (a mutation run's), and the hover then never lands.
    await userEvent.hover(chart.querySelector("figcaption")!, { position: { x: 2, y: 2 } });
    await pressTab();
    expect(document.activeElement).toBe(surface(chart));
    // Focus shows the first point; the arrow keys move along.
    const tooltip = () => chart.querySelector<HTMLElement>("[data-ouro-chart-tooltip]");
    await expect.poll(() => tooltip()?.textContent).toBe("JanuaryRecipes cooked12Recipes saved4");
    // The card is a polite live region that stays in place, so a screen reader hears each point.
    const status = page.getByRole("status").element();
    expect(status).toBe(tooltip());
    expect(status.getAttribute("aria-live")).toBe("polite");
    await userEvent.keyboard("{ArrowRight}");
    await expect.poll(() => status.textContent).toBe("FebruaryRecipes cooked18Recipes saved9");
    expect(tooltip()).toBe(status);
    const markers = [...tooltip()!.querySelectorAll("[data-ouro-chart-marker]")].map((marker) => marker.getAttribute("data-ouro-chart-marker"));
    expect(new Set(markers).size).toBe(2);
    // The band behind the category it describes.
    const cursor = chart.querySelector<SVGRectElement>("[data-ouro-chart-cursor]")!;
    const second = bars(chart, "cooked")[1]!.getBoundingClientRect();
    expect(cursor.getBoundingClientRect().left).toBeLessThan(second.left);
    expect(cursor.getBoundingClientRect().right).toBeGreaterThan(second.right);
    await userEvent.keyboard("{End}");
    await expect.poll(() => status.textContent).toMatch(/^March/);
    await userEvent.keyboard("{ArrowRight}");
    await expect.poll(() => status.textContent).toMatch(/^March/);
    await userEvent.keyboard("{Home}");
    await expect.poll(() => status.textContent).toMatch(/^January/);
    await userEvent.keyboard("{ArrowLeft}");
    await expect.poll(() => status.textContent).toMatch(/^January/);
    // Escape puts it away; an arrow brings it back, at the first point.
    await userEvent.keyboard("{Escape}");
    await expect.poll(() => tooltip()).toBeNull();
    await userEvent.keyboard("{ArrowRight}");
    await expect.poll(() => tooltip()?.textContent).toMatch(/^January/);
    await userEvent.keyboard("{ArrowRight}");
    await expect.poll(() => tooltip()?.textContent).toMatch(/^February/);
    // Data with fewer points than the one it showed puts it away, and it stays away when the data grows back; the
    // plot losing focus puts it away too.
    await rerender(<Chart title="Cooking" data={rows.slice(0, 1)} categoryKey="month" config={config} />);
    expect(tooltip()).toBeNull();
    await rerender(<Chart title="Cooking" data={rows} categoryKey="month" config={config} />);
    expect(tooltip()).toBeNull();
    await userEvent.keyboard("{Home}");
    await expect.poll(() => tooltip()?.textContent).toMatch(/^January/);
    await act(async () => surface(chart)!.blur());
    expect(tooltip()).toBeNull();
  });

  it("keeps Escape from what is around it while it puts the tooltip away, and lets it through when there is none", async () => {
    const around = vi.fn();
    const { chart } = await render(
      <div onKeyDown={(event) => event.key === "Escape" && around()}>
        <Chart title="Cooking" data={rows} categoryKey="month" config={config} />
      </div>,
    );
    await drawn(chart);
    await act(() => surface(chart)!.focus());
    await expect.poll(() => chart.querySelector("[data-ouro-chart-tooltip]")).not.toBeNull();
    await userEvent.keyboard("{Escape}");
    await expect.poll(() => chart.querySelector("[data-ouro-chart-tooltip]")).toBeNull();
    expect(around).not.toHaveBeenCalled();
    await userEvent.keyboard("{Escape}");
    expect(around).toHaveBeenCalledOnce();
  });

  it("shows the tooltip when the pointer is over a bar", async () => {
    const { chart } = await render(<Chart title="Cooking" data={rows} categoryKey="month" config={config} />);
    await drawn(chart);
    await userEvent.hover(bars(chart, "cooked")[2]!);
    await expect.poll(() => chart.querySelector("[data-ouro-chart-tooltip]")?.textContent).toBe("MarchRecipes cooked1,250Recipes saved7");
    // Over the axis labels, outside the plot area, there is none.
    await userEvent.hover(chart.querySelector('[data-ouro-chart-axis="x"] text')!);
    await expect.poll(() => chart.querySelector("[data-ouro-chart-tooltip]")).toBeNull();
  });

  it("keeps the tooltip card inside the plot, beside its point, turning it at the plot's edges", async () => {
    // Narrower than the test frame, so no hover scrolls the page.
    const { chart } = await render(<Chart title="Cooking" data={rows} categoryKey="month" config={config} />, 360);
    await drawn(chart);
    const plot = chart.querySelector("[data-ouro-chart-plot]")!.getBoundingClientRect();
    const card = () => chart.querySelector("[data-ouro-chart-tooltip]")!.getBoundingClientRect();
    // Near the top left, the card sits below and to the right of the pointer.
    await userEvent.hover(surface(chart)!, { position: { x: 80, y: 20 } });
    await expect.poll(() => chart.querySelector("[data-ouro-chart-tooltip]")).not.toBeNull();
    await expect.poll(() => [card().left - plot.left, card().top - plot.top]).toEqual([90, 30]);
    // Near the bottom right, it turns to sit above and to the left, still inside.
    const corner = { x: Math.round(plot.width) - 12, y: Math.round(plot.height) - 34 };
    await userEvent.hover(surface(chart)!, { position: corner });
    await expect.poll(() => Math.abs(card().right - plot.left - (corner.x - 10))).toBeLessThan(1);
    expect(Math.abs(card().bottom - plot.top - (corner.y - 10))).toBeLessThan(1);
  });

  it("keeps a tooltip a finger opened after the finger lifts, and takes it away when a mouse leaves", async () => {
    const { chart } = await render(<Chart title="Cooking" data={rows} categoryKey="month" config={config} />);
    await drawn(chart);
    const plot = surface(chart)!;
    const box = bars(chart, "cooked")[1]!.getBoundingClientRect();
    const at = { clientX: box.left + box.width / 2, clientY: box.top + box.height / 2, bubbles: true };
    const tooltip = () => chart.querySelector("[data-ouro-chart-tooltip]");
    await act(async () => {
      plot.dispatchEvent(new PointerEvent("pointerover", { ...at, pointerType: "touch" }));
      plot.dispatchEvent(new PointerEvent("pointerdown", { ...at, pointerType: "touch" }));
      plot.dispatchEvent(new PointerEvent("pointerout", { ...at, pointerType: "touch", relatedTarget: document.body }));
    });
    expect(tooltip()?.textContent).toMatch(/^February/);
    await act(async () => {
      plot.dispatchEvent(new PointerEvent("pointerover", { ...at, pointerType: "mouse" }));
      plot.dispatchEvent(new PointerEvent("pointermove", { ...at, pointerType: "mouse" }));
      plot.dispatchEvent(new PointerEvent("pointerout", { ...at, pointerType: "mouse", relatedTarget: document.body }));
    });
    expect(tooltip()).toBeNull();
  });

  it("grows the point under the tooltip over the fast duration, and at once with reduced motion", async () => {
    const fast = parseDuration(getComputedStyle(document.documentElement).getPropertyValue("--ouro-duration-fast"));
    for (const reduced of [false, true]) {
      await commands.emulateMedia({ reducedMotion: reduced ? "reduce" : "no-preference" });
      try {
        const { chart } = await render(<Chart type="line" title="Cooking" data={rows} categoryKey="month" config={config} />);
        await drawn(chart);
        const plot = chart.querySelector<HTMLElement>("[data-ouro-part='plot']")!;
        await act(() => plot.focus());
        const grow = () => chart.querySelectorAll('[data-ouro-chart-dot][data-ouro-chart-series="cooked"] > [data-ouro-part="dot"]')[1]!;
        void getComputedStyle(grow()).scale;
        // The change commits at once, with no await before the motion is read.
        flushSync(() => plot.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
        if (reduced) {
          await expectNoMotion(grow(), { stem: "chart", state: "data-highlighted", reduced });
          // The tooltip card only fades as it moves.
          expect(getComputedStyle(chart.querySelector("[data-ouro-chart-tooltip-place]")!).transitionProperty).toBe("opacity");
        } else {
          await expectMotion(grow(), { stem: "chart", state: "data-highlighted", properties: { scale: fast }, reduced });
        }
        expect(getComputedStyle(grow()).scale).toBe("1.4");
        // Only the point under the tooltip is marked, as a state with no value.
        expect([...chart.querySelectorAll("[data-ouro-part='dot'][data-highlighted]")].map((dot) => dot.getAttribute("data-highlighted"))).toEqual(["", ""]);
      } finally {
        await commands.emulateMedia({ reducedMotion: "no-preference" });
      }
    }
  });

  it("breaks a line at a missing value, leaves out its bar, and draws a lone point and a nameless category", async () => {
    const gaps = [
      { month: "January", cooked: 12, saved: null },
      { month: "February", cooked: null, saved: 9 },
      { saved: 7, cooked: 20 },
    ];
    const line = await render(<Chart type="line" title="Cooking" data={gaps} categoryKey="month" config={config} />);
    await drawn(line.chart);
    // Cooked: two runs of one point each; saved: one run of two.
    expect([...line.chart.querySelectorAll(".ouro-chart-series-cooked [data-ouro-chart-line]")].map((path) => path.getAttribute("d")!.includes("C"))).toEqual([false, false]);
    expect(line.chart.querySelectorAll(".ouro-chart-series-saved [data-ouro-chart-line]")).toHaveLength(1);
    expect(line.chart.querySelectorAll("[data-ouro-chart-dots] [data-ouro-chart-dot]")).toHaveLength(4);
    expect([...line.chart.querySelectorAll('[data-ouro-chart-axis="x"] text')].map((tick) => tick.textContent)).toEqual(["January", "February", ""]);
    const bar = await render(<Chart title="Cooking" data={gaps} categoryKey="month" config={config} />);
    await drawn(bar.chart);
    expect(bars(bar.chart, "cooked")).toHaveLength(2);
    // One category's point sits in the middle of the plot.
    const lone = await render(<Chart type="line" title="Cooking" data={rows.slice(0, 1)} categoryKey="month" config={config} />);
    await drawn(lone.chart);
    const plot = surface(lone.chart)!;
    const dot = lone.chart.querySelector("[data-ouro-chart-dot]")!.getBoundingClientRect();
    const grid = lone.chart.querySelector("[data-ouro-chart-grid] line")!.getBoundingClientRect();
    expect(Math.abs(dot.left + dot.width / 2 - (grid.left + grid.right) / 2)).toBeLessThan(1);
    await userEvent.hover(plot, { position: { x: grid.right - plot.getBoundingClientRect().left - 4, y: 40 } });
    await expect.poll(() => lone.chart.querySelector("[data-ouro-chart-tooltip]")?.textContent).toMatch(/^January/);
  });

  it("leaves out x-axis labels that would crowd each other, keeping the last", async () => {
    const days = Array.from({ length: 30 }, (_, day) => ({ day: `Day ${day + 1}`, cooked: day }));
    const { chart } = await render(<Chart type="line" title="Cooking" data={days} categoryKey="day" config={{ cooked: { label: "Cooked" } }} />, 320);
    await drawn(chart);
    const labels = [...chart.querySelectorAll<SVGTextElement>('[data-ouro-chart-axis="x"] text')];
    expect(labels.length).toBeGreaterThan(1);
    expect(labels.length).toBeLessThan(30);
    expect(labels.at(-1)!.textContent).toBe("Day 30");
    const boxes = labels.map((label) => label.getBoundingClientRect());
    for (let index = 1; index < boxes.length; index++) expect(boxes[index]!.left - boxes[index - 1]!.right).toBeGreaterThanOrEqual(16);
  });

  it("draws an empty chart's axes, with no tooltip to show", async () => {
    const { chart } = await render(<Chart title="Cooking" data={[]} categoryKey="month" config={config} />);
    await expect.poll(() => chart.querySelectorAll("[data-ouro-chart-grid] line").length).toBe(5);
    await userEvent.hover(surface(chart)!);
    await pressTab();
    await userEvent.keyboard("{ArrowRight}");
    expect(chart.querySelector("[data-ouro-chart-tooltip]")).toBeNull();
  });

  it("shows the tooltip where a click lands, and keeps it there when the plot takes focus", async () => {
    const { chart } = await render(<Chart title="Cooking" data={rows} categoryKey="month" config={config} />);
    await drawn(chart);
    await userEvent.click(bars(chart, "cooked")[2]!);
    expect(document.activeElement).toBe(surface(chart));
    await expect.poll(() => chart.querySelector("[data-ouro-chart-tooltip]")?.textContent).toMatch(/^March/);
  });

  it.each(["reduce", "no-preference"] as const)("draws bars and lines at their final geometry from the first frame (%s)", async (reducedMotion) => {
    await commands.emulateMedia({ reducedMotion });
    try {
      const { chart } = await render(<Chart title="Cooking" data={rows} categoryKey="month" config={config} />);
      await expect.poll(() => bars(chart, "cooked").length).toBe(3);
      const first = bars(chart, "cooked")[2]!.getBoundingClientRect().height;
      await drawn(chart);
      const final = bars(chart, "cooked")[2]!.getBoundingClientRect().height;
      expect(final).toBeGreaterThan(50);
      expect(first).toBe(final);
    } finally {
      await commands.emulateMedia({ reducedMotion: "no-preference" });
    }
  });

  it("draws a line in full at once, with no draw-in", async () => {
    const { chart } = await render(<Chart type="line" title="Cooking" data={rows} categoryKey="month" config={config} />);
    const plot = chart.querySelector("[data-ouro-chart-plot]")!;
    await expect.poll(() => chart.querySelector<SVGPathElement>("[data-ouro-chart-line]") !== null).toBe(true);
    const curve = chart.querySelector<SVGPathElement>("[data-ouro-chart-line]")!;
    // No dash gap from a draw-in, and nothing for a screenshot to wait for.
    expect(curve.getAttribute("stroke-dasharray") ?? "").not.toMatch(/^0px/);
    expect(plot.hasAttribute("data-ouro-chart-animating")).toBe(false);
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
    // Recharts sizes it to the plot box itself.
    expect(Math.round(plot.getBoundingClientRect().width)).toBe(Math.round(chart.querySelector("[data-ouro-chart-plot]")!.getBoundingClientRect().width));
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
    await pressTab();
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
    // The plot box is in the HTML, empty, and the plot draws as the page hydrates.
    expect(html).toContain("data-ouro-chart-plot");
    expect(html).not.toContain("data-ouro-chart-bar");
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
    expect(host.querySelectorAll("[data-ouro-chart-bar]").length).toBeGreaterThan(0);
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
  ])("warns when %s gets shadcn's content prop, with the page and before the plot draws, once", async (part, problem, fix) => {
    const Part = (part === "ChartTooltip" ? ChartTooltip : ChartLegend) as (props: { content: unknown }) => ReactNode;
    const message = `[ouro-ui] ${part}: ${problem}. Fix: ${fix}.`;
    const tree = () => (
      <Chart title="Cooking" data={rows} categoryKey="month" config={config}>
        <LineChart>
          <Line dataKey="cooked" />
          <Part content={<div />} />
        </LineChart>
      </Chart>
    );
    const said = () => warn.mock.calls.filter((call: unknown[]) => call[0] === message).length;
    // With the frame the plot waits for held, the plot never draws, so only Chart can have said it: with the page.
    const frames = vi.spyOn(window, "requestAnimationFrame").mockImplementation(() => 0);
    const held = await render(tree());
    expect(held.chart.querySelector(".recharts-surface")).toBeNull();
    expect(said()).toBe(1);
    frames.mockRestore();
    // The part, rendered with the plot, knows Chart checked it and says nothing more, nor does a render with new elements.
    warn.mockClear();
    const { chart, rerender } = await render(tree());
    await drawn(chart);
    await rerender(tree());
    expect(said()).toBe(1);
  });

  it("names nothing for a part of recharts' own that takes content, nor for its own parts without it", async () => {
    const { chart } = await render(
      <Chart title="Cooking" data={rows} categoryKey="month" config={config}>
        <LineChart>
          <Line dataKey="cooked" />
          <Tooltip content={() => null} />
          <ChartTooltip />
          <ChartLegend />
        </LineChart>
      </Chart>,
    );
    await drawn(chart);
    expect(warn.mock.calls.filter((call: unknown[]) => String(call[0]).startsWith("[ouro-ui]"))).toEqual([]);
  });

  it.each([
    ["ChartTooltip", "content is not a prop; ChartTooltip draws its content from config", "<ChartTooltip />"],
    ["ChartLegend", "content is not a prop; ChartLegend draws its content from config", "<ChartLegend />"],
  ])("still warns, once, when %s gets content inside a wrapper Chart cannot see into", async (part, problem, fix) => {
    const Part = (part === "ChartTooltip" ? ChartTooltip : ChartLegend) as (props: { content: unknown }) => ReactNode;
    const Wrapped = () => <Part content={<div />} />;
    const message = `[ouro-ui] ${part}: ${problem}. Fix: ${fix}.`;
    const { chart } = await render(
      <Chart title="Cooking" data={rows} categoryKey="month" config={config}>
        <LineChart>
          <Line dataKey="cooked" />
          <Wrapped />
        </LineChart>
      </Chart>,
    );
    await drawn(chart);
    await expect.poll(() => warn.mock.calls.filter((call: unknown[]) => call[0] === message).length).toBe(1);
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

describe("Chart geometry", () => {
  it("picks five round ticks from 0 past the largest value, below 0 for negative values", () => {
    expect(niceTicks(0, 1250)).toEqual([0, 350, 700, 1050, 1400]);
    expect(niceTicks(0, 31)).toEqual([0, 8, 16, 24, 32]);
    expect(niceTicks(-5, 20)).toEqual([-7, 0, 7, 14, 21]);
    expect(niceTicks(-30, 0)).toEqual([-32, -24, -16, -8, 0]);
    // A step too small for five ticks to hold the range grows by one.
    expect(niceTicks(-2, 98)).toEqual([-35, 0, 35, 70, 105]);
    // A chart of zeros still has an axis.
    expect(niceTicks(0, 0)).toEqual([0, 0.25, 0.5, 0.75, 1]);
    expect(niceTicks(0, 0.4)).toEqual([0, 0.1, 0.2, 0.3, 0.4]);
    // Room left over goes above the values, or below them when none is above 0 (each as Recharts' getNiceTickValues gives them).
    expect(niceTicks(0, 42)).toEqual([0, 15, 30, 45, 60]);
    expect(niceTicks(0, 5)).toEqual([0, 2, 4, 6, 8]);
    expect(niceTicks(-5, 0)).toEqual([-8, -6, -4, -2, 0]);
    expect(niceTicks(-9, 0)).toEqual([-12, -9, -6, -3, 0]);
  });

  it("draws a monotone curve through every point that never overshoots one", () => {
    expect(curvePath([])).toBe("");
    expect(curvePath([[1, 2]])).toBe("M1,2");
    expect(curvePath([[0, 0], [10, 5]])).toBe("M0,0L10,5");
    // The path d3's curveMonotoneX draws through these points, its ends' slopes included.
    expect(curvePath([[0, 0], [10, 10], [20, 30], [30, 35]])).toBe("M0,0C3.33,2.5 6.67,5 10,10C13.33,15 16.67,26.67 20,30C23.33,33.33 26.67,34.17 30,35");
    expect(curvePath([[0, 0], [5, 10], [20, 30], [30, 35], [34, 20]])).toBe("M0,0C1.67,3.47 3.33,6.94 5,10C10,19.17 15,25.83 20,30C23.33,32.78 26.67,35 30,35C31.33,35 32.67,27.5 34,20");
    const points = [[0, 50], [10, 20], [20, 30], [30, 30], [40, 0]] as const;
    const path = curvePath(points);
    const segments = [...path.matchAll(/C([^C]+)/g)].map((match) => match[1]!.trim().split(/[ ,]+/).map(Number));
    expect(segments).toHaveLength(4);
    segments.forEach(([, c1y, , c2y, x, y], index) => {
      // Each segment ends on its point, and its control points stay between the two points' heights.
      expect([x, y]).toEqual([...points[index + 1]!]);
      const [low, high] = [Math.min(points[index]![1], y!), Math.max(points[index]![1], y!)];
      for (const control of [c1y!, c2y!]) {
        expect(control).toBeGreaterThanOrEqual(low);
        expect(control).toBeLessThanOrEqual(high);
      }
    });
  });

  it("lays bars out in their category with a tenth free at each side and 4px between", () => {
    expect(barSlots(100, 1)).toEqual([{ x: 10, width: 80 }]);
    expect(barSlots(100, 2)).toEqual([{ x: 10, width: 38 }, { x: 52, width: 38 }]);
    // Bars too thin for the gap touch.
    const thin = barSlots(10, 3);
    expect(thin.map((slot) => slot.width)).toEqual([8 / 3, 8 / 3, 8 / 3]);
    expect(thin.map((slot) => slot.x)).toEqual([1, 1 + 8 / 3, 1 + 16 / 3]);
    // Bars exactly as wide as a pixel each keep the gap.
    expect(barSlots(7.5, 2)).toEqual([{ x: 0.75, width: 1 }, { x: 5.75, width: 1 }]);
  });
});

describe("Chart plot", () => {
  const values = [
    { at: "A", value: 30 },
    { at: "B", value: 10 },
    { at: "C", value: -5 },
  ];
  const one = { value: { label: "Value" } } satisfies ChartConfig<(typeof values)[number]>;
  const numbers = (element: Element, ...names: string[]) => names.map((name) => Number(element.getAttribute(name)));
  /** The plot's box and scale, as its grid and y axis draw them. */
  function scale(chart: HTMLElement, ticks: number[]) {
    const svg = surface(chart)!;
    const [width, height] = numbers(svg, "width", "height");
    const grid = [...chart.querySelectorAll('[data-ouro-chart-grid] line')].map((line) => numbers(line, "x1", "x2", "y1"));
    const [top, bottom, left, right] = [8, Math.max(height! - 30, 9), grid[0]![0]!, grid[0]![1]!];
    const y = (value: number) => bottom - ((value - ticks[0]!) / (ticks.at(-1)! - ticks[0]!)) * (bottom - top);
    return { width: width!, height: height!, grid, top, bottom, left, right, y };
  }

  it("lays its grid, axes and bars out on a scale from its smallest tick at the bottom to its largest at the top", async () => {
    const { chart } = await render(<Chart title="Scale" type="bar" data={values} categoryKey="at" config={one} />);
    await drawn(chart);
    const box = chart.querySelector("[data-ouro-chart-plot]")!;
    const ticks = niceTicks(-5, 30);
    const { width, height, grid, bottom, left, right, y } = scale(chart, ticks);
    expect([width, height]).toEqual([box.clientWidth, box.clientHeight]);
    // The y axis is as wide as its widest label and the room beside it; the plot ends 8px from the right.
    const yLabels = [...chart.querySelectorAll<SVGTextElement>('[data-ouro-chart-axis="y"] text')];
    expect(yLabels.map((label) => label.textContent)).toEqual(ticks.map((tick) => tick.toLocaleString("en-US")));
    expect(Math.abs(left - (Math.max(...yLabels.map((label) => label.getComputedTextLength())) + 14))).toBeLessThanOrEqual(1);
    expect(right).toBe(width - 8);
    expect(grid.map(([x1, x2]) => [x1, x2])).toEqual(ticks.map(() => [left, right]));
    grid.forEach(([, , y1], place) => expect(y1).toBeCloseTo(y(ticks[place]!), 6));
    for (const [place, label] of yLabels.entries()) expect(numbers(label, "x", "y")).toEqual([left - 14, y(ticks[place]!)]);
    // A band per category; each bar a tenth in from its band's sides, from 0 to its value.
    const band = (right - left) / 3;
    bars(chart, "value").forEach((bar, category) => {
      const [x, top, barWidth, barHeight] = numbers(bar, "x", "y", "width", "height");
      expect(x).toBeCloseTo(left + band * category + band * 0.1, 6);
      expect(barWidth).toBeCloseTo(band * 0.8, 6);
      const ends = [y(0), y(values[category]!.value)];
      expect(top).toBeCloseTo(Math.min(...ends), 6);
      expect(barHeight).toBeCloseTo(Math.abs(ends[1]! - ends[0]!), 6);
    });
    expect(chart.querySelector("[data-ouro-chart-dot]"), "a bar chart's points").toBeNull();
    // Each category's label in the middle of its band, under the plot.
    const xLabels = [...chart.querySelectorAll('[data-ouro-chart-axis="x"] text')];
    expect(xLabels.map((label) => label.textContent)).toEqual(["A", "B", "C"]);
    xLabels.forEach((label, category) => expect(numbers(label, "x", "y")).toEqual([left + band * (category + 0.5), bottom + 14]));
  });

  // Right to left, as test/conformance/rtl.test.tsx sets it: `dir="rtl"` on <html>, as an app in Arabic or Hebrew does.
  it("mirrors the y axis gutter to the right in a right-to-left page, so its labels sit beside the bars, not over them", async () => {
    document.documentElement.dir = "rtl";
    try {
      const { chart } = await render(<Chart title="Scale" type="bar" data={values} categoryKey="at" config={one} />);
      await drawn(chart);
      const { width, right } = scale(chart, niceTicks(-5, 30));
      const yLabels = [...chart.querySelectorAll<SVGTextElement>('[data-ouro-chart-axis="y"] text')];
      // The gutter sits past the plot's right edge, not inside it over the bars.
      for (const label of yLabels) expect(Number(label.getAttribute("x"))).toBeGreaterThanOrEqual(right);
      const widest = Math.max(...yLabels.map((label) => label.getComputedTextLength()));
      for (const bar of bars(chart, "value")) expect(bar.getBoundingClientRect().right).toBeLessThanOrEqual(chart.getBoundingClientRect().right - widest + 1);
      // The gutter is cut from the right edge by the same width it takes in a left-to-right page, not picked as its smaller remainder.
      const gutter = Math.ceil(widest) + 14;
      expect(Math.abs(right - (width - gutter))).toBeLessThanOrEqual(1);
    } finally {
      document.documentElement.removeAttribute("dir");
    }
  });

  it("keeps the right-to-left plot at least a pixel wide when the chart is too narrow for the full gutter", async () => {
    document.documentElement.dir = "rtl";
    try {
      const { chart } = await render(<Chart title="Scale" type="bar" data={values} categoryKey="at" config={one} />, 20);
      await drawn(chart);
      const { right } = scale(chart, niceTicks(-5, 30));
      // Clamped to the plot margin plus a pixel: the larger of the two candidates, never the smaller, and never short by one.
      expect(right).toBe(9);
    } finally {
      document.documentElement.removeAttribute("dir");
    }
  });

  it("puts a line's points a step apart from edge to edge, and a lone point in the middle", async () => {
    const { chart, rerender } = await render(<Chart title="Scale" type="line" data={values} categoryKey="at" config={one} />);
    await drawn(chart);
    const { left, right, y } = scale(chart, niceTicks(-5, 30));
    const step = (right - left) / 2;
    const points = values.map((row, category) => [left + step * category, y(row.value)] as const);
    expect(chart.querySelector("[data-ouro-chart-line]")!.getAttribute("d")).toBe(curvePath(points));
    const dots = [...chart.querySelectorAll("[data-ouro-chart-dot]")].map((dot) => dot.getAttribute("transform"));
    expect(dots).toEqual(points.map(([x, at]) => `translate(${x} ${at})`));
    expect(chart.querySelector("[data-ouro-chart-dot]")!.getAttribute("color")).toBe("var(--color-value)");
    expect([...chart.querySelectorAll('[data-ouro-chart-axis="x"] text')].map((label) => Number(label.getAttribute("x")))).toEqual(points.map(([x]) => x));
    await rerender(<Chart title="Scale" type="line" data={[{ at: "A", value: 5 }]} categoryKey="at" config={one} />);
    await drawn(chart);
    const lone = scale(chart, niceTicks(0, 5));
    expect(chart.querySelector("[data-ouro-chart-dot]")!.getAttribute("transform")).toBe(`translate(${(lone.left + lone.right) / 2} ${lone.y(5)})`);
    expect(chart.querySelector("[data-ouro-chart-line]")!.getAttribute("d")).toBe(curvePath([[(lone.left + lone.right) / 2, lone.y(5)]]));
  });

  it("breaks a line and its area at each missing, NaN or infinite value, drawing each run between them once", async () => {
    const error = vi.spyOn(console, "error");
    const gappy = [
      { at: "A", value: 5 },
      { at: "B", value: Number.NaN },
      { at: "C", value: Number.POSITIVE_INFINITY },
      { at: "D", value: 7 },
      { at: "E", value: 8 },
      { at: "F", value: 6 },
      { at: "G" },
    ];
    const { chart, rerender } = await render(<Chart title="Gaps" type="area" data={gappy} categoryKey="at" config={one} />);
    await drawn(chart);
    const { left, right, y } = scale(chart, niceTicks(0, 8));
    const x = (category: number) => left + ((right - left) / 6) * category;
    const runs = [[[x(0), y(5)]], [[x(3), y(7)], [x(4), y(8)], [x(5), y(6)]]] as const;
    expect([...chart.querySelectorAll("[data-ouro-chart-line]")].map((line) => line.getAttribute("d"))).toEqual(runs.map((run) => curvePath(run)));
    expect([...chart.querySelectorAll("[data-ouro-chart-area]")].map((area) => area.getAttribute("d"))).toEqual(
      runs.map((run) => `${curvePath(run)}L${run.at(-1)![0]},${y(0)}L${run[0]![0]},${y(0)}Z`),
    );
    // Each run's area has a key of its own.
    expect(error).not.toHaveBeenCalled();
    await rerender(<Chart title="Gaps" type="line" data={gappy} categoryKey="at" config={one} />);
    await drawn(chart);
    expect(chart.querySelectorAll("[data-ouro-chart-line]")).toHaveLength(2);
    expect(chart.querySelector("[data-ouro-chart-area]"), "a line chart's area").toBeNull();
  });

  it("keeps the last category's label inside the plot's box", async () => {
    const long = [{ at: "A", value: 1 }, { at: "The longest label of all", value: 2 }];
    const { chart } = await render(<Chart title="Labels" type="line" data={long} categoryKey="at" config={one} />);
    await drawn(chart);
    const { width } = scale(chart, niceTicks(0, 2));
    const last = [...chart.querySelectorAll<SVGTextElement>('[data-ouro-chart-axis="x"] text')].at(-1)!;
    expect(last.textContent).toBe("The longest label of all");
    expect(Math.abs(Number(last.getAttribute("x")) - (width - last.getComputedTextLength() / 2))).toBeLessThanOrEqual(1);
  });

  it("keeps a category label exactly the gap from the next, and leaves out one that comes closer", async () => {
    const blank = Array.from({ length: 5 }, () => ({ at: "", value: 1 }));
    const { host, chart } = await render(<Chart title="Gaps" type="line" data={blank} categoryKey="at" config={one} />);
    await drawn(chart);
    const labels = () => chart.querySelectorAll('[data-ouro-chart-axis="x"] text').length;
    const span = () => {
      const { left, right } = scale(chart, niceTicks(0, 1));
      return right - left;
    };
    // Labels with no width, a step of 16px apart: each is exactly the gap from the next.
    for (const [step, shown] of [[16, 5], [15, 3]] as const) {
      host.style.width = `${host.getBoundingClientRect().width + step * 4 - span()}px`;
      await expect.poll(span).toBe(step * 4);
      expect(labels()).toBe(shown);
    }
  });

  it("puts the cursor on the category under the tooltip: the band behind a bar, a line through a point", async () => {
    const { chart, rerender } = await render(<Chart title="Scale" type="bar" data={values} categoryKey="at" config={one} />);
    await drawn(chart);
    const cursors = () => [...chart.querySelectorAll("[data-ouro-chart-cursor]")];
    expect(cursors(), "a cursor with no tooltip").toEqual([]);
    const plot = chart.querySelector<SVGSVGElement>("[data-ouro-part='plot']")!;
    await act(() => plot.focus());
    await act(() => plot.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true })));
    const bar = scale(chart, niceTicks(-5, 30));
    const band = (bar.right - bar.left) / 3;
    expect(cursors().map((cursor) => [cursor.tagName, ...numbers(cursor, "x", "y", "width", "height")])).toEqual([["rect", bar.left + band * 2, bar.top, band, bar.bottom - bar.top]]);
    await rerender(<Chart title="Scale" type="line" data={values} categoryKey="at" config={one} />);
    await drawn(chart);
    const line = scale(chart, niceTicks(-5, 30));
    expect(cursors().map((cursor) => [cursor.tagName, ...numbers(cursor, "x1", "x2", "y1", "y2")])).toEqual([["line", line.right, line.right, line.top, line.bottom]]);
  });

  it("takes the arrow keys from the page's scrolling, and lets them on to what is around it", async () => {
    const { chart } = await render(<Chart title="Scale" type="line" data={values} categoryKey="at" config={one} />);
    await drawn(chart);
    // Above React's root, where a key the plot stops never arrives.
    const heard: string[] = [];
    const hear = (event: KeyboardEvent) => heard.push(event.key);
    document.addEventListener("keydown", hear);
    try {
      const plot = chart.querySelector<SVGSVGElement>("[data-ouro-part='plot']")!;
      await act(() => plot.focus());
      const press = async (key: string) => {
        let kept = true;
        await act(() => {
          kept = plot.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
        });
        return kept;
      };
      const category = () => chart.querySelector("[data-ouro-chart-tooltip]")?.textContent?.[0];
      expect(await press("ArrowRight"), "the key's default").toBe(false);
      expect(await press("ArrowRight")).toBe(false);
      expect(category()).toBe("C");
      expect(await press("ArrowLeft")).toBe(false);
      expect(category()).toBe("B");
      expect(await press("Home")).toBe(false);
      expect(category()).toBe("A");
      expect(heard).toEqual(["ArrowRight", "ArrowRight", "ArrowLeft", "Home"]);
    } finally {
      document.removeEventListener("keydown", hear);
    }
  });

  it("shows the tooltip for the category under the pointer, from the plot's edges in and nowhere outside them", async () => {
    const { chart, rerender } = await render(<Chart title="Scale" type="bar" data={values} categoryKey="at" config={one} />);
    await drawn(chart);
    const plot = chart.querySelector<SVGSVGElement>("[data-ouro-part='plot']")!;
    const box = plot.getBoundingClientRect();
    const shown = async (x: number, y: number) => {
      await act(() => plot.dispatchEvent(new PointerEvent("pointermove", { clientX: box.left + x, clientY: box.top + y, bubbles: true })));
      return chart.querySelector("[data-ouro-chart-tooltip]")?.textContent?.[0] ?? null;
    };
    const bar = scale(chart, niceTicks(-5, 30));
    const band = (bar.right - bar.left) / 3;
    const middle = (bar.top + bar.bottom) / 2;
    // A bar's whole band is its category's.
    expect(await shown(bar.left + band * 0.9, middle)).toBe("A");
    expect(await shown(bar.left + band * 1.1, middle)).toBe("B");
    // Its edges are inside; a pixel past any of them is not.
    expect(await shown(bar.left, middle)).toBe("A");
    for (const [x, y] of [[bar.left - 1, middle], [bar.right + 1, middle], [bar.left + 1, bar.top - 1], [bar.left + 1, bar.bottom + 1]] as const) expect(await shown(x, y), `${x},${y}`).toBeNull();
    expect(await shown(bar.right, bar.bottom)).toBe("C");
    // A line's nearest point is the category's.
    await rerender(<Chart title="Scale" type="line" data={values} categoryKey="at" config={one} />);
    await drawn(chart);
    const line = scale(chart, niceTicks(-5, 30));
    const step = (line.right - line.left) / 2;
    expect(await shown(line.left + step * 0.4, middle)).toBe("A");
    expect(await shown(line.left + step * 0.6, middle)).toBe("B");
  });

  it("turns the tooltip card before the point once it would pass the plot's edge, and not before", async () => {
    const { chart } = await render(<Chart title="Scale" type="bar" data={values} categoryKey="at" config={one} />);
    await drawn(chart);
    const plot = chart.querySelector<SVGSVGElement>("[data-ouro-part='plot']")!;
    const box = plot.getBoundingClientRect();
    const { width, right } = scale(chart, niceTicks(-5, 30));
    const point = (x: number) => act(() => plot.dispatchEvent(new PointerEvent("pointermove", { clientX: box.left + x, clientY: box.top + 20, bubbles: true })));
    const place = () => chart.querySelector<HTMLElement>("[data-ouro-chart-tooltip-place]")!;
    await point(right - 1);
    const card = place().offsetWidth;
    const across = () => Number.parseFloat(place().style.translate);
    // Exactly reaching the edge still fits; 5px past it, the card goes before the point.
    await point(width - card - 10);
    expect(across()).toBe(width - card);
    await point(width - card - 5);
    expect(across()).toBe(width - card - 5 - 10 - card);
  });

  it("keeps a plot too small for its axes a pixel wide and a pixel tall", async () => {
    const { chart } = await render(<Chart title="Tiny" type="bar" data={values} categoryKey="at" config={one} />, 30);
    await drawn(chart);
    const { height, grid, left } = scale(chart, niceTicks(-5, 30));
    expect(height - 30).toBeLessThan(9);
    expect(grid.map(([x1, x2]) => x2! - x1!)).toEqual(grid.map(() => 1));
    expect([grid[0]![0], grid[0]![2], grid.at(-1)![2]]).toEqual([left, 9, 8]);
  });

  it("writes the y axis with formatValue, naming no series, as all of them share it", async () => {
    const formatValue = (value: number, series: string) => `${series || "axis"} ${value}`;
    const { chart } = await render(<Chart title="Scale" type="bar" data={values} categoryKey="at" config={one} formatValue={formatValue} />);
    await drawn(chart);
    expect([...chart.querySelectorAll('[data-ouro-chart-axis="y"] text')].map((label) => label.textContent)).toEqual(niceTicks(-5, 30).map((tick) => `axis ${tick}`));
  });

  it("draws in the commit that mounts it, before any frame", () => {
    const host = document.createElement("div");
    host.style.width = "600px";
    document.body.append(host);
    mounted.push(host);
    const root = createRoot(host);
    roots.push(root);
    flushSync(() => root.render(<Chart title="Now" type="bar" data={values} categoryKey="at" config={one} />));
    expect(host.querySelectorAll("[data-ouro-chart-bar]")).toHaveLength(3);
  });

  it("follows its box as it resizes, and stops watching it when it unmounts", async () => {
    const observe = vi.spyOn(ResizeObserver.prototype, "observe");
    const disconnect = vi.spyOn(ResizeObserver.prototype, "disconnect");
    const { host, chart } = await render(<Chart title="Scale" type="bar" data={values} categoryKey="at" config={one} />);
    await drawn(chart);
    const box = chart.querySelector("[data-ouro-chart-plot]")!;
    const watcher = observe.mock.contexts[observe.mock.calls.findIndex(([target]) => target === box)];
    expect(watcher).toBeDefined();
    host.style.width = "400px";
    await expect.poll(() => scale(chart, niceTicks(-5, 30)).right).toBe(chart.querySelector("[data-ouro-chart-plot]")!.clientWidth - 8);
    expect(disconnect.mock.contexts).not.toContain(watcher);
    await act(async () => roots.splice(0).forEach((root) => root.unmount()));
    expect(disconnect.mock.contexts).toContain(watcher);
  });

  it("leaves a recharts chart's box to recharts, and measures it once the chart draws by type", async () => {
    const observe = vi.spyOn(ResizeObserver.prototype, "observe");
    const custom = (
      <Chart title="Scale" data={values} categoryKey="at" config={one}>
        <LineChart>
          <Line dataKey="value" />
        </LineChart>
      </Chart>
    );
    const { chart, rerender } = await render(custom);
    await drawn(chart);
    const box = chart.querySelector("[data-ouro-chart-plot]")!;
    expect(observe.mock.calls.map(([target]) => target)).not.toContain(box);
    await rerender(<Chart title="Scale" type="bar" data={values} categoryKey="at" config={one} />);
    await drawn(chart);
    expect(observe.mock.calls.map(([target]) => target)).toContain(box);
    expect(bars(chart, "value")).toHaveLength(3);
  });

  it("draws a recharts chart passed as children to a chart that first drew by type", async () => {
    const { chart, rerender } = await render(<Chart title="Scale" type="bar" data={values} categoryKey="at" config={one} />);
    await drawn(chart);
    await rerender(
      <Chart title="Scale" data={values} categoryKey="at" config={one}>
        <LineChart>
          <Line dataKey="value" />
        </LineChart>
      </Chart>,
    );
    await expect.poll(() => chart.querySelector(".recharts-surface")).not.toBeNull();
  });
});
