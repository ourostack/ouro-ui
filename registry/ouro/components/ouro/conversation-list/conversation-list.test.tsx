import { type ReactNode } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { Badge } from "@/registry/ouro/components/ouro/badge/badge";
import { ConversationList, type ConversationListItem, type ConversationListProps } from "@/registry/ouro/components/ouro/conversation-list/conversation-list";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

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
    const probe = document.createElement("span");
    probe.style.color = "var(--accent)";
    host.append(probe);
    expect(getComputedStyle(rows[1]!).backgroundColor).toBe(getComputedStyle(probe).color);
    probe.remove();
    expect(getComputedStyle(rows[0]!).backgroundColor).toBe("rgba(0, 0, 0, 0)");
    await rerender(<ConversationList label="Conversations" items={items} selectedId={null} onSelect={() => {}} />);
    expect(rows.some((row) => row.hasAttribute("aria-current"))).toBe(false);
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
    const title = (row: HTMLElement) => row.querySelector<HTMLElement>(".truncate")!;
    expect(Number(getComputedStyle(title(rows[0]!)).fontWeight)).toBeGreaterThanOrEqual(600);
    expect(Number(getComputedStyle(title(rows[1]!)).fontWeight)).toBe(400);
    const unread = rows[0]!.querySelector<HTMLElement>("[data-ouro-conversation-unread]")!;
    expect(unread.textContent).toBe("Unread");
    expect(unread.querySelector('[aria-hidden="true"]')!.getBoundingClientRect().width).toBe(8);
    expect(rows[1]!.querySelector("[data-ouro-conversation-unread]")).toBeNull();
    await rerender(<ConversationList label="Conversations" items={items} unreadLabel="Non lu" onSelect={() => {}} />);
    expect(rows[0]!.querySelector("[data-ouro-conversation-unread]")!.textContent).toBe("Non lu");
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

  it("leaves out the time and preview when a row has none, and shows badges after the title", async () => {
    const { rows } = await render(
      <ConversationList label="Conversations" items={[{ id: "new", title: "New topic", time: null, preview: null, badges: <Badge>Muted</Badge> }]} onSelect={() => {}} />,
    );
    expect(rows[0]!.textContent).toBe("NTNew topicMuted");
    expect(rows[0]!.querySelector("[data-ouro-conversation-preview]")).toBeNull();
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

describe("ConversationList development messages", () => {
  it.each([
    ["an unknown density", { density: "cozy" }, 'density="cozy" is not a density; use "comfortable" or "compact"', '<ConversationList density="compact">'],
    ["value", { value: "ada" }, "value is not a prop", "<ConversationList selectedId={openId}>"],
    ["selected", { selected: "ada" }, "selected is not a prop", "<ConversationList selectedId={openId}>"],
    ["onValueChange", { onValueChange: () => {} }, "onValueChange is not a prop", "<ConversationList onSelect={(id) => open(id)}>"],
    ["conversations", { conversations: [] }, "conversations is not a prop", "<ConversationList items={conversations}>"],
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
