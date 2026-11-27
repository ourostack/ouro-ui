"use client";

import { useLayoutEffect, useRef, type HTMLAttributes, type JSX, type MouseEventHandler, type ReactNode, type Ref } from "react";
import { Avatar } from "@/registry/ouro/components/ouro/avatar/avatar";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Card } from "@/registry/ouro/components/ouro/card/card";
import { arrival } from "@/registry/ouro/components/ouro/ring-card/ring-card-styles";
import { Text } from "@/registry/ouro/components/ouro/text/text";
import { Tooltip } from "@/registry/ouro/components/ouro/tooltip/tooltip";
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/ouro/class-name-check";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { useFocusHandoff } from "@/registry/ouro/lib/ouro/focus-handoff";
import { useMergedRef } from "@/registry/ouro/lib/ouro/refs";
import { useDevWarnings } from "@/registry/ouro/lib/ouro/use-dev-messages";

/** Props for {@link RingCard}, including attributes for its region. */
export interface RingCardProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  /** Who is calling. */
  caller: string;
  /** How the incoming call arrives. */
  kind: "audio" | "video" | (string & { 'Use "audio" or "video"': never });
  /** The caller's optional note. */
  note?: string | null | undefined;
  /** The caller's photo; their initials stand in while it loads. */
  avatar?: { src?: string | undefined } | undefined;
  /** The ring's assertive announcement, including any page-owned shortcuts. Clear after the person acts. */
  announcement: string;
  /**
   * Optional page-owned shortcuts, shown in tooltips. RingCard registers no keyboard handlers.
   * @claim "RingCard registers no keyboard handlers" registry/ouro/components/ouro/ring-card/ring-card.test.tsx verify:testExists(registry/ouro/components/ouro/ring-card/ring-card.test.tsx::RingCard > leaves page shortcuts to the host)
   */
  keys?: { decline: string; audio: string; video: string } | undefined;
  /**
   * The person's decline action; never offer it through an agent door.
   * @claim "never offer it through an agent door" registry/ouro/components/ouro/ring-card/ring-card.test.tsx verify:testExists(registry/ouro/components/ouro/ring-card/ring-card.test.tsx::RingCard > declares answer and decline person-only and marks every action for X-ray)
   */
  onDecline: MouseEventHandler<HTMLButtonElement>;
  /**
   * The person's audio answer; never offer it through an agent door.
   * @claim "never offer it through an agent door" registry/ouro/components/ouro/ring-card/ring-card.test.tsx verify:testExists(registry/ouro/components/ouro/ring-card/ring-card.test.tsx::RingCard > declares answer and decline person-only and marks every action for X-ray)
   */
  onAudio: MouseEventHandler<HTMLButtonElement>;
  /**
   * The person's video answer; never offer it through an agent door.
   * @claim "never offer it through an agent door" registry/ouro/components/ouro/ring-card/ring-card.test.tsx verify:testExists(registry/ouro/components/ouro/ring-card/ring-card.test.tsx::RingCard > declares answer and decline person-only and marks every action for X-ray)
   */
  onVideo: MouseEventHandler<HTMLButtonElement>;
  /** Quiet alternatives, such as a Button to message instead. Hidden during pending and failure. */
  chips?: ReactNode;
  /** A calm line instead of the choices while the call connects or declines. */
  pending?: { label: string; media: "audio" | "video" | null | (string & { 'Use "audio", "video" or null': never }) } | null | undefined;
  /** Failure content, a host-provided recovery control and a polite announcement. */
  failure?: { title: string; line?: string | null | undefined; action: ReactNode; announcement: string } | null | undefined;
  /** Translate the card's words with the rest of the app. */
  labels?: { region: (caller: string) => string; audioCall: string; videoCall: string; decline: string; audio: string; video: string; answerAudio: string; answerVideo: string } | undefined;
  /** Layout only: width, margins and placement. Appearance belongs to RingCard. */
  className?: string | undefined;
  ref?: Ref<HTMLDivElement> | undefined;
}

/**
 * An incoming call, with the caller and the person's choice of audio, video or decline.
 *
 * Use `Alert` instead when showing an app notice, and `ConfirmDialog` when a decision must interrupt.
 *
 * @group Chat
 * @example
 * <RingCard caller="Mara Vale" kind="video" announcement="Mara Vale is calling."
 *   onDecline={decline} onAudio={answerAudio} onVideo={answerVideo} />
 * @claim "An incoming call, with the caller" registry/ouro/components/ouro/ring-card/ring-card.test.tsx verify:testExists(registry/ouro/components/ouro/ring-card/ring-card.test.tsx::RingCard > introduces the caller without taking focus from a person's work)
 */
export function RingCard({
  caller, kind: kindProp, note, avatar, announcement, keys, onDecline, onAudio, onVideo,
  chips, pending, failure, labels, className, ref, ...rest
}: RingCardProps): JSX.Element {
  const kind = kindProp === "video" ? "video" : "audio";
  const words = labels ?? {
    region: (name: string) => `Incoming call from ${name}`,
    audioCall: "Audio call", videoCall: "Video call", decline: "Decline", audio: "Audio",
    video: "Video", answerAudio: "Answer with audio", answerVideo: "Answer with video",
  };
  const box = useRef<HTMLDivElement>(null);
  const tallest = useRef(0);
  const merged = useMergedRef(useMergedRef(ref, box), useFocusHandoff<HTMLDivElement>());
  const actionsRef = useFocusHandoff<HTMLDivElement>();
  useLayoutEffect(() => {
    const element = box.current!;
    const retainHeight = () => {
      tallest.current = Math.max(tallest.current, element.offsetHeight);
      element.style.minHeight = `${tallest.current}px`;
    };
    retainHeight();
    if (element.getAnimations().length) element.setAttribute("data-starting-style", "");
    const observer = new ResizeObserver(retainHeight);
    observer.observe(element);
    return () => observer.disconnect();
  });
  useAppearanceClassNameCheck("RingCard", className, process.env.NODE_ENV !== "production"
    ? "remove the appearance class; RingCard owns its surface"
    : /* istanbul ignore next @preserve -- production only */ String);
  useDevWarnings("RingCard", process.env.NODE_ENV !== "production" ? () => [
    !caller && ["caller is missing", '<RingCard caller="Mara Vale" kind="audio" announcement="Mara Vale is calling." onDecline={decline} onAudio={answerAudio} onVideo={answerVideo} />'],
    kindProp !== "audio" && kindProp !== "video" && ['kind must be "audio" or "video"', '<RingCard kind="audio" />'],
    pending?.media != null && pending.media !== "audio" && pending.media !== "video" && ['pending.media must be "audio", "video" or null', '<RingCard pending={{ label: "Connecting...", media: null }} />'],
  ] : /* istanbul ignore next @preserve -- production only */ undefined);
  const choices = [
    { part: "decline", marker: { "data-ouro-control": "ring-card", "data-ouro-part": "decline" }, label: words.decline, hint: words.decline, onClick: onDecline, tone: "destructive", variant: "soft", action: "decline" },
    { part: "audio", marker: { "data-ouro-control": "ring-card", "data-ouro-part": "audio" }, label: words.audio, hint: words.answerAudio, onClick: onAudio, tone: "success", variant: "soft", action: "answer" },
    { part: "video", marker: { "data-ouro-control": "ring-card", "data-ouro-part": "video" }, label: words.video, hint: words.answerVideo, onClick: onVideo, tone: "success", variant: "soft", action: "answer" },
  ] as const;
  return (
    <div
      {...rest}
      ref={merged}
      role="region"
      aria-label={words.region(caller)}
      data-ouro="ring-card"
      data-ouro-part="root"
      data-kind={kind}
      data-state={failure ? "failed" : pending ? "pending" : "ringing"}
      onTransitionEnd={(event) => {
        if (event.target === event.currentTarget) event.currentTarget.removeAttribute("data-starting-style");
        rest.onTransitionEnd?.(event);
      }}
      className={cn(
        "box-border flex w-full min-w-0 flex-col gap-4 rounded-ouro-xl border border-solid border-border bg-card p-4 text-card-foreground shadow-(--shadow-lg) [--ouro-scroller-surface:var(--card)]",
        arrival, className,
      )}
    >
      <div role="alert" aria-live="assertive" aria-atomic="true" className="sr-only">{announcement}</div>
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">{failure?.announcement ?? ""}</div>
      <div className="flex min-w-0 items-center gap-3">
        <Avatar name={caller} alt="" src={avatar?.src} size="lg" />
        <Card variant="plain" size="sm" title={caller} headingLevel={2} description={kind === "video" ? words.videoCall : words.audioCall} className="min-w-0 flex-1" />
      </div>
      {note && <Text size="sm" tone="muted" lines={2}>{note}</Text>}
      {failure ? (
        <div key="failure" ref={actionsRef} className="flex flex-1 flex-col gap-3" data-slot="failure">
          <div className="flex flex-col gap-1">
            <Text size="sm"><strong>{failure.title}</strong></Text>
            {failure.line && <Text size="sm" tone="muted">{failure.line}</Text>}
          </div>
          <div className="mt-auto grid">{failure.action}</div>
        </div>
      ) : pending ? (
        <div key="pending" className="flex min-h-11 items-center gap-2" data-slot="pending">
          {pending.media === "audio" || pending.media === "video" ? (
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="size-4 shrink-0">
              {pending.media === "video" ? <path strokeLinejoin="round" d="M4 5h11a2 2 0 0 1 2 2v3l5-3v10l-5-3v3a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" /> : <path strokeLinecap="round" strokeLinejoin="round" d="M7 3H4a1 1 0 0 0-1 1c0 9.4 7.6 17 17 17a1 1 0 0 0 1-1v-3l-5-2-2 2a14 14 0 0 1-7-7l2-2-2-5Z" />}
            </svg>
          ) : null}
          <Text size="sm" tone="muted">{pending.label}</Text>
        </div>
      ) : (
        <div key="choices" ref={actionsRef} className="flex flex-col gap-3">
          <div className="grid grid-cols-3 gap-2">
            {choices.map((choice) => {
              const button = (
                <Button key={choice.part} size="sm" fullWidth tone={choice.tone} variant={choice.variant}
                  {...choice.marker} data-ax-action={choice.action} onClick={choice.onClick}>
                  {choice.label}
                </Button>
              );
              return keys ? <Tooltip key={choice.part} content={`${choice.hint} (${keys[choice.part]})`}>{button}</Tooltip> : button;
            })}
          </div>
          {chips != null && <div className="flex flex-wrap gap-2" data-slot="chips">{chips}</div>}
        </div>
      )}
    </div>
  );
}
