import { useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { ReactionBar, type Reaction } from "@/registry/ouro/components/ouro/reaction-bar/reaction-bar";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

const roots: Root[] = [];
const nodes: Element[] = [];
const initial: Reaction[] = [{ key: "like", label: "Like", emoji: "👍", count: 3, mine: false }];

let settle: { resolve: () => void; reject: (error: unknown) => void };

function App({ describeError }: { describeError?: (error: unknown) => string }) {
  const [list, setList] = useState(initial);
  return (
    <ReactionBar
      reactions={list}
      optimistic
      {...(describeError ? { describeError } : {})}
      onReact={() =>
        new Promise<void>((resolve, reject) => {
          settle = {
            resolve: () => {
              setList([{ ...initial[0]!, count: 4, mine: true }]);
              resolve();
            },
            reject,
          };
        })
      }
    />
  );
}

async function mount(describeError?: (error: unknown) => string) {
  const host = document.createElement("div");
  document.body.append(host);
  nodes.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(<App {...(describeError ? { describeError } : {})} />));
  const bar = host.querySelector<HTMLElement>('[data-ouro="reaction-bar"]')!;
  return { bar, button: bar.querySelector("button")! };
}

describe("ReactionBar optimistic quick reactions", () => {
  it("adds a quick reaction at once and drops a reaction the person was the last to take back", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    nodes.push(host);
    const root = createRoot(host);
    roots.push(root);
    const never = () => new Promise<void>(() => {});
    await act(async () =>
      root.render(<ReactionBar reactions={[{ key: "like", label: "Like", emoji: "👍", count: 1, mine: true }]} quick={[{ key: "heart", label: "Heart", emoji: "❤️" }]} optimistic onReact={never} />),
    );
    const buttons = () => [...host.querySelectorAll("button")];
    await act(async () => buttons()[1]!.click());
    expect(buttons()[1]!.getAttribute("aria-pressed")).toBe("true");
    expect(buttons()[1]!.textContent).toContain("1");
    await act(async () => buttons()[0]!.click());
    expect(buttons().map((button) => button.textContent)).toEqual(["❤️Heart, 1"]);
  });
});

afterEach(async () => {
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  for (const node of nodes.splice(0)) node.remove();
});

describe("ReactionBar optimistic with an app that updates first", () => {
  it("keeps the new reaction while the promise waits, though the app's list already has it", async () => {
    function Early() {
      const [list, setList] = useState(initial);
      return (
        <ReactionBar
          reactions={list}
          optimistic
          onReact={() => {
            setList([{ ...initial[0]!, count: 4, mine: true }]);
            return new Promise<void>(() => {});
          }}
        />
      );
    }
    const host = document.createElement("div");
    document.body.append(host);
    nodes.push(host);
    const root = createRoot(host);
    roots.push(root);
    await act(async () => root.render(<Early />));
    const button = host.querySelector("button")!;
    await act(async () => button.click());
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(button.textContent).toContain("4");
  });
});

describe("ReactionBar optimistic", () => {
  it("shows a press at once, marks the group pending, and keeps it once the promise settles", async () => {
    const { bar, button } = await mount();
    expect(bar.hasAttribute("data-ouro-pending")).toBe(false);
    expect(bar.hasAttribute("aria-busy")).toBe(false);
    await act(async () => button.click());
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(button.textContent).toContain("4");
    expect(bar.hasAttribute("data-ouro-pending")).toBe(true);
    expect(bar.getAttribute("aria-busy")).toBe("true");
    await act(async () => settle.resolve());
    expect(bar.hasAttribute("data-ouro-pending")).toBe(false);
    expect(bar.hasAttribute("aria-busy")).toBe(false);
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(button.textContent).toContain("4");
  });

  it("undoes a refused press and says why, announced politely", async () => {
    const { bar, button } = await mount();
    await act(async () => button.click());
    await act(async () => settle.reject(new Error("You can't react here")));
    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(button.textContent).toContain("3");
    const status = bar.querySelector('[role="status"]')!;
    expect(status.textContent).toBe("You can't react here");
    expect(bar.hasAttribute("data-ouro-pending")).toBe(false);
  });

  it("says a refusal in the app's words when describeError gives them", async () => {
    const { bar, button } = await mount(() => "Sign in to react");
    await act(async () => button.click());
    await act(async () => settle.reject(new Error("403")));
    expect(bar.querySelector('[role="status"]')!.textContent).toBe("Sign in to react");
  });
});
