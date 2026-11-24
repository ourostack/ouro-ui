import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { commands, page, userEvent } from "vitest/browser";
import { Message } from "@/registry/ouro/components/ouro/message/message";
import { MessageList } from "@/registry/ouro/components/ouro/message/message-list";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { expectMotion, parseDuration } from "@/registry/ouro/lib/ouro/testing/motion";

const roots: Root[] = [];
const hosts: Element[] = [];

afterEach(async () => {
  document.documentElement.style.removeProperty("--ouro-duration-fast");
  await commands.emulateMedia({ reducedMotion: "no-preference" });
  await userEvent.unhover(document.body);
  for (const root of roots.splice(0)) await act(async () => root.unmount());
  for (const host of hosts.splice(0)) host.remove();
});

async function render() {
  const host = document.createElement("div");
  document.body.append(host);
  hosts.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () =>
    root.render(
      <MessageList label="Launch channel" style={{ height: 240 }}>
        {["m0", "m1"].map((id) => (
          <Message key={id} id={id} variant="chat" role="assistant" name="Grace Hopper" actions={[{ key: "like", label: "Like", icon: "👍", onClick: () => {} }]}>
            {`Message ${id}`}
          </Message>
        ))}
      </MessageList>,
    ),
  );
}

const bar = () => document.querySelector<HTMLElement>('[data-ouro-part="bar"]');
const hover = (id: string) => userEvent.hover(document.getElementById(id)!.querySelector("[data-ouro-message-content]")!);
const fast = () => parseDuration(getComputedStyle(document.documentElement).getPropertyValue("--ouro-duration-fast"));

// A fade long enough that a loaded runner's round trip to the browser cannot outlast it.
const slowFade = () => document.documentElement.style.setProperty("--ouro-duration-fast", "1s");

async function shown(id: string) {
  await expect.poll(async () => (await hover(id), document.getElementById(id)!.contains(bar()))).toBe(true);
}

describe("MessageList bar fade", () => {
  it.each([false, true])("fades the bar in as it first shows, with reduced motion %s", async (reduced) => {
    await commands.emulateMedia({ reducedMotion: reduced ? "reduce" : "no-preference" });
    await render();
    const seen: string[] = [];
    const watch = new MutationObserver(() => {
      const first = bar();
      if (first !== null && seen.length === 0) seen.push(...first.getAnimations().map((animation) => (animation as CSSTransition).transitionProperty));
    });
    watch.observe(document.body, { childList: true, subtree: true });
    try {
      await shown("m0");
    } finally {
      watch.disconnect();
    }
    expect(seen).toEqual(["opacity"]);
    await expect.poll(() => getComputedStyle(bar()!).opacity).toBe("1");
  });

  it("never marks the bar as ending while the pointer still hovers it", async () => {
    await render();
    await shown("m0");
    expect(bar()!.hasAttribute("data-ending-style")).toBe(false);
  });

  async function fadesOutThenUnmounts(reduced: boolean) {
    await commands.emulateMedia({ reducedMotion: reduced ? "reduce" : "no-preference" });
    slowFade();
    await render();
    await shown("m0");
    await expect.poll(() => bar()!.getAnimations().length).toBe(0);
    await userEvent.unhover(document.body);
    const leaving = bar()!;
    expect(leaving.hasAttribute("data-ending-style")).toBe(true);
    await expectMotion(leaving, { stem: "message", state: "data-ending-style", properties: { opacity: fast() }, reduced });
    await expect.poll(() => bar()).toBeNull();
    expect(document.querySelector("[data-ouro-message-bar-slot]")?.parentNode ?? null).toBeNull();
  }

  // Two explicit tests, not it.each: motion coverage's recorded test names must match these titles literally, which an it.each "%s" template cannot do.
  it("fades the bar out over the fast duration when the pointer leaves, then unmounts it, with reduced motion false", () => fadesOutThenUnmounts(false));
  it("fades the bar out over the fast duration when the pointer leaves, then unmounts it, with reduced motion true", () => fadesOutThenUnmounts(true));

  it("keeps the same bar, unfaded, when the pointer comes back during the exit", async () => {
    slowFade();
    await render();
    await shown("m0");
    await expect.poll(() => bar()!.getAnimations().length).toBe(0);
    const before = bar()!;
    await userEvent.unhover(document.body);
    expect(before.hasAttribute("data-ending-style")).toBe(true);
    const restyled: string[] = [];
    const watch = new MutationObserver((records) => restyled.push(...records.map((record) => record.attributeName!)));
    watch.observe(before, { attributes: true, attributeFilter: ["data-starting-style"] });
    await hover("m0");
    expect(bar()).toBe(before);
    expect(before.hasAttribute("data-ending-style")).toBe(false);
    await expect.poll(() => before.getAnimations().length).toBe(0);
    watch.disconnect();
    // The exit that ended with the return does not send the bar back through its entrance.
    expect(restyled).toEqual([]);
    expect(bar()).toBe(before);
    expect(getComputedStyle(before).opacity).toBe("1");
  });

  it("takes the bar away at once, with no fade, as it opens the menu", async () => {
    slowFade();
    const host = document.createElement("div");
    document.body.append(host);
    hosts.push(host);
    const root = createRoot(host);
    roots.push(root);
    await act(async () =>
      root.render(
        <MessageList label="Launch channel" style={{ height: 240 }}>
          <Message id="m0" variant="chat" role="assistant" name="Grace Hopper" menu={[{ label: "Copy link", onClick: () => {} }]}>
            Message m0
          </Message>
        </MessageList>,
      ),
    );
    await shown("m0");
    await expect.poll(() => bar()!.getAnimations().length).toBe(0);
    await userEvent.click(bar()!.querySelector<HTMLElement>('[data-ouro-part="menu"]')!);
    await expect.element(page.getByRole("menuitem", { name: "Copy link" })).toBeVisible();
    expect(bar()).toBeNull();
  });

  it("fades out again after the menu closed and the pointer came back", async () => {
    slowFade();
    const host = document.createElement("div");
    document.body.append(host);
    hosts.push(host);
    const root = createRoot(host);
    roots.push(root);
    await act(async () =>
      root.render(
        <MessageList label="Launch channel" style={{ height: 240 }}>
          <Message id="m0" variant="chat" role="assistant" name="Grace Hopper" menu={[{ label: "Copy link", onClick: () => {} }]}>
            Message m0
          </Message>
        </MessageList>,
      ),
    );
    await shown("m0");
    await expect.poll(() => bar()!.getAnimations().length).toBe(0);
    await userEvent.click(bar()!.querySelector<HTMLElement>('[data-ouro-part="menu"]')!);
    await expect.element(page.getByRole("menuitem", { name: "Copy link" })).toBeVisible();
    await userEvent.keyboard("{Escape}");
    await expect.poll(() => document.querySelector('[role="menuitem"]')).toBeNull();
    await shown("m0");
    await userEvent.unhover(document.body);
    expect(bar()!.hasAttribute("data-ending-style")).toBe(true);
  });

  it("moves the bar from one message to the next without a fade", async () => {
    await render();
    await shown("m0");
    await expect.poll(() => bar()!.getAnimations().length).toBe(0);
    const before = bar()!;
    await shown("m1");
    expect(bar()).toBe(before);
    expect(before.getAnimations().map((animation) => (animation as CSSTransition).transitionProperty)).toEqual([]);
  });
});
