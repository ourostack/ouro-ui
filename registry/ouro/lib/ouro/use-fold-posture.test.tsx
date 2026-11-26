import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  foldInputFromSegments,
  isFoldHostInput,
  useFoldHostInput,
  useFoldPosture,
  useViewportSegments,
  FOLD_INPUT_EVENT,
} from "@/registry/ouro/lib/ouro/use-fold-posture";
import type { OuroFoldRules } from "@/registry/ouro/lib/ouro/fold-posture";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

const restoreSegments: Array<() => void> = [];

/** Stubs `window.visualViewport.segments` for the rest of the test, as the Viewport Segments API would report it. */
function stubSegments(segments: ReadonlyArray<{ x: number; y: number; width: number; height: number }> | undefined) {
  const viewport = window.visualViewport!;
  const own = Object.getOwnPropertyDescriptor(viewport, "segments");
  Object.defineProperty(viewport, "segments", { configurable: true, get: () => segments });
  restoreSegments.push(() => {
    if (own) Object.defineProperty(viewport, "segments", own);
    else delete (viewport as unknown as Record<string, unknown>).segments;
  });
}

function reportViewportResize() {
  window.visualViewport!.dispatchEvent(new Event("resize"));
}

function Probe({ width, height }: { width: number; height: number }) {
  const posture = useFoldPosture({ width, height });
  return <span data-testid="probe">{posture.kind}</span>;
}

function RulesProbe({ width, height, rules }: { width: number; height: number; rules: OuroFoldRules }) {
  const posture = useFoldPosture({ width, height }, rules);
  return <span data-testid="probe">{posture.kind}</span>;
}

function HostInputProbe() {
  const input = useFoldHostInput();
  return <span data-testid="probe">{input === null ? "none" : input.hinge.kind}</span>;
}

function SegmentsProbe() {
  const segments = useViewportSegments();
  return <span data-testid="probe">{segments === undefined ? "none" : String(segments.length)}</span>;
}

function reportFoldInput(detail: unknown) {
  window.dispatchEvent(new CustomEvent(FOLD_INPUT_EVENT, { detail }));
}

afterEach(() => {
  reportFoldInput({ hinge: { kind: "none" }, regions: [] });
  document.body.replaceChildren();
  for (const undo of restoreSegments.splice(0).reverse()) undo();
});

describe("isFoldHostInput", () => {
  it.each([
    ["not an object", "a string"],
    ["null", null],
    ["a number", 42],
  ])("rejects a detail that is %s", (_label, detail) => {
    expect(isFoldHostInput(detail)).toBe(false);
  });

  it.each([
    ["none", { kind: "none" }],
    ["closed", { kind: "closed" }],
    ["fullyOpen", { kind: "fullyOpen" }],
    ["partiallyOpen with a numeric angle", { kind: "partiallyOpen", angleDegrees: 100 }],
  ])("accepts a hinge of kind %s", (_label, hinge) => {
    expect(isFoldHostInput({ hinge, regions: [] })).toBe(true);
  });

  it.each([
    ["not an object", "sideways"],
    ["null", null],
    ["an unknown kind", { kind: "sideways" }],
    ["partiallyOpen missing its angle", { kind: "partiallyOpen" }],
    ["partiallyOpen with a non-numeric angle", { kind: "partiallyOpen", angleDegrees: "100" }],
    ["an object with no kind", {}],
  ])("rejects a hinge that is %s", (_label, hinge) => {
    expect(isFoldHostInput({ hinge, regions: [] })).toBe(false);
  });

  it("accepts an empty regions array", () => {
    expect(isFoldHostInput({ hinge: { kind: "none" }, regions: [] })).toBe(true);
  });

  it("accepts a region whose frame has every numeric field and a boolean isActive", () => {
    const region = { frame: { x: 0, y: 1, width: 2, height: 3 }, isActive: true };
    expect(isFoldHostInput({ hinge: { kind: "none" }, regions: [region] })).toBe(true);
  });

  it("rejects when regions is not an array", () => {
    expect(isFoldHostInput({ hinge: { kind: "none" }, regions: "not an array" })).toBe(false);
  });

  it.each([
    ["not an object", "a string"],
    ["null", null],
    ["isActive missing", { frame: { x: 0, y: 0, width: 1, height: 1 } }],
    ["isActive not a boolean", { frame: { x: 0, y: 0, width: 1, height: 1 }, isActive: "yes" }],
    ["frame null", { frame: null, isActive: true }],
    ["frame not an object", { frame: "flat", isActive: true }],
    ["frame.x not a number", { frame: { x: "0", y: 0, width: 1, height: 1 }, isActive: true }],
    ["frame.y not a number", { frame: { x: 0, y: "0", width: 1, height: 1 }, isActive: true }],
    ["frame.width not a number", { frame: { x: 0, y: 0, width: "1", height: 1 }, isActive: true }],
    ["frame.height not a number", { frame: { x: 0, y: 0, width: 1, height: "1" }, isActive: true }],
  ])("rejects a region that is %s", (_label, region) => {
    expect(isFoldHostInput({ hinge: { kind: "none" }, regions: [region] })).toBe(false);
  });

  it("rejects the whole report when any one region in the list is malformed", () => {
    const good = { frame: { x: 0, y: 0, width: 1, height: 1 }, isActive: true };
    const bad = { frame: null, isActive: true };
    expect(isFoldHostInput({ hinge: { kind: "none" }, regions: [good, bad] })).toBe(false);
  });

  it("rejects a region whose frame is a function carrying numeric x, y, width and height properties", () => {
    // A function is neither an object (by typeof) nor null, so only the "is this an object" check rejects it;
    // proof that check runs, not just the null check, since a function can carry arbitrary own properties that
    // would otherwise read as a well-formed frame once destructured.
    const frame = Object.assign(() => {}, { x: 0, y: 0, width: 1, height: 1 });
    expect(isFoldHostInput({ hinge: { kind: "none" }, regions: [{ frame, isActive: true }] })).toBe(false);
  });

  it("rejects a detail that is a function carrying hinge and regions properties", () => {
    // Same proof as the frame case above, one level up: a function is neither an object nor null, so only the
    // "is this an object" check rejects it, even though it can carry a well-formed hinge and regions.
    const detail = Object.assign(() => {}, { hinge: { kind: "none" }, regions: [] });
    expect(isFoldHostInput(detail)).toBe(false);
  });

  it("rejects a hinge that is a function carrying a well-formed kind", () => {
    // Same proof as the detail and frame cases above, for isFoldHinge's own "is this an object" check: a
    // function is neither an object nor null, so only that check rejects it, even though it can carry a kind
    // that would otherwise read as well-formed once destructured.
    const hinge = Object.assign(() => {}, { kind: "none" });
    expect(isFoldHostInput({ hinge, regions: [] })).toBe(false);
  });

  it("rejects a region that is a function carrying a well-formed frame and isActive", () => {
    // Same proof again, for isFoldRegion's own "is this an object" check on the region itself, as distinct
    // from the nested check on its frame covered above.
    const region = Object.assign(() => {}, { frame: { x: 0, y: 0, width: 1, height: 1 }, isActive: true });
    expect(isFoldHostInput({ hinge: { kind: "none" }, regions: [region] })).toBe(false);
  });

  it("rejects a hinge with an unknown kind even when it also carries a numeric angleDegrees", () => {
    // Proves the kind check runs before the partiallyOpen/angleDegrees check: a numeric angleDegrees alone
    // isn't enough to accept a hinge whose kind isn't "partiallyOpen".
    expect(isFoldHostInput({ hinge: { kind: "sideways", angleDegrees: 100 }, regions: [] })).toBe(false);
  });
});

describe("useFoldPosture before any host has ever reported", () => {
  // No earlier test in this file ever mounts a component (every test above only calls the pure isFoldHostInput
  // directly), so the module's one host-input record is still genuinely null here, not just reset to a
  // none/empty shape: the only place in the whole file that exercises the hinge and regions fallbacks for real.
  it("resolves to single on the no-rules branch", async () => {
    const container = document.body.appendChild(document.createElement("div"));
    const root = createRoot(container);
    await act(async () => root.render(<Probe width={400} height={800} />));
    expect(container.textContent).toBe("single");
    await act(async () => root.unmount());
  });

  it("resolves to single on the with-rules branch", async () => {
    const container = document.body.appendChild(document.createElement("div"));
    const root = createRoot(container);
    await act(async () => root.render(<RulesProbe width={400} height={800} rules={{ minimumPaneLength: 260, foldMargin: 24, tabletopAngles: [60, 150] }} />));
    expect(container.textContent).toBe("single");
    await act(async () => root.unmount());
  });
});

describe("useFoldHostInput", () => {
  it("reads null until a host reports a fold input", async () => {
    const container = document.body.appendChild(document.createElement("div"));
    const root = createRoot(container);
    reportFoldInput({ hinge: { kind: "none" }, regions: [] });
    await act(async () => root.render(<HostInputProbe />));
    // A prior test's report lands on this one, since the module keeps one host input for the whole page: start from "none".
    expect(container.textContent).toBe("none");
    await act(async () => reportFoldInput({ hinge: { kind: "fullyOpen" }, regions: [] }));
    expect(container.textContent).toBe("fullyOpen");
    await act(async () => root.unmount());
  });

  it("drops a malformed event's detail, keeping the last valid report", async () => {
    const container = document.body.appendChild(document.createElement("div"));
    const root = createRoot(container);
    await act(async () => root.render(<HostInputProbe />));
    await act(async () => reportFoldInput({ hinge: { kind: "fullyOpen" }, regions: [] }));
    expect(container.textContent).toBe("fullyOpen");
    await act(async () => reportFoldInput({ hinge: { kind: "sideways" }, regions: [] }));
    expect(container.textContent).toBe("fullyOpen");
    await act(async () => root.unmount());
  });

  it("listens on the event's own name, not whatever FOLD_INPUT_EVENT happens to hold", async () => {
    const container = document.body.appendChild(document.createElement("div"));
    const root = createRoot(container);
    await act(async () => root.render(<HostInputProbe />));
    // Reset through the real constant first, so a leaked report from an earlier test cannot already read
    // "fullyOpen" by coincidence once this test's own dispatch below is checked.
    await act(async () => reportFoldInput({ hinge: { kind: "none" }, regions: [] }));
    expect(container.textContent).toBe("none");
    // Dispatched by its literal name, independent of the imported constant: if the constant's own value were
    // wrong, the listener would subscribe to that wrong name and this dispatch would silently do nothing,
    // leaving the "none" set above in place instead of advancing to "fullyOpen".
    await act(
      async () =>
        void window.dispatchEvent(new CustomEvent("ouro-fold-input", { detail: { hinge: { kind: "fullyOpen" }, regions: [] } })),
    );
    expect(container.textContent).toBe("fullyOpen");
    await act(async () => root.unmount());
  });

  it("subscribes once on mount and unsubscribes once on unmount", async () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const container = document.body.appendChild(document.createElement("div"));
    const root = createRoot(container);
    await act(async () => root.render(<HostInputProbe />));
    expect(addSpy).toHaveBeenCalledWith(FOLD_INPUT_EVENT, expect.any(Function));
    const [, listener] = addSpy.mock.calls.find(([type]) => type === FOLD_INPUT_EVENT)!;
    await act(async () => root.unmount());
    expect(removeSpy).toHaveBeenCalledWith(FOLD_INPUT_EVENT, listener);
    addSpy.mockRestore();
    removeSpy.mockRestore();
  });
});

describe("useFoldPosture", () => {
  it("resolves to single with no host input", async () => {
    const container = document.body.appendChild(document.createElement("div"));
    const root = createRoot(container);
    await act(async () => root.render(<Probe width={400} height={800} />));
    expect(container.textContent).toBe("single");
    await act(async () => root.unmount());
  });

  it("picks up the host's hinge over the fallback, once one is reported, on the no-rules branch", async () => {
    // Isolates the hinge fallback from the regions one: an inactive region only splits the screen when the
    // hinge is bent, so a "tabletop" result here can only come from the real reported hinge reaching
    // resolveFoldPosture, not the { kind: "none" } fallback (which is never bent).
    const container = document.body.appendChild(document.createElement("div"));
    const root = createRoot(container);
    await act(async () => root.render(<Probe width={400} height={800} />));
    // A prior test's report lands on this one: start from an empty report, taken only once this probe's
    // listener is attached, so the leftover state below is the only one a later test can inherit.
    await act(async () => reportFoldInput({ hinge: { kind: "none" }, regions: [] }));
    await act(async () =>
      reportFoldInput({
        hinge: { kind: "partiallyOpen", angleDegrees: 100 },
        regions: [{ frame: { x: 0, y: 390, width: 400, height: 20 }, isActive: false }],
      }),
    );
    expect(container.textContent).toBe("tabletop");
    await act(async () => root.unmount());
  });

  it("picks up the host's regions over the fallback, once some are reported, on the no-rules branch", async () => {
    // Isolates the regions fallback from the hinge one: with a hinge that is never bent, only an active region
    // the real report carries can split the screen, so "tabletop" here can only come from the real regions
    // reaching resolveFoldPosture, not the [] fallback.
    const container = document.body.appendChild(document.createElement("div"));
    const root = createRoot(container);
    await act(async () => root.render(<Probe width={400} height={800} />));
    await act(async () => reportFoldInput({ hinge: { kind: "none" }, regions: [] }));
    await act(async () =>
      reportFoldInput({
        hinge: { kind: "none" },
        regions: [{ frame: { x: 0, y: 390, width: 400, height: 20 }, isActive: true }],
      }),
    );
    expect(container.textContent).toBe("tabletop");
    await act(async () => root.unmount());
  });

  it("resolves again as the host's report changes", async () => {
    const container = document.body.appendChild(document.createElement("div"));
    const root = createRoot(container);
    await act(async () => root.render(<Probe width={400} height={800} />));
    // A prior test's report lands on this one: start from an empty report, taken only once this probe's
    // listener is attached.
    await act(async () => reportFoldInput({ hinge: { kind: "none" }, regions: [] }));
    expect(container.textContent).toBe("single");
    await act(async () =>
      reportFoldInput({
        hinge: { kind: "partiallyOpen", angleDegrees: 100 },
        regions: [{ frame: { x: 0, y: 390, width: 400, height: 20 }, isActive: true }],
      }),
    );
    expect(container.textContent).toBe("tabletop");
    await act(async () => root.unmount());
  });

  it("resolves to single with no host input, passing custom rules through", async () => {
    const rules: OuroFoldRules = { minimumPaneLength: 260, foldMargin: 24, tabletopAngles: [60, 150] };
    const container = document.body.appendChild(document.createElement("div"));
    const root = createRoot(container);
    await act(async () => root.render(<RulesProbe width={400} height={800} rules={rules} />));
    // A prior test's report lands on this one, since the module keeps one host input for the whole page: start
    // from an empty report, taken only once this probe's listener is attached.
    await act(async () => reportFoldInput({ hinge: { kind: "none" }, regions: [] }));
    expect(container.textContent).toBe("single");
    await act(async () => root.unmount());
  });

  it("picks up the host's hinge over the fallback, once one is reported, on the custom-rules branch", async () => {
    // Same proof as the no-rules hinge test above, with a rules argument supplied, so it exercises the other of
    // the two duplicated hinge-and-regions object literals.
    const rules: OuroFoldRules = { minimumPaneLength: 260, foldMargin: 24, tabletopAngles: [60, 150] };
    const container = document.body.appendChild(document.createElement("div"));
    const root = createRoot(container);
    await act(async () => root.render(<RulesProbe width={400} height={800} rules={rules} />));
    await act(async () => reportFoldInput({ hinge: { kind: "none" }, regions: [] }));
    await act(async () =>
      reportFoldInput({
        hinge: { kind: "partiallyOpen", angleDegrees: 100 },
        regions: [{ frame: { x: 0, y: 390, width: 400, height: 20 }, isActive: false }],
      }),
    );
    expect(container.textContent).toBe("tabletop");
    await act(async () => root.unmount());
  });

  it("picks up the host's regions over the fallback, once some are reported, on the custom-rules branch", async () => {
    // Same proof as the no-rules regions test above, with a rules argument supplied, so it exercises the other
    // of the two duplicated hinge-and-regions object literals.
    const rules: OuroFoldRules = { minimumPaneLength: 260, foldMargin: 24, tabletopAngles: [60, 150] };
    const container = document.body.appendChild(document.createElement("div"));
    const root = createRoot(container);
    await act(async () => root.render(<RulesProbe width={400} height={800} rules={rules} />));
    await act(async () => reportFoldInput({ hinge: { kind: "none" }, regions: [] }));
    await act(async () =>
      reportFoldInput({
        hinge: { kind: "none" },
        regions: [{ frame: { x: 0, y: 390, width: 400, height: 20 }, isActive: true }],
      }),
    );
    expect(container.textContent).toBe("tabletop");
    await act(async () => root.unmount());
  });

  it("uses the custom rules it is given, not the standard ones, for a reported fold", async () => {
    // A minimumPaneLength taller than either pane the fold below would leave forces resolveFoldPosture's split()
    // to fail, falling back to "single" where the standard rules (minimumPaneLength: 260) give "tabletop": proof
    // the rules argument reaches resolveFoldPosture, not just a hardcoded default.
    const rules: OuroFoldRules = { minimumPaneLength: 1000, foldMargin: 24, tabletopAngles: [60, 150] };
    const container = document.body.appendChild(document.createElement("div"));
    const root = createRoot(container);
    await act(async () => root.render(<RulesProbe width={400} height={800} rules={rules} />));
    await act(async () => reportFoldInput({ hinge: { kind: "none" }, regions: [] }));
    expect(container.textContent).toBe("single");
    await act(async () =>
      reportFoldInput({
        hinge: { kind: "partiallyOpen", angleDegrees: 100 },
        regions: [{ frame: { x: 0, y: 390, width: 400, height: 20 }, isActive: true }],
      }),
    );
    expect(container.textContent).toBe("single");
    await act(async () => root.unmount());
  });
});

describe("foldInputFromSegments", () => {
  it("returns null with no segments reported", () => {
    expect(foldInputFromSegments(undefined)).toBeNull();
  });

  it("returns null with only one segment (no fold to report)", () => {
    expect(foldInputFromSegments([{ x: 0, y: 0, width: 800, height: 800 }])).toBeNull();
  });

  it("returns null with three segments, which it has no pairing rule for", () => {
    expect(
      foldInputFromSegments([
        { x: 0, y: 0, width: 200, height: 800 },
        { x: 220, y: 0, width: 200, height: 800 },
        { x: 440, y: 0, width: 200, height: 800 },
      ]),
    ).toBeNull();
  });

  it("returns null for two segments that share neither a row nor a column", () => {
    expect(
      foldInputFromSegments([
        { x: 0, y: 0, width: 200, height: 200 },
        { x: 220, y: 220, width: 200, height: 200 },
      ]),
    ).toBeNull();
  });

  it("turns two side-by-side segments into a fullyOpen hinge with the vertical gap between them as the region", () => {
    expect(
      foldInputFromSegments([
        { x: 0, y: 0, width: 400, height: 800 },
        { x: 420, y: 0, width: 400, height: 800 },
      ]),
    ).toEqual({
      hinge: { kind: "fullyOpen" },
      regions: [{ frame: { x: 400, y: 0, width: 20, height: 800 }, isActive: true }],
    });
  });

  it("turns two stacked segments into a fullyOpen hinge with the horizontal gap between them as the region", () => {
    expect(
      foldInputFromSegments([
        { x: 0, y: 0, width: 800, height: 390 },
        { x: 0, y: 410, width: 800, height: 390 },
      ]),
    ).toEqual({
      hinge: { kind: "fullyOpen" },
      regions: [{ frame: { x: 0, y: 390, width: 800, height: 20 }, isActive: true }],
    });
  });

  it("pairs two side-by-side segments regardless of the order they're reported in", () => {
    expect(
      foldInputFromSegments([
        { x: 420, y: 0, width: 400, height: 800 },
        { x: 0, y: 0, width: 400, height: 800 },
      ]),
    ).toEqual({
      hinge: { kind: "fullyOpen" },
      regions: [{ frame: { x: 400, y: 0, width: 20, height: 800 }, isActive: true }],
    });
  });

  it("folds between two side-by-side segments that touch, off the top edge", () => {
    expect(
      foldInputFromSegments([
        { x: 0, y: 100, width: 400, height: 600 },
        { x: 400, y: 100, width: 400, height: 600 },
      ]),
    ).toEqual({ hinge: { kind: "fullyOpen" }, regions: [{ frame: { x: 400, y: 100, width: 0, height: 600 }, isActive: true }] });
  });

  it("folds between two stacked segments that touch, off the left edge", () => {
    expect(
      foldInputFromSegments([
        { x: 100, y: 0, width: 600, height: 400 },
        { x: 100, y: 400, width: 600, height: 400 },
      ]),
    ).toEqual({ hinge: { kind: "fullyOpen" }, regions: [{ frame: { x: 100, y: 400, width: 600, height: 0 }, isActive: true }] });
  });

  it.each([
    ["side by side, a pixel apart in top edge", [{ x: 0, y: 0, width: 400, height: 800 }, { x: 420, y: 1, width: 400, height: 800 }]],
    ["side by side, a pixel apart in height", [{ x: 0, y: 0, width: 400, height: 800 }, { x: 420, y: 0, width: 400, height: 799 }]],
    ["side by side, overlapping", [{ x: 0, y: 0, width: 400, height: 800 }, { x: 300, y: 0, width: 400, height: 800 }]],
    ["stacked, a pixel apart in left edge", [{ x: 0, y: 0, width: 800, height: 390 }, { x: 1, y: 410, width: 800, height: 390 }]],
    ["stacked, a pixel apart in width", [{ x: 0, y: 0, width: 800, height: 390 }, { x: 0, y: 410, width: 799, height: 390 }]],
    ["stacked, overlapping", [{ x: 0, y: 0, width: 800, height: 390 }, { x: 0, y: 300, width: 800, height: 390 }]],
  ])("returns null for two segments %s", (_, segments) => {
    expect(foldInputFromSegments(segments)).toBeNull();
  });
});

describe("useViewportSegments", () => {
  it("reads undefined where the browser reports no segments", async () => {
    const container = document.body.appendChild(document.createElement("div"));
    const root = createRoot(container);
    await act(async () => root.render(<SegmentsProbe />));
    expect(container.textContent).toBe("none");
    await act(async () => root.unmount());
  });

  it("reads the segments the browser reports, and again as they change", async () => {
    const container = document.body.appendChild(document.createElement("div"));
    const root = createRoot(container);
    await act(async () => root.render(<SegmentsProbe />));
    expect(container.textContent).toBe("none");
    stubSegments([
      { x: 0, y: 0, width: 400, height: 800 },
      { x: 420, y: 0, width: 400, height: 800 },
    ]);
    await act(reportViewportResize);
    expect(container.textContent).toBe("2");
    await act(async () => root.unmount());
  });

  it("reads undefined, and subscribes to nothing, where the browser has no visualViewport", async () => {
    const own = Object.getOwnPropertyDescriptor(window, "visualViewport");
    Object.defineProperty(window, "visualViewport", { configurable: true, get: () => null });
    restoreSegments.push(() => {
      if (own) Object.defineProperty(window, "visualViewport", own);
      else delete (window as unknown as Record<string, unknown>).visualViewport;
    });
    const container = document.body.appendChild(document.createElement("div"));
    const root = createRoot(container);
    await act(async () => root.render(<SegmentsProbe />));
    expect(container.textContent).toBe("none");
    await act(async () => root.unmount());
  });

  it("subscribes to the visual viewport's resize event once on mount and unsubscribes once on unmount", async () => {
    const viewport = window.visualViewport!;
    const addSpy = vi.spyOn(viewport, "addEventListener");
    const removeSpy = vi.spyOn(viewport, "removeEventListener");
    const container = document.body.appendChild(document.createElement("div"));
    const root = createRoot(container);
    await act(async () => root.render(<SegmentsProbe />));
    expect(addSpy).toHaveBeenCalledWith("resize", expect.any(Function));
    const [, listener] = addSpy.mock.calls.find(([type]) => type === "resize")!;
    await act(async () => root.unmount());
    expect(removeSpy).toHaveBeenCalledWith("resize", listener);
    addSpy.mockRestore();
    removeSpy.mockRestore();
  });
});

describe("useFoldPosture reads the Viewport Segments API ahead of a native host's report", () => {
  it("resolves a book posture from reported segments, with no native host reporting anything", async () => {
    const container = document.body.appendChild(document.createElement("div"));
    const root = createRoot(container);
    await act(async () => root.render(<Probe width={820} height={800} />));
    expect(container.textContent).toBe("single");
    stubSegments([
      { x: 0, y: 0, width: 400, height: 800 },
      { x: 420, y: 0, width: 400, height: 800 },
    ]);
    await act(reportViewportResize);
    expect(container.textContent).toBe("book");
    await act(async () => root.unmount());
  });

  it("prefers the segments it reads over whatever a native host has reported", async () => {
    // A native host reporting fullyOpen with no regions would resolve to single on its own (no region to
    // split on); if the segments-derived region reached resolveFoldPosture too, the result is book instead.
    const container = document.body.appendChild(document.createElement("div"));
    const root = createRoot(container);
    await act(async () => root.render(<Probe width={820} height={800} />));
    await act(async () => reportFoldInput({ hinge: { kind: "fullyOpen" }, regions: [] }));
    expect(container.textContent).toBe("single");
    stubSegments([
      { x: 0, y: 0, width: 400, height: 800 },
      { x: 420, y: 0, width: 400, height: 800 },
    ]);
    await act(reportViewportResize);
    expect(container.textContent).toBe("book");
    await act(async () => root.unmount());
  });

  it("falls back to the native host's report once the browser stops reporting segments", async () => {
    const container = document.body.appendChild(document.createElement("div"));
    const root = createRoot(container);
    await act(async () => root.render(<Probe width={800} height={820} />));
    stubSegments([
      { x: 0, y: 0, width: 800, height: 390 },
      { x: 0, y: 410, width: 800, height: 390 },
    ]);
    await act(reportViewportResize);
    expect(container.textContent).toBe("tabletop");
    stubSegments(undefined);
    await act(reportViewportResize);
    expect(container.textContent).toBe("single");
    await act(async () =>
      reportFoldInput({
        hinge: { kind: "partiallyOpen", angleDegrees: 100 },
        regions: [{ frame: { x: 0, y: 400, width: 800, height: 20 }, isActive: true }],
      }),
    );
    expect(container.textContent).toBe("tabletop");
    await act(async () => root.unmount());
  });
});
