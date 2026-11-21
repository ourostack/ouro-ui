import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { Accordion } from "@/registry/ouro/components/ouro/accordion/accordion";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Checkbox } from "@/registry/ouro/components/ouro/checkbox/checkbox";
import { CheckboxGroup } from "@/registry/ouro/components/ouro/checkbox/checkbox-group";
import { Menu } from "@/registry/ouro/components/ouro/menu/menu";
import { RadioGroup } from "@/registry/ouro/components/ouro/radio-group/radio-group";
import { ReactionBar } from "@/registry/ouro/components/ouro/reaction-bar/reaction-bar";
import { Reorderable } from "@/registry/ouro/components/ouro/reorderable/reorderable";
import { SegmentedControl } from "@/registry/ouro/components/ouro/segmented-control/segmented-control";
import { Select } from "@/registry/ouro/components/ouro/select/select";
import { Switch } from "@/registry/ouro/components/ouro/switch/switch";
import { Tabs } from "@/registry/ouro/components/ouro/tabs/tabs";
import { Toggle } from "@/registry/ouro/components/ouro/toggle/toggle";
import { ToggleGroup } from "@/registry/ouro/components/ouro/toggle/toggle-group";
import { Toolbar } from "@/registry/ouro/components/ouro/toolbar/toolbar";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { pressTab } from "@/registry/ouro/lib/ouro/testing/tab";

const roots: Root[] = [];
const hosts: Element[] = [];

async function render(node: ReactNode) {
  const host = document.createElement("div");
  host.style.padding = "40px";
  document.body.append(host);
  hosts.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
}

async function clear() {
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  hosts.splice(0).forEach((host) => host.remove());
}

afterEach(clear);

/** How a control is turned off: not at all, with `disabled`, or with `disabledReason`. */
type State = "on" | "disabled" | "reason";

const offProps = (state: State) => (state === "disabled" ? { disabled: true } : state === "reason" ? { disabledReason: "Not yet" } : {});

const noop = () => {};

/** The look of an element: opacity, cursor, colour, background and border. */
function look(el: HTMLElement) {
  const style = getComputedStyle(el);
  return [style.opacity, style.cursor, style.color, style.backgroundColor, style.borderColor].join(" ");
}

/**
 * What a reader sees of a control: its own look, the set of looks of the parts drawn inside it (a box, a track, a
 * label) and the opacity of every ancestor, so dimming on a wrapper counts too.
 */
async function snapshot(target: HTMLElement) {
  await expect.poll(() => target.getAnimations({ subtree: true }).length).toBe(0);
  const parts = [...target.querySelectorAll<HTMLElement>("*")].filter((el) => el.getClientRects().length > 0);
  const ancestors: string[] = [];
  for (let el = target.parentElement; el && el !== document.body; el = el.parentElement) ancestors.push(getComputedStyle(el).opacity);
  return {
    self: look(target),
    parts: [...new Set(parts.map(look))].sort(),
    ancestors: ancestors.join(" "),
  };
}

const byText = (selector: string, text: string) => [...document.querySelectorAll<HTMLElement>(selector)].find((el) => el.textContent?.includes(text))!;

type Case = {
  name: string;
  /** Renders the control in the given state. */
  node: (state: State) => ReactNode;
  /** The control element whose look is compared. */
  target: () => HTMLElement;
  /** Steps taken after rendering, before the look is read (a menu is opened by keyboard). */
  after?: () => Promise<void>;
};

const cases: Case[] = [
  ...(["solid", "soft", "outline", "plain"] as const).map((variant) => ({
    name: `Button ${variant}`,
    node: (state: State) => <Button variant={variant} {...offProps(state)}>Save</Button>,
    target: () => document.querySelector<HTMLElement>("button")!,
  })),
  {
    name: "Accordion item",
    node: (state) => (
      <Accordion items={[{ value: "a", title: "Storage", content: "Three days." }, { value: "b", title: "Freezing", content: "A month.", ...offProps(state) }]} />
    ),
    target: () => document.querySelectorAll<HTMLElement>("[data-ouro-part=trigger]")[1]!,
  },
  {
    name: "Checkbox",
    node: (state) => <Checkbox label="Basil" {...offProps(state)} />,
    target: () => document.querySelector<HTMLElement>('button[role="checkbox"]')!,
  },
  {
    name: "CheckboxGroup option",
    node: (state) => <CheckboxGroup legend="Herbs" options={[{ value: "b", label: "Basil", ...offProps(state) }]} />,
    target: () => document.querySelector<HTMLElement>('button[role="checkbox"]')!,
  },
  {
    name: "Menu item",
    node: (state) => (
      <Menu
        trigger={<Button>Edit</Button>}
        items={[{ label: "Cut", onClick: noop }, { label: "Paste", onClick: noop, ...offProps(state) }]}
      />
    ),
    after: async () => {
      await pressTab();
      await userEvent.keyboard("{Enter}");
      await expect.poll(() => document.querySelector('[role="menu"]')).not.toBeNull();
    },
    target: () => byText('[role="menuitem"]', "Paste"),
  },
  {
    name: "RadioGroup option",
    node: (state) => <RadioGroup legend="Size" options={[{ value: "a", label: "Small" }, { value: "b", label: "Large", ...offProps(state) }]} />,
    target: () => document.querySelectorAll<HTMLElement>('[role="radio"]')[1]!,
  },
  {
    name: "ReactionBar",
    node: (state) => (
      <ReactionBar reactions={[{ key: "like", label: "Like", emoji: "👍", count: 3 }]} quick={[{ key: "like", label: "Like", emoji: "👍" }]} onReact={noop} {...offProps(state)} />
    ),
    target: () => document.querySelector<HTMLElement>("button")!,
  },
  {
    name: "Reorderable handle",
    node: (state) => (
      <Reorderable label="Steps" items={[{ id: "sear", label: "Sear", content: "Sear" }, { id: "soften", label: "Soften", content: "Soften" }]} {...offProps(state)} />
    ),
    target: () => document.querySelector<HTMLElement>("[data-ouro-reorderable-handle]")!,
  },
  {
    name: "SegmentedControl item",
    node: (state) => (
      <SegmentedControl label="View" items={[{ value: "a", label: "List" }, { value: "b", label: "Map", ...offProps(state) }]} />
    ),
    target: () => document.querySelectorAll<HTMLElement>('[role="radio"]')[1]!,
  },
  {
    name: "Select",
    node: (state) => <Select label="Course" options={[{ value: "a", label: "Art" }]} {...offProps(state)} />,
    target: () => document.querySelector<HTMLElement>("[data-ouro-part=trigger]")!,
  },
  {
    name: "Switch",
    node: (state) => <Switch label="Wi-Fi" {...offProps(state)} />,
    target: () => document.querySelector<HTMLElement>('button[role="switch"]')!,
  },
  {
    name: "Tabs tab",
    node: (state) => (
      <Tabs label="Settings" items={[{ value: "a", label: "General", content: "General" }, { value: "b", label: "Sharing", content: "Sharing", ...offProps(state) }]} />
    ),
    target: () => document.querySelectorAll<HTMLElement>('[role="tab"]')[1]!,
  },
  {
    name: "Toggle",
    node: (state) => <Toggle label="Bold" {...offProps(state)} />,
    target: () => document.querySelector<HTMLElement>('button[data-ouro="toggle"]')!,
  },
  {
    name: "ToggleGroup item",
    node: (state) => <ToggleGroup label="Style" items={[{ value: "b", label: "Bold", ...offProps(state) }]} />,
    target: () => document.querySelector<HTMLElement>("button[data-ouro-toggle]")!,
  },
  {
    name: "Toolbar item",
    node: (state) => <Toolbar label="Edit" items={[{ label: "Cut" }, { label: "Paste", ...offProps(state) }]} />,
    target: () => byText('[data-ouro="toolbar"] button', "Paste"),
  },
];

describe("a control turned off by disabled looks different from one that is on", () => {
  it.each(cases)("$name", async ({ node, target, after }) => {
    await render(node("on"));
    await after?.();
    const on = await snapshot(target());
    await clear();
    await render(node("disabled"));
    await after?.();
    expect(await snapshot(target())).not.toEqual(on);
  });
});

describe("a control off with disabledReason looks as it does with disabled", () => {
  it.each(cases)("$name", async ({ node, target, after }) => {
    await render(node("disabled"));
    await after?.();
    const disabled = await snapshot(target());
    await clear();
    await render(node("reason"));
    await after?.();
    expect(await snapshot(target())).toEqual(disabled);
  });
});

describe("Button while loading keeps its own look", () => {
  it("is not dimmed, and keeps the progress cursor", async () => {
    await render(<Button loading>Save</Button>);
    const el = document.querySelector<HTMLElement>("button")!;
    expect(getComputedStyle(el).opacity).toBe("1");
    expect(getComputedStyle(el).cursor).toBe("progress");
  });
});
