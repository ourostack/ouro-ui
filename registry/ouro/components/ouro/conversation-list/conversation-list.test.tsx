import { useState, type MouseEvent, type ReactNode } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { commands, page, userEvent } from "vitest/browser";
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
  { id: "ada", title: "Ada Lovelace", preview: "The engine notes are attached.", time: "Tue" },
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
      "TCTrail crew9:41Weekend hikesMeet at the north gate at eight.Unread",
      "ALAda LovelaceTueThe engine notes are attached.",
      "Garden clubMonSeed swap moved to Sunday.",
    ]);
    expect(rows.every((row) => row.type === "button")).toBe(true);
  });

  it("calls onSelect with the row's id on a click, Enter and Space", async () => {
    const onSelect = vi.fn();
    const { rows } = await render(<ConversationList label="Conversations" items={items} onSelect={onSelect} />);
    await userEvent.click(page.getByRole("button", { name: /Ada Lovelace/ }));
    expect(onSelect).toHaveBeenLastCalledWith("ada");
    // WebKit does not focus a button on click, so focus it as a keyboard user would reach it.
    await act(async () => rows[1]!.focus());
    await userEvent.keyboard("{ArrowDown}");
    await userEvent.keyboard("{Enter}");
    expect(onSelect).toHaveBeenLastCalledWith("garden");
    await userEvent.keyboard("{ArrowUp}");
    await userEvent.keyboard(" ");
    expect(onSelect).toHaveBeenLastCalledWith("ada");
    expect(onSelect).toHaveBeenCalledTimes(3);
  });

  it("marks the open conversation current and highlights it", async () => {
    const { host, rows, rerender } = await render(<ConversationList label="Conversations" items={items} selectedId="ada" onSelect={() => {}} />);
    expect(rows.map((row) => row.getAttribute("aria-current"))).toEqual([null, "true", null]);
    // A pointer an earlier test left over the row would show its hover shade instead.
    const away = document.createElement("div");
    away.style.height = "40px";
    host.append(away);
    await userEvent.hover(away);
    await Promise.allSettled(rows.flatMap((row) => row.getAnimations()).map((animation) => animation.finished));
    const probe = document.createElement("span");
    probe.style.color = "var(--accent)";
    host.append(probe);
    expect(getComputedStyle(rows[1]!).backgroundColor).toBe(getComputedStyle(probe).color);
    probe.remove();
    expect(getComputedStyle(rows[0]!).backgroundColor).toBe("rgba(0, 0, 0, 0)");
    await rerender(<ConversationList label="Conversations" items={items} selectedId={null} onSelect={() => {}} />);
    expect(rows.some((row) => row.hasAttribute("aria-current"))).toBe(false);
  });

  it("keeps the open conversation highlighted under the pointer", async () => {
    const { host, rows } = await render(<ConversationList label="Conversations" items={items} selectedId="ada" onSelect={() => {}} />);
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
    // The open row stays exactly --accent under the pointer and while pressed, where the other rows
    // take --muted. A theme that draws the two alike (shadcn's stock themes) cannot show the
    // difference, but the row is still --accent there.
    await userEvent.hover(rows[1]!);
    expect(rows[1]!.matches(":hover")).toBe(true);
    expect(await settled(rows[1]!)).toBe(paint("var(--accent)"));
    await commands.pointerPress({ selector: '[data-ouro-control="conversation-list"][aria-current="true"]', action: "down" });
    try {
      expect(rows[1]!.matches(":active")).toBe(true);
      expect(await settled(rows[1]!)).toBe(paint("var(--accent)"));
    } finally {
      await commands.pointerPress({ action: "up" });
    }
    await userEvent.hover(rows[0]!);
    expect(await settled(rows[0]!)).toBe(paint("var(--muted)"));
    expect(await settled(rows[1]!)).toBe(paint("var(--accent)"));
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
          { id: "ada", title: "Ada Lovelace", name: "Ada L.", time: "Tue" },
        ]}
        onSelect={() => {}}
      />,
    );
    const [launch, ada] = rows;
    const title = launch!.querySelector<HTMLElement>("[data-ouro-conversation-title]")!;
    expect(title.querySelector('[aria-hidden="true"] [data-testid="rocket"]')).not.toBeNull();
    expect(title.querySelector(".sr-only")!.textContent).toBe("Launch team");
    expect(launch!.querySelector('[data-ouro="avatar"]')!.textContent).toBe("LT");
    expect(launch!.querySelector("[data-ouro-conversation-where] b")!.textContent).toBe("HQ");
    await expect.element(page.getByRole("button", { name: /^\W*(LT )?Launch team\W+Fernwood HQ 9:41$/ })).toBeVisible();
    // A text title with a name: the name is what screen readers hear and what the initials come from.
    expect(ada!.querySelector("[data-ouro-conversation-title] .sr-only")!.textContent).toBe("Ada L.");
    expect(ada!.querySelector('[data-ouro="avatar"]')!.textContent).toBe("AL");
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
    expect(rows[1]!.querySelector('[data-ouro="avatar"]')!.textContent).toBe("AL");
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
    expect(rows[0]!.textContent).toBe("NTNew topicMuted");
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
    const node = <ConversationList label="Conversations" items={items} selectedId="ada" onSelect={() => {}} />;
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
        <ConversationList label="Conversations" items={items} selectedId="ada" onSelect={() => {}} />
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
      const [openId, setOpenId] = useState<string | null>("ada");
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
    expect(id).toBe("ada");
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

  it("gives up the where before the title when the row is narrow", async () => {
    const { rows } = await render(
      <div style={{ width: 240 }}>
        <ConversationList label="Conversations" items={[{ id: "design", title: "Design reviews", where: "The launch team for the spring release", time: "9:12" }]} onSelect={() => {}} />
      </div>,
    );
    const title = rows[0]!.querySelector<HTMLElement>("[data-ouro-conversation-title]")!;
    const where = rows[0]!.querySelector<HTMLElement>("[data-ouro-conversation-where]")!;
    expect(title.scrollWidth).toBe(title.clientWidth);
    expect(where.scrollWidth).toBeGreaterThan(where.clientWidth);
    expect(getComputedStyle(where).textOverflow).toBe("ellipsis");
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
    await expect.element(page.getByRole("button", { name: /^Pinned Ada Lovelace/ })).toBeVisible();
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
          { id: "c", title: "Ada Lovelace", time: "Tue", unread: true },
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
  });

  it("keeps every row the same shape in a narrow list: the time shows and long text ends in an ellipsis", async () => {
    const { rows } = await render(
      <div style={{ width: 220 }}>
        <ConversationList
          label="Unread"
          items={[
            { id: "a", title: "Weekly sync", where: "Garden club", preview: "Could you share the rollout numbers before Friday's review?", time: "9:27", unread: true },
            { id: "b", title: "Ada Lovelace", preview: "Short.", time: "Tue" },
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
  { id: "ada", title: "Ada Lovelace", preview: "The engine notes are attached.", time: "Tue", section: "pinned" },
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
    expect(rows.map((row) => row.querySelector("[data-ouro-conversation-title]")!.textContent)).toEqual(["Notes to self", "Ada Lovelace", "Trail crew", "Garden club"]);
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

describe("ConversationList development messages", () => {
  it("warns of nothing when the props are right", async () => {
    await render(<ConversationList label="Conversations" items={items} onSelect={() => {}} />);
    await render(<ConversationList label="Conversations" items={items} density="compact" selectedId="ada" onSelect={() => {}} />);
    await render(<ConversationList label="Chats" items={grouped} sections={[{ id: "pinned", title: "Pinned", open: true }, sections[1]!]} onSectionOpenChange={() => {}} onSelect={() => {}} />);
    await render(<ConversationList label="Chats" items={grouped} sections={sections} onSelect={() => {}} />);
    expect(warn).not.toHaveBeenCalled();
  });

  it.each([
    ["an unknown density", { density: "cozy" }, 'density="cozy" is not a density; use "comfortable" or "compact"', '<ConversationList density="compact">'],
    ["value", { value: "ada" }, "value is not a prop", "<ConversationList selectedId={openId}>"],
    ["selected", { selected: "ada" }, "selected is not a prop", "<ConversationList selectedId={openId}>"],
    ["onValueChange", { onValueChange: () => {} }, "onValueChange is not a prop", "<ConversationList onSelect={(id) => open(id)}>"],
    ["conversations", { conversations: [] }, "conversations is not a prop", "<ConversationList items={conversations}>"],
    ["groups", { groups: [] }, "groups is not a prop", '<ConversationList sections={[{ id: "pinned", title: "Pinned" }]} items={[{ ...row, section: "pinned" }]}>'],
    [
      "a row whose section is not in sections",
      { items: [{ id: "ada", title: "Ada Lovelace", section: "pinned" }] },
      'the row "ada" names section "pinned", which is not in sections, so it shows first',
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
});
