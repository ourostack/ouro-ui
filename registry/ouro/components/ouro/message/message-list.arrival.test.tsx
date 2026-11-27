import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { commands } from "vitest/browser";
import { Message } from "@/registry/ouro/components/ouro/message/message";
import { MessageList } from "@/registry/ouro/components/ouro/message/message-list";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { expectMotion, parseDuration } from "@/registry/ouro/lib/ouro/testing/motion";

const roots: Root[] = [];
const hosts: Element[] = [];

afterEach(async () => {
  await commands.emulateMedia({ reducedMotion: "no-preference" });
  for (const root of roots.splice(0)) await act(async () => root.unmount());
  for (const host of hosts.splice(0)) host.remove();
});

function Chat({ ids }: { ids: string[] }) {
  return (
    <MessageList label="Conversation" style={{ height: 300 }}>
      {ids.map((id) => (
        <Message key={id} id={id} variant="chat" role={id.startsWith("u") ? "user" : "assistant"} name={id.startsWith("u") ? "Ana" : "Ouro"}>
          {`Message ${id}`}
        </Message>
      ))}
    </MessageList>
  );
}

async function start(ids: string[], { hidden = false } = {}) {
  const host = document.createElement("div");
  host.hidden = hidden;
  document.body.append(host);
  hosts.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(<Chat ids={ids} />));
  return (next: string[]) => act(async () => root.render(<Chat ids={next} />));
}

const bubble = (id: string) => document.getElementById(id)!.querySelector<HTMLElement>('[data-ouro-part="bubble"]')!;
const bounce = () => parseDuration(getComputedStyle(document.documentElement).getPropertyValue("--ouro-duration-bounce"));
const fast = () => parseDuration(getComputedStyle(document.documentElement).getPropertyValue("--ouro-duration-fast"));

describe("MessageList arrival", () => {
  it("grows a new message's bubble in from its tail's corner on the bounce tokens, and with reduced motion only fades it", async () => {
    for (const reduced of [false, true]) {
      await commands.emulateMedia({ reducedMotion: reduced ? "reduce" : "no-preference" });
      const ids = [`u1-${reduced}`, `a1-${reduced}`];
      const render = await start(ids);
      const sent = `u2-${reduced}`;
      await render([...ids, sent]);
      expect(getComputedStyle(bubble(sent)).transformOrigin).not.toBe("");
      await expectMotion(bubble(sent), {
        stem: "message",
        state: "data-starting-style",
        properties: reduced ? { opacity: fast() } : { opacity: bounce(), transform: bounce() },
        reduced,
      });
      await expect.poll(() => document.getElementById(sent)!.hasAttribute("data-starting-style")).toBe(false);
    }
  });

  it("starts a sent bubble from its end corner and another's from its start corner, and moves nothing by translate", async () => {
    const render = await start(["u1", "a1"]);
    await render(["u1", "a1", "u2", "a2"]);
    const sent = bubble("u2");
    const received = bubble("a2");
    for (const [element, name] of [[sent, "ouro-message-sent"], [received, "ouro-message-received"]] as const) {
      const animation = element.getAnimations().find((found): found is CSSAnimation => found instanceof CSSAnimation && found.animationName === name);
      expect(animation, name).toBeDefined();
      for (const frame of (animation!.effect as KeyframeEffect).getKeyframes()) expect(String(frame.transform ?? "")).not.toContain("translate");
    }
    const box = (element: HTMLElement) => getComputedStyle(element).transformOrigin;
    // The end corner is the right one in left-to-right text: the origin sits at the bubble's own width.
    expect(parseFloat(box(sent))).toBeGreaterThan(0);
    expect(parseFloat(box(received))).toBe(0);
  });

  it("keeps the mark through another animation's end inside the message, and drops it when the arrival ends", async () => {
    const render = await start(["u1", "a1"]);
    await render(["u1", "a1", "u2"]);
    const article = document.getElementById("u2")!;
    expect(article.hasAttribute("data-starting-style")).toBe(true);
    bubble("u2").dispatchEvent(new AnimationEvent("animationend", { animationName: "ouro-pulse", bubbles: true }));
    expect(article.hasAttribute("data-starting-style")).toBe(true);
    bubble("u2").dispatchEvent(new AnimationEvent("animationend", { animationName: "ouro-message-sent", bubbles: true }));
    // It stays a frame, so the finished animation is not dropped in the same moment it ends.
    expect(article.hasAttribute("data-starting-style")).toBe(true);
    await expect.poll(() => article.hasAttribute("data-starting-style")).toBe(false);
  });

  it("draws the messages already there, and one that fills an empty list, with no arrival", async () => {
    const render = await start(["u1", "a1"]);
    expect(document.querySelector("[data-starting-style]")).toBeNull();
    await render([]);
    await render(["a9"]);
    expect(document.querySelector("[data-starting-style]")).toBeNull();
  });

  it("marks no arrival for a message that comes in while the list is hidden, so it does not grow in when shown", async () => {
    const render = await start(["u1", "a1"], { hidden: true });
    await render(["u1", "a1", "u2"]);
    expect(document.getElementById("u2")).not.toBeNull();
    expect(document.querySelector("[data-starting-style]")).toBeNull();
  });
});
