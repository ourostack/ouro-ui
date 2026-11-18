import { Component, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { Chart } from "@/registry/ouro/components/ouro/chart/chart";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

// Its own file, so recharts can fail to load: Chart loads it after the first paint, by a dynamic import, and a chunk
// that does not arrive (a network fault, or a page older than the deploy that renamed it) must reach the app. The mock
// fails when Chart reads the parts it draws with, as a load that failed would.
vi.mock("recharts", async (importOriginal) => {
  const recharts = await importOriginal<typeof import("recharts")>();
  return {
    ...recharts,
    get Area() {
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

const chart = (
  <Chart title="Cooked" data={[{ month: "Jan", cooked: 3 }, { month: "Feb", cooked: 5 }]} categoryKey="month" config={{ cooked: { label: "Cooked" } }} />
);

it("throws a recharts that does not load to the app's error boundary, in each chart that needs it", async () => {
  // React reports each error a boundary caught; those reports are this test's subject, not noise.
  const reported = vi.spyOn(console, "error").mockImplementation(() => {});
  const first = await render(<Boundary>{chart}</Boundary>);
  await expect.poll(() => first.querySelector('[role="alert"]')?.textContent).toBe("recharts did not load");
  // A chart that mounts later gets the same answer, rather than a plot box that stays empty.
  const second = await render(<Boundary>{chart}</Boundary>);
  await expect.poll(() => second.querySelector('[role="alert"]')?.textContent).toBe("recharts did not load");
  expect(reported).toHaveBeenCalled();
});
