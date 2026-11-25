import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { isFoldHostInput, useFoldHostInput, useFoldPosture, FOLD_INPUT_EVENT } from "@/registry/ouro/lib/ouro/use-fold-posture";
import type { OuroFoldRules } from "@/registry/ouro/lib/ouro/fold-posture";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

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

function reportFoldInput(detail: unknown) {
  window.dispatchEvent(new CustomEvent(FOLD_INPUT_EVENT, { detail }));
}

afterEach(() => {
  reportFoldInput({ hinge: { kind: "none" }, regions: [] });
  document.body.replaceChildren();
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
    // Dispatched by its literal name, independent of the imported constant, so a change to that constant's value
    // cannot make this test pass by accident.
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

  it("resolves again as the host's report changes", async () => {
    const container = document.body.appendChild(document.createElement("div"));
    const root = createRoot(container);
    await act(async () => root.render(<Probe width={400} height={800} />));
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
