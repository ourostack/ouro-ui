import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { Chart, ChartLegend, ChartTooltip, type ChartConfig } from "@/registry/ouro/components/ouro/chart/chart";

// Layout here uses inline styles and the theme's CSS variables (shadcn's names).

const months = [
  { month: "January", cooked: 12, saved: 4, shared: 2 },
  { month: "February", cooked: 18, saved: 9, shared: 3 },
  { month: "March", cooked: 15, saved: 7, shared: 6 },
  { month: "April", cooked: 22, saved: 11, shared: 5 },
  { month: "May", cooked: 26, saved: 8, shared: 9 },
  { month: "June", cooked: 31, saved: 14, shared: 12 },
];

/** Chart for these rows: an instantiation expression, so Storybook's args are typed by the rows. */
const MonthChart = Chart<(typeof months)[number]>;

const config = {
  month: { label: "Month" },
  cooked: { label: "Cooked" },
  saved: { label: "Saved" },
  shared: { label: "Shared" },
} satisfies ChartConfig<(typeof months)[number]>;

/** A themed panel. It follows the page's scheme (the `.dark` class on the root). */
function Surface({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        background: "var(--background)",
        color: "var(--foreground)",
        border: "1px solid var(--border)",
        borderRadius: "calc(var(--radius) + 4px)",
        padding: 24,
        maxWidth: 720,
      }}
    >
      {children}
    </div>
  );
}

const meta = {
  title: "Data/Chart",
  component: MonthChart,
  parameters: { layout: "padded" },
  decorators: [(Story) => <Surface>{Story()}</Surface>],
  args: { title: "Recipes per month", description: "January to June", data: months, categoryKey: "month", config },
  argTypes: {
    type: { control: "inline-radio", options: ["bar", "line", "area"] },
  },
} satisfies Meta<typeof MonthChart>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Bars, one per series, with the legend and the keyboard tooltip. Tab to the plot and use the arrow keys. */
export const Playground: Story = {
  parameters: { screenshot: { name: "chart-bar" } },
};

/** Lines: each series has its own point shape as well as its color. */
export const Lines: Story = {
  args: { type: "line" },
  parameters: { screenshot: { name: "chart-line" } },
};

/** Areas, with one series in a tone that means something. */
export const Areas: Story = {
  args: {
    type: "area",
    title: "Bakes",
    description: undefined,
    config: { month: { label: "Month" }, cooked: { label: "Risen" }, saved: { label: "Collapsed", tone: "destructive" } },
  },
};

/** The data table, which screen readers always get, shown under the chart. */
export const WithTable: Story = {
  args: { showTable: true, config: { month: { label: "Month" }, cooked: { label: "Cooked" } } },
};

/** A recharts chart as children, as in shadcn: Chart gives it the data, the name and `var(--color-<key>)`. */
export const Composed: Story = {
  args: { title: "Cooked and saved", description: undefined },
  render: (args) => (
    <MonthChart {...args}>
      <LineChart margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="month" tickLine={false} axisLine={false} />
        <YAxis tickLine={false} axisLine={false} width="auto" />
        <Line dataKey="cooked" type="step" stroke="var(--color-cooked)" strokeWidth={2} dot={false} />
        <Line dataKey="saved" type="step" stroke="var(--color-saved)" strokeWidth={2} strokeDasharray="6 4" dot={false} />
        <ChartTooltip />
        <ChartLegend />
      </LineChart>
    </MonthChart>
  ),
};
