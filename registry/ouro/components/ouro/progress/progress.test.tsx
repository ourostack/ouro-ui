import type { ReactNode } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { commands, page } from "vitest/browser";
import { Progress, type ProgressProps } from "@/registry/ouro/components/ouro/progress/progress";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

const roots: Root[] = [];
let mounted: Element[] = [];

async function render(node: ReactNode) {
  const host = document.createElement("div");
  host.style.width = "300px";
  document.body.append(host);
  mounted.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
  return {
    host,
    rerender: (next: ReactNode) => act(async () => root.render(next)),
    get root() {
      return host.querySelector<HTMLElement>('[data-ouro="progress"]')!;
    },
    get bar() {
      return host.querySelector<HTMLElement>('[role="progressbar"]')!;
    },
    get indicator() {
      return host.querySelector<HTMLElement>("[data-ouro-progress-indicator]")!;
    },
    get track() {
      return host.querySelector<HTMLElement>("[data-ouro-progress-track]")!;
    },
  };
}

function themeColor(variable: string): string {
  const probe = document.createElement("div");
  probe.style.backgroundColor = `var(${variable})`;
  document.body.append(probe);
  const value = getComputedStyle(probe).backgroundColor;
  probe.remove();
  return value;
}

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(async () => {
  vi.restoreAllMocks();
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  for (const node of mounted) node.remove();
  mounted = [];
  await commands.emulateMedia({ reducedMotion: "no-preference" });
});

/** How much of the track the bar covers: the bar is full width and slid back by what is not done. */
const filled = (indicator: HTMLElement, track: HTMLElement) =>
  Math.max(0, indicator.getBoundingClientRect().right - track.getBoundingClientRect().left);

const warnings = () => warn.mock.calls.map((call: unknown[]) => String(call[0]));

describe("Progress", () => {
  it("is a progressbar named by its visible label, with its value", async () => {
    const { root, bar, indicator, track } = await render(<Progress label="Uploading photos" value={40} />);
    await expect.element(page.getByRole("progressbar", { name: "Uploading photos" })).toBeVisible();
    expect(root).toBe(bar);
    expect(bar.getAttribute("aria-valuenow")).toBe("40");
    expect(bar.getAttribute("aria-valuemin")).toBe("0");
    expect(bar.getAttribute("aria-valuemax")).toBe("100");
    expect(bar.getAttribute("aria-valuetext")).toBe("40%");
    expect(root.querySelector("[data-ouro-progress-label]")!.getBoundingClientRect().width).toBeGreaterThan(1);
    expect(filled(indicator, track)).toBeCloseTo(track.getBoundingClientRect().width * 0.4, 0);
  });

  it("scales the value between min and max", async () => {
    const { bar, indicator, track } = await render(<Progress label="Steps" value={3} min={0} max={4} showValue format={{ style: "decimal" }} />);
    expect(bar.querySelector("[data-ouro-progress-value]")!.textContent).toBe("3");
    expect(bar.getAttribute("aria-valuemax")).toBe("4");
    expect(filled(indicator, track)).toBeCloseTo(track.getBoundingClientRect().width * 0.75, 0);
  });

  it("shows the formatted value with showValue", async () => {
    const { root, rerender } = await render(<Progress label="Uploading" value={40} showValue />);
    expect(root.querySelector("[data-ouro-progress-value]")!.textContent).toBe("40%");
    await rerender(<Progress label="Uploading" value={null} showValue />);
    expect(root.querySelector("[data-ouro-progress-value]")).toBeNull();
  });

  it("hides the label visually with hideLabel, and keeps the name", async () => {
    const { root } = await render(<Progress label="Uploading" hideLabel value={10} />);
    await expect.element(page.getByRole("progressbar", { name: "Uploading" })).toBeInTheDocument();
    expect(root.querySelector("[data-ouro-progress-label]")!.parentElement!.getBoundingClientRect().width).toBeLessThanOrEqual(1);
  });

  it("is indeterminate with value={null}: no value, and a sliding bar", async () => {
    const { bar, indicator } = await render(<Progress label="Loading" value={null} />);
    expect(bar.hasAttribute("aria-valuenow")).toBe(false);
    expect(bar.hasAttribute("data-indeterminate")).toBe(true);
    expect(getComputedStyle(indicator).animationName).toBe("ouro-progress");
    await commands.emulateMedia({ reducedMotion: "reduce" });
    expect(getComputedStyle(indicator).animationName).toBe("ouro-pulse");
    expect(indicator.getBoundingClientRect().width).toBe(indicator.parentElement!.getBoundingClientRect().width);
  });

  it("says the bar is under way when indeterminate, in words you can translate with indeterminateText", async () => {
    const { bar, rerender } = await render(<Progress label="Loading" value={null} />);
    expect(bar.getAttribute("aria-valuetext")).toBe("Loading");
    await rerender(<Progress label="Chargement" value={null} indeterminateText="En cours" />);
    expect(bar.getAttribute("aria-valuetext")).toBe("En cours");
    await rerender(<Progress label="Chargement" value={40} indeterminateText="En cours" />);
    expect(bar.getAttribute("aria-valuetext")).toBe("40%");
  });

  it("keeps the bar full width and fills it by sliding, clamped between min and max", async () => {
    const { indicator, track, rerender } = await render(<Progress label="Uploading" value={150} />);
    expect(indicator.getBoundingClientRect().width).toBeCloseTo(track.getBoundingClientRect().width, 0);
    expect(filled(indicator, track)).toBeCloseTo(track.getBoundingClientRect().width, 0);
    await rerender(<Progress label="Uploading" value={-5} />);
    await expect.poll(() => filled(indicator, track)).toBeCloseTo(0, 0);
    expect(indicator.getBoundingClientRect().width).toBeCloseTo(track.getBoundingClientRect().width, 0);
  });

  it("animates a change in value only when motion is allowed", async () => {
    const { indicator } = await render(<Progress label="Uploading" value={20} />);
    expect(getComputedStyle(indicator).transitionProperty).toBe("translate");
    expect(getComputedStyle(indicator).transitionTimingFunction).toBe("cubic-bezier(0.23, 1, 0.32, 1)");
    await commands.emulateMedia({ reducedMotion: "reduce" });
    expect(getComputedStyle(indicator).transitionProperty).toBe("none");
  });

  it("fills with the tone's color, primary by default, on a quiet track", async () => {
    const color = async (tone?: ProgressProps["tone"]) =>
      getComputedStyle((await render(<Progress label="Tone" value={50} tone={tone} />)).indicator).backgroundColor;
    expect(await color()).toBe(themeColor("--primary"));
    expect(await color("secondary")).toBe(themeColor("--muted-foreground"));
    expect(await color("destructive")).toBe(themeColor("--destructive"));
    expect(await color("success")).toBe(themeColor("--success"));
    expect(await color("warning")).toBe(themeColor("--warning"));
    const { track } = await render(<Progress label="Track" value={50} />);
    expect(getComputedStyle(track).backgroundColor).not.toBe(themeColor("--background"));
  });

  it("keeps layout classes and passes ids through", async () => {
    const { root } = await render(<Progress label="Uploading" value={10} className="mt-4" id="upload" />);
    expect(root.classList.contains("mt-4")).toBe(true);
    expect(root.id).toBe("upload");
    expect(warnings()).toEqual([]);
  });

  it("wires the label the same on the server and in the browser", async () => {
    const node = <Progress label="Uploading" value={40} showValue />;
    const html = renderToString(node);
    const doc = new DOMParser().parseFromString(html, "text/html");
    const bar = doc.querySelector('[role="progressbar"]')!;
    expect(doc.getElementById(bar.getAttribute("aria-labelledby")!)!.textContent).toBe("Uploading");
    const host = document.createElement("div");
    host.innerHTML = html;
    document.body.append(host);
    mounted.push(host);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const recoverable = vi.fn();
    let root!: Root;
    await act(async () => {
      root = hydrateRoot(host, node, { onRecoverableError: recoverable });
    });
    roots.push(root);
    expect(recoverable).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    const live = host.querySelector('[role="progressbar"]')!;
    expect(host.querySelector(`#${CSS.escape(live.getAttribute("aria-labelledby")!)}`)!.textContent).toBe("Uploading");
  });

  it("warns, once each, for guessed props and appearance classes, and renders the defaults", async () => {
    const props = { indeterminate: true, isIndeterminate: true, variant: "determinate", color: "green", tone: "danger" } as unknown as ProgressProps;
    const { indicator } = await render(<Progress {...props} label="Uploading" value={50} className="bg-red-500" />);
    expect(getComputedStyle(indicator).backgroundColor).toBe(themeColor("--primary"));
    expect(warnings()).toEqual([
      '[ouro-ui] Progress: "bg-red-500" sets appearance, and className is for layout only. Fix: tone="destructive".',
      '[ouro-ui] Progress: tone="danger" is not a tone. Fix: <Progress tone="destructive">.',
      "[ouro-ui] Progress: indeterminate is not a prop. Fix: <Progress value={null}>.",
      "[ouro-ui] Progress: isIndeterminate is not a prop. Fix: <Progress value={null}>.",
      '[ouro-ui] Progress: variant is not a prop; a number value is determinate. Fix: <Progress value={40}>, or value={null} while unknown.',
      '[ouro-ui] Progress: color is not a prop. Fix: <Progress tone="success">.',
    ]);
  });
});
