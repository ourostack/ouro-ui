import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { cdp, page, server } from "vitest/browser";
import { NavigationRail, type NavigationRailEntry } from "@/registry/ouro/components/ouro/navigation-rail/navigation-rail";

const labels = ["Activity", "Chat", "Calendar", "Files", "Notes", "Tasks", "Help", "Wiki", "Mail"];
const items: NavigationRailEntry[] = labels.map((label) => ({
  label,
  href: `/${label}`,
  icon: (
    <svg viewBox="0 0 24 24">
      <path d="M4 4h16v16H4z" />
    </svg>
  ),
}));

const frames = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

/** The layouts Chromium runs from mounting a rail in a host `height` px tall until the second frame after. */
async function layoutsToMount(height: number) {
  await page.viewport(1024, 768);
  const session = cdp();
  await session.send("Performance.enable");
  const host = document.createElement("div");
  host.style.cssText = `display:flex;height:${height}px`;
  document.body.append(host);
  const root = createRoot(host);
  await frames();
  const count = async () => {
    const { metrics } = await session.send("Performance.getMetrics");
    return metrics.find((metric: { name: string }) => metric.name === "LayoutCount")!.value as number;
  };
  const before = await count();
  flushSync(() => root.render(<NavigationRail label="Main" items={items} />));
  await frames();
  const layouts = (await count()) - before;
  root.unmount();
  host.remove();
  return layouts;
}

describe.skipIf(server.browser !== "chromium")("NavigationRail layouts", () => {
  it("lays the page out once when mounted where every item fits", async () => {
    expect(await layoutsToMount(900)).toBe(1);
  });

  it("lays the page out no more than twice when mounted where items move under More: the measure and the paint of its fit", async () => {
    expect(await layoutsToMount(400)).toBeLessThanOrEqual(2);
  });
});
