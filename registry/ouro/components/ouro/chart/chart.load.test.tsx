import { Component, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { Chart, ChartLegend, ChartTooltip } from "@/registry/ouro/components/ouro/chart/chart";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

// Its own file, so recharts can fail to load. Chart draws a chart with `type` itself and never imports recharts; only
// ChartTooltip and ChartLegend load it, by a dynamic import, inside a recharts chart passed as children, and a chunk
// that does not arrive (a network fault, or a page older than the deploy that renamed it) must reach the app. The mock
// fails when the parts read what they draw with, as a load that failed would, and counts each read.
const reads = vi.hoisted(() => ({ count: 0 }));
vi.mock("recharts", async (importOriginal) => {
  const recharts = await importOriginal<typeof import("recharts")>();
  return {
    ...recharts,
    get Tooltip() {
      reads.count++;
      throw new Error("recharts did not load");
    },
  };
});

class Boundary extends Component<{ children: ReactNode }, { message: string | null }> {
  override state = { message: null as string | null };
  static getDerivedStateFromError(error: Error) {
    return { message: error.message };
  }
  override render() {
    return this.state.message === null ? this.props.children : <p role="alert">{this.state.message}</p>;
  }
}

const roots: Root[] = [];
afterEach(async () => {
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

async function render(node: ReactNode) {
  const host = document.createElement("div");
  host.style.width = "600px";
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
  return host;
}

const months = [
  { month: "Jan", cooked: 3 },
  { month: "Feb", cooked: 5 },
];

/** A stand-in for a recharts chart passed as children (this file cannot import recharts, whose mock throws). */
const Plot = ({ children }: { children?: ReactNode }) => <div>{children}</div>;

const composed = (part: ReactNode) => (
  <Chart title="Cooked" data={months} categoryKey="month" config={{ cooked: { label: "Cooked" } }}>
    <Plot>{part}</Plot>
  </Chart>
);

it("draws a chart with type without ever importing recharts", async () => {
  const host = await render(
    <Boundary>
      <Chart type="line" title="Cooked" data={months} categoryKey="month" config={{ cooked: { label: "Cooked" } }} />
    </Boundary>,
  );
  await expect.poll(() => host.querySelectorAll("[data-ouro-chart-dot]").length).toBe(2);
  // Two frames later, still nothing has read recharts' parts, and no error reached the boundary.
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  expect(reads.count).toBe(0);
  expect(host.querySelector('[role="alert"]')).toBeNull();
});

it("throws a recharts that does not load to the app's error boundary, in each chart that needs it", async () => {
  // React reports each error a boundary caught; those reports are this test's subject, not noise.
  const reported = vi.spyOn(console, "error").mockImplementation(() => {});
  const first = await render(<Boundary>{composed(<ChartTooltip />)}</Boundary>);
  await expect.poll(() => first.querySelector('[role="alert"]')?.textContent).toBe("recharts did not load");
  // A chart that mounts later gets the same answer, rather than a plot box that stays empty.
  const second = await render(<Boundary>{composed(<ChartLegend />)}</Boundary>);
  await expect.poll(() => second.querySelector('[role="alert"]')?.textContent).toBe("recharts did not load");
  expect(reported).toHaveBeenCalled();
});

it.each([
  ["ChartTooltip", () => <ChartTooltip />],
  ["ChartLegend", () => <ChartLegend />],
])("throws a recharts that does not load to the boundary from a %s inside a wrapper Chart cannot see into", async (_part, Part) => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const host = await render(<Boundary>{composed(<Part />)}</Boundary>);
  await expect.poll(() => host.querySelector('[role="alert"]')?.textContent).toBe("recharts did not load");
});
