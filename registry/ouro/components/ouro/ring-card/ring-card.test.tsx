import { type ReactNode } from "react";
import { flushSync } from "react-dom";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { commands, page, userEvent } from "vitest/browser";
import { bindAx, expectAxRendered } from "@/registry/ouro/ax/component";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { RingCard, type RingCardProps } from "@/registry/ouro/components/ouro/ring-card/ring-card";
import { ringCardAx } from "@/registry/ouro/components/ouro/ring-card/ring-card-styles";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { expectMotion, parseDuration } from "@/registry/ouro/lib/ouro/testing/motion";

const roots: Root[] = [];
const hosts: HTMLElement[] = [];
const base = {
  caller: "Mara Vale",
  kind: "video",
  announcement: "Mara Vale is calling with video.",
  onDecline: () => {},
  onAudio: () => {},
  onVideo: () => {},
} satisfies RingCardProps;

async function render(node: ReactNode) {
  const host = document.createElement("div");
  host.style.width = "352px";
  document.body.append(host);
  hosts.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
  return {
    host,
    card: host.querySelector<HTMLElement>('[data-ouro="ring-card"]')!,
    rerender: (next: ReactNode) => act(async () => root.render(next)),
  };
}

afterEach(async () => {
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  hosts.splice(0).forEach((host) => host.remove());
  await commands.emulateMedia({ reducedMotion: "no-preference" });
  vi.restoreAllMocks();
});

describe("RingCard", () => {
  it("introduces the caller without taking focus from a person's work", async () => {
    const input = document.createElement("input");
    document.body.append(input);
    hosts.push(input);
    input.focus();
    const { card } = await render(<RingCard {...base} note="A quick question about the trail." />);
    expect(document.activeElement).toBe(input);
    await expect.element(page.getByRole("region", { name: "Incoming call from Mara Vale" })).toBeVisible();
    expect(card.querySelector("h2")?.textContent).toBe("Mara Vale");
    expect(card.textContent).toContain("Video call");
    expect(card.textContent).toContain("A quick question about the trail.");
    expect(card.querySelector('[data-ouro="avatar"]')).not.toBeNull();
  });

  it("offers equal Decline Audio and Video choices with their own callbacks and optional shortcut hints", async () => {
    const onDecline = vi.fn();
    const onAudio = vi.fn();
    const onVideo = vi.fn();
    const { card } = await render(<RingCard {...base} onDecline={onDecline} onAudio={onAudio} onVideo={onVideo} keys={{ decline: "Esc", audio: "Shift+A", video: "Shift+V" }} />);
    const buttons = [...card.querySelectorAll<HTMLButtonElement>("button")];
    expect(buttons.map((button) => button.textContent)).toEqual(["Decline", "Audio", "Video"]);
    const widths = buttons.map((button) => button.getBoundingClientRect().width);
    expect(Math.max(...widths) - Math.min(...widths)).toBeLessThan(1);
    await userEvent.hover(buttons[0]!);
    await expect.poll(() => document.querySelector('[data-ouro="tooltip"]')?.textContent).toBe("Decline (Esc)");
    for (const button of buttons) {
      expect(button.getAttribute("data-ouro-control")).toBe("ring-card");
      await userEvent.click(button);
    }
    expect(onDecline).toHaveBeenCalledTimes(1);
    expect(onAudio).toHaveBeenCalledTimes(1);
    expect(onVideo).toHaveBeenCalledTimes(1);
  });

  it("keeps its two live regions mounted and changes each announcement only when its message changes", async () => {
    const { card, rerender } = await render(<RingCard {...base} />);
    const ring = card.querySelector('[role="alert"]')!;
    const status = card.querySelector('[role="status"]')!;
    expect(ring.getAttribute("aria-live")).toBe("assertive");
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(ring.textContent).toBe(base.announcement);
    expect(status.textContent).toBe("");
    const changes: MutationRecord[] = [];
    const observer = new MutationObserver((records) => changes.push(...records));
    observer.observe(ring, { subtree: true, childList: true, characterData: true });
    await rerender(<RingCard {...base} note="New context" />);
    expect(changes).toHaveLength(0);
    await rerender(<RingCard {...base} announcement="" pending={{ label: "Connecting...", media: "audio" }} />);
    expect(card.querySelector('[role="alert"]')).toBe(ring);
    expect(card.querySelector('[role="status"]')).toBe(status);
    expect(ring.textContent).toBe("");
    await rerender(<RingCard {...base} announcement="" failure={{ title: "Couldn't answer here", line: "The call is still ringing.", action: <Button>Open call</Button>, announcement: "Couldn't answer here. Open the call to answer." }} />);
    expect(card.querySelectorAll('[role="alert"]')).toHaveLength(1);
    expect(card.querySelector('[role="status"]')).toBe(status);
    expect(status.textContent).toBe("Couldn't answer here. Open the call to answer.");
    observer.disconnect();
  });

  it("replaces choices and chips in place, keeps its height, and gives failure precedence", async () => {
    const props = { ...base, note: "Can we talk before the walk?", chips: <Button size="sm" variant="plain">Message instead</Button> };
    const { card, rerender } = await render(<RingCard {...props} />);
    const height = card.offsetHeight;
    await rerender(<RingCard {...props} announcement="" pending={{ label: "Connecting...", media: "video" }} />);
    expect(card.dataset.state).toBe("pending");
    expect(card.querySelectorAll("button")).toHaveLength(0);
    expect(card.textContent).toContain("Connecting...");
    expect(card.offsetHeight).toBeGreaterThanOrEqual(height);
    await rerender(<RingCard {...props} announcement="" pending={{ label: "Connecting...", media: null }} failure={{ title: "Couldn't connect", line: "Try the call again.", announcement: "Couldn't connect. Try again.", action: <Button>Try again</Button> }} />);
    expect(card.dataset.state).toBe("failed");
    expect(card.querySelectorAll("button")).toHaveLength(1);
    expect(card.textContent).not.toContain("Connecting...");
    expect(card.textContent).not.toContain("Message instead");
    expect(card.offsetHeight).toBeGreaterThanOrEqual(height);
  });

  it("declares answer and decline person-only and marks every action for X-ray", async () => {
    const { card } = await render(<RingCard {...base} />);
    expectAxRendered(ringCardAx, card);
    const entries = bindAx(ringCardAx, { refuseAs: { answer: "app call answer", decline: "app call decline" } });
    expect(entries).toHaveLength(2);
    expect(ringCardAx.actions.every((action) => "personOnly" in action && !("agent" in action))).toBe(true);
    expect(card.querySelectorAll('[data-ax-action="answer"]')).toHaveLength(2);
    expect([...card.querySelectorAll("button")].every((button) => button.matches('[data-ouro-control="ring-card"][data-ouro-part]'))).toBe(true);
  });

  it("slides down twelve pixels on arrival and only fades under reduced motion", async () => {
    for (const reduced of [false, true]) {
      await commands.emulateMedia({ reducedMotion: reduced ? "reduce" : "no-preference" });
      await expect.poll(() => matchMedia("(prefers-reduced-motion: reduce)").matches).toBe(reduced);
      const host = document.createElement("div");
      document.body.append(host);
      hosts.push(host);
      const root = createRoot(host);
      roots.push(root);
      flushSync(() => root.render(<RingCard {...base} />));
      const card = host.querySelector<HTMLElement>('[data-ouro="ring-card"]')!;
      const duration = parseDuration(getComputedStyle(document.documentElement).getPropertyValue(reduced ? "--ouro-duration-fast" : "--ouro-duration-base"));
      if (!reduced) {
        const transform = card.getAnimations().find((animation) => animation instanceof CSSTransition && animation.transitionProperty === "transform");
        const from = (transform?.effect as KeyframeEffect).getKeyframes()[0]!.transform;
        expect(new DOMMatrix(String(from)).m42).toBe(-12);
      }
      await expectMotion(card, { stem: "ring-card", state: "data-starting-style", properties: reduced ? { opacity: duration } : { opacity: duration, transform: duration }, reduced });
    }
  });

  it("hydrates the caller and choices without moving focus or changing the server content", async () => {
    const host = document.createElement("div");
    host.innerHTML = renderToString(<RingCard {...base} />);
    document.body.append(host);
    hosts.push(host);
    const recoverable = vi.fn();
    await act(async () => roots.push(hydrateRoot(host, <RingCard {...base} />, { onRecoverableError: recoverable })));
    expect(recoverable).not.toHaveBeenCalled();
    expect(host.querySelectorAll("button")).toHaveLength(3);
  });

  it("translates its words, forwards attributes and a ref, and leaves focus outside across states", async () => {
    let ref: HTMLDivElement | null = null;
    const onTransitionEnd = vi.fn();
    const props = {
      ...base, kind: "audio" as const, id: "incoming", className: "mt-4",
      ref: (node: HTMLDivElement | null) => { ref = node; },
      onTransitionEnd,
      labels: { region: (caller: string) => `Call: ${caller}`, audioCall: "Voice call", videoCall: "Camera call", decline: "Dismiss", audio: "Voice", video: "Camera", answerAudio: "Use voice", answerVideo: "Use camera" },
    };
    const { card, rerender } = await render(<RingCard {...props} />);
    expect(ref).toBe(card);
    expect(card.id).toBe("incoming");
    expect(getComputedStyle(card).marginTop).toBe("16px");
    expect(card.getAttribute("aria-label")).toBe("Call: Mara Vale");
    expect(card.textContent).toContain("Voice call");
    expect(card.querySelector("button")?.textContent).toBe("Dismiss");
    card.dispatchEvent(new TransitionEvent("transitionend", { bubbles: true }));
    card.querySelector("button")!.dispatchEvent(new TransitionEvent("transitionend", { bubbles: true }));
    expect(onTransitionEnd).toHaveBeenCalledTimes(2);
    const input = document.createElement("input");
    document.body.append(input);
    hosts.push(input);
    input.focus();
    for (const media of ["audio", "video", null] as const) {
      await rerender(<RingCard {...props} announcement="" pending={{ label: "Please wait", media }} />);
      expect(document.activeElement).toBe(input);
      expect(card.querySelector('[data-ouro-part="pending"] svg') !== null).toBe(media !== null);
    }
    await rerender(<RingCard {...props} announcement="" failure={{ title: "Not connected", action: null, announcement: "Not connected" }} />);
    expect(document.activeElement).toBe(input);
  });

  it("names the fix for invalid kinds, missing caller and appearance classes once per instance", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const invalid = { ...base, caller: "", kind: "phone", pending: { label: "Waiting", media: "screen" } } as unknown as RingCardProps;
    const { card, rerender } = await render(<RingCard {...invalid} className="bg-red-500" />);
    expect(card.dataset.kind).toBe("audio");
    expect(warn.mock.calls.flat().join("\n")).toContain('Fix: <RingCard kind="audio" />.');
    expect(warn.mock.calls.flat().join("\n")).toContain("caller is missing");
    expect(warn.mock.calls.flat().join("\n")).toContain('pending.media must be "audio", "video" or null');
    expect(warn.mock.calls.flat().join("\n")).toContain("className is for layout only");
    const count = warn.mock.calls.length;
    await rerender(<RingCard {...invalid} className="bg-red-500" />);
    expect(warn).toHaveBeenCalledTimes(count);
  });

  it("keeps the call usable when mounted in a hidden host without an entry transition", async () => {
    const host = document.createElement("div");
    host.hidden = true;
    document.body.append(host);
    hosts.push(host);
    const root = createRoot(host);
    roots.push(root);
    await act(async () => root.render(<RingCard {...base} />));
    host.hidden = false;
    await expect.element(page.getByRole("button", { name: "Video", exact: true })).toBeVisible();
  });

  it("leaves page shortcuts to the host", async () => {
    const onDecline = vi.fn();
    const onAudio = vi.fn();
    const onVideo = vi.fn();
    await render(<RingCard {...base} onDecline={onDecline} onAudio={onAudio} onVideo={onVideo}
      keys={{ decline: "Esc", audio: "Shift+A", video: "Shift+V" }} />);
    await userEvent.keyboard("{Escape}{Shift>}A{/Shift}{Shift>}V{/Shift}");
    expect(onDecline).not.toHaveBeenCalled();
    expect(onAudio).not.toHaveBeenCalled();
    expect(onVideo).not.toHaveBeenCalled();
  });
});
