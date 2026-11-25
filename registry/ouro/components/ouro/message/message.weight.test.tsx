import type { ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { Lightbox } from "@/registry/ouro/components/ouro/lightbox/lightbox";
import { Message, type MessageAction } from "@/registry/ouro/components/ouro/message/message";
import type { MessageBarData } from "@/registry/ouro/components/ouro/message/message-parts";
import { ReactionBar } from "@/registry/ouro/components/ouro/reaction-bar/reaction-bar";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { createRowLayer, RowLayerContext, type RowLayer } from "@/registry/ouro/lib/ouro/row-hover";

// Opening a chat draws every message on screen in one commit, and its cost is the count of
// elements and components each message draws, not any one of them. Each budget is what the
// variant draws now: a change that adds to one fails here, and a cut lowers it.

const actions: MessageAction[] = [{ key: "reply", label: "Reply", icon: "↩", onClick: () => {} }];
const reactions = [
  { key: "like", label: "Like", emoji: "👍", count: 2 },
  { key: "heart", label: "Heart", emoji: "❤️", count: 1, mine: true },
];
const picture = "data:image/gif;base64,R0lGODlhAQABAAAAACw=";
// In a MessageList, a message with actions gives the list's one bar a slot rather than drawing its own.
const layer = createRowLayer<MessageBarData>() as RowLayer<unknown>;

const variants: { variant: string; message: ReactElement; inList?: true; elements: number; components: number }[] = [
  { variant: "a text message", message: <Message role="assistant" variant="chat" name="Ana">Hello there</Message>, elements: 9, components: 2 },
  { variant: "a text message with its time", message: <Message role="assistant" variant="chat" name="Ana" time="9:41 AM">Hello there</Message>, elements: 11, components: 2 },
  { variant: "the user's own message", message: <Message role="user" variant="chat" name="You" time="9:41 AM">Hello there</Message>, elements: 7, components: 1 },
  { variant: "a continued message", message: <Message role="assistant" variant="chat" name="Ana" time="9:41 AM" continued>Hello there</Message>, elements: 9, components: 1 },
  {
    variant: "a message with its author's presence",
    message: <Message role="assistant" variant="chat" name="Ana" presence="available" presenceLabel="Available">Hello there</Message>,
    elements: 12,
    components: 4,
  },
  { variant: "a message with a name tag", message: <Message role="assistant" variant="chat" name="Halden" nameTag="AI agent" time="9:41 AM">Hello there</Message>, elements: 13, components: 2 },
  {
    variant: "a message with reactions",
    message: <Message role="assistant" variant="chat" name="Ana" footer={<ReactionBar reactions={reactions} onReact={() => {}} />}>Hello there</Message>,
    elements: 21,
    components: 14,
  },
  {
    variant: "a message of a picture",
    message: <Message role="assistant" variant="chat" name="Ana" attachments={<Lightbox label="Photo from Ana" layout="mosaic" images={[{ src: picture, alt: "A lake", width: 1200, height: 800 }]} />} />,
    elements: 17,
    components: 3,
  },
  { variant: "a message with a quote", message: <Message role="assistant" variant="chat" name="Ana" quote={{ author: "Theo", excerpt: "I have one." }}>Hello there</Message>, elements: 15, components: 2 },
  {
    variant: "a message with actions, in a list",
    message: <Message role="assistant" variant="chat" name="Ana" actions={actions}>Hello there</Message>,
    inList: true,
    elements: 10,
    components: 2,
  },
  { variant: "a message still being written", message: <Message role="assistant" variant="chat" name="Ana" streaming />, elements: 14, components: 2 },
  { variant: "a message that did not send", message: <Message role="user" variant="chat" name="You" failed={{ onRetry: () => {}, onDelete: () => {} }}>Hello there</Message>, elements: 18, components: 10 },
  { variant: "a post", message: <Message role="assistant" variant="post" name="Ana" time="9:41 AM">Hello there</Message>, elements: 12, components: 2 },
  { variant: "a reply", message: <Message role="assistant" variant="reply" name="Ana" time="9:41 AM">Hello there</Message>, elements: 11, components: 2 },
  { variant: "a message in the default layout", message: <Message role="assistant" name="Ana">Hello there</Message>, elements: 7, components: 2 },
];

/** The components React keeps for what the root draws: every fiber but the root, elements and text, context providers included. */
function componentsUnder(host: HTMLElement): number {
  const key = Object.keys(host).find((name) => name.startsWith("__reactContainer$"))!;
  // React's fibers: 3 is the root, 5 an element, 6 a text node; everything else is a component, provider or fragment.
  type Fiber = { tag: number; child: Fiber | null; sibling: Fiber | null; stateNode: { current: Fiber } };
  const count = (fiber: Fiber | null): number => (fiber === null ? 0 : (fiber.tag === 5 || fiber.tag === 6 ? 0 : 1) + count(fiber.child) + count(fiber.sibling));
  // The container keeps the root's first fiber; the tree on screen hangs from the root's current one.
  return count((host as unknown as Record<string, Fiber>)[key]!.stateNode.current.child);
}

describe("Message's weight", () => {
  it.each(variants)("draws $variant in no more than $elements elements and $components components", async ({ message, inList, elements, components }) => {
    const host = document.createElement("div");
    host.dataset["testHarness"] = "";
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => root.render(inList ? <RowLayerContext.Provider value={layer}>{message}</RowLayerContext.Provider> : message));
    const drawnElements = host.querySelector("article")!.querySelectorAll("*").length + 1;
    // The list's provider is the list's, not the message's.
    const drawnComponents = componentsUnder(host) - (inList ? 1 : 0);
    await act(async () => root.unmount());
    host.remove();
    expect(drawnElements, "elements").toBeLessThanOrEqual(elements);
    expect(drawnComponents, "components").toBeLessThanOrEqual(components);
  });
});
