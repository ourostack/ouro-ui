import { useState, type ReactNode } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { expectAxRendered } from "@/registry/ouro/ax/component";
import { Badge } from "@/registry/ouro/components/ouro/badge/badge";
import { PermissionPrompt, type PermissionAnswer } from "@/registry/ouro/components/ouro/permission-prompt/permission-prompt";
import { permissionPromptAx } from "@/registry/ouro/components/ouro/permission-prompt/permission-prompt-styles";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { pressTab } from "@/registry/ouro/lib/ouro/testing/tab";
import { watchAnnouncements } from "@/registry/ouro/lib/ouro/testing/announcements";

const roots: Root[] = [];
let mounted: Element[] = [];

async function render(node: ReactNode) {
  const host = document.createElement("div");
  host.style.width = "480px";
  document.body.append(host);
  mounted.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
  return {
    host,
    rerender: (next: ReactNode) => act(async () => root.render(next)),
    get prompt() {
      return host.querySelector<HTMLElement>('[data-ouro="permission-prompt"]')!;
    },
    part(name: string) {
      return host.querySelector<HTMLElement>(`[data-slot="permission-prompt-${name}"]`);
    },
    button(part: "allow" | "deny") {
      return host.querySelector<HTMLButtonElement>(`[data-ouro-control="permission-prompt"][data-ouro-part="${part}"]`);
    },
  };
}

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

const said = () => warn.mock.calls.map((call: unknown[]) => String(call[0]));

const ask = {
  title: "Your agent wants to run a command",
  detail: "npm install recipe-scaler",
  reason: "To add the package that scales a recipe.",
  risk: "medium" as const,
};

describe("PermissionPrompt", () => {
  it("shows what, exactly what, why and how risky, as an article named by what it wants", async () => {
    const view = await render(<PermissionPrompt {...ask} />);
    await expect.element(page.getByRole("article", { name: "Your agent wants to run a command" })).toBeVisible();
    expect(view.part("detail")!.getAttribute("data-ouro")).toBe("code-block");
    expect(view.part("detail")!.textContent).toContain("npm install recipe-scaler");
    expect(view.part("detail")!.querySelector("button")).toBeNull();
    await expect.element(page.getByText("To add the package that scales a recipe.")).toBeVisible();
    expect(view.part("risk")!.textContent).toBe("Medium risk");
    await view.rerender(<PermissionPrompt {...ask} risk="high" />);
    expect(view.part("risk")!.textContent).toBe("High risk");
    await view.rerender(<PermissionPrompt title="Your agent wants to read your calendar" />);
    expect(view.part("risk")).toBeNull();
    expect(view.part("detail")).toBeNull();
  });

  it("badges each risk in its tone, and labels its buttons Allow once and Deny", async () => {
    const tones = await render(
      <>
        {(["secondary", "warning", "destructive"] as const).map((tone) => (
          <Badge key={tone} tone={tone} variant="soft">
            {tone}
          </Badge>
        ))}
      </>,
    );
    const [secondary, warning, destructive] = [...tones.host.querySelectorAll<HTMLElement>('[data-ouro="badge"]')].map((badge) => getComputedStyle(badge).backgroundColor);
    const view = await render(<PermissionPrompt {...ask} risk="low" />);
    const badge = () => getComputedStyle(view.part("risk")!).backgroundColor;
    expect(view.part("risk")!.textContent).toBe("Low risk");
    expect(badge()).toBe(secondary);
    await view.rerender(<PermissionPrompt {...ask} risk="medium" />);
    expect(badge()).toBe(warning);
    await view.rerender(<PermissionPrompt {...ask} risk="high" />);
    expect(badge()).toBe(destructive);
    expect(new Set([secondary, warning, destructive]).size).toBe(3);
    expect(view.button("allow")!.textContent).toContain("Allow once");
    expect(view.button("deny")!.textContent).toContain("Deny");
    expect(view.button("allow")!.hasAttribute("aria-disabled")).toBe(false);
    expect(view.button("deny")!.hasAttribute("aria-disabled")).toBe(false);
  });

  it("presses safely with no handlers", async () => {
    const view = await render(<PermissionPrompt {...ask} />);
    await userEvent.click(view.button("allow")!);
    await userEvent.click(view.button("deny")!);
    expect(view.button("allow")).not.toBeNull();
  });

  it("calls onAllow and onDeny from Allow once and Deny", async () => {
    const onAllow = vi.fn();
    const onDeny = vi.fn();
    await render(<PermissionPrompt {...ask} onAllow={onAllow} onDeny={onDeny} allowLabel="Allow" denyLabel="Not now" />);
    await userEvent.click(page.getByRole("button", { name: "Allow" }));
    await userEvent.click(page.getByRole("button", { name: "Not now" }));
    expect(onAllow).toHaveBeenCalledTimes(1);
    expect(onDeny).toHaveBeenCalledTimes(1);
  });

  it("shows the answer on its way as busy, and presses neither button again", async () => {
    const onAllow = vi.fn();
    const onDeny = vi.fn();
    const view = await render(<PermissionPrompt {...ask} onAllow={onAllow} onDeny={onDeny} answering="allow" />);
    expect(view.button("allow")!.getAttribute("aria-busy")).toBe("true");
    expect(view.button("deny")!.getAttribute("aria-disabled")).toBe("true");
    // The other button looks off too, not only to a screen reader.
    expect(getComputedStyle(view.button("deny")!).opacity).toBe("0.5");
    // Neither button is enabled to Playwright while the answer is on its way, so they are pressed directly.
    await act(async () => view.button("deny")!.click());
    await act(async () => view.button("allow")!.click());
    expect(onAllow).not.toHaveBeenCalled();
    expect(onDeny).not.toHaveBeenCalled();
    await view.rerender(<PermissionPrompt {...ask} onAllow={onAllow} onDeny={onDeny} answering="deny" />);
    expect(view.button("deny")!.getAttribute("aria-busy")).toBe("true");
    expect(view.button("allow")!.hasAttribute("aria-busy")).toBe(false);
    expect(view.button("allow")!.getAttribute("aria-disabled")).toBe("true");
  });

  it("gives way to who answered and from where, which a screen reader hears", async () => {
    const view = await render(<PermissionPrompt {...ask} />);
    const heard = watchAnnouncements();
    try {
      await view.rerender(<PermissionPrompt {...ask} answer={{ decision: "allowed", by: "Ana", app: "their phone", at: "9:41" }} />);
      expect(view.button("allow")).toBeNull();
      expect(view.button("deny")).toBeNull();
      expect(view.part("answer-text")!.textContent).toBe("Allowed by Ana from their phone · 9:41");
      expect(view.prompt.getAttribute("data-decision")).toBe("allowed");
      await expect.poll(() => heard.count("Allowed by Ana from their phone · 9:41")).toBe(1);
    } finally {
      heard.stop();
    }
    const shade = (value: string) => {
      const probe = document.createElement("span");
      probe.style.color = value;
      document.body.append(probe);
      mounted.push(probe);
      return getComputedStyle(probe).color;
    };
    const icon = () => view.part("answer-icon")!;
    expect(getComputedStyle(icon()).color).toBe(shade("var(--success)"));
    expect(getComputedStyle(view.part("answer")!).color).toBe(shade("var(--muted-foreground)"));
    expect((icon().firstElementChild as SVGGraphicsElement).getBBox().width).toBeGreaterThan(0);
    const tick = icon().firstElementChild!.getAttribute("d");
    await view.rerender(<PermissionPrompt {...ask} answer={{ decision: "denied", by: "you" }} />);
    expect(view.part("answer-text")!.textContent).toBe("Denied by you");
    expect(icon().firstElementChild!.getAttribute("d")).not.toBe(tick);
    expect(getComputedStyle(icon()).color).toBe(shade("var(--destructive)"));
    expect((icon().firstElementChild as SVGGraphicsElement).getBBox().width).toBeGreaterThan(0);
    expect(view.prompt.getAttribute("data-decision")).toBe("denied");
  });

  it("moves focus from the pressed button to the answer, and leaves focus elsewhere alone", async () => {
    function Prompt() {
      const [answer, setAnswer] = useState<PermissionAnswer | undefined>(undefined);
      return (
        <>
          <PermissionPrompt {...ask} onAllow={() => setAnswer({ decision: "allowed", by: "you" })} answer={answer} />
          <button type="button" onClick={() => setAnswer({ decision: "denied", by: "Ana", app: "their phone" })}>
            Answer elsewhere
          </button>
        </>
      );
    }
    const view = await render(<Prompt />);
    // From the keyboard, as WebKit leaves focus where it was when a button is clicked; Deny first, then on to Allow.
    await act(async () => view.button("deny")!.focus());
    await pressTab();
    expect(document.activeElement).toBe(view.button("allow"));
    await userEvent.keyboard("{Enter}");
    expect(document.activeElement).toBe(view.part("answer"));
    expect(view.part("answer")!.tabIndex).toBe(-1);
    // A prompt that arrives already answered leaves focus alone.
    await act(async () => (document.activeElement as HTMLElement).blur());
    await render(<PermissionPrompt {...ask} answer={{ decision: "allowed", by: "Ana" }} />);
    expect(document.activeElement).toBe(document.body);
    // Focus on a button and then off it, to nowhere, before an answer from elsewhere: it stays where the person left it.
    const left = await render(<Prompt />);
    await act(async () => left.button("deny")!.focus());
    await act(async () => (document.activeElement as HTMLElement).blur());
    await act(async () => left.host.querySelector<HTMLButtonElement>("button:not([data-ouro-control])")!.click());
    expect(left.part("answer-text")!.textContent).toBe("Denied by Ana from their phone");
    expect(document.activeElement).toBe(document.body);
    const other = await render(<Prompt />);
    const elsewhere = other.host.querySelector<HTMLButtonElement>("button:not([data-ouro-control])")!;
    await act(async () => elsewhere.focus());
    await userEvent.keyboard("{Enter}");
    expect(other.part("answer-text")!.textContent).toBe("Denied by Ana from their phone");
    expect(document.activeElement).toBe(elsewhere);
  });

  it("declares allow and deny the person's, each on the button that does it", async () => {
    const view = await render(<PermissionPrompt {...ask} />);
    expectAxRendered(permissionPromptAx, view.host);
    expect(permissionPromptAx.actions.map((action) => [action.id, "personOnly" in action && typeof action.personOnly === "string"])).toEqual([
      ["allow", true],
      ["deny", true],
    ]);
    expect(permissionPromptAx.reads.map((read) => read.id)).toEqual(["request"]);
    // Each says what it does in a sentence, for the agent that reads the declaration.
    for (const entry of [...permissionPromptAx.reads, ...permissionPromptAx.actions]) expect(entry.summary).toMatch(/^[A-Z].{8,}\.$/);
  });

  it("says nothing in development for a prompt with only its own props", async () => {
    await render(<PermissionPrompt {...ask} onAllow={() => {}} onDeny={() => {}} allowLabel="Allow" denyLabel="Not now" className="max-w-xl" />);
    await render(<PermissionPrompt title="Your agent wants to read your calendar" />);
    expect(warn).not.toHaveBeenCalled();
  });

  it("renders in server HTML and hydrates without a mismatch", async () => {
    const node = <PermissionPrompt {...ask} answer={{ decision: "allowed", by: "Ana", app: "their phone" }} />;
    const html = renderToString(node);
    expect(html).toContain('data-ouro="permission-prompt"');
    expect(html).toContain("their phone");
    const host = document.createElement("div");
    host.innerHTML = html;
    document.body.append(host);
    mounted.push(host);
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    await act(async () => {
      roots.push(hydrateRoot(host, node));
    });
    expect(errors).not.toHaveBeenCalled();
  });

  it("renders an unknown risk with no badge and names the fix", async () => {
    // @ts-expect-error critical is not a risk.
    const view = await render(<PermissionPrompt {...ask} risk="critical" />);
    expect(view.part("risk")).toBeNull();
    expect(said()).toContain('[ouro-ui] PermissionPrompt: risk="critical" is not a risk; use "low", "medium" or "high". Fix: <PermissionPrompt risk="medium">.');
  });

  it("names the fix for a guessed prop in development", async () => {
    // @ts-expect-error onApprove is not a prop.
    await render(<PermissionPrompt {...ask} onApprove={() => {}} />);
    // @ts-expect-error onReject is not a prop.
    await render(<PermissionPrompt {...ask} onReject={() => {}} />);
    // @ts-expect-error command is not a prop.
    await render(<PermissionPrompt {...ask} command="npm install" />);
    // @ts-expect-error command is not a prop, and one that is not a string gets a sample command.
    await render(<PermissionPrompt {...ask} command={["npm", "install"]} />);
    // @ts-expect-error description is not a prop.
    await render(<PermissionPrompt {...ask} description="Why" />);
    // @ts-expect-error status is not a prop.
    await render(<PermissionPrompt {...ask} status="allowed" />);
    expect(said()).toEqual(
      expect.arrayContaining([
        "[ouro-ui] PermissionPrompt: onApprove is not a prop. Fix: <PermissionPrompt onAllow={allow}>.",
        "[ouro-ui] PermissionPrompt: onReject is not a prop. Fix: <PermissionPrompt onDeny={deny}>.",
        '[ouro-ui] PermissionPrompt: command is not a prop; what it would run is detail. Fix: <PermissionPrompt detail="npm install">.',
        '[ouro-ui] PermissionPrompt: command is not a prop; what it would run is detail. Fix: <PermissionPrompt detail="npm install">.',
        '[ouro-ui] PermissionPrompt: description is not a prop; why it asks is reason. Fix: <PermissionPrompt reason="To add the package">.',
        "[ouro-ui] PermissionPrompt: status is not a prop; the person's answer is answer. Fix: <PermissionPrompt answer={{ decision: \"allowed\", by: \"Ana\" }}>.",
      ]),
    );
  });

  it("names the fix for an appearance class, and leaves a layout class alone", async () => {
    await render(<PermissionPrompt {...ask} className="max-w-xl shadow-lg" />);
    expect(said().some((line: string) => line.startsWith("[ouro-ui] PermissionPrompt: ") && line.includes('remove "shadow-lg"; PermissionPrompt sets its own look from the theme'))).toBe(true);
    expect(said().some((line: string) => line.includes("max-w-xl"))).toBe(false);
  });
});
