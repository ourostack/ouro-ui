import type { ReactElement, ReactNode } from "react";
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
// prop or its children) must handle the lazy wrapper React's Flight client can hand over in
// place of an element a Server Component passed (https://github.com/facebook/react/issues/32392).
// Each case renders on the server twice, once with plain elements and once with every given
// element wrapped, and both must give the same HTML.

/** What the Flight client hands a client component in place of `element`. */
function fromServer<T extends ReactNode>(element: T): T {
  return { $$typeof: Symbol.for("react.lazy"), _payload: element, _init: (payload: unknown) => payload } as unknown as T;
}
const plain = <T,>(element: T): T => element;

/** A plot Chart hands its data to, in place of a recharts chart. */
function Plot({ data }: { data?: unknown }) {
  return <output>{JSON.stringify(data)}</output>;
}
const rows = [{ month: "January", cooked: 12 }];
const noop = () => {};

const cases: Array<[string, (wrap: <T extends ReactNode>(element: T) => T) => ReactElement]> = [
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
];

describe("elements a Server Component passes", () => {
  it.each(cases)("%s renders the same through React's lazy wrapper", (_name, app) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const expected = renderToString(app(plain));
    expect(renderToString(app(fromServer))).toBe(expected);
    vi.restoreAllMocks();
  });
});
