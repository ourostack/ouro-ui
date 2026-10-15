import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import { commands, server, userEvent } from "vitest/browser";
import { Accordion } from "@/registry/ouro/components/ouro/accordion/accordion";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

declare module "vitest/browser" {
  interface BrowserCommands {
    recordAccordionObservation: (record: string) => Promise<void>;
  }
}

let root: Root | undefined;
let host: HTMLDivElement | undefined;

beforeEach(async () => {
  await commands.emulateMedia({ reducedMotion: "no-preference" });
});

afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
});

async function render() {
  host = document.createElement("div");
  host.style.width = "480px";
  host.style.padding = "24px";
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(
    <Accordion items={[{
      title: "Storage",
      content: <div data-proof-child="" style={{ height: 20, transition: "height 50ms linear" }}>Three days in the fridge.</div>,
    }]} />,
  ));
  const trigger = host.querySelector<HTMLButtonElement>("button[aria-expanded]")!;
  const panel = host.querySelector<HTMLElement>(`[id="${trigger.getAttribute("aria-controls")}"]`)!;
  const child = panel.querySelector<HTMLElement>("[data-proof-child]")!;
  return { trigger, panel, child };
}

it("observes real panel height motion after its active animation has already ended", async () => {
  const { trigger, panel } = await render();
  let heightStarted = false;
  let heightEnded = false;
  let oldObservation: boolean | undefined;
  const rows: Array<{ type: string; property: string; now: number; trusted: boolean }> = [];
  const record = (event: TransitionEvent) => {
    if (event.target === panel && event.propertyName === "height") heightStarted = true;
  };
  const native = (event: TransitionEvent) => {
    if (event.target !== panel || event.propertyName !== "height") return;
    rows.push({ type: event.type, property: event.propertyName, now: performance.now(), trusted: event.isTrusted });
    if (event.type === "transitionend") heightEnded = true;
  };
  panel.addEventListener("transitionrun", record);
  panel.addEventListener("transitionrun", native);
  panel.addEventListener("transitionend", native);
  try {
    await userEvent.click(trigger);
    await expect.poll(() => heightEnded).toBe(true);
    oldObservation = panel.getAnimations().some((animation) => (animation as CSSTransition).transitionProperty === "height");
    expect(oldObservation).toBe(false);
    expect(heightStarted).toBe(true);
    expect(rows.map((row) => row.type)).toEqual(["transitionrun", "transitionend"]);
    expect(rows.every((row) => row.trusted)).toBe(true);
    expect(panel.getBoundingClientRect().height).toBeCloseTo(panel.scrollHeight, 0);
  } finally {
    panel.removeEventListener("transitionrun", record);
    panel.removeEventListener("transitionrun", native);
    panel.removeEventListener("transitionend", native);
    await commands.recordAccordionObservation(JSON.stringify({
      browser: server.browser, scenario: "late-native-observation",
      oldObservation, heightStarted, heightEnded, rows,
      height: panel.getBoundingClientRect().height, scrollHeight: panel.scrollHeight,
    }));
  }
});

it("does not mistake a child's native height transition for panel height motion", async () => {
  const { trigger, panel, child } = await render();
  panel.style.setProperty("transition-property", "none", "important");
  let heightStarted = false;
  let childEnded = false;
  let childStarted = false;
  const record = (event: TransitionEvent) => {
    if (event.target === panel && event.propertyName === "height") heightStarted = true;
  };
  const native = (event: TransitionEvent) => {
    if (event.target !== child || event.propertyName !== "height") return;
    if (event.type === "transitionrun") childStarted = event.isTrusted;
    if (event.type === "transitionend") childEnded = event.isTrusted;
  };
  panel.addEventListener("transitionrun", record);
  panel.addEventListener("transitionrun", native);
  panel.addEventListener("transitionend", native);
  try {
    await userEvent.click(trigger);
    await expect.poll(() => panel.getBoundingClientRect().height).toBeGreaterThan(0);
    expect(getComputedStyle(panel).transitionProperty).toBe("none");
    expect(child.getBoundingClientRect().height).toBe(20);
    child.style.height = "40px";
    await expect.poll(() => childEnded).toBe(true);
    expect(childStarted).toBe(true);
    expect(heightStarted).toBe(false);
    expect(child.getBoundingClientRect().height).toBe(40);
  } finally {
    panel.removeEventListener("transitionrun", record);
    panel.removeEventListener("transitionrun", native);
    panel.removeEventListener("transitionend", native);
    await commands.recordAccordionObservation(JSON.stringify({
      browser: server.browser, scenario: "native-child-negative",
      heightStarted, childStarted, childEnded,
      panelTransition: getComputedStyle(panel).transitionProperty,
    }));
  }
});
