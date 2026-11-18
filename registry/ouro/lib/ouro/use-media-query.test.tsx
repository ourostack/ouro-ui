import { createRoot } from "react-dom/client";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { page } from "vitest/browser";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useMediaQuery } from "@/registry/ouro/lib/ouro/use-media-query";
import { act } from "@/registry/ouro/lib/ouro/testing/act";


function Probe({ query = "(min-width: 640px)", serverDefault }: { query?: string; serverDefault: boolean }) {
  const matches = useMediaQuery(query, serverDefault);
  return <span data-testid="probe">{String(matches)}</span>;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe("useMediaQuery", () => {
  it("returns serverDefault from renderToString, whatever the viewport", async () => {
    await page.viewport(1000, 800);
    expect(renderToString(<Probe serverDefault={false} />)).toContain("false");
    expect(renderToString(<Probe serverDefault />)).toContain("true");
  });

  it("returns the live value on the client and follows viewport changes", async () => {
    await page.viewport(1000, 800);
    const container = document.body.appendChild(document.createElement("div"));
    const root = createRoot(container);
    await act(async () => root.render(<Probe serverDefault={false} />));
    expect(container.textContent).toBe("true");
    await page.viewport(400, 800);
    await vi.waitFor(() => expect(container.textContent).toBe("false"), { timeout: 10_000 });
    await page.viewport(1000, 800);
    await vi.waitFor(() => expect(container.textContent).toBe("true"), { timeout: 10_000 });
    await act(async () => root.unmount());
  });

  it("hydrates without a warning even when the server default differs", async () => {
    await page.viewport(400, 800);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const container = document.body.appendChild(document.createElement("div"));
    container.innerHTML = renderToString(<Probe serverDefault />);
    expect(container.textContent).toBe("true");
    await act(async () => {
      hydrateRoot(container, <Probe serverDefault />);
    });
    expect(container.textContent).toBe("false");
    expect(error).not.toHaveBeenCalled();
  });

  it("falls back to serverDefault where matchMedia is missing", async () => {
    vi.stubGlobal("matchMedia", undefined);
    const container = document.body.appendChild(document.createElement("div"));
    const root = createRoot(container);
    await act(async () => root.render(<Probe serverDefault />));
    expect(container.textContent).toBe("true");
    await act(async () => root.unmount());
  });

  it("switches subscription when the query changes", async () => {
    await page.viewport(1000, 800);
    const container = document.body.appendChild(document.createElement("div"));
    const root = createRoot(container);
    await act(async () => root.render(<Probe serverDefault={false} />));
    expect(container.textContent).toBe("true");
    await act(async () => root.render(<Probe query="(min-width: 5000px)" serverDefault />));
    expect(container.textContent).toBe("false");
    await act(async () => root.unmount());
  });

  it("calls matchMedia once for a query, however many components read it and however often they render", async () => {
    await page.viewport(1000, 800);
    // A query no other test asks, so no list for it is kept from before.
    const query = "(min-width: 641px)";
    const matchMedia = vi.spyOn(window, "matchMedia");
    const container = document.body.appendChild(document.createElement("div"));
    const root = createRoot(container);
    const probes = (n: number) => Array.from({ length: n }, (_, at) => <Probe key={at} query={query} serverDefault={false} />);
    await act(async () => root.render(<>{probes(5)}</>));
    await act(async () => root.render(<>{probes(8)}</>));
    expect(container.textContent).toBe("true".repeat(8));
    await page.viewport(400, 800);
    await vi.waitFor(() => expect(container.textContent).toBe("false".repeat(8)), { timeout: 10_000 });
    await act(async () => root.unmount());
    expect(matchMedia.mock.calls.filter(([asked]) => asked === query)).toHaveLength(1);
  });

  it("reads a matchMedia swapped in after the real one made a list for the same query, as a test's stub is", async () => {
    await page.viewport(1000, 800);
    const query = "(min-width: 642px)";
    const container = document.body.appendChild(document.createElement("div"));
    const root = createRoot(container);
    await act(async () => root.render(<Probe query={query} serverDefault={false} />));
    expect(container.textContent).toBe("true");
    await act(async () => root.unmount());
    vi.stubGlobal("matchMedia", (asked: string) => ({ matches: false, media: asked, addEventListener() {}, removeEventListener() {} }));
    const again = createRoot(container);
    await act(async () => again.render(<Probe query={query} serverDefault />));
    expect(container.textContent).toBe("false");
    await act(async () => again.unmount());
  });
});
