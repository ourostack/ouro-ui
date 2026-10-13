import { createContext, createElement, isValidElement, type ComponentType, type ReactElement, type ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Avatar, AvatarGroup } from "@/registry/ouro/components/ouro/avatar/avatar";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Carousel } from "@/registry/ouro/components/ouro/carousel/carousel";
import { Chart } from "@/registry/ouro/components/ouro/chart/chart";
import { ShowMore } from "@/registry/ouro/components/ouro/collapsible/show-more";
import { Command } from "@/registry/ouro/components/ouro/command/command";
import { ConfirmDialog } from "@/registry/ouro/components/ouro/dialog/confirm-dialog";
import { Dialog } from "@/registry/ouro/components/ouro/dialog/dialog";
import { HoverCard } from "@/registry/ouro/components/ouro/hover-card/hover-card";
import { Item } from "@/registry/ouro/components/ouro/item/item";
import { ItemGroup } from "@/registry/ouro/components/ouro/item/item-group";
import { Menu } from "@/registry/ouro/components/ouro/menu/menu";
import { Message } from "@/registry/ouro/components/ouro/message/message";
import { MessageList } from "@/registry/ouro/components/ouro/message/message-list";
import { Popover } from "@/registry/ouro/components/ouro/popover/popover";
import { Resizable, ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/registry/ouro/components/ouro/resizable/resizable";
import { Select } from "@/registry/ouro/components/ouro/select/select";
import { SelectGroup, SelectItem } from "@/registry/ouro/components/ouro/select/select-parts";
import { Sheet } from "@/registry/ouro/components/ouro/sheet/sheet";
import { Tooltip } from "@/registry/ouro/components/ouro/tooltip/tooltip";

// Every component that reads, copies or sorts an element it was given (a trigger, a render
// prop or its children) must handle what React's Flight client hands a client component in
// place of an element a Server Component passed (https://github.com/facebook/react/issues/32392):
// - "wrapped": a lazy wrapper around the element, with no `type`, `props` or `key`;
// - "lazy type": the element itself, whose `type` is a lazy reference to the client component
//   and never the component, which is what a Next.js build sends for `<SelectItem>` or `<Button>`;
// - "both": a lazy wrapper around an element with a lazy type.
// Each case renders on the server with plain elements and in each of those shapes, and all
// must give the same HTML.

type Wrap = <T extends ReactNode>(element: T) => T;

const lazy = (value: unknown) => ({ $$typeof: Symbol.for("react.lazy"), _payload: value, _init: (payload: unknown) => payload });
const plain: Wrap = (element) => element;
const wrapped: Wrap = (element) => lazy(element) as unknown as typeof element;
const lazyType: Wrap = (element) => {
  // A host element (`<p>`, `<a>`) keeps its tag; only a component is sent as a reference.
  if (!isValidElement(element) || typeof element.type === "string") return element;
  return createElement(lazy(element.type) as unknown as ComponentType, { ...(element.props as object), key: element.key ?? undefined }) as typeof element;
};
const both: Wrap = (element) => wrapped(lazyType(element));

/** A plot Chart hands its data to, in place of a recharts chart. */
function Plot({ data }: { data?: unknown }) {
  return <output>{JSON.stringify(data)}</output>;
}
const rows = [{ month: "January", cooked: 12 }];
const noop = () => {};

const cases: Array<[string, (wrap: Wrap) => ReactElement]> = [
  ["Dialog trigger", (wrap) => <Dialog title="t" trigger={wrap(<Button>Open</Button>)}>x</Dialog>],
  ["Command trigger", (wrap) => <Command title="t" trigger={wrap(<Button>Search</Button>)} items={[{ label: "New", onSelect: noop }]} />],
  ["ConfirmDialog trigger", (wrap) => <ConfirmDialog title="t" confirmLabel="Delete" onConfirm={noop} trigger={wrap(<Button>Delete</Button>)} />],
  ["Sheet trigger", (wrap) => <Sheet title="t" trigger={wrap(<Button>Open</Button>)}>x</Sheet>],
  ["Popover trigger", (wrap) => <Popover title="t" trigger={wrap(<Button>Open</Button>)}>x</Popover>],
  ["HoverCard trigger", (wrap) => <HoverCard trigger={wrap(<a href="/cooks/ari">Ari</a>)}>Preview</HoverCard>],
  ["Tooltip child", (wrap) => <Tooltip content="Add">{wrap(<Button>Add</Button>)}</Tooltip>],
  ["Menu trigger", (wrap) => <Menu trigger={wrap(<Button>Actions</Button>)} items={[{ label: "Open", href: "/open" }]} />],
  ["Menu contextTrigger", (wrap) => <Menu contextTrigger={wrap(<div>Right-click here</div>)} items={[{ label: "Open", href: "/open" }]} />],
  [
    "Chart plot child",
    (wrap) => (
      <Chart title="Cooking" data={rows} categoryKey="month" config={{ month: { label: "Month" }, cooked: { label: "Cooked" } }}>
        {wrap(<Plot />)}
      </Chart>
    ),
  ],
  [
    "ItemGroup rows",
    (wrap) => (
      <ItemGroup label="Recipes">
        {wrap(<Item title="Pasta" />)}
        {wrap(<Item title="Salad" />)}
      </ItemGroup>
    ),
  ],
  [
    "AvatarGroup avatars",
    (wrap) => (
      <AvatarGroup label="Cooks" max={1}>
        {wrap(<Avatar name="Ada Lovelace" />)}
        {wrap(<Avatar name="Grace Hopper" />)}
      </AvatarGroup>
    ),
  ],
  [
    "MessageList messages",
    (wrap) => (
      <MessageList label="Conversation">
        {wrap(
          <Message role="user" name="Ada">
            Question
          </Message>,
        )}
      </MessageList>
    ),
  ],
  [
    "Carousel slides",
    (wrap) => (
      <Carousel label="Photos">
        {wrap(<p>Shakshuka</p>)}
        {wrap(<p>Short ribs</p>)}
      </Carousel>
    ),
  ],
  [
    "Resizable panels",
    (wrap) => (
      <Resizable>
        {wrap(
          <ResizablePanel label="Files" defaultSize={30}>
            Files
          </ResizablePanel>,
        )}
        {wrap(<ResizablePanel label="Editor">Editor</ResizablePanel>)}
      </Resizable>
    ),
  ],
  [
    "ResizablePanelGroup panels and handle",
    (wrap) => (
      <ResizablePanelGroup orientation="vertical">
        {wrap(<ResizablePanel label="Preview">Preview</ResizablePanel>)}
        {wrap(<ResizableHandle />)}
        {wrap(<ResizablePanel label="Console">Console</ResizablePanel>)}
      </ResizablePanelGroup>
    ),
  ],
  [
    "Resizable with a handle added by mistake",
    (wrap) => (
      <Resizable>
        {wrap(<ResizablePanel label="One">One</ResizablePanel>)}
        {wrap(<ResizableHandle />)}
        {wrap(<ResizablePanel label="Two">Two</ResizablePanel>)}
      </Resizable>
    ),
  ],
  ["ShowMore items", (wrap) => <ShowMore initialCount={1} items={[wrap(<span key="a">Pasta</span>), wrap(<span key="b">Salad</span>)]} />],
  [
    "Select item children",
    (wrap) => (
      <Select label="Course" defaultValue="main">
        {wrap(
          <SelectGroup label="Meals">
            {wrap(<SelectItem value="main">Main</SelectItem>)}
          </SelectGroup>,
        )}
      </Select>
    ),
  ],
  [
    "Select item inside an HTML element",
    (wrap) => (
      <Select label="Course" defaultValue="main">
        <div>{wrap(<SelectItem value="main">Main</SelectItem>)}</div>
      </Select>
    ),
  ],
  [
    "Select items in one list",
    (wrap) => (
      <Select label="Course" defaultValue="dessert">
        {wrap([
          wrap(
            <SelectItem key="main" value="main">
              Main
            </SelectItem>,
          ),
          wrap(
            <SelectItem key="dessert" value="dessert">
              Dessert
            </SelectItem>,
          ),
        ])}
      </Select>
    ),
  ],
];

describe.each([
  ["wrapped", wrapped],
  ["lazy type", lazyType],
  ["both", both],
] as const)("elements a Server Component passes, %s", (_shape, wrap) => {
  it.each(cases)("%s renders the same as with plain elements", (_name, app) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const expected = renderToString(app(plain));
    expect(renderToString(app(wrap))).toBe(expected);
    vi.restoreAllMocks();
  });
});

// A component around the items that has a string `value` of its own is not an item: Select
// looks inside it. The items are given in each shape; the component around them is the app's.
const Locale = createContext("en");
function Section({ children }: { value: string; children: ReactNode }) {
  return <>{children}</>;
}
describe.each([
  ["plain", plain],
  ["wrapped", wrapped],
  ["lazy type", lazyType],
  ["both", both],
] as const)("Select items inside a component with its own value, %s", (_shape, wrap) => {
  it.each([
    ["a context provider", (item: ReactNode) => <Locale value="fr">{item}</Locale>],
    ["an app component", (item: ReactNode) => <Section value="courses">{item}</Section>],
  ])("shows the chosen item's label through %s", (_name, around) => {
    const html = renderToString(
      <Select label="Course" defaultValue="main">
        {around(wrap(<SelectItem value="main">Main</SelectItem>))}
      </Select>,
    );
    expect(html).toContain(">Main</span>");
    expect(html).not.toContain(">main</span>");
  });
});
