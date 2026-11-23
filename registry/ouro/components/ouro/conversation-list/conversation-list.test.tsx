import { useState, type MouseEvent, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { commands, page, userEvent } from "vitest/browser";
import { Avatar, AvatarGroup } from "@/registry/ouro/components/ouro/avatar/avatar";
import { Badge } from "@/registry/ouro/components/ouro/badge/badge";
import { ConversationList, type ConversationListItem, type ConversationListProps } from "@/registry/ouro/components/ouro/conversation-list/conversation-list";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { pressTab } from "@/registry/ouro/lib/ouro/testing/tab";

const roots: Root[] = [];
let mounted: Element[] = [];

async function render(node: ReactNode) {
  const host = document.createElement("div");
  host.style.width = "360px";
  document.body.append(host);
  mounted.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
  return {
    host,
    rerender: (next: ReactNode) => act(async () => root.render(next)),
    get list() {
      return host.querySelector<HTMLElement>('[data-ouro="conversation-list"]')!;
    },
    get rows() {
      return [...host.querySelectorAll<HTMLButtonElement>('[data-ouro-part="row"]')];
    },
  };
}

const items: ConversationListItem[] = [
  { id: "trail", title: "Trail crew", subtitle: "Weekend hikes", preview: "Meet at the north gate at eight.", time: "9:41", unread: true },
  { id: "ana", title: "Ana Lind", preview: "The engine notes are attached.", time: "Tue" },
  { id: "garden", title: "Garden club", preview: "Seed swap moved to Sunday.", time: "Mon", avatar: false },
];

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(async () => {
  vi.restoreAllMocks();
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  for (const node of mounted) node.remove();
  mounted = [];
});

describe("ConversationList", () => {
  it("is a named list of buttons, one per conversation, in order", async () => {
    const { rows } = await render(<ConversationList label="Conversations" items={items} onSelect={() => {}} />);
    await expect.element(page.getByRole("list", { name: "Conversations" })).toBeVisible();
    expect(rows.map((row) => row.textContent)).toEqual([
      "Trail crew9:41Weekend hikesMeet at the north gate at eight.Unread",
      "Ana LindTueThe engine notes are attached.",
      "Garden clubMonSeed swap moved to Sunday.",
    ]);
    expect(rows.every((row) => row.type === "button")).toBe(true);
  });

  it("calls onSelect with the row's id on a click, Enter and Space", async () => {
    const onSelect = vi.fn();
    const { rows } = await render(<ConversationList label="Conversations" items={items} onSelect={onSelect} />);
    await userEvent.click(page.getByRole("button", { name: /Ana Lind/ }));
    expect(onSelect).toHaveBeenLastCalledWith("ana");
    // WebKit does not focus a button on click, so focus it as a keyboard user would reach it.
    await act(async () => rows[1]!.focus());
    await userEvent.keyboard("{ArrowDown}");
    await userEvent.keyboard("{Enter}");
    expect(onSelect).toHaveBeenLastCalledWith("garden");
    await userEvent.keyboard("{ArrowUp}");
    await userEvent.keyboard(" ");
    expect(onSelect).toHaveBeenLastCalledWith("ana");
    expect(onSelect).toHaveBeenCalledTimes(3);
  });

  it("marks the open conversation current and highlights it", async () => {
    const { host, rows, rerender } = await render(<ConversationList label="Conversations" items={items} selectedId="ana" onSelect={() => {}} />);
    expect(rows.map((row) => row.getAttribute("aria-current"))).toEqual([null, "true", null]);
    // A pointer an earlier test left over the row would show its hover shade instead.
    const away = document.createElement("div");
    away.style.height = "40px";
    host.append(away);
    await userEvent.hover(away);
    await Promise.allSettled(rows.flatMap((row) => row.getAnimations()).map((animation) => animation.finished));
    const probe = document.createElement("span");
    probe.style.color = "var(--ouro-row-selected)";
    host.append(probe);
    expect(getComputedStyle(rows[1]!).backgroundColor).toBe(getComputedStyle(probe).color);
    probe.remove();
    expect(getComputedStyle(rows[0]!).backgroundColor).toBe("rgba(0, 0, 0, 0)");
    await rerender(<ConversationList label="Conversations" items={items} selectedId={null} onSelect={() => {}} />);
    expect(rows.some((row) => row.hasAttribute("aria-current"))).toBe(false);
  });

  it("draws the row that opens in its selected fill on the first frame, and drops the one that closes at once, as hover changes at once", async () => {
    const { host, rows, rerender } = await render(<ConversationList label="Conversations" items={items} selectedId="ana" onSelect={() => {}} />);
    const away = document.createElement("div");
    away.style.height = "40px";
    host.append(away);
    await userEvent.hover(away);
    await Promise.allSettled(rows.flatMap((row) => row.getAnimations()).map((animation) => animation.finished));
    const probe = document.createElement("span");
    probe.style.color = "var(--ouro-row-selected)";
    host.append(probe);
    const accent = getComputedStyle(probe).color;
    const easing = (row: HTMLElement) => row.getAnimations().filter((animation) => (animation as CSSTransition).transitionProperty === "background-color");
    await rerender(<ConversationList label="Conversations" items={items} selectedId="garden" onSelect={() => {}} />);
    await new Promise((done) => requestAnimationFrame(done));
    expect(getComputedStyle(rows[2]!).backgroundColor).toBe(accent);
    expect(getComputedStyle(rows[1]!).backgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect([...easing(rows[1]!), ...easing(rows[2]!)]).toEqual([]);
    // Hover changes at once too, where a fine pointer hovers: no colour eases (the press utility).
    if (matchMedia("(pointer: fine)").matches) {
      await userEvent.hover(rows[0]!);
      expect(easing(rows[0]!)).toEqual([]);
    }
  });

  it("keeps the open conversation distinct under the pointer", async () => {
    const { host, rows } = await render(<ConversationList label="Conversations" items={items} selectedId="ana" onSelect={() => {}} />);
    const paint = (value: string) => {
      const probe = document.createElement("span");
      probe.style.backgroundColor = value;
      host.append(probe);
      const color = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return color;
    };
    const settled = async (row: HTMLElement) => {
      await Promise.allSettled(row.getAnimations().map((animation) => animation.finished));
      return getComputedStyle(row).backgroundColor;
    };
    // The open row takes its own hover and pressed fills under the pointer, so it never reads as a hovered neighbour; the others take the row hover.
    await userEvent.hover(rows[1]!);
    expect(rows[1]!.matches(":hover")).toBe(true);
    expect(await settled(rows[1]!)).toBe(paint("var(--ouro-row-selected-hover)"));
    await commands.pointerPress({ selector: '[data-ouro-control="conversation-list"][aria-current="true"]', action: "down" });
    try {
      expect(rows[1]!.matches(":active")).toBe(true);
      expect(await settled(rows[1]!)).toBe(paint("var(--ouro-row-selected-pressed)"));
    } finally {
      await commands.pointerPress({ action: "up" });
    }
    await userEvent.hover(rows[0]!);
    expect(await settled(rows[0]!)).toBe(paint("var(--ouro-row-hover)"));
    expect(await settled(rows[1]!)).toBe(paint("var(--ouro-row-selected)"));
  });

  it("moves focus with the arrow keys, Home and End", async () => {
    const { rows } = await render(<ConversationList label="Conversations" items={items} onSelect={() => {}} />);
    await act(async () => rows[0]!.focus());
    await userEvent.keyboard("{ArrowUp}");
    expect(document.activeElement).toBe(rows[0]);
    await userEvent.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(rows[1]);
    await userEvent.keyboard("{End}");
    expect(document.activeElement).toBe(rows[2]);
    await userEvent.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(rows[2]);
    await userEvent.keyboard("{Home}");
    expect(document.activeElement).toBe(rows[0]);
    // Other keys keep their meaning: the page still gets them.
    const seen = vi.fn();
    document.addEventListener("keydown", seen);
    await userEvent.keyboard("{ArrowRight}");
    document.removeEventListener("keydown", seen);
    expect(seen.mock.calls[0]![0].defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(rows[0]);
  });

  it("shows unread conversations with a bold title, a dot and a spoken label", async () => {
    const { rows, rerender } = await render(<ConversationList label="Conversations" items={items} onSelect={() => {}} />);
    const title = (row: HTMLElement) => row.querySelector<HTMLElement>("[data-ouro-conversation-title]")!;
    expect(Number(getComputedStyle(title(rows[0]!)).fontWeight)).toBeGreaterThanOrEqual(600);
    expect(Number(getComputedStyle(title(rows[1]!)).fontWeight)).toBe(400);
    const unread = rows[0]!.querySelector<HTMLElement>("[data-ouro-conversation-unread]")!;
    expect(unread.textContent).toBe("Unread");
    expect(unread.querySelector('[aria-hidden="true"]')!.getBoundingClientRect().width).toBe(8);
    expect(rows[1]!.querySelector("[data-ouro-conversation-unread]")).toBeNull();
    await rerender(<ConversationList label="Conversations" items={items} unreadLabel="Non lu" onSelect={() => {}} />);
    expect(rows[0]!.querySelector("[data-ouro-conversation-unread]")!.textContent).toBe("Non lu");
  });

  it("shows a title and where given as content, with the name screen readers hear and the avatar's initials come from", async () => {
    const picture = "data:image/gif;base64,R0lGODlhAQABAAAAACw=";
    const { rows } = await render(
      <ConversationList
        label="Conversations"
        items={[
          { id: "launch", title: <>Launch team <img alt="" src={picture} width={16} height={16} data-testid="rocket" /></>, name: "Launch team", where: <>Fernwood <b>HQ</b></>, time: "9:41" },
          { id: "ana", title: "Ana Lind", name: "Ana L.", time: "Tue" },
        ]}
        onSelect={() => {}}
      />,
    );
    const [launch, ana] = rows;
    const title = launch!.querySelector<HTMLElement>("[data-ouro-conversation-title]")!;
    expect(title.querySelector('[aria-hidden="true"] [data-testid="rocket"]')).not.toBeNull();
    expect(title.querySelector(".sr-only")!.textContent).toBe("Launch team");
    expect(launch!.querySelector("[data-ouro-avatar-initials]")!.getAttribute("data-ouro-avatar-initials")).toBe("LT");
    expect(launch!.querySelector("[data-ouro-conversation-where] b")!.textContent).toBe("HQ");
    await expect.element(page.getByRole("button", { name: /^\W*(LT )?Launch team\W+Fernwood HQ 9:41$/ })).toBeVisible();
    // A text title with a name: the name is what screen readers hear and what the initials come from.
    expect(ana!.querySelector("[data-ouro-conversation-title] .sr-only")!.textContent).toBe("Ana L.");
    expect(ana!.querySelector("[data-ouro-avatar-initials]")!.getAttribute("data-ouro-avatar-initials")).toBe("AL");
  });

  it("shows a context line between the title and the preview, which the mark ends when there is no preview", async () => {
    const { rows, rerender, host } = await render(
      <ConversationList
        label="Activity"
        items={[
          { id: "mention", title: "Noor Example", context: <>mentioned you in <b>Design reviews</b></>, preview: "Can you sign off on the mockups?", time: "1:02 PM", unread: true },
          { id: "react", title: "Alex Example", context: "reacted in Launch planning", time: "12:43 PM", mark: <Badge>2</Badge> },
          { id: "reply", title: "Riley Example", subtitle: "Launch team", context: "replied in Design reviews", time: "12:27 PM", unread: true },
        ]}
        onSelect={() => {}}
      />,
    );
    const [mention, react, reply] = rows;
    const top = (element: Element) => element.getBoundingClientRect().top;
    const title = mention!.querySelector("[data-ouro-conversation-title]")!;
    const context = mention!.querySelector<HTMLElement>("[data-ouro-conversation-context]")!;
    const preview = mention!.querySelector("[data-ouro-conversation-preview]")!;
    expect(context.textContent).toBe("mentioned you in Design reviews");
    expect(top(title)).toBeLessThan(top(context));
    expect(top(context)).toBeLessThan(top(preview));
    expect(getComputedStyle(context).fontSize).toBe(getComputedStyle(preview).fontSize);
    // The unread dot ends the preview's line; with no preview, the mark ends the context's.
    expect(preview.parentElement!.querySelector("[data-ouro-conversation-unread]")).not.toBeNull();
    expect(mention!.querySelectorAll("[data-ouro-conversation-unread]")).toHaveLength(1);
    expect(react!.querySelector("[data-ouro-conversation-context]")!.parentElement!.querySelector("[data-ouro-conversation-mark]")!.textContent).toBe("2");
    expect(react!.querySelectorAll("[data-ouro-conversation-mark]")).toHaveLength(1);
    // Under a subtitle, the context line is still the one the dot ends.
    expect(reply!.querySelectorAll("[data-ouro-conversation-unread]")).toHaveLength(1);
    expect(reply!.querySelector("[data-ouro-conversation-context]")!.parentElement!.querySelector("[data-ouro-conversation-unread]")).not.toBeNull();
    await rerender(
      <ConversationList label="Activity" density="compact" items={[{ id: "mention", title: "Noor Example", context: "mentioned you in Design reviews", preview: "Can you sign off?", time: "1:02 PM" }]} onSelect={() => {}} />,
    );
    expect(host.querySelector("[data-ouro-conversation-context]")!.textContent).toBe("mentioned you in Design reviews");
    expect(host.querySelector("[data-ouro-conversation-preview]")).toBeNull();
  });

  it("puts an activity row's time after the context line's words, not between the title and them", async () => {
    const { rows } = await render(
      <ConversationList
        label="Activity"
        items={[{ id: "react", title: "Alex Example", context: "reacted in Launch planning", time: "12:43 PM", mark: <Badge>2</Badge> }]}
        onSelect={() => {}}
      />,
    );
    const row = rows[0]!;
    const title = row.querySelector("[data-ouro-conversation-title]")!;
    const context = row.querySelector<HTMLElement>("[data-ouro-conversation-context]")!;
    const time = row.querySelector<HTMLElement>("[data-ouro-conversation-time]")!;
    const mark = row.querySelector<HTMLElement>("[data-ouro-conversation-mark]")!;
    // The time shares the context's line, not the title's, and reads after the context's words, before the mark.
    expect(time.parentElement).toBe(context.parentElement);
    expect(title.compareDocumentPosition(time) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(context.compareDocumentPosition(time) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(time.compareDocumentPosition(mark) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await expect.element(page.getByRole("button", { name: "Alex Example reacted in Launch planning 12:43 PM 2" })).toBeVisible();
  });

  it("keeps an activity row's time visible on hover, since it is not the title row's own last word there", async () => {
    const { rows } = await render(
      <ConversationList
        label="Activity"
        items={[
          {
            id: "react",
            title: "Alex Example",
            context: "reacted in Launch planning",
            time: "12:43 PM",
            menu: [{ label: "Pin", onClick: () => {} }],
          },
        ]}
        onSelect={() => {}}
      />,
    );
    const time = rows[0]!.querySelector<HTMLElement>("[data-ouro-conversation-time]")!;
    expect(time.className).not.toMatch(/opacity-0/);
  });

  it("shows a draft in place of the preview, after its label in the destructive tone, and hides it when compact", async () => {
    const drafts: ConversationListItem[] = [
      { id: "launch", title: "Launch planning", preview: "Ship it Friday.", draft: "Can we move the review to", time: "9:41" },
      { id: "ana", title: "Ana Lind", draft: <i>Notes on the engine</i>, time: "Tue", unread: true },
      { id: "garden", title: "Garden club", preview: "Seed swap moved to Sunday.", time: "Mon" },
    ];
    const { rows, rerender, host } = await render(<ConversationList label="Conversations" items={drafts} onSelect={() => {}} />);
    const preview = (row: Element) => row.querySelector<HTMLElement>("[data-ouro-conversation-preview]")!;
    expect(preview(rows[0]!).textContent).toBe("Draft: Can we move the review to");
    expect(preview(rows[1]!).querySelector("i")!.textContent).toBe("Notes on the engine");
    expect(preview(rows[2]!).textContent).toBe("Seed swap moved to Sunday.");
    expect(preview(rows[2]!).querySelector("[data-ouro-conversation-draft]")).toBeNull();
    const label = preview(rows[0]!).querySelector<HTMLElement>("[data-ouro-conversation-draft]")!;
    expect(getComputedStyle(label).color).not.toBe(getComputedStyle(preview(rows[0]!)).color);
    // The unread dot still ends a drafted row's line.
    expect(preview(rows[1]!).parentElement!.querySelector("[data-ouro-conversation-unread]")).not.toBeNull();
    await expect.element(page.getByRole("button", { name: /Launch planning.*Draft: Can we move the review to/ })).toBeVisible();
    await rerender(<ConversationList label="Gespräche" items={drafts} draftLabel="Entwurf:" onSelect={() => {}} />);
    expect(preview(host.querySelectorAll('[data-ouro-part="row"]')[0]!).textContent).toBe("Entwurf: Can we move the review to");
    await rerender(<ConversationList label="Conversations" items={drafts} density="compact" onSelect={() => {}} />);
    expect(host.querySelector("[data-ouro-conversation-preview]")).toBeNull();
  });

  it("shows a text title without a name as plain text", async () => {
    const { rows } = await render(<ConversationList label="Conversations" items={items} onSelect={() => {}} />);
    const title = rows[0]!.querySelector<HTMLElement>("[data-ouro-conversation-title]")!;
    expect(title.textContent).toBe("Trail crew");
    expect(title.querySelector('[aria-hidden="true"], .sr-only')).toBeNull();
  });

  it("shows the avatar from the title or a picture, or none", async () => {
    const { rows } = await render(
      <ConversationList
        label="Conversations"
        items={[{ id: "pic", title: "Grace Hopper", avatar: "data:image/gif;base64,R0lGODlhAQABAAAAACw=" }, ...items.slice(1)]}
        onSelect={() => {}}
      />,
    );
    expect(rows[0]!.querySelector('[data-ouro="avatar"]')).not.toBeNull();
    expect(rows[1]!.querySelector("[data-ouro-avatar-initials]")!.getAttribute("data-ouro-avatar-initials")).toBe("AL");
    expect(rows[1]!.querySelector('[data-ouro="avatar"]')!.getAttribute("aria-hidden")).toBe("true");
    expect(rows[2]!.querySelector('[data-ouro="avatar"]')).toBeNull();
  });

  it("drops the preview and shrinks the avatar when compact", async () => {
    const { list, rows, rerender } = await render(<ConversationList label="Conversations" items={items} onSelect={() => {}} />);
    const avatarSize = () => rows[1]!.querySelector('[data-ouro="avatar"]')!.getBoundingClientRect().width;
    expect(list.dataset.density).toBe("comfortable");
    expect(rows[1]!.querySelector("[data-ouro-conversation-preview]")).not.toBeNull();
    expect(avatarSize()).toBe(32);
    const tall = rows[1]!.getBoundingClientRect().height;
    await rerender(<ConversationList label="Conversations" items={items} density="compact" onSelect={() => {}} />);
    expect(list.dataset.density).toBe("compact");
    expect(rows[1]!.querySelector("[data-ouro-conversation-preview]")).toBeNull();
    expect(avatarSize()).toBe(24);
    expect(rows[1]!.getBoundingClientRect().height).toBeLessThan(tall);
  });

  it("pads a compact row less than a comfortable one", async () => {
    const { rows, rerender } = await render(<ConversationList label="Conversations" items={items} onSelect={() => {}} />);
    expect(getComputedStyle(rows[0]!).paddingTop).toBe("8px");
    await rerender(<ConversationList label="Conversations" items={items} density="compact" onSelect={() => {}} />);
    expect(getComputedStyle(rows[0]!).paddingTop).toBe("6px");
  });

  it("keeps its avatars' size while its rows tighten at a compact density", async () => {
    const pin = (
      <svg role="img" aria-label="Pinned" viewBox="0 0 16 16">
        <circle cx="8" cy="8" r="4" fill="currentColor" />
      </svg>
    );
    const { host, rows } = await render(
      <ConversationList label="Conversations" items={[{ ...items[1]!, icon: pin, mark: "New", menu: [{ label: "Pin", onClick: () => {} }] }]} onSelect={() => {}} />,
    );
    const row = rows[0]!;
    // The more button is the row's sibling in its item, so both are measured from the item.
    const item = row.closest("li")!;
    const measure = () => {
      const size = (selector: string) => {
        const { width, height } = item.querySelector(selector)!.getBoundingClientRect();
        return [width, height];
      };
      return {
        avatar: size('[data-ouro="avatar"]'),
        icon: size("[data-ouro-conversation-icon] svg"),
        more: size('[data-ouro-part="more"]'),
        mark: size("[data-ouro-conversation-mark]")[1],
        row: row.getBoundingClientRect().height,
      };
    };
    const roomy = measure();
    expect(getComputedStyle(row).paddingTop).toBe("8px");
    expect(roomy).toMatchObject({ avatar: [32, 32], icon: [16, 16], more: [28, 20], mark: 20 });
    // The spacing scale is set on the list's container: its rows' padding follows it, and the fixed sizes do not.
    host.style.setProperty("--spacing", "0.2rem");
    const compact = measure();
    expect(getComputedStyle(row).paddingTop).toBe("6.4px");
    expect(compact).toMatchObject({ avatar: [32, 32], icon: [16, 16], more: [28, 20], mark: 20 });
    expect(compact.row).toBeLessThan(roomy.row);
  });

  it("is a plain row that shows a focus ring from the keyboard and does not select its text", async () => {
    const { rows } = await render(<ConversationList label="Conversations" items={items} onSelect={() => {}} />);
    const style = getComputedStyle(rows[0]!);
    expect(style.userSelect).toBe("none");
    expect(style.touchAction).toBe("manipulation");
    expect(style.outlineStyle).toBe("none");
    await pressTab();
    expect(document.activeElement).toBe(rows[0]);
    expect(getComputedStyle(rows[0]!).outlineStyle).toBe("solid");
    expect(getComputedStyle(rows[0]!).outlineWidth).toBe("2px");
  });

  it("keeps the page from scrolling on the keys that move focus, and only on those", async () => {
    const { rows } = await render(<ConversationList label="Conversations" items={items} onSelect={() => {}} />);
    const press = (key: string) => {
      const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
      rows[0]!.dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(press("ArrowDown")).toBe(true);
    expect(press("a")).toBe(false);
  });

  it("shows the subtitle under the title, quieter, and nothing for a row with only a title", async () => {
    const { rows } = await render(
      <ConversationList label="Conversations" items={[items[0]!, { id: "new", title: "New topic", time: undefined, subtitle: undefined, preview: undefined }]} onSelect={() => {}} />,
    );
    const title = rows[0]!.querySelector<HTMLElement>("[data-ouro-conversation-title]")!;
    const subtitle = rows[0]!.querySelector<HTMLElement>("[data-ouro-conversation-subtitle]")!;
    expect(subtitle.textContent).toBe("Weekend hikes");
    expect(subtitle.getBoundingClientRect().top).toBeGreaterThanOrEqual(title.getBoundingClientRect().bottom - 1);
    expect(getComputedStyle(subtitle).color).not.toBe(getComputedStyle(title).color);
    // One line, holding the title alone.
    const column = rows[1]!.querySelector<HTMLElement>("[data-ouro-conversation-title]")!.closest(".flex-col")!;
    expect(column.children).toHaveLength(1);
    expect(column.textContent).toBe("New topic");
    expect(rows[1]!.querySelector("[data-ouro-conversation-time], [data-ouro-conversation-subtitle], [data-ouro-conversation-preview]")).toBeNull();
  });

  it("leaves out the time and preview when a row has none, and shows badges after the title", async () => {
    const { rows } = await render(
      <ConversationList label="Conversations" items={[{ id: "new", title: "New topic", time: null, preview: null, badges: <Badge>Muted</Badge> }]} onSelect={() => {}} />,
    );
    expect(rows[0]!.textContent).toBe("New topicMuted");
    expect(rows[0]!.querySelector("[data-ouro-conversation-time]")).toBeNull();
    expect(rows[0]!.querySelector("[data-ouro-conversation-preview]")).toBeNull();
    const title = rows[0]!.querySelector("[data-ouro-conversation-title]")!;
    expect(title.nextElementSibling!.getAttribute("data-ouro")).toBe("badge");
  });

  it("keeps long titles and previews on one line inside the row", async () => {
    const { host, rows } = await render(
      <ConversationList label="Conversations" items={[{ id: "long", title: "A".repeat(200), preview: "word ".repeat(80), time: "9:41" }]} onSelect={() => {}} />,
    );
    expect(rows[0]!.getBoundingClientRect().right).toBeLessThanOrEqual(host.getBoundingClientRect().right);
    const preview = rows[0]!.querySelector<HTMLElement>("[data-ouro-conversation-preview]")!;
    expect(preview.scrollWidth).toBeGreaterThan(preview.clientWidth);
    expect(getComputedStyle(preview).whiteSpace).toBe("nowrap");
  });

  it("shows the empty message when there are no conversations", async () => {
    const { list, rerender } = await render(<ConversationList label="Conversations" items={[]} onSelect={() => {}} />);
    expect(list.querySelector("ul")).toBeNull();
    expect(list.textContent).toBe("Nothing here yet");
    await rerender(<ConversationList label="Conversations" items={[]} empty="Start a conversation" onSelect={() => {}} />);
    expect(list.textContent).toBe("Start a conversation");
  });

  it("renders in server HTML and hydrates without a warning", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const node = <ConversationList label="Conversations" items={items} selectedId="ana" onSelect={() => {}} />;
    const html = renderToString(node);
    expect(html).toContain('aria-current="true"');
    expect(html).toContain("Trail crew");
    const host = document.createElement("div");
    host.innerHTML = html;
    document.body.append(host);
    mounted.push(host);
    const recoverable = vi.fn();
    let root!: Root;
    await act(async () => {
      root = hydrateRoot(host, node, { onRecoverableError: recoverable });
    });
    roots.push(root);
    expect(recoverable).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it("is one Tab stop, which lands on the open conversation", async () => {
    const { host, rows, rerender } = await render(
      <>
        <button type="button">Before</button>
        <ConversationList label="Conversations" items={items} selectedId="ana" onSelect={() => {}} />
        <button type="button">After</button>
      </>,
    );
    expect(rows.map((row) => row.tabIndex)).toEqual([-1, 0, -1]);
    await act(async () => host.querySelector("button")!.focus());
    await pressTab();
    expect(document.activeElement).toBe(rows[1]);
    // Arrows move the stop with focus, so Tab leaves the list from any row.
    await userEvent.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(rows[2]);
    expect(rows.map((row) => row.tabIndex)).toEqual([-1, -1, 0]);
    await pressTab();
    expect(document.activeElement!.textContent).toBe("After");
    // Back in, the open conversation has the stop again.
    expect(rows.map((row) => row.tabIndex)).toEqual([-1, 0, -1]);
    await pressTab({ shift: true });
    expect(document.activeElement).toBe(rows[1]);
    // With nothing open, the first row has it.
    await act(async () => (document.activeElement as HTMLElement).blur());
    await rerender(
      <>
        <button type="button">Before</button>
        <ConversationList label="Conversations" items={items} selectedId="gone" onSelect={() => {}} />
        <button type="button">After</button>
      </>,
    );
    expect(rows.map((row) => row.tabIndex)).toEqual([0, -1, -1]);
  });

  it("keeps the stop on the row that has focus while the open conversation changes", async () => {
    function Inbox() {
      const [openId, setOpenId] = useState<string | null>("ana");
      return <ConversationList label="Conversations" items={items} selectedId={openId} onSelect={setOpenId} />;
    }
    const { rows } = await render(<Inbox />);
    await act(async () => rows[0]!.focus());
    await userEvent.keyboard("{Enter}");
    expect(rows[0]!.getAttribute("aria-current")).toBe("true");
    expect(rows.map((row) => row.tabIndex)).toEqual([0, -1, -1]);
    // Focus moving inside the list keeps the stop in the list.
    await act(async () => rows[2]!.focus());
    expect(rows.map((row) => row.tabIndex)).toEqual([-1, -1, 0]);
  });

  it("gives onSelect the click when the handler takes it, and the id alone otherwise", async () => {
    const withEvent = vi.fn<(id: string, event: MouseEvent<HTMLButtonElement>) => void>();
    const { rows, rerender } = await render(<ConversationList label="Conversations" items={items} onSelect={(id, event) => withEvent(id, event)} />);
    await userEvent.click(rows[1]!);
    expect(withEvent).toHaveBeenCalledTimes(1);
    const [id, event] = withEvent.mock.calls[0]!;
    expect(id).toBe("ana");
    expect(event.type).toBe("click");
    expect((event.target as Element).closest('[data-ouro-part="row"]')).toBe(rows[1]);
    expect(event.nativeEvent.isTrusted).toBe(true);
    // A one-parameter handler, as a server action is to the client, gets nothing it cannot send.
    const seen: unknown[][] = [];
    await rerender(
      <ConversationList
        label="Conversations"
        items={items}
        onSelect={function (this: unknown, id: string) {
          // eslint-disable-next-line prefer-rest-params -- the arguments the list passed, beyond the declared one
          seen.push([id, ...[...arguments].slice(1)]);
        }}
      />,
    );
    await userEvent.click(rows[2]!);
    expect(seen).toEqual([["garden"]]);
  });

  it("shows where a conversation is after its title, muted, and reads it after the title", async () => {
    const { rows } = await render(
      <ConversationList label="Conversations" items={[{ id: "design", title: "Design reviews", where: "Launch team", preview: "Sign off on the mockups?", time: "9:12" }]} onSelect={() => {}} />,
    );
    const title = rows[0]!.querySelector<HTMLElement>("[data-ouro-conversation-title]")!;
    const where = rows[0]!.querySelector<HTMLElement>("[data-ouro-conversation-where]")!;
    expect(where.textContent).toBe("· Launch team");
    expect(where.querySelector('[aria-hidden="true"]')!.textContent).toBe("· ");
    expect(Math.round(where.getBoundingClientRect().top)).toBeLessThan(Math.round(title.getBoundingClientRect().bottom));
    expect(where.getBoundingClientRect().left).toBeGreaterThanOrEqual(title.getBoundingClientRect().right);
    expect(getComputedStyle(where).color).not.toBe(getComputedStyle(title).color);
    await expect.element(page.getByRole("button", { name: /^Design reviews Launch team 9:12/ })).toBeVisible();
  });

  it("shows a quiet name tag after the title, read after it, and shortens the title first", async () => {
    const { rows } = await render(
      <div style={{ width: 260 }}>
        <ConversationList
          label="Chats"
          items={[
            { id: "halden", title: "Halden", nameTag: "AI agent", preview: "I'll post the summary by 4:00.", time: "3:31" },
            { id: "long", title: "Halden, the launch planning agent for the spring release", nameTag: "AI agent", time: "3:31" },
          ]}
          onSelect={() => {}}
        />
      </div>,
    );
    const parts = (row: HTMLElement) => [row.querySelector<HTMLElement>("[data-ouro-conversation-title]")!, row.querySelector<HTMLElement>("[data-ouro-conversation-name-tag]")!] as const;
    const [title, tag] = parts(rows[0]!);
    expect(tag.textContent).toBe(", AI agent");
    expect(tag.querySelector(".sr-only")!.textContent).toBe(", ");
    expect(Math.round(tag.getBoundingClientRect().top)).toBeLessThan(Math.round(title.getBoundingClientRect().bottom));
    expect(tag.getBoundingClientRect().left).toBeGreaterThanOrEqual(title.getBoundingClientRect().right);
    expect(getComputedStyle(tag).color).not.toBe(getComputedStyle(title).color);
    expect(parseFloat(getComputedStyle(tag).fontSize)).toBeLessThan(parseFloat(getComputedStyle(title).fontSize));
    expect(getComputedStyle(tag).fontWeight).toBe("400");
    await expect.element(page.getByRole("button", { name: /^Halden ?, AI agent/ })).toBeVisible();
    const [longTitle, longTag] = parts(rows[1]!);
    expect(longTitle.scrollWidth).toBeGreaterThan(longTitle.clientWidth);
    expect(longTag.scrollWidth).toBe(longTag.clientWidth);
    expect(rows[1]!.querySelector("[data-ouro-conversation-name-tag]")).not.toBeNull();
    expect(rows[0]!.parentElement!.parentElement!.querySelectorAll("[data-ouro-conversation-name-tag]")).toHaveLength(2);
  });

  it("shows the where whole or not at all, never cut, and gives it up before the title", async () => {
    const { rows } = await render(
      <div style={{ width: 300 }}>
        <ConversationList
          label="Conversations"
          items={[
            { id: "fits", title: "Design", where: "Harbor", time: "9:12" },
            { id: "tight", title: "Release notes", where: "Harbor Point team", time: "5:54 PM" },
            { id: "long", title: "Design reviews", where: "The launch team for the spring release", time: "9:12" },
          ]}
          onSelect={() => {}}
        />
      </div>,
    );
    // The parts of the where's text a person sees: whole, or nothing.
    const seen = (row: HTMLElement) => {
      const where = row.querySelector<HTMLElement>("[data-ouro-conversation-where]")!;
      const box = where.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(where);
      const text = [...range.getClientRects()].filter((rect) => rect.width > 0);
      const inside = (rect: DOMRect) => rect.left >= box.left - 0.5 && rect.right <= box.right + 0.5 && rect.top >= box.top - 0.5 && rect.bottom <= box.bottom + 0.5;
      const outside = (rect: DOMRect) => rect.right <= box.left + 0.5 || rect.left >= box.right - 0.5 || rect.bottom <= box.top + 0.5 || rect.top >= box.bottom - 0.5;
      return text.every(inside) ? "whole" : text.every((rect) => inside(rect) || outside(rect)) ? "hidden" : "cut";
    };
    expect(rows.map(seen)).toEqual(["whole", "hidden", "hidden"]);
    for (const row of rows) {
      const title = row.querySelector<HTMLElement>("[data-ouro-conversation-title]")!;
      expect(title.scrollWidth).toBe(title.clientWidth);
    }
    await expect.element(page.getByRole("button", { name: /^Release notes Harbor Point team 5:54 PM/ })).toBeVisible();
  });

  it("shows an icon before the title in the muted color", async () => {
    const pin = (
      <svg role="img" aria-label="Pinned" viewBox="0 0 16 16">
        <circle cx="8" cy="8" r="4" fill="currentColor" />
      </svg>
    );
    const { rows } = await render(<ConversationList label="Conversations" items={[{ ...items[1]!, icon: pin }, items[2]!]} onSelect={() => {}} />);
    const icon = rows[0]!.querySelector<HTMLElement>("[data-ouro-conversation-icon]")!;
    const title = rows[0]!.querySelector<HTMLElement>("[data-ouro-conversation-title]")!;
    expect(icon.nextElementSibling).toBe(title);
    expect(icon.querySelector("svg")!.getBoundingClientRect().width).toBe(16);
    expect(getComputedStyle(icon).color).not.toBe(getComputedStyle(title).color);
    await expect.element(page.getByRole("button", { name: /^Pinned Ana Lind/ })).toBeVisible();
    expect(rows[1]!.querySelector("[data-ouro-conversation-icon]")).toBeNull();
  });

  it("puts a mark at the end of the last line, under the time, in place of the unread dot", async () => {
    const mention = <Badge tone="destructive">@</Badge>;
    const { rows } = await render(
      <ConversationList
        label="Conversations"
        items={[
          { id: "a", title: "Trail crew", preview: "Meet at eight.", time: "9:41", unread: true, mark: mention },
          { id: "b", title: "Weekly sync", subtitle: "Garden club", time: "9:27", mark: "in 10 min" },
          { id: "c", title: "Ana Lind", time: "Tue", unread: true },
          { id: "d", title: "Grace Hopper", preview: "Found the bug.", time: "Mon" },
        ]}
        onSelect={() => {}}
      />,
    );
    // A badge a little taller than the line leaves the row the height of one without a mark.
    expect(rows[0]!.getBoundingClientRect().height).toBe(rows[3]!.getBoundingClientRect().height);
    const mark = (row: HTMLElement) => row.querySelector<HTMLElement>("[data-ouro-conversation-mark]")!;
    const time = (row: HTMLElement) => row.querySelector<HTMLElement>("[data-ouro-conversation-time]")!;
    // On the preview line, its end lined up with the time's.
    expect(mark(rows[0]!).parentElement).toBe(rows[0]!.querySelector("[data-ouro-conversation-preview]")!.parentElement);
    expect(Math.round(mark(rows[0]!).getBoundingClientRect().right)).toBe(Math.round(time(rows[0]!).getBoundingClientRect().right));
    expect(mark(rows[0]!).getBoundingClientRect().top).toBeGreaterThanOrEqual(time(rows[0]!).getBoundingClientRect().bottom - 1);
    // The mark replaces the dot, and screen readers still hear that the row is unread.
    const unread = rows[0]!.querySelector<HTMLElement>("[data-ouro-conversation-unread]")!;
    expect(unread.querySelector('[aria-hidden="true"]')).toBeNull();
    expect(unread.textContent).toBe("Unread");
    // With no preview, on the subtitle's line; with one line, after the time.
    expect(mark(rows[1]!).parentElement).toBe(rows[1]!.querySelector("[data-ouro-conversation-subtitle]")!.parentElement);
    expect(mark(rows[1]!).textContent).toBe("in 10 min");
    // Words show small and muted, like the time.
    expect(getComputedStyle(mark(rows[1]!)).fontSize).toBe("12px");
    expect(getComputedStyle(mark(rows[1]!)).color).toBe(getComputedStyle(time(rows[1]!)).color);
    expect(rows[1]!.querySelector("[data-ouro-conversation-unread]")).toBeNull();
    expect(rows[2]!.querySelector("[data-ouro-conversation-unread]")!.previousElementSibling).toBe(time(rows[2]!));
  });

  it("keeps the mark on the title line when compact drops the preview", async () => {
    const { rows } = await render(
      <ConversationList label="Conversations" density="compact" items={[{ id: "a", title: "Trail crew", preview: "Meet at eight.", time: "9:41", mark: "in 10 min" }]} onSelect={() => {}} />,
    );
    const mark = rows[0]!.querySelector<HTMLElement>("[data-ouro-conversation-mark]")!;
    expect(mark.previousElementSibling).toBe(rows[0]!.querySelector("[data-ouro-conversation-time]"));
  });

  it("leaves out a mark or an icon that is false, and keeps the unread dot", async () => {
    const { rows } = await render(<ConversationList label="Conversations" items={[{ id: "a", title: "Trail crew", preview: "Meet at eight.", unread: true, mark: false, icon: false }]} onSelect={() => {}} />);
    expect(rows[0]!.querySelector("[data-ouro-conversation-mark], [data-ouro-conversation-icon]")).toBeNull();
    expect(rows[0]!.querySelector("[data-ouro-conversation-unread] [aria-hidden='true']")).not.toBeNull();
  });

  it("shows an avatar element the app passes in place of the initials", async () => {
    const { rows } = await render(
      <ConversationList label="Conversations" items={[{ ...items[1]!, avatar: <span data-testid="face">AL</span> }, items[0]!]} onSelect={() => {}} />,
    );
    const slot = rows[0]!.querySelector<HTMLElement>("[data-ouro-conversation-avatar]")!;
    expect(slot.firstElementChild!.getAttribute("data-testid")).toBe("face");
    expect(slot.nextElementSibling!.querySelector("[data-ouro-conversation-title]")).not.toBeNull();
    expect(rows[0]!.querySelector('[data-ouro="avatar"]')).toBeNull();
    expect(rows[1]!.querySelector("[data-ouro-conversation-avatar]")).toBeNull();
    // Only a custom avatar element carries its own words into the row's accessible name; the default Avatar (drawn
    // here for items[0]) does not, so the row has no aria-labelledby joining it in.
    expect(rows[1]!.hasAttribute("aria-labelledby")).toBe(false);
  });

  it("reads the title before a custom avatar's own words (a presence dot), whatever order the DOM draws them in", async () => {
    await render(
      <ConversationList
        label="Conversations"
        items={[
          {
            id: "sal",
            title: "Sal Example",
            time: "2:19 AM",
            preview: "Quick question…",
            avatar: <Avatar name="Sal Example" alt="" presence="available" presenceLabel="Available" />,
          },
        ]}
        onSelect={() => {}}
      />,
    );
    await expect.element(page.getByRole("button", { name: /^Sal Example 2:19 AM Quick question… Available$/ })).toBeVisible();
  });

  it("keeps every row the same shape in a narrow list: the time shows and long text ends in an ellipsis", async () => {
    const { rows } = await render(
      <div style={{ width: 220 }}>
        <ConversationList
          label="Unread"
          items={[
            { id: "a", title: "Weekly sync", where: "Garden club", preview: "Could you share the rollout numbers before Friday's review?", time: "9:27", unread: true },
            { id: "b", title: "Ana Lind", preview: "Short.", time: "Tue" },
          ]}
          onSelect={() => {}}
        />
      </div>,
    );
    for (const row of rows) {
      const time = row.querySelector<HTMLElement>("[data-ouro-conversation-time]")!;
      expect(time.getBoundingClientRect().width).toBeGreaterThan(0);
      expect(time.getBoundingClientRect().right).toBeLessThanOrEqual(row.getBoundingClientRect().right);
      expect(row.scrollWidth).toBe(row.clientWidth);
    }
    const preview = rows[0]!.querySelector<HTMLElement>("[data-ouro-conversation-preview]")!;
    expect(preview.scrollWidth).toBeGreaterThan(preview.clientWidth);
    expect(getComputedStyle(preview).textOverflow).toBe("ellipsis");
    expect(Math.round(rows[0]!.querySelector("[data-ouro-conversation-time]")!.getBoundingClientRect().right)).toBe(
      Math.round(rows[1]!.querySelector("[data-ouro-conversation-time]")!.getBoundingClientRect().right),
    );
  });

  it("forwards a ref and lets app layout classes win", async () => {
    let element: HTMLDivElement | null = null;
    const { list } = await render(
      <ConversationList label="Conversations" items={items} onSelect={() => {}} className="mt-4" id="inbox" ref={(node) => void (element = node)} />,
    );
    expect(element).toBe(list);
    expect(list.id).toBe("inbox");
    expect(getComputedStyle(list).marginTop).toBe("16px");
  });
});

const grouped: ConversationListItem[] = [
  { id: "notes", title: "Notes to self", preview: "Bring the slides.", time: "Mon" },
  { id: "trail", title: "Trail crew", preview: "Meet at the north gate at eight.", time: "9:41", unread: true, section: "recent" },
  { id: "ana", title: "Ana Lind", preview: "The engine notes are attached.", time: "Tue", section: "pinned" },
  { id: "garden", title: "Garden club", preview: "Seed swap moved to Sunday.", time: "Mon", section: "recent" },
];
const sections = [
  { id: "pinned", title: "Pinned" },
  { id: "recent", title: "Recent", note: "you posted here lately" },
  { id: "empty", title: "Archive" },
];

describe("ConversationList sections", () => {
  const headers = (host: HTMLElement) => [...host.querySelectorAll<HTMLButtonElement>('[data-ouro-part="section"]')];

  it("groups rows under headers that open and close them", async () => {
    const onSectionOpenChange = vi.fn();
    const { host, rows } = await render(<ConversationList label="Chats" items={grouped} sections={sections} onSectionOpenChange={onSectionOpenChange} onSelect={() => {}} />);
    // Rows with no section first, then each section's rows in the sections' order; an empty section is left out.
    expect(rows.map((row) => row.querySelector("[data-ouro-conversation-title]")!.textContent)).toEqual(["Notes to self", "Ana Lind", "Trail crew", "Garden club"]);
    expect(headers(host).map((header) => header.textContent)).toEqual(["Pinned", "Recentyou posted here lately"]);
    const recent = headers(host)[1]!;
    expect(recent.getAttribute("aria-expanded")).toBe("true");
    const group = document.getElementById(recent.getAttribute("aria-controls")!)!;
    expect(group.getAttribute("aria-label")).toBe("Recent");
    expect(group.querySelectorAll('[data-ouro-part="row"]')).toHaveLength(2);
    await expect.element(page.getByRole("list", { name: "Pinned" })).toBeVisible();
    await userEvent.click(recent);
    expect(recent.getAttribute("aria-expanded")).toBe("false");
    expect(recent.hasAttribute("aria-controls")).toBe(false);
    expect(host.querySelectorAll('[data-ouro-part="row"]')).toHaveLength(2);
    expect(onSectionOpenChange).toHaveBeenLastCalledWith("recent", false);
    await userEvent.click(recent);
    expect(host.querySelectorAll('[data-ouro-part="row"]')).toHaveLength(4);
    expect(onSectionOpenChange).toHaveBeenLastCalledWith("recent", true);
  });

  it("starts a section closed with defaultOpen, and follows open when the app keeps the state", async () => {
    const { host, rerender } = await render(<ConversationList label="Chats" items={grouped} sections={[sections[0]!, { ...sections[1]!, defaultOpen: false }]} onSelect={() => {}} />);
    expect(headers(host).map((header) => header.getAttribute("aria-expanded"))).toEqual(["true", "false"]);
    const onSectionOpenChange = vi.fn();
    await rerender(<ConversationList label="Chats" items={grouped} sections={[{ ...sections[0]!, open: false }, sections[1]!]} onSectionOpenChange={onSectionOpenChange} onSelect={() => {}} />);
    expect(headers(host)[0]!.getAttribute("aria-expanded")).toBe("false");
    await userEvent.click(headers(host)[0]!);
    expect(onSectionOpenChange).toHaveBeenCalledWith("pinned", true);
    // The app has not opened it, so it stays closed.
    expect(headers(host)[0]!.getAttribute("aria-expanded")).toBe("false");
  });

  it("shows a closed section's unread dot, which screen readers hear", async () => {
    const { host } = await render(
      <ConversationList label="Chats" items={grouped} sections={[{ ...sections[0]!, defaultOpen: false }, { ...sections[1]!, defaultOpen: false }]} unreadLabel="Non lu" onSelect={() => {}} />,
    );
    const [pinned, recent] = headers(host);
    expect(pinned!.querySelector("[data-ouro-conversation-unread]")).toBeNull();
    const unread = recent!.querySelector<HTMLElement>("[data-ouro-conversation-unread]")!;
    expect(unread.textContent).toBe("Non lu");
    expect(unread.querySelector('[aria-hidden="true"]')!.getBoundingClientRect().width).toBe(8);
    expect(Math.round(unread.getBoundingClientRect().right)).toBeGreaterThan(Math.round(recent!.getBoundingClientRect().right) - 20);
    await userEvent.click(recent!);
    expect(recent!.querySelector("[data-ouro-conversation-unread]")).toBeNull();
  });

  it("moves through headers and open rows with the arrows, and opens and closes a section with Right and Left", async () => {
    const { host, rows } = await render(<ConversationList label="Chats" items={grouped} sections={sections} onSelect={() => {}} />);
    const [pinned, recent] = headers(host);
    expect([...host.querySelectorAll<HTMLButtonElement>('[data-ouro-control="conversation-list"]')].map((control) => control.tabIndex)).toEqual([0, -1, -1, -1, -1, -1]);
    await act(async () => rows[0]!.focus());
    await userEvent.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(pinned);
    expect(pinned!.tabIndex).toBe(0);
    expect(rows[0]!.tabIndex).toBe(-1);
    await userEvent.keyboard("{ArrowDown}{ArrowDown}");
    expect(document.activeElement).toBe(recent);
    await userEvent.keyboard("{ArrowLeft}");
    expect(recent!.getAttribute("aria-expanded")).toBe("false");
    await userEvent.keyboard("{End}");
    expect(document.activeElement).toBe(recent);
    // Left on a closed header and Right on an open one leave it as it is, and the page gets the key.
    const seen = vi.fn();
    document.addEventListener("keydown", seen);
    await userEvent.keyboard("{ArrowLeft}");
    expect(recent!.getAttribute("aria-expanded")).toBe("false");
    await userEvent.keyboard("{ArrowRight}");
    expect(recent!.getAttribute("aria-expanded")).toBe("true");
    await userEvent.keyboard("{ArrowRight}");
    document.removeEventListener("keydown", seen);
    expect(seen.mock.calls.map((call) => (call[0] as KeyboardEvent).defaultPrevented)).toEqual([false, true, false]);
    expect(recent!.getAttribute("aria-expanded")).toBe("true");
    await userEvent.keyboard("{End}");
    expect(document.activeElement!.textContent).toContain("Garden club");
    await userEvent.keyboard("{Home}");
    expect(document.activeElement).toBe(rows[0]);
  });

  it("puts the stop on the first header when no row comes before it, and on the open row when it shows", async () => {
    const { host, rerender } = await render(<ConversationList label="Chats" items={grouped.slice(1)} sections={sections} selectedId="garden" onSelect={() => {}} />);
    const stop = () => [...host.querySelectorAll<HTMLButtonElement>('[data-ouro-control="conversation-list"]')].filter((control) => control.tabIndex === 0).map((control) => control.textContent);
    expect(stop()).toEqual([expect.stringContaining("Garden club")]);
    await rerender(<ConversationList label="Chats" items={grouped.slice(1)} sections={[sections[0]!, { ...sections[1]!, open: false }]} onSectionOpenChange={() => {}} selectedId="garden" onSelect={() => {}} />);
    expect(stop()).toEqual(["Pinned"]);
  });

  it("puts the stop on the first header when nothing is open and the first section is closed", async () => {
    const { host } = await render(<ConversationList label="Chats" items={grouped.slice(1)} sections={[{ ...sections[0]!, defaultOpen: false }, sections[1]!]} onSelect={() => {}} />);
    const stops = [...host.querySelectorAll<HTMLButtonElement>('[data-ouro-control="conversation-list"]')].filter((control) => control.tabIndex === 0);
    expect(stops).toEqual([headers(host)[0]]);
  });

  it("draws a chevron that points at the rows when open and along the header when closed, mirrored right to left", async () => {
    const { host } = await render(
      <div dir="rtl">
        <ConversationList label="Chats" items={grouped} sections={[sections[0]!, { ...sections[1]!, defaultOpen: false }]} onSelect={() => {}} />
      </div>,
    );
    const [open, closed] = headers(host).map((header) => header.querySelector<SVGElement>('svg[aria-hidden="true"]')!);
    expect(open!.querySelector("path")!.getAttribute("d")).toBe("M4 6l4 4 4-4");
    expect(closed!.querySelector("path")!.getAttribute("d")).toBe("M6 4l4 4-4 4");
    expect(open!.getBoundingClientRect().width).toBe(16);
    expect(getComputedStyle(open!).scale).toBe("none");
    expect(getComputedStyle(closed!).scale).toBe("-1 1");
    const { host: ltr } = await render(<ConversationList label="Chats" items={grouped} sections={[{ ...sections[0]!, defaultOpen: false }]} onSelect={() => {}} />);
    expect(getComputedStyle(headers(ltr)[0]!.querySelector("svg")!).scale).toBe("none");
  });

  it("spaces each header from what comes before it, and keeps a header a full target to a finger's reach on a mouse", async () => {
    const { host } = await render(<ConversationList label="Chats" items={grouped} sections={sections} onSelect={() => {}} />);
    const items = [...host.querySelectorAll<HTMLElement>("[data-ouro-conversation-section]")];
    expect(items.map((item) => getComputedStyle(item).marginTop)).toEqual(["8px", "8px"]);
    const { host: alone } = await render(<ConversationList label="Chats" items={grouped.slice(1)} sections={sections} onSelect={() => {}} />);
    expect(getComputedStyle(alone.querySelector("[data-ouro-conversation-section]")!).marginTop).toBe("0px");
    const header = headers(host)[0]!;
    expect(getComputedStyle(header).paddingTop).toBe("6px");
    expect(getComputedStyle(header).fontSize).toBe("14px");
  });
});

describe("ConversationList group chats", () => {
  const crew = [{ name: "Captain Nemo" }, { name: "Professor Aronnax" }, { name: "Conseil" }, { name: "Ned Land" }];
  const rows: ConversationListItem[] = [
    { id: "crew", title: "The whole crew", subtitle: "Four aboard", members: crew },
    { id: "nemo", title: "Captain Nemo" },
    { id: "radio", title: "Radio room", avatar: <Avatar name="Radio room" shape="square" alt="" /> },
  ];

  it("draws a group chat's avatar from its members, at the list's size", async () => {
    for (const [density, width, slices] of [
      ["comfortable", 32, 2],
      ["compact", 24, 2],
    ] as const) {
      const { host } = await render(<ConversationList label="Chats" items={rows} density={density} onSelect={() => {}} />);
      const [group, person, channel] = [...host.querySelectorAll<HTMLElement>('[data-ouro="avatar"]')];
      // A group chat is the group, a person their own avatar, and a channel the square: three different shapes.
      expect([group!.dataset["shape"], person!.dataset["shape"], channel!.dataset["shape"]]).toEqual(["group", "circle", "square"]);
      expect(group!.getBoundingClientRect().width).toBe(width);
      expect(group!.getBoundingClientRect().width).toBe(person!.getBoundingClientRect().width);
      expect(group!.querySelectorAll("[data-ouro-avatar-slice]")).toHaveLength(slices);
      expect(group!.getAttribute("aria-hidden")).toBe("true");
      host.remove();
    }
    // Screen readers hear who is in it after the title.
    await render(<ConversationList label="Chats" items={rows} onSelect={() => {}} />);
    await expect.element(page.getByRole("button", { name: /^The whole crew ?, group chat with Captain Nemo, Professor Aronnax and 2 others Four aboard$/ })).toBeVisible();
    await render(<ConversationList label="Discussions" items={rows} membersLabel={(names) => `discussion à ${names.length}`} onSelect={() => {}} />);
    await expect.element(page.getByRole("button", { name: /^The whole crew ?, discussion à 4 Four aboard$/ })).toBeVisible();
    // A channel's own Avatar element is no AvatarGroup, so it draws no message.
    expect(warn).not.toHaveBeenCalled();
    // A row with no members yet is no group chat: its name says nothing about who is in it.
    await render(<ConversationList label="Empty" items={[{ id: "new", title: "New chat", members: [] }]} onSelect={() => {}} />);
    await expect.element(page.getByRole("list", { name: "Empty" }).getByRole("button", { name: /^New chat ?$/ })).toBeVisible();
    warn.mockClear();
    // A picture the group set for itself, given as the avatar, still draws the group until it loads.
    const own = await render(<ConversationList label="Chats" items={[{ id: "crew", title: "The whole crew", members: crew, avatar: "data:image/png;base64,broken" }]} onSelect={() => {}} />);
    await expect.poll(() => own.host.querySelector('[data-ouro="avatar"]')!.getAttribute("data-image")).toBe("error");
    expect(own.host.querySelectorAll("[data-ouro-avatar-slice]")).toHaveLength(2);
    expect(warn).not.toHaveBeenCalled();
  });

  it("names members when a row's avatar is an AvatarGroup", async () => {
    const stacked: ConversationListItem = {
      id: "crew",
      title: "The whole crew",
      avatar: (
        <AvatarGroup label="Crew" size="sm">
          <Avatar name="Captain Nemo" />
          <Avatar name="Ned Land" />
        </AvatarGroup>
      ),
    };
    await render(<ConversationList label="Chats" items={[stacked]} onSelect={() => {}} />);
    expect(warn).toHaveBeenCalledWith(
      '[ouro-ui] ConversationList: the row "crew" shows an AvatarGroup, a row of faces wider than an avatar; a group chat\'s avatar is its members. Fix: { id: "crew", title: "Crew", members: [{ name: "Ana Lind", src: ana }, { name: "Ben Ito" }] }.',
    );
  });
});

describe("ConversationList development messages", () => {
  it("warns of nothing when the props are right", async () => {
    await render(<ConversationList label="Conversations" items={items} onSelect={() => {}} />);
    await render(<ConversationList label="Conversations" items={items} density="compact" selectedId="ana" onSelect={() => {}} />);
    await render(<ConversationList label="Chats" items={grouped} sections={[{ id: "pinned", title: "Pinned", open: true }, sections[1]!]} onSectionOpenChange={() => {}} onSelect={() => {}} />);
    await render(<ConversationList label="Chats" items={grouped} sections={sections} onSelect={() => {}} />);
    expect(warn).not.toHaveBeenCalled();
  });

  it("reads the sections again when they change, so a row left without its section is named", async () => {
    const rows = [{ id: "ana", title: "Ana Lind", section: "pinned" }];
    const { rerender } = await render(<ConversationList label="Chats" items={rows} sections={[{ id: "pinned", title: "Pinned" }]} onSelect={() => {}} />);
    expect(warn).not.toHaveBeenCalled();
    await rerender(<ConversationList label="Chats" items={rows} sections={[{ id: "recent", title: "Recent" }]} onSelect={() => {}} />);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('the row "ana" names section "pinned", which is not in sections'));
  });

  it.each([
    ["an unknown density", { density: "cozy" }, 'density="cozy" is not a density; use "comfortable" or "compact"', '<ConversationList density="compact">'],
    ["value", { value: "ana" }, "value is not a prop", "<ConversationList selectedId={openId}>"],
    ["selected", { selected: "ana" }, "selected is not a prop", "<ConversationList selectedId={openId}>"],
    ["onValueChange", { onValueChange: () => {} }, "onValueChange is not a prop", "<ConversationList onSelect={(id) => open(id)}>"],
    ["conversations", { conversations: [] }, "conversations is not a prop", "<ConversationList items={conversations}>"],
    ["groups", { groups: [] }, "groups is not a prop", '<ConversationList sections={[{ id: "pinned", title: "Pinned" }]} items={[{ ...row, section: "pinned" }]}>'],
    [
      "a row whose section is not in sections",
      { items: [{ id: "ana", title: "Ana Lind", section: "pinned" }] },
      'the row "ana" names section "pinned", which is not in sections, so it shows first',
      '<ConversationList sections={[{ id: "pinned", title: "Pinned" }]}>',
    ],
    [
      "a section's open without onSectionOpenChange",
      { sections: [{ id: "pinned", title: "Pinned", open: true }] },
      "a section's open is set without onSectionOpenChange, so its header cannot open or close it",
      "<ConversationList onSectionOpenChange={(id, open) => setOpen(id, open)}>",
    ],
    [
      "a missing label",
      { label: undefined },
      "label is missing, so screen readers cannot name the list",
      '<ConversationList label="Conversations" items={conversations} onSelect={open}>',
    ],
  ])("names the fix for %s", async (_name, extra, problem, fix) => {
    const props = { label: "Conversations", items, onSelect: () => {}, ...extra } as unknown as ConversationListProps;
    const { list } = await render(<ConversationList {...props} />);
    expect(warn).toHaveBeenCalledWith(`[ouro-ui] ConversationList: ${problem}. Fix: ${fix}.`);
    expect(list.hasAttribute("value")).toBe(false);
    expect(list.hasAttribute("selected")).toBe(false);
    expect(list.hasAttribute("groups")).toBe(false);
  });

  it("renders an unknown density as comfortable", async () => {
    const props = { label: "Conversations", items, onSelect: () => {}, density: "cozy" } as unknown as ConversationListProps;
    const { list } = await render(<ConversationList {...props} />);
    expect(list.dataset.density).toBe("comfortable");
  });

  it("checks the className", async () => {
    await render(<ConversationList label="Conversations" items={items} onSelect={() => {}} className="bg-blue-500" />);
    expect(warn).toHaveBeenCalledWith(
      '[ouro-ui] ConversationList: "bg-blue-500" sets appearance, and className is for layout only. Fix: remove "bg-blue-500"; ConversationList takes its colors from the theme.',
    );
  });
  it("paints a list taller than the view as its finished screen, with no row added or swapped after the first paint", async () => {
    const many: ConversationListItem[] = Array.from({ length: 40 }, (_, i) => ({ id: `c${i}`, title: `Chat ${i}`, preview: "Hello", time: "9:41" }));
    const host = document.createElement("div");
    host.style.width = "360px";
    host.style.height = "400px";
    host.style.overflow = "auto";
    document.body.append(host);
    mounted.push(host);
    const root = createRoot(host);
    roots.push(root);
    const ids = () => [...host.querySelectorAll('[data-ouro-part="row"]')].map((row) => row.textContent);
    const changes: string[] = [];
    const watcher = new MutationObserver((records) => changes.push(...records.map((r) => r.target.nodeName)));
    watcher.observe(host, { childList: true, subtree: true });
    flushSync(() => root.render(<ConversationList label="Chats" items={many} onSelect={() => {}} />));
    const first = ids();
    watcher.takeRecords();
    expect(first.length).toBeGreaterThan(0);
    expect(first.length).toBeLessThan(40);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 100))));
    watcher.disconnect();
    // Frame one holds the rows its estimates reach; the first measure drops those past the view and changes none within it.
    const settled = ids();
    expect(settled.length).toBeGreaterThan(0);
    expect(first.slice(0, settled.length)).toEqual(settled);
    expect(settled.length).toBeGreaterThan(Math.floor(400 / 80));
  });
});

describe("ConversationList row menu", () => {
  const withMenu = (pick: (label: string) => void): ConversationListItem[] => [
    { id: "ana", title: "Ana Lind", menu: [{ label: "Mark as read", onClick: () => pick("read") }, { label: "Pin", onClick: () => pick("pin") }] },
    { id: "trail", title: "Trail crew" },
  ];
  const row = (name: string) => page.getByRole("button", { name: new RegExp(`^${name}`) }).element() as HTMLElement;

  it("opens a row's menu at the pointer on a right-click, runs the chosen entry and puts focus back on the row", async () => {
    const picked: string[] = [];
    await render(<ConversationList label="Chats" items={withMenu((label) => picked.push(label))} onSelect={() => {}} />);
    await userEvent.click(row("Ana Lind"), { button: "right" });
    const menu = page.getByRole("menu", { name: "Ana Lind" });
    await expect.element(menu).toBeVisible();
    await userEvent.click(page.getByRole("menuitem", { name: "Pin" }));
    expect(picked).toEqual(["pin"]);
    await expect.poll(() => document.activeElement).toBe(row("Ana Lind"));
  });

  it("leaves the browser's own menu to a row without one, one with an empty menu, and the list around the rows", async () => {
    const items = [...withMenu(() => {}), { id: "empty", title: "Empty menu", menu: [] }];
    await render(<ConversationList label="Chats" items={items} onSelect={() => {}} />);
    for (const target of [row("Trail crew"), row("Empty menu"), row("Ana Lind").closest("ul")!]) {
      const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
      await act(async () => target.dispatchEvent(event));
      expect(event.defaultPrevented).toBe(false);
    }
    expect(page.getByRole("menu").query()).toBeNull();
    // Only a row with a menu turns off the system's own long-press callout, so a finger resting on it opens the list's menu alone.
    expect(row("Ana Lind").classList).toContain("[-webkit-touch-callout:none]");
    expect(row("Trail crew").classList).not.toContain("[-webkit-touch-callout:none]");
    expect(row("Empty menu").classList).not.toContain("[-webkit-touch-callout:none]");
  });

  // Four rows without a menu above one with, so a menu placed nowhere in particular is not where the row is.
  const lower = (): ConversationListItem[] => [...["Mo", "Kai", "Lee", "Sam"].map((title) => ({ id: title, title })), ...withMenu(() => {})];
  // How far a menu's box is from a point or a box, in px: 0 when they touch.
  const apart = (menu: DOMRect, to: { left: number; right: number; top: number; bottom: number }) =>
    Math.hypot(Math.max(menu.left - to.right, to.left - menu.right, 0), Math.max(menu.top - to.bottom, to.top - menu.bottom, 0));

  it("opens a row's menu at the pointer, in place of the browser's own", async () => {
    await render(<ConversationList label="Chats" items={lower()} onSelect={() => {}} />);
    const box = row("Ana Lind").getBoundingClientRect();
    const [x, y] = [box.left + 120, box.top + 12];
    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: x, clientY: y });
    await act(async () => row("Ana Lind").dispatchEvent(event));
    expect(event.defaultPrevented).toBe(true);
    const menu = page.getByRole("menu", { name: "Ana Lind" });
    await expect.element(menu).toBeVisible();
    await expect.poll(() => apart(menu.element().getBoundingClientRect(), { left: x, right: x, top: y, bottom: y })).toBeLessThan(16);
    await userEvent.keyboard("{Escape}");
    await expect.poll(() => page.getByRole("menu").query()).toBeNull();
    // With Menu's code loaded, the next opens within the event, before the browser draws a frame.
    row("Ana Lind").dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: x, clientY: y }));
    expect(document.querySelector('[role="menu"]')).not.toBeNull();
    await userEvent.keyboard("{Escape}");
    await expect.poll(() => page.getByRole("menu").query()).toBeNull();
    // A finger resting on the row opens it where the finger is.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      row("Ana Lind").dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "touch", clientX: x, clientY: y }));
      await act(async () => void vi.advanceTimersByTime(600));
    } finally {
      vi.useRealTimers();
    }
    await expect.element(menu).toBeVisible();
    await expect.poll(() => apart(menu.element().getBoundingClientRect(), { left: x, right: x, top: y, bottom: y })).toBeLessThan(16);
  });

  it("puts focus back on the row when a click on nothing closes its menu", async () => {
    const [width, height] = [innerWidth, innerHeight];
    await page.viewport(1280, 800);
    onTestFinished(() => page.viewport(width, height));
    await render(<ConversationList label="Chats" items={withMenu(() => {})} onSelect={() => {}} />);
    await act(async () => row("Ana Lind").focus());
    await userEvent.keyboard("{Shift>}{F10}{/Shift}");
    await expect.element(page.getByRole("menu", { name: "Ana Lind" })).toBeVisible();
    // The page's empty middle, right of the list.
    await userEvent.click(document.body, { position: { x: 900, y: 400 } });
    await expect.poll(() => page.getByRole("menu").query()).toBeNull();
    await expect.poll(() => document.activeElement).toBe(row("Ana Lind"));
  });

  it.each([
    ["at once", (focus: () => void) => focus()],
    ["once the menu has closed", (focus: () => void) => void setTimeout(focus)],
  ])("leaves focus where a chosen entry moved it, %s", async (_, when) => {
    const note = () => document.querySelector<HTMLInputElement>("#note")!.focus();
    const items: ConversationListItem[] = [{ id: "ana", title: "Ana Lind", menu: [{ label: "Write a note", onClick: () => when(note) }] }];
    await render(
      <>
        <input id="note" aria-label="Note" />
        <ConversationList label="Chats" items={items} onSelect={() => {}} />
      </>,
    );
    await userEvent.click(row("Ana Lind"), { button: "right" });
    await userEvent.click(page.getByRole("menuitem", { name: "Write a note" }));
    await expect.poll(() => page.getByRole("menu").query()).toBeNull();
    // After the list's own turn to put focus back, which it leaves.
    await act(() => new Promise((resolve) => setTimeout(resolve)));
    expect(document.activeElement?.id).toBe("note");
  });

  it("opens a row's menu beside it from the row's own Shift+F10 or Menu key, with no context menu event from the browser, and from no other key or row", async () => {
    // Wide enough for a menu beside the row; below 640px it is a bottom sheet.
    const [width, height] = [innerWidth, innerHeight];
    await page.viewport(1280, 800);
    onTestFinished(() => page.viewport(width, height));
    await render(<ConversationList label="Chats" items={lower()} onSelect={() => {}} />);
    // Keys sent by the page, which the browser follows with no context menu event of its own: only the row's key handling opens a menu.
    const press = async (name: string, init: KeyboardEventInit) => {
      const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
      await act(async () => row(name).dispatchEvent(event));
      return event.defaultPrevented;
    };
    const menu = page.getByRole("menu", { name: "Ana Lind" });
    for (const keys of [{ key: "F10", shiftKey: true }, { key: "ContextMenu" }]) {
      expect(await press("Ana Lind", keys)).toBe(true);
      await expect.element(menu).toBeVisible();
      await expect.poll(() => apart(menu.element().getBoundingClientRect(), row("Ana Lind").getBoundingClientRect())).toBeLessThan(16);
      await userEvent.keyboard("{Escape}");
      await expect.poll(() => page.getByRole("menu").query()).toBeNull();
    }
    expect(await press("Ana Lind", { key: "F10" })).toBe(false);
    expect(await press("Ana Lind", { key: "a", shiftKey: true })).toBe(false);
    expect(await press("Trail crew", { key: "F10", shiftKey: true })).toBe(false);
    expect(page.getByRole("menu").query()).toBeNull();
  });

  it("opens a row's menu when a finger rests on it, and not for a mouse, a finger that drifts or lifts, or a row without one; the press's click selects nothing", async () => {
    const selected: string[] = [];
    await render(<ConversationList label="Chats" items={withMenu(() => {})} onSelect={(id) => selected.push(id)} />);
    // Menu's code, loaded: a right-click opens and closes it once.
    await userEvent.click(row("Ana Lind"), { button: "right" });
    await expect.element(page.getByRole("menu")).toBeVisible();
    await userEvent.keyboard("{Escape}");
    await expect.poll(() => page.getByRole("menu").query()).toBeNull();
    const pointer = (type: string, target: Element, pointerType: string, dx = 0) => {
      const box = target.getBoundingClientRect();
      target.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerType, clientX: box.left + 40 + dx, clientY: box.top + 10 }));
    };
    const rest = (ms: number) => act(async () => void vi.advanceTimersByTime(ms));
    const menuShown = () => document.querySelector('[role="menu"]') !== null;
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      // A mouse held down, a row without a menu, a finger that drifts and one that lifts early open nothing.
      pointer("pointerdown", row("Ana Lind"), "mouse");
      await rest(600);
      pointer("pointerup", row("Ana Lind"), "mouse");
      pointer("pointerdown", row("Trail crew"), "touch");
      await rest(600);
      pointer("pointerup", row("Trail crew"), "touch");
      pointer("pointerdown", row("Ana Lind"), "touch");
      pointer("pointermove", row("Ana Lind"), "touch", 20);
      await rest(600);
      pointer("pointerdown", row("Ana Lind"), "touch");
      await rest(300);
      pointer("pointerup", row("Ana Lind"), "touch");
      await rest(600);
      // A second press, by a mouse, ends the finger's; a finger on the list around its rows opens nothing.
      pointer("pointerdown", row("Ana Lind"), "touch");
      await rest(300);
      pointer("pointerdown", row("Ana Lind"), "mouse");
      await rest(600);
      pointer("pointerdown", row("Ana Lind").closest("ul")!, "touch");
      await rest(600);
      expect(menuShown()).toBe(false);
      // A finger that rests, drifting no more than the slop, opens it; the browser's own context menu event for the press leaves one menu.
      pointer("pointerdown", row("Ana Lind"), "touch");
      pointer("pointermove", row("Ana Lind"), "touch", 10);
      await rest(600);
      expect(menuShown()).toBe(true);
      row("Ana Lind").dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
      expect(document.querySelectorAll('[role="menu"]')).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
    // The click that ends the press is the menu's, and only that click.
    const ending = new MouseEvent("click", { bubbles: true, cancelable: true });
    await act(async () => row("Ana Lind").dispatchEvent(ending));
    expect(ending.defaultPrevented).toBe(true);
    expect(selected).toEqual([]);
    await userEvent.keyboard("{Escape}");
    await expect.poll(() => page.getByRole("menu").query()).toBeNull();
    await act(async () => row("Ana Lind").click());
    expect(selected).toEqual(["ana"]);
    // A press whose menu closed with no click after it leaves the next tap to select, as does a tap after the menu's click.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      pointer("pointerdown", row("Ana Lind"), "touch");
      await rest(600);
    } finally {
      vi.useRealTimers();
    }
    await expect.element(page.getByRole("menu")).toBeVisible();
    await userEvent.keyboard("{Escape}");
    await expect.poll(() => page.getByRole("menu").query()).toBeNull();
    pointer("pointerdown", row("Ana Lind"), "touch");
    pointer("pointerup", row("Ana Lind"), "touch");
    await act(async () => row("Ana Lind").click());
    expect(selected).toEqual(["ana", "ana"]);
  });

  it.each([
    ["Shift+F10", "{Shift>}{F10}{/Shift}"],
    ["the Menu key", "{ContextMenu}"],
  ])("opens a focused row's menu beside it with %s, and Escape puts focus back on the row", async (_, keys) => {
    await render(<ConversationList label="Chats" items={withMenu(() => {})} onSelect={() => {}} />);
    await act(async () => row("Ana Lind").focus());
    await userEvent.keyboard(keys);
    await expect.element(page.getByRole("menu", { name: "Ana Lind" })).toBeVisible();
    await expect.poll(() => document.activeElement?.closest('[role="menu"]') !== null).toBe(true);
    await userEvent.keyboard("{Escape}");
    await expect.poll(() => document.activeElement).toBe(row("Ana Lind"));
    await expect.poll(() => page.getByRole("menu").query()).toBeNull();
  });

  it("puts focus back on the row after Escape when focus met one of the menu's focus guards while it was open", async () => {
    await render(<ConversationList label="Chats" items={withMenu(() => {})} onSelect={() => {}} />);
    await act(async () => row("Ana Lind").focus());
    await userEvent.keyboard("{Shift>}{F10}{/Shift}");
    await expect.element(page.getByRole("menu", { name: "Ana Lind" })).toBeVisible();
    await expect.poll(() => document.activeElement?.closest('[role="menu"]') !== null).toBe(true);
    const guard = document.querySelector<HTMLElement>("[data-base-ui-focus-guard]");
    expect(guard).not.toBeNull();
    // Focus meeting a guard, as Base UI's focus management does on its way back into the menu, is not focus moving away.
    await act(async () => guard!.dispatchEvent(new FocusEvent("focusin", { bubbles: true })));
    await userEvent.keyboard("{Escape}");
    await expect.poll(() => document.activeElement).toBe(row("Ana Lind"));
    await expect.poll(() => page.getByRole("menu").query()).toBeNull();
  });
});

describe("ConversationList in a bordered container, under forced colours", () => {
  it("drops the container's own edge, since the list already draws its own frame (#3180)", async () => {
    try {
      const { host } = await render(
        <div style={{ border: "1px solid black" }} className="forced-colors:border-0!" data-test-surface="">
          <ConversationList label="Chats" items={items} onSelect={() => {}} />
        </div>,
      );
      const surface = host.querySelector<HTMLElement>("[data-test-surface]")!;
      const list = host.querySelector<HTMLElement>('[data-ouro="conversation-list"]')!;
      await commands.emulateMedia({ forcedColors: "active" });
      expect(matchMedia("(forced-colors: active)").matches).toBe(true);
      // The container's own edge is gone, so only the list's own frame remains: it is not doubled.
      expect(parseFloat(getComputedStyle(surface).borderTopWidth)).toBe(0);
      expect(parseFloat(getComputedStyle(list).borderTopWidth)).toBeGreaterThan(0);
    } finally {
      await commands.emulateMedia({ forcedColors: "none" });
    }
  });
});
