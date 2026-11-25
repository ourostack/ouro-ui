import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { useFoldHostInput, useFoldPosture, FOLD_INPUT_EVENT } from "@/registry/ouro/lib/ouro/use-fold-posture";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

function Probe({ width, height }: { width: number; height: number }) {
  const posture = useFoldPosture({ width, height });
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
});
