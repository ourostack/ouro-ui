"use client";

import { useEffect, useId, useLayoutEffect, useRef, type CSSProperties, type JSX, type Ref } from "react";
import {
  ANNOUNCE_GAP_MS,
  bandClass,
  bandSizes,
  finalWordsClass,
  firstName,
  interimWordsClass,
  labelClass,
  linesClass,
  linesSizes,
  MAX_LINES_DEFAULT,
  MAX_LINES_MAX,
  MAX_LINES_MIN,
  speakerClass,
  spokenText,
  trackClass,
} from "@/registry/ouro/components/ouro/live-captions/live-captions-styles";
import { announce as speak } from "@/registry/ouro/lib/ouro/announce";
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/ouro/class-name-check";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { useDevWarnings } from "@/registry/ouro/lib/ouro/use-dev-messages";
import { useReducedMotion } from "@/registry/ouro/lib/ouro/use-reduced-motion";

/** One caption line: who is speaking and what they have said so far. */
export interface LiveCaptionLine {
  /** Stays the same while the line firms up, so the app replaces an interim line by its id. */
  id: string;
  /** Who said it, in full: "Mara Lind". The band shows the first word; an announcement reads it whole. */
  speaker: string;
  /** What they said so far. */
  text: string;
  /**
   * `true` once the words will not change. Words that are not final show muted and are never announced.
   * @claim "Words that are not final show" registry/ouro/components/ouro/live-captions/live-captions.test.tsx verify:testExists(registry/ouro/components/ouro/live-captions/live-captions.test.tsx::LiveCaptions announcements > announces a line once, when it becomes final, and never its interim words)
   */
  final: boolean;
  /** Not a field. A line says it is final with `final`: `{ id, speaker, text, final: true }`. */
  isFinal?: { 'Use final: true': never };
}

/** Props for {@link LiveCaptions}. */
export interface LiveCaptionsProps {
  /**
   * The caption lines, in the order they were said. Feed it as the words come: add a line when
   * someone starts speaking, replace it by its `id` as its words grow, and mark it `final` when
   * they are settled. The band shows the newest lines and lets older ones go over its top.
   * @claim "The band shows the newest lines" registry/ouro/components/ouro/live-captions/live-captions.test.tsx verify:testExists(registry/ouro/components/ouro/live-captions/live-captions.test.tsx::LiveCaptions > is exactly maxLines lines tall, empty, full and overflowing, so nothing around it moves)
   */
  lines: readonly LiveCaptionLine[];
  /** What the band is: "Captions". It names the band for screen readers. */
  label: string;
  /**
   * Hides the label visually; screen readers still use it.
   * @claim "Hides the label visually; screen readers" registry/ouro/components/ouro/live-captions/live-captions.test.tsx verify:testExists(registry/ouro/components/ouro/live-captions/live-captions.test.tsx::LiveCaptions > is a region named by its label, which hideLabel hides from sight only)
   */
  hideLabel?: boolean | undefined;
  /**
   * The words' size: 14, 18 or 24px. Let the person choose.
   * @default "md"
   * @claim "The words' size: 14, 18 or" registry/ouro/components/ouro/live-captions/live-captions.test.tsx verify:testExists(registry/ouro/components/ouro/live-captions/live-captions.test.tsx::LiveCaptions > sets its words at 14, 18 and 24px on 20, 28 and 32px lines, md by default)
   */
  size?: "sm" | "md" | "lg" | (string & { 'Use "sm", "md" or "lg"': never }) | undefined;
  /**
   * How many lines tall the band is, a whole number from 1 to 6. The band is always that
   * tall, empty or full, so nothing around it moves as captions come and go.
   * @default 2
   * @claim "How many lines tall the band" registry/ouro/components/ouro/live-captions/live-captions.test.tsx verify:testExists(registry/ouro/components/ouro/live-captions/live-captions.test.tsx::LiveCaptions > keeps 2 lines by default, or the nearest whole number from 1 to 6)
   * @claim "The band is always that tall," registry/ouro/components/ouro/live-captions/live-captions.test.tsx verify:testExists(registry/ouro/components/ouro/live-captions/live-captions.test.tsx::LiveCaptions > is exactly maxLines lines tall, empty, full and overflowing, so nothing around it moves)
   */
  maxLines?: number | undefined;
  /**
   * Reads final lines aloud to screen readers. Off by default, because captions read aloud talk
   * over the call: turn it on when the person asks for captions read aloud.
   * @default false
   * @claim "Reads final lines aloud to screen readers." registry/ouro/components/ouro/live-captions/live-captions.test.tsx verify:testExists(registry/ouro/components/ouro/live-captions/live-captions.test.tsx::LiveCaptions announcements > announces a line once, when it becomes final, and never its interim words)
   * @claim "Off by default, because captions read" registry/ouro/components/ouro/live-captions/live-captions.test.tsx verify:testExists(registry/ouro/components/ouro/live-captions/live-captions.test.tsx::LiveCaptions announcements > announces nothing by default, nor once announce is turned off)
   */
  announce?: boolean | undefined;
  /** Layout only: width, margins, placement (`max-w-3xl`, `mx-auto`). Appearance classes warn in development; use `size`. */
  className?: string | undefined;
  /** The band's id, for `aria-describedby` or `aria-controls` elsewhere on the page. */
  id?: string | undefined;
  ref?: Ref<HTMLDivElement> | undefined;

  /** Not a prop. The lines are `lines`: `<LiveCaptions lines={lines}>`. */
  captions?: { 'Use <LiveCaptions lines={lines}>': never };
  /** Not a prop. Ouro UI uses `announce`: `<LiveCaptions announce>`. */
  readAloud?: { 'Use <LiveCaptions announce>': never };
}

/**
 * A caption band for a live call or video: what people are saying, as they say it. Each line is
 * the speaker's first name in a light tint of the brand colour, then their words. Words that
 * may still change are muted and turn white when final, in place, without the line moving.
 *
 * The band is a solid, translucent black fill with rounded corners and no blur, so it reads
 * over any picture; put it in its own space under the pictures, never over a face. It is
 * always `maxLines` lines tall, two by default, so the layout never jumps as captions come and
 * go; the newest words sit on the last line, and older lines slide up and off the top (with
 * reduced motion they move at once).
 *
 * It is a region named by its `label`. With `announce`, it reads each line aloud once, when it
 * becomes final, through one polite live region, never a line's interim words; it says at most
 * one announcement every 2 seconds and gathers the lines that finish in between into the next,
 * so a fast talker doesn't flood a screen reader. Lines that were already final when
 * announcing began are not read. `announce` is off by default, since captions read aloud would
 * talk over the call.
 *
 * Its agent side, `liveCaptionsAx` in `live-captions-styles.ts`, declares one read, `captions`
 * (the speaker, the words and when they were said), which an agent may read only while the
 * person has asked it to follow the meeting (consent `listening`), and only through a filtered
 * watch, never every word pushed. It declares no actions: turning captions on and off is the
 * person's, declared once in a calling app's own controls.
 *
 * Use `Toaster` instead for a passing notice, `Text` for subtitles that don't change, and
 * `MessageList` for a transcript the person can scroll back through.
 *
 * @claim "Each line is the speaker's first" registry/ouro/components/ouro/live-captions/live-captions.test.tsx verify:testExists(registry/ouro/components/ouro/live-captions/live-captions.test.tsx::LiveCaptions > shows each line as the speaker's first name in a tint of the brand colour, then their words)
 * @claim "Words that may still change are" registry/ouro/components/ouro/live-captions/live-captions.test.tsx verify:testExists(registry/ouro/components/ouro/live-captions/live-captions.test.tsx::LiveCaptions > turns interim words white in place when they become final, moving nothing)
 * @claim "The band is a solid, translucent" registry/ouro/components/ouro/live-captions/live-captions.test.tsx verify:testExists(registry/ouro/components/ouro/live-captions/live-captions.test.tsx::LiveCaptions > draws a solid translucent black band with rounded corners and no blur)
 * @claim "It is always `maxLines` lines tall," registry/ouro/components/ouro/live-captions/live-captions.test.tsx verify:testExists(registry/ouro/components/ouro/live-captions/live-captions.test.tsx::LiveCaptions > is exactly maxLines lines tall, empty, full and overflowing, so nothing around it moves)
 * @claim "It is always `maxLines` lines tall," registry/ouro/components/ouro/live-captions/live-captions.test.tsx verify:testExists(registry/ouro/components/ouro/live-captions/live-captions.test.tsx::LiveCaptions motion > slides older lines up and off the top as a new line comes, and with reduced motion moves them at once)
 * @claim "It is a region named by" registry/ouro/components/ouro/live-captions/live-captions.test.tsx verify:testExists(registry/ouro/components/ouro/live-captions/live-captions.test.tsx::LiveCaptions > is a region named by its label, which hideLabel hides from sight only)
 * @claim "With `announce`, it reads each line" registry/ouro/components/ouro/live-captions/live-captions.test.tsx verify:testExists(registry/ouro/components/ouro/live-captions/live-captions.test.tsx::LiveCaptions announcements > announces a line once, when it becomes final, and never its interim words)
 * @claim "it says at most one announcement" registry/ouro/components/ouro/live-captions/live-captions.test.tsx verify:testExists(registry/ouro/components/ouro/live-captions/live-captions.test.tsx::LiveCaptions announcements > reads at most one announcement every 2 seconds, and batches the lines that finish in between into the next)
 * @claim "Lines that were already final when" registry/ouro/components/ouro/live-captions/live-captions.test.tsx verify:testExists(registry/ouro/components/ouro/live-captions/live-captions.test.tsx::LiveCaptions announcements > does not read lines that were final before announcing began)
 * @claim "`announce` is off by default, since" registry/ouro/components/ouro/live-captions/live-captions.test.tsx verify:testExists(registry/ouro/components/ouro/live-captions/live-captions.test.tsx::LiveCaptions announcements > announces nothing by default, nor once announce is turned off)
 * @claim "It declares no actions: turning captions" registry/ouro/components/ouro/live-captions/live-captions.test.tsx verify:testExists(registry/ouro/components/ouro/live-captions/live-captions.test.tsx::LiveCaptions > declares one agent read, the captions, behind listening consent and a filtered push, and no actions)
 * @claim "Its agent side, `liveCaptionsAx` in `live-captions-styles.ts`," registry/ouro/components/ouro/live-captions/live-captions.test.tsx verify:testExists(registry/ouro/components/ouro/live-captions/live-captions.test.tsx::LiveCaptions > declares one agent read, the captions, behind listening consent and a filtered push, and no actions)
 * @group Display
 * @see https://ui.ouro.bot/docs/live-captions
 *
 * @example
 * <LiveCaptions label="Captions" hideLabel lines={[{ id: "1", speaker: "Mara Lind", text: "Shall we start?", final: true }]} />
 * <LiveCaptions label="Captions" lines={lines} size="lg" announce={readAloud} />
 */
export function LiveCaptions(props: LiveCaptionsProps): JSX.Element {
  const {
    lines,
    label,
    hideLabel,
    size: sizeProp = "md",
    maxLines: maxLinesProp = MAX_LINES_DEFAULT,
    announce = false,
    className,
    id,
    ref,
    // Guard props (hint types), dropped here so they never reach the DOM.
    captions,
    readAloud,
  } = props;
  const size = Object.hasOwn(bandSizes, sizeProp) ? (sizeProp as keyof typeof bandSizes) : "md";
  const maxLines = Math.min(Math.max(Math.round(maxLinesProp), MAX_LINES_MIN), MAX_LINES_MAX) || MAX_LINES_DEFAULT;
  // An id of our own puts aria-labelledby in the server HTML too.
  const labelId = `${useId()}-label`;
  const reduced = useReducedMotion();
  useAppearanceClassNameCheck(
    "LiveCaptions",
    className,
    process.env.NODE_ENV !== "production"
      ? (token: string) => `remove "${token}"; the band keeps its own look over video, and size="lg" makes the words larger`
      : // Stryker disable next-line StringLiteral: production only; the check never runs there.
        /* istanbul ignore next @preserve -- production only */ "",
  );
  useDevWarnings(
    "LiveCaptions",
    process.env.NODE_ENV !== "production"
      ? () => [
          size !== sizeProp && [`size="${String(sizeProp)}" is not a size; use "sm", "md", "lg"`, '<LiveCaptions size="md">'],
          maxLines !== maxLinesProp && [`maxLines={${String(maxLinesProp)}} is not a whole number from ${MAX_LINES_MIN} to ${MAX_LINES_MAX}`, `<LiveCaptions maxLines={${maxLines}}>`],
          new Set(lines.map((line) => line.id)).size !== lines.length && ["two lines share an id; give each line its own and keep it while the line firms up", '<LiveCaptions lines={[{ id: "a1", speaker, text, final }]}>'],
          lines.some((line) => "isFinal" in line) && ["isFinal is not a line field", "{ id, speaker, text, final: true }"],
          captions !== undefined && ["captions is not a prop", "<LiveCaptions lines={lines}>"],
          readAloud !== undefined && ["readAloud is not a prop", "<LiveCaptions announce>"],
        ]
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );

  // The newest lines, and one more above them, out of sight over the top edge until it leaves:
  // a line that pushes the others up slides them there, and the one leaving goes over the edge.
  const shown = lines.slice(-(maxLines + 1));

  const trackRef = useRef<HTMLDivElement>(null);
  const tops = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const track = trackRef.current!;
    const rows = [...track.children] as HTMLElement[];
    // Where each line sits in the window, by layout (so a slide under way doesn't count).
    const now = new Map(rows.map((row) => [row.dataset["ouroLiveCaptionsLine"]!, track.offsetTop + row.offsetTop]));
    const kept = rows.find((row) => tops.current.has(row.dataset["ouroLiveCaptionsLine"]!));
    const rise = kept ? tops.current.get(kept.dataset["ouroLiveCaptionsLine"]!)! - now.get(kept.dataset["ouroLiveCaptionsLine"]!)! : 0;
    tops.current = now;
    if (reduced || rise <= 0) return;
    // Start the lines where they were drawn (with any slide still under way) and let them slide up.
    const [, under = "0"] = getComputedStyle(track).translate.split(" ");
    track.style.transition = "none";
    track.style.translate = `0 ${rise + parseFloat(under)}px`;
    // Reading the style applies the start before the transition comes back.
    void getComputedStyle(track).translate;
    track.style.transition = "";
    track.style.translate = "";
  });

  // Announcing: the ids that were final last time, the lines waiting to be read, and the gap timer.
  const heard = useRef<Set<string> | null>(null);
  const waiting = useRef<LiveCaptionLine[]>([]);
  const gap = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    const finals = new Set(lines.filter((line) => line.final).map((line) => line.id));
    if (!announce) {
      heard.current = null;
      waiting.current = [];
      clearTimeout(gap.current);
      gap.current = undefined;
      return;
    }
    // Announcing begins: what is already final has been seen, not just said.
    const before = heard.current ?? finals;
    heard.current = finals;
    waiting.current.push(...lines.filter((line) => line.final && !before.has(line.id)));
    const flush = () => {
      if (waiting.current.length === 0) {
        gap.current = undefined;
        return;
      }
      speak(spokenText(waiting.current));
      waiting.current = [];
      gap.current = setTimeout(flush, ANNOUNCE_GAP_MS);
    };
    if (gap.current === undefined) flush();
  }, [announce, lines]);
  useEffect(() => () => clearTimeout(gap.current), []);

  return (
    <div
      ref={ref}
      id={id}
      role="region"
      aria-labelledby={labelId}
      data-ouro="live-captions"
      data-size={size}
      className={cn(bandClass, bandSizes[size], className)}
      style={{ "--ouro-live-captions-lines": maxLines } as CSSProperties}
    >
      <p id={labelId} data-ouro-live-captions-label="" className={hideLabel ? "sr-only" : labelClass}>
        {label}
      </p>
      <div data-ouro-live-captions-window="" className={cn(linesClass, linesSizes[size])}>
        <div ref={trackRef} data-ouro-live-captions-track="" className={trackClass}>
          {shown.map((line) => (
            <p key={line.id} data-ouro-live-captions-line={line.id} data-final={line.final ? "" : undefined} className="m-0">
              <span data-ouro-live-captions-speaker="" className={speakerClass}>
                {firstName(line.speaker)}
              </span>
              <span className="sr-only">:</span>{" "}
              <span data-ouro-live-captions-words="" className={line.final ? finalWordsClass : interimWordsClass}>
                {line.text}
              </span>
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}
