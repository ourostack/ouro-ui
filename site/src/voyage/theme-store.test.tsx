import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { previewTheme, storeTheme, useLiveClock, useSiteTheme } from "./theme-store";
import { THEME_KEY } from "../themes/prepaint";

// Live is the home page's default theme, and useLiveClock's minute timer repaints its sky CSS variables for as
// long as it is on. The sweep that screenshots a page twice in a row (states-sweep.ts) ran long enough for that
// timer to fire between a retake's two takes and catch an unrelated control's picture differ on the home page
// (ourostack/ouro-ui#2966, the same pattern #2917 fixed for the live-captions demo). Under navigator.webdriver
// the timer never starts, so nothing on the page repaints on its own while a sweep takes its pictures.

function Host({ live }: { live: boolean }) {
  useLiveClock(live);
  return null;
}

const roots: Root[] = [];
let mounted: Element[] = [];

function render(live: boolean): void {
  const host = document.createElement("div");
  document.body.append(host);
  mounted.push(host);
  const root = createRoot(host);
  roots.push(root);
  root.render(<Host live={live} />);
}

afterEach(async () => {
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  for (const node of mounted) node.remove();
  mounted = [];
  Object.defineProperty(navigator, "webdriver", { value: false, configurable: true });
});

describe("useLiveClock", () => {
  it("never schedules the minute tick where navigator.webdriver is true, so a sweep's two takes agree", async () => {
    Object.defineProperty(navigator, "webdriver", { value: true, configurable: true });
    const interval = vi.spyOn(window, "setInterval");
    try {
      await act(async () => render(true));
      expect(interval).not.toHaveBeenCalled();
    } finally {
      interval.mockRestore();
    }
  });

  it("schedules the minute tick for a person, where navigator.webdriver is false", async () => {
    Object.defineProperty(navigator, "webdriver", { value: false, configurable: true });
    const interval = vi.spyOn(window, "setInterval");
    try {
      await act(async () => render(true));
      expect(interval).toHaveBeenCalledWith(expect.any(Function), 60_000);
    } finally {
      interval.mockRestore();
    }
  });

  it("schedules no tick where live is false, whether or not navigator.webdriver is set", async () => {
    const interval = vi.spyOn(window, "setInterval");
    try {
      await act(async () => render(false));
      expect(interval).not.toHaveBeenCalled();
    } finally {
      interval.mockRestore();
    }
  });
});

function Reader({ seen }: { seen: (preset: string) => void }) {
  seen(useSiteTheme().preset);
  return null;
}

describe("previewTheme", () => {
  const html = document.documentElement;
  afterEach(() => {
    for (const name of ["data-theme", "data-preview-from", "data-live", "data-sky", "data-season", "data-weather"]) html.removeAttribute(name);
    document.getElementById("ouro-live")?.remove();
    localStorage.removeItem(THEME_KEY);
  });

  it("shows a look on the page without choosing it, and puts the choice back", async () => {
    html.setAttribute("data-theme", "abyss");
    const seen = vi.fn();
    const host = document.createElement("div");
    document.body.append(host);
    mounted.push(host);
    const root = createRoot(host);
    roots.push(root);
    await act(async () => root.render(<Reader seen={seen} />));
    await act(async () => previewTheme("brass"));
    expect(html.getAttribute("data-theme")).toBe("brass");
    expect(seen).toHaveBeenLastCalledWith("abyss");
    await act(async () => previewTheme("live"));
    expect(html.getAttribute("data-theme")).toBe("pearl");
    expect(html.hasAttribute("data-live")).toBe(true);
    await act(async () => previewTheme(null));
    expect(html.getAttribute("data-theme")).toBe("abyss");
    expect(html.hasAttribute("data-live")).toBe(false);
    expect(html.hasAttribute("data-preview-from")).toBe(false);
    expect(localStorage.getItem(THEME_KEY)).toBeNull();
    expect(seen).toHaveBeenLastCalledWith("abyss");
  });

  it("keeps the look previewed when it is chosen, and ends the preview", () => {
    html.setAttribute("data-theme", "abyss");
    previewTheme("brass");
    storeTheme({ preset: "brass" });
    expect(html.getAttribute("data-theme")).toBe("brass");
    expect(html.hasAttribute("data-preview-from")).toBe(false);
    previewTheme(null);
    expect(html.getAttribute("data-theme")).toBe("brass");
  });

  it("puts the choice back before any other change, such as light or dark", () => {
    html.setAttribute("data-theme", "abyss");
    previewTheme("brass");
    storeTheme({ mode: "dark" });
    expect(html.getAttribute("data-theme")).toBe("abyss");
    expect(html.classList.contains("dark")).toBe(true);
    html.classList.remove("dark");
  });
});
