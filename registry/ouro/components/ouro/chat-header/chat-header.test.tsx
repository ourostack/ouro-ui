import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { ChatHeader, type ChatMember } from "@/registry/ouro/components/ouro/chat-header/chat-header";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

const roots: Root[] = [];
let mounted: Element[] = [];

async function render(node: ReactNode) {
  const host = document.createElement("div");
  host.style.width = "420px";
  document.body.append(host);
  mounted.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
  return { host, header: host.querySelector<HTMLElement>('[data-ouro="chat-header"]')! };
}

const crew: ChatMember[] = [
  { name: "Captain Nemo", presence: "available", presenceLabel: "On the bridge", note: "the captain" },
  { name: "Professor Aronnax", presence: "busy", presenceLabel: "Busy in the lab", note: "the ship's scientist" },
  { name: "Conseil", note: "the scientist's helper" },
  { name: "Ned Land", presence: "away", presenceLabel: "Napping" },
];
const nemo: ChatMember = { name: "Captain Nemo", presence: "available", presenceLabel: "On the bridge" };

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

const subtitleOf = (header: HTMLElement) => header.querySelector("[data-ouro-chat-header-subtitle]")?.textContent ?? null;

describe("ChatHeader", () => {
  it("shows a one-to-one chat as the person, with their presence under the title and no member list", async () => {
    const { header } = await render(<ChatHeader title="Captain Nemo" members={[nemo]} />);
    const avatar = header.querySelector<HTMLElement>('[data-ouro="avatar"]')!;
    expect(avatar.getAttribute("data-shape")).toBe("circle");
    expect(avatar.getAttribute("data-presence")).toBe("available");
    // The title and the line under it say it all, so the avatar is quiet.
    expect(avatar.getAttribute("aria-hidden")).toBe("true");
    expect(subtitleOf(header)).toBe("On the bridge");
    expect(header.hasAttribute("data-group")).toBe(false);
    expect(header.querySelector('[data-ouro-part="members"]')).toBeNull();
    // Nothing at the end without a member list or actions: the avatar and the words only.
    expect(header.children).toHaveLength(2);
    // Without a presence there is no line under the title.
    const plain = (await render(<ChatHeader title="Conseil" members={[{ name: "Conseil" }]} />)).header;
    expect(subtitleOf(plain)).toBeNull();
    expect(plain.querySelector('[data-ouro="avatar"]')!.hasAttribute("data-presence")).toBe(false);
    expect(warn).not.toHaveBeenCalled();
  });

  it("speaks the person's presence on the avatar when an app's own line takes its place", async () => {
    const { header } = await render(<ChatHeader title="Captain Nemo" members={[nemo]} subtitle="Captain Nemo is writing…" />);
    const avatar = header.querySelector<HTMLElement>('[data-ouro="avatar"]')!;
    expect(avatar.hasAttribute("aria-hidden")).toBe(false);
    expect(avatar.getAttribute("aria-label")).toBe("On the bridge");
    expect(subtitleOf(header)).toBe("Captain Nemo is writing…");
  });

  it("keeps the presence line when an app's own line is false, null or empty, as a typing line that stops leaves it", async () => {
    for (const subtitle of [false, null, ""]) {
      const { header } = await render(<ChatHeader title="Captain Nemo" members={[nemo]} subtitle={subtitle} />);
      expect(subtitleOf(header)).toBe("On the bridge");
      expect(header.querySelectorAll("[data-ouro-chat-header-subtitle]")).toHaveLength(1);
      expect(header.querySelector('[data-ouro="avatar"]')!.getAttribute("aria-hidden")).toBe("true");
    }
    const group = (await render(<ChatHeader title="Crew" members={crew} subtitle={false} />)).header;
    expect(subtitleOf(group)).toBe("Captain Nemo and 3 others");
  });

  it("says a dot without its words in plain words, and names the fix in ChatHeader's terms", async () => {
    const busy = { name: "Ana Lind", presence: "do-not-disturb" } as unknown as ChatMember;
    const { header } = await render(<ChatHeader title="Ana Lind" members={[busy]} />);
    expect(subtitleOf(header)).toBe("do not disturb");
    expect(header.querySelector('[data-ouro="avatar"]')!.getAttribute("data-presence")).toBe("do-not-disturb");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      "[ouro-ui] ChatHeader: Ana Lind's presenceLabel is missing, so the header says no words for their dot. Fix: <ChatHeader members={[{ name: \"Ana Lind\", presence: \"busy\", presenceLabel: \"In a meeting\" }]} />.",
    );
    // In a group, the message names the member whose words are missing, after one whose are there and one with no dot.
    warn.mockClear();
    await render(<ChatHeader title="Crew" members={[nemo, { name: "Plain" }, busy]} />);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("Ana Lind's presenceLabel is missing"));
    await userEvent.click(page.getByRole("button", { name: "3 members" }));
    const list = page.getByRole("dialog", { name: "Members" });
    await expect.element(list).toBeVisible();
    const rows = [...list.element().querySelectorAll("[data-ouro-chat-header-members] li")];
    expect(rows[2]!.textContent).toBe("Ana Linddo not disturb");
    // A member with neither a note nor a presence has their name alone, with no empty line under it.
    expect(rows[1]!.querySelectorAll(":scope > span:last-child > span")).toHaveLength(1);
  });

  it("shows a group chat as its members, says who is in it, and opens the member list from the count", async () => {
    const { header } = await render(<ChatHeader title="The whole crew" members={crew} />);
    const avatar = header.querySelector<HTMLElement>('[data-ouro="avatar"]')!;
    expect(avatar.getAttribute("data-shape")).toBe("group");
    expect(avatar.querySelectorAll("[data-ouro-avatar-slice]")).toHaveLength(3);
    expect(avatar.getAttribute("aria-hidden")).toBe("true");
    expect(header.getAttribute("data-group")).toBe("");
    expect(subtitleOf(header)).toBe("Captain Nemo and 3 others");
    const button = page.getByRole("button", { name: "4 members" });
    await expect.element(button).toHaveTextContent("4");
    expect(button.element().querySelector("svg path")).not.toBeNull();
    await userEvent.click(button);
    const list = page.getByRole("dialog", { name: "Members" });
    await expect.element(list).toBeVisible();
    const rows = [...list.element().querySelectorAll("[data-ouro-chat-header-members] li")];
    expect(rows.map((row) => row.textContent)).toEqual([
      "Captain Nemothe captain · On the bridge",
      "Professor Aronnaxthe ship's scientist · Busy in the lab",
      "Conseilthe scientist's helper",
      "Ned LandNapping",
    ]);
    expect(rows.map((row) => row.querySelector('[data-ouro="avatar"]')!.getAttribute("data-presence"))).toEqual(["available", "busy", null, "away"]);
    // Each presence is written beside the face, so the face is quiet and nothing is read twice.
    expect(rows.map((row) => row.querySelector('[data-ouro="avatar"]')!.getAttribute("aria-hidden"))).toEqual(["true", "true", "true", "true"]);
    await userEvent.keyboard("{Escape}");
    await expect.element(list).not.toBeInTheDocument();
    expect(warn).not.toHaveBeenCalled();
  });

  it("says who is in a group under its title, by name for two and with a count past that", async () => {
    const pair = (await render(<ChatHeader title="Pair" members={crew.slice(0, 2)} />)).header;
    expect(subtitleOf(pair)).toBe("Captain Nemo and Professor Aronnax");
    const three = (await render(<ChatHeader title="Three" members={crew.slice(0, 3)} />)).header;
    expect(subtitleOf(three)).toBe("Captain Nemo and 2 others");
    const french = (await render(<ChatHeader title="Équipage" members={crew} othersLabel={(names) => `${names[0]} et ${names.length - 1} autres`} membersLabel={(count) => `${count} membres`} membersTitle="Membres" />)).header;
    expect(subtitleOf(french)).toBe("Captain Nemo et 3 autres");
    await userEvent.click(page.getByRole("button", { name: "4 membres" }));
    await expect.element(page.getByRole("dialog", { name: "Membres" })).toBeVisible();
    const own = (await render(<ChatHeader title="Crew" members={crew} subtitle="Planning the voyage" />)).header;
    expect(subtitleOf(own)).toBe("Planning the voyage");
  });

  it("shows the group's own picture in place of its members' faces", async () => {
    const photo = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR4AWP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==";
    const { header } = await render(<ChatHeader title="The whole crew" members={crew} avatar={photo} />);
    const avatar = header.querySelector<HTMLElement>('[data-ouro="avatar"]')!;
    await expect.poll(() => avatar.getAttribute("data-image")).toBe("loaded");
    expect(avatar.querySelector("img")!.getAttribute("src")).toBe(photo);
    // A one-to-one chat draws the person's own picture, not avatar.
    const one = (await render(<ChatHeader title="Captain Nemo" members={[{ ...nemo, src: photo }]} avatar="/ignored.png" />)).header;
    await expect.poll(() => one.querySelector("[data-ouro='avatar'] img")?.getAttribute("src")).toBe(photo);
  });

  it("names the chat with a heading at the level asked, and keeps actions at the end", async () => {
    const { header } = await render(<ChatHeader title="The whole crew" members={crew} actions={<Button aria-label="Call">Call</Button>} />);
    await expect.element(page.getByRole("heading", { level: 2, name: "The whole crew" })).toBeVisible();
    const call = page.getByRole("button", { name: "Call" }).element();
    const members = header.querySelector('[data-ouro-part="members"]')!;
    // Actions come last, after the member list's button.
    expect(members.compareDocumentPosition(call) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(call.getBoundingClientRect().right).toBeCloseTo(header.getBoundingClientRect().right, 0);
    for (const level of [1, 3, 4] as const) {
      await render(<ChatHeader title={`Level ${level}`} members={[nemo]} level={level} actions={<Button>Call</Button>} />);
      await expect.element(page.getByRole("heading", { level, name: `Level ${level}` })).toBeVisible();
    }
    // A one-to-one chat with actions has them, without a member list.
    expect(mounted.at(-1)!.querySelector('[data-ouro-part="members"]')).toBeNull();
    expect(mounted.at(-1)!.textContent).toContain("Call");
  });

  it("shows a back button only with onBack, at the start, and calls it", async () => {
    const { header } = await render(<ChatHeader title="The whole crew" members={crew} />);
    expect(header.querySelector('[data-ouro-part="back"]')).toBeNull();
    const onBack = vi.fn();
    const back = (await render(<ChatHeader title="Captain Nemo" members={[nemo]} onBack={onBack} backLabel="Chats" />)).header;
    const button = page.getByRole("button", { name: "Chats" });
    expect(back.firstElementChild).toBe(button.element());
    await userEvent.click(button);
    expect(onBack).toHaveBeenCalledTimes(1);
    await render(<ChatHeader title="Ned Land" members={[{ name: "Ned Land" }]} onBack={() => {}} />);
    await expect.element(page.getByRole("button", { name: "Back" })).toBeVisible();
  });

  it("turns the back arrow to point the other way right to left", async () => {
    const { host } = await render(
      <div dir="rtl">
        <ChatHeader title="Captain Nemo" members={[nemo]} onBack={() => {}} />
      </div>,
    );
    const arrow = host.querySelector<SVGElement>('[data-ouro-part="back"] svg')!;
    expect(getComputedStyle(arrow).scale).toBe("-1 1");
    const box = host.querySelector('[data-ouro-part="back"]')!.getBoundingClientRect();
    expect(box.right).toBeGreaterThan(host.querySelector('[data-ouro="avatar"]')!.getBoundingClientRect().right);
  });

  it("renders to a string with its heading, avatar and line", () => {
    const html = renderToString(<ChatHeader title="The whole crew" members={crew} />);
    expect(html).toContain('data-ouro="chat-header"');
    expect(html).toContain("<h2");
    expect(html).toContain('data-shape="group"');
    expect(html).toContain("Captain Nemo and 3 others");
  });
});

describe("ChatHeader development messages", () => {
  it.each([
    ["participants", { participants: crew }, "participants is not a prop; a chat's people are members", '<ChatHeader title="Crew" members={[{ name: "Ana Lind", src: ana }]} />'],
    ["people", { people: crew }, "people is not a prop; a chat's people are members", '<ChatHeader title="Crew" members={[{ name: "Ana Lind", src: ana }]} />'],
    ["description", { description: "Hi" }, "description is not a prop", '<ChatHeader subtitle="Planning the voyage" />'],
    ["name", { name: "Crew" }, "name is not a prop; the chat's name is title", '<ChatHeader title="The whole crew" />'],
    ["level", { level: 5 }, "level={5} is not a level; use 1, 2, 3 or 4", "<ChatHeader level={2} />"],
    ["an empty members", { members: [] }, "members is empty, so the header shows no one", '<ChatHeader title="Crew" members={[{ name: "Crew" }]} />'],
  ])("names the fix for %s", async (_name, extra, problem, fix) => {
    const props = { title: "Crew", members: crew, ...extra } as unknown as Parameters<typeof ChatHeader>[0];
    const { header } = await render(<ChatHeader {...props} />);
    expect(warn).toHaveBeenCalledWith(`[ouro-ui] ChatHeader: ${problem}. Fix: ${fix}.`);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(header.querySelector("h2")!.textContent).toBe("Crew");
    expect(header.hasAttribute("participants")).toBe(false);
    expect(header.hasAttribute("description")).toBe(false);
  });

  it("checks the className", async () => {
    await render(<ChatHeader title="Crew" members={crew} className="bg-muted" />);
    expect(warn).toHaveBeenCalledWith('[ouro-ui] ChatHeader: "bg-muted" sets appearance, and className is for layout only. Fix: remove "bg-muted"; ChatHeader takes its colors from the theme.');
  });
});
