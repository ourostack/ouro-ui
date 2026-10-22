import { useState, type ReactNode } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { ReactionBar, type Reaction, type ReactionBarProps, type ReactionOption } from "@/registry/ouro/components/ouro/reaction-bar/reaction-bar";
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
    get bar() {
      return host.querySelector<HTMLElement>('[data-ouro="reaction-bar"]');
    },
  };
}

const reactions: Reaction[] = [
  { key: "like", label: "Like", emoji: "👍", count: 3, mine: true },
  { key: "laugh", label: "Laugh", emoji: "😄", count: 1 },
];
const quick: ReactionOption[] = [
  { key: "like", label: "Like", emoji: "👍" },
  { key: "heart", label: "Heart", emoji: "❤️" },
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

function Toggling({ onReact }: { onReact: (key: string, trusted: boolean) => void }) {
  const [list, setList] = useState<Reaction[]>(reactions);
  return (
    <ReactionBar
      reactions={list}
      quick={quick}
      onReact={(key, event) => {
        onReact(key, event.isTrusted);
        setList((current) => {
          const found = current.find((reaction) => reaction.key === key);
          const option = quick.find((candidate) => candidate.key === key)!;
          if (!found) return [...current, { ...option, count: 1, mine: true }];
          return current.map((reaction) => (reaction.key === key ? { ...reaction, count: reaction.count + (reaction.mine ? -1 : 1), mine: !reaction.mine } : reaction));
        });
      }}
    />
  );
}

describe("ReactionBar", () => {
  it("shows each reaction as a toggle button named by its label and count", async () => {
    const { bar } = await render(<ReactionBar reactions={reactions} onReact={() => {}} />);
    await expect.element(page.getByRole("group", { name: "Reactions" })).toBeVisible();
    await expect.element(page.getByRole("button", { name: "Like, 3" })).toHaveAttribute("aria-pressed", "true");
    await expect.element(page.getByRole("button", { name: "Laugh, 1" })).toHaveAttribute("aria-pressed", "false");
    expect(bar!.querySelectorAll('[data-ouro-part="reaction"]')).toHaveLength(2);
    // The emoji shows but is not read: screen readers hear the label.
    expect(bar!.querySelector('[aria-hidden="true"]:not([data-ouro-touch-target])')!.textContent).toBe("👍");
  });

  it("tints the person's own reaction", async () => {
    const { bar } = await render(<ReactionBar reactions={reactions} onReact={() => {}} />);
    const [mine, other] = [...bar!.querySelectorAll<HTMLElement>('[data-ouro="badge"]')];
    expect(mine!.className).toContain("bg-primary/10");
    expect(other!.className).not.toContain("bg-primary/10");
  });

  it("calls onReact with the key and the trusted click, to add or take back a reaction", async () => {
    const onReact = vi.fn();
    await render(<Toggling onReact={onReact} />);
    await userEvent.click(page.getByRole("button", { name: "Like, 3" }));
    expect(onReact).toHaveBeenLastCalledWith("like", true);
    await expect.element(page.getByRole("button", { name: "Like, 2" })).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(page.getByRole("button", { name: "Laugh, 1" }));
    expect(onReact).toHaveBeenLastCalledWith("laugh", true);
    await expect.element(page.getByRole("button", { name: "Laugh, 2" })).toHaveAttribute("aria-pressed", "true");
  });

  it("offers quick reactions that are not there yet, and moves one to the counts once chosen", async () => {
    const onReact = vi.fn();
    const { bar } = await render(<Toggling onReact={onReact} />);
    const quickParts = () => [...bar!.querySelectorAll<HTMLElement>('[data-ouro-part="quick"]')].map((part) => part.textContent);
    // Like is already counted, so only Heart is offered.
    expect(quickParts()).toEqual(["❤️Heart"]);
    await expect.element(page.getByRole("button", { name: "Heart", exact: true })).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(page.getByRole("button", { name: "Heart", exact: true }));
    expect(onReact).toHaveBeenLastCalledWith("heart", true);
    expect(quickParts()).toEqual([]);
    await expect.element(page.getByRole("button", { name: "Heart, 1" })).toHaveAttribute("aria-pressed", "true");
  });

  it("keeps keyboard focus on a quick reaction once chosen, and on the last one taken back", async () => {
    // This app drops a reaction nobody has left, so taking back the last Heart offers it again.
    function Dropping() {
      const [list, setList] = useState<Reaction[]>(reactions);
      return (
        <ReactionBar
          reactions={list}
          quick={quick}
          onReact={(key) =>
            setList((current) => {
              const found = current.find((reaction) => reaction.key === key);
              if (!found) return [...current, { ...quick.find((option) => option.key === key)!, count: 1, mine: true }];
              const next = found.mine ? found.count - 1 : found.count + 1;
              return next === 0 ? current.filter((reaction) => reaction.key !== key) : current.map((reaction) => (reaction === found ? { ...found, count: next, mine: !found.mine } : reaction));
            })
          }
        />
      );
    }
    const { bar } = await render(<Dropping />);
    const heart = bar!.querySelector<HTMLElement>('[data-ouro-part="quick"]')!;
    await act(async () => heart.focus());
    await userEvent.keyboard("{Enter}");
    await expect.element(page.getByRole("button", { name: "Heart, 1" })).toHaveFocus();
    expect(document.activeElement).toBe(heart);
    expect(heart.dataset.ouroPart).toBe("reaction");
    await userEvent.keyboard("{Enter}");
    await expect.element(page.getByRole("button", { name: "Heart", exact: true })).toHaveFocus();
    expect(document.activeElement).toBe(heart);
    expect(heart.dataset.ouroPart).toBe("quick");
  });

  it("keeps the counts but turns off reacting when disabled", async () => {
    const onReact = vi.fn();
    const { bar } = await render(<ReactionBar reactions={reactions} quick={quick} onReact={onReact} disabled />);
    const buttons = [...bar!.querySelectorAll<HTMLButtonElement>("button")];
    expect(buttons).toHaveLength(3);
    expect(buttons.every((button) => button.disabled)).toBe(true);
    buttons[0]!.click();
    expect(onReact).not.toHaveBeenCalled();
  });

  it("is read-only without onReact, and says which reaction is yours", async () => {
    const { bar } = await render(<ReactionBar reactions={reactions} />);
    expect(bar!.querySelector("button")).toBeNull();
    const [mine, other] = [...bar!.querySelectorAll<HTMLElement>('[data-ouro="badge"]')];
    expect(mine!.textContent).toBe("👍Like, 3, including you");
    expect(mine!.className).toContain("bg-primary/10");
    expect(other!.textContent).toBe("😄Laugh, 1");
  });

  it("takes other words for the group and the person's own reaction", async () => {
    const { bar } = await render(<ReactionBar reactions={reactions} label="Réactions" mineLabel="dont vous" />);
    await expect.element(page.getByRole("group", { name: "Réactions" })).toBeVisible();
    expect(bar!.querySelector('[data-ouro="badge"]')!.textContent).toBe("👍Like, 3, dont vous");
  });

  it("renders nothing with nothing to show", async () => {
    const { host, rerender } = await render(<ReactionBar reactions={[]} onReact={() => {}} />);
    expect(host.childElementCount).toBe(0);
    await rerender(<ReactionBar reactions={[]} quick={quick} onReact={() => {}} />);
    expect(host.querySelectorAll('[data-ouro-part="quick"]')).toHaveLength(2);
  });

  it("gives each button press feedback and a touch target, as Badge does", async () => {
    const { bar } = await render(<ReactionBar reactions={reactions} quick={quick} onReact={() => {}} />);
    for (const button of bar!.querySelectorAll<HTMLElement>("button")) {
      expect(button.dataset.ouroControl).toBe("reaction-bar");
      expect(button.classList.contains("press")).toBe(true);
      expect(button.querySelector("[data-ouro-touch-target]")).not.toBeNull();
    }
  });

  it("renders in server HTML and hydrates without a warning", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const node = <ReactionBar reactions={reactions} quick={quick} onReact={() => {}} />;
    const html = renderToString(node);
    expect(html).toContain('aria-pressed="true"');
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
    const { bar } = await render(<ReactionBar reactions={reactions} className="mt-4" ref={(node) => void (element = node)} />);
    expect(element).toBe(bar);
    expect(getComputedStyle(bar!).marginTop).toBe("16px");
  });
});

describe("ReactionBar development messages", () => {
  it("warns of nothing when the props are right", async () => {
    await render(<ReactionBar reactions={reactions} />);
    await render(<ReactionBar reactions={reactions} quick={quick} onReact={() => {}} />);
    expect(warn).not.toHaveBeenCalled();
  });

  it.each([
    ["missing reactions", { reactions: undefined }, "reactions is missing", "<ReactionBar reactions={message.reactions} onReact={react}>"],
    ["onReactionClick", { onReactionClick: () => {} }, "onReactionClick is not a prop", "<ReactionBar onReact={(key) => react(key)}>"],
    ["items", { items: [] }, "items is not a prop", "<ReactionBar reactions={message.reactions}>"],
    ["quick without onReact", { quick, onReact: undefined }, "quick reactions need onReact, so they are hidden", "<ReactionBar quick={quick} onReact={react}>"],
  ])("names the fix for %s", async (_name, extra, problem, fix) => {
    const props = { reactions, onReact: () => {}, ...extra } as unknown as ReactionBarProps;
    const { host } = await render(<ReactionBar {...props} />);
    expect(warn).toHaveBeenCalledWith(`[ouro-ui] ReactionBar: ${problem}. Fix: ${fix}.`);
    expect(host.querySelector("[items]")).toBeNull();
  });

  it("checks the className", async () => {
    await render(<ReactionBar reactions={reactions} className="bg-blue-500" />);
    expect(warn).toHaveBeenCalledWith(
      '[ouro-ui] ReactionBar: "bg-blue-500" sets appearance, and className is for layout only. Fix: remove "bg-blue-500"; ReactionBar takes its colors from the theme.',
    );
  });
});
