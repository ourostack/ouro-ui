"use client";

import { useEffect, useLayoutEffect, useRef, useState, type HTMLAttributes, type JSX, type ReactNode, type Ref, type SVGProps } from "react";
import { Avatar, type AvatarOwnProps } from "@/registry/ouro/components/ouro/avatar/avatar";
import {
  avatarSizeFor,
  connections,
  controlsClass,
  defaultLabels,
  fitClasses,
  HYSTERESIS_DEFAULT,
  mediaClass,
  plateClass,
  ringClass,
  sentenceFor,
  smallPhotos,
  sources,
  tileClass,
  upperFirst,
  VISIBLE_RATIO,
  type MediaTileConnection,
  type MediaTileHysteresis,
  type MediaTileLabels,
} from "@/registry/ouro/components/ouro/media-tile/media-tile-styles";
import { Toggle } from "@/registry/ouro/components/ouro/toggle/toggle";
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/ouro/class-name-check";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { useMergedRef } from "@/registry/ouro/lib/ouro/refs";
import { useDevWarnings } from "@/registry/ouro/lib/ouro/use-dev-messages";

export type { MediaTileConnection, MediaTileHysteresis, MediaTileLabels };

/** The Avatar props a tile passes to the photo it shows in place of the picture. Its name is the tile's. */
export type MediaTileAvatar = Pick<AvatarOwnProps, "src" | "initials" | "icon" | "shape" | "color" | "idForColor" | "size">;

/** The props MediaTile adds to the `<div>` attributes it passes through. */
export interface MediaTileOwnProps {
  /**
   * Who is in the tile: "Mara Lind". The name plate shows it, its photo's initials come from it,
   * and it starts the sentence screen readers hear. Required, so no tile is silent.
   * @claim "Required, so no tile is silent." registry/ouro/components/ouro/media-tile/media-tile.test-d.ts verify:fileLine(registry/ouro/components/ouro/media-tile/media-tile.test-d.ts, /expectTypeOf<\{ speaking: true \}>\(\)\.not\.toExtend<MediaTileProps>/)
   */
  name: string;
  /**
   * The picture: your `<video>` (or `<canvas>`, or `<img>`), which fills the tile. MediaTile
   * renders no media of its own, and keeps yours mounted while it shows the photo instead, so a
   * `<video>` keeps its stream when the camera goes off and on.
   * @claim "and keeps yours mounted while it" registry/ouro/components/ouro/media-tile/media-tile.test.tsx verify:testExists(registry/ouro/components/ouro/media-tile/media-tile.test.tsx::MediaTile > shows the app's media while the camera is on, and the photo while it is off or paused, keeping the media mounted)
   */
  children?: ReactNode;
  /**
   * Whether the person's camera is on. While it is off the tile shows their photo, or their
   * initials, from `avatar`. Defaults to whether there are `children`.
   * @claim "While it is off the tile shows" registry/ouro/components/ouro/media-tile/media-tile.test.tsx verify:testExists(registry/ouro/components/ouro/media-tile/media-tile.test.tsx::MediaTile > shows the app's media while the camera is on, and the photo while it is off or paused, keeping the media mounted)
   */
  cameraOn?: boolean | undefined;
  /**
   * Where the picture comes from: `camera`, or `screen` for a shared screen or window, which is
   * read as "shared screen" and is never cropped. @default "camera"
   * @claim "Where the picture comes from:" registry/ouro/components/ouro/media-tile/media-tile.test.tsx verify:testExists(registry/ouro/components/ouro/media-tile/media-tile.test.tsx::MediaTile > crops a camera to fill the tile and never crops a share)
   */
  source?: "camera" | "screen" | (string & { 'Use "camera" or "screen"; a shared window is "screen"': never }) | undefined;
  /**
   * How the picture fills the tile: `cover` crops it to fill (a camera), `contain` shows all of
   * it with bars (a share). Defaults to `cover` for a camera and `contain` for a screen.
   * @claim "How the picture fills the tile:" registry/ouro/components/ouro/media-tile/media-tile.test.tsx verify:testExists(registry/ouro/components/ouro/media-tile/media-tile.test.tsx::MediaTile > crops a camera to fill the tile and never crops a share)
   */
  fit?: "cover" | "contain" | (string & { 'Use "cover" or "contain"': never }) | undefined;
  /**
   * The person's photo, shown in place of the picture: Avatar's props, such as `{ src, idForColor }`.
   * Without it the photo is their initials. It grows with the tile unless you pass `size`.
   */
  avatar?: MediaTileAvatar | undefined;
  /** Whether the person is muted: a crossed-out microphone on the name plate, and "muted" in the sentence. */
  muted?: boolean | undefined;
  /** Whether the person's hand is up: a hand in the top start corner, and "hand raised" in the sentence. */
  handRaised?: boolean | undefined;
  /**
   * How well the person's media is getting through. `poor` shows a glyph in the top start
   * corner and is read as "poor connection"; `good` and `fair` show nothing, since a fair
   * connection still carries the call. @default "good"
   * @claim "`good` and `fair` show nothing, since" registry/ouro/components/ouro/media-tile/media-tile.test.tsx verify:testExists(registry/ouro/components/ouro/media-tile/media-tile.test.tsx::MediaTile > shows a glyph for a poor connection only, and the hand while it is up)
   */
  connection?: MediaTileConnection | (string & { 'Use "good", "fair" or "poor"': never }) | undefined;
  /**
   * The picture is paused (your app stopped receiving it, to save bandwidth or power): the tile
   * shows the photo with a pause glyph. Pass the reason as words to say it, such as
   * `paused="video paused to save power"`; `true` says "video paused".
   * @claim "Pass the reason as words to say" registry/ouro/components/ouro/media-tile/media-tile.test.tsx verify:testExists(registry/ouro/components/ouro/media-tile/media-tile.test.tsx::MediaTile > shows the app's media while the camera is on, and the photo while it is off or paused, keeping the media mounted)
   */
  paused?: boolean | string | undefined;
  /**
   * Whether the person is speaking now: the app's speaker detection. The ring and the sentence
   * follow it after `hysteresis`, so a cough doesn't flash the ring.
   */
  speaking?: boolean | undefined;
  /**
   * How long, in milliseconds, someone must speak before the ring comes on (`on`), and be quiet
   * before it goes (`off`). The ring eases between the two states and never throbs with the
   * voice. @default { on: 300, off: 600 }
   * @claim "{ on: 300, off: 600 }" registry/ouro/components/ouro/media-tile/media-tile.test.tsx verify:testExists(registry/ouro/components/ouro/media-tile/media-tile.test.tsx::MediaTile speaking > turns the ring on after 300ms of speaking and off after 600ms of quiet, and ignores a blip shorter than that)
   * @claim "The ring eases between the two" registry/ouro/components/ouro/media-tile/media-tile.test.tsx verify:testExists(registry/ouro/components/ouro/media-tile/media-tile.test.tsx::MediaTile motion > fades the ring in over the fast duration, and turns it on at once with reduced motion)
   * @claim "The ring eases between the two" registry/ouro/components/ouro/media-tile/media-tile.test.tsx verify:testExists(registry/ouro/components/ouro/media-tile/media-tile.test.tsx::MediaTile speaking > turns the ring on after 300ms of speaking and off after 600ms of quiet, and ignores a blip shorter than that)
   * @claim "How long, in milliseconds, someone must" registry/ouro/components/ouro/media-tile/media-tile.test.tsx verify:testExists(registry/ouro/components/ouro/media-tile/media-tile.test.tsx::MediaTile speaking > turns the ring on after 300ms of speaking and off after 600ms of quiet, and ignores a blip shorter than that)
   * @claim "How long, in milliseconds, someone must" registry/ouro/components/ouro/media-tile/media-tile.test.tsx verify:testExists(registry/ouro/components/ouro/media-tile/media-tile.test.tsx::MediaTile speaking > takes its own hysteresis, and turns at once with 0)
   */
  hysteresis?: MediaTileHysteresis | undefined;
  /**
   * Whether to draw the speaking ring. Pass `ring={false}` for a stage tile, which already says
   * who is speaking; the sentence still says "speaking". @default true
   * @claim "Pass `ring={false}` for a stage tile," registry/ouro/components/ouro/media-tile/media-tile.test.tsx verify:testExists(registry/ouro/components/ouro/media-tile/media-tile.test.tsx::MediaTile speaking > draws no ring with ring={false}, and still says speaking)
   */
  ring?: boolean | undefined;
  /** Whether the tile is pinned: a pin on the name plate (or the Pin control pressed), and "pinned" in the sentence. */
  pinned?: boolean | undefined;
  /**
   * Shows a Pin toggle in the tile's top end corner, with `data-ax-action="pin"`, and is called
   * with the new state when it is pressed. Pinning changes only the person's own view.
   * @claim "Shows a Pin toggle in the tile's" registry/ouro/components/ouro/media-tile/media-tile.test.tsx verify:testExists(registry/ouro/components/ouro/media-tile/media-tile.test.tsx::MediaTile controls > shows a Pin toggle that carries the pin action, pressed while pinned)
   */
  onPinnedChange?: ((pinned: boolean) => void) | undefined;
  /** Whether the person is presenting: "Presenting" after the name on the name plate, and in the sentence. */
  presenting?: boolean | undefined;
  /**
   * The tile's own controls, such as a `Menu` with Pin, Spotlight and Remove, in the top end
   * corner after the Pin toggle. They show while the pointer is over the tile or focus is in
   * it, and always on a touch screen. Give a Pin item of your own `data-ax-action="pin"`.
   * @claim "They show while the pointer is over" registry/ouro/components/ouro/media-tile/media-tile.test.tsx verify:testExists(registry/ouro/components/ouro/media-tile/media-tile.test.tsx::MediaTile controls > shows its controls while focus is inside the tile or it is pinned, and hides them otherwise)
   * @claim "and always on a touch screen" registry/ouro/components/ouro/media-tile/media-tile.touch.test.tsx verify:testExists(registry/ouro/components/ouro/media-tile/media-tile.touch.test.tsx::MediaTile on a touch screen > always shows its controls, and gives the Pin toggle a 44px target)
   */
  actions?: ReactNode;
  /**
   * Called with whether the tile can be seen and its size in CSS pixels, rounded up, whenever
   * either changes, so you can stop receiving a picture nobody sees and ask for a picture
   * size at or above the tile's (multiply by `devicePixelRatio` for device pixels). A tile counts
   * as seen once a tenth of it is on screen, so a sliver doesn't count, and not while the page
   * is hidden. The first call waits until the browser has said whether the tile is on screen.
   * Changes are gathered once a frame, and it is never called twice with the same values.
   * @claim "The first call waits until the" registry/ouro/components/ouro/media-tile/media-tile.test.tsx verify:testExists(registry/ouro/components/ouro/media-tile/media-tile.test.tsx::MediaTile visibility > calls nothing until the browser has said whether the tile is on screen, so it never starts unseen by mistake)
   * @claim "A tile counts as seen once a" registry/ouro/components/ouro/media-tile/media-tile.test.tsx verify:testExists(registry/ouro/components/ouro/media-tile/media-tile.test.tsx::MediaTile visibility > counts a tile as seen only once a tenth of it is on screen, so a sliver doesn't count)
   * @claim "and not while the page is hidden" registry/ouro/components/ouro/media-tile/media-tile.test.tsx verify:testExists(registry/ouro/components/ouro/media-tile/media-tile.test.tsx::MediaTile visibility > reports a hidden page as unseen at once, and seen again when it shows)
   * @claim "Changes are gathered once a frame, and" registry/ouro/components/ouro/media-tile/media-tile.test.tsx verify:testExists(registry/ouro/components/ouro/media-tile/media-tile.test.tsx::MediaTile visibility > reports its size rounded up once a frame, never twice with the same values, whatever the callback)
   */
  onVisibilityChange?: ((visible: boolean, width: number, height: number) => void) | undefined;
  /**
   * The words the tile is read in, and its controls' names. Pass the ones you translate; the
   * rest stay English.
   * @claim "Pass the ones you translate; the rest" registry/ouro/components/ouro/media-tile/media-tile.test.tsx verify:testExists(registry/ouro/components/ouro/media-tile/media-tile.test.tsx::MediaTile > reads in the words labels gives, and English for the rest)
   */
  labels?: Partial<MediaTileLabels> | undefined;
  /**
   * Layout only: width, grid placement, another shape (`aspect-square`, `h-full`). The tile is
   * 16:9 and as wide as its container by default. Appearance classes warn in development;
   * set `--ouro-media-tile-ring` for the ring's colour.
   * @claim "The tile is 16:9 and as" registry/ouro/components/ouro/media-tile/media-tile.test.tsx verify:testExists(registry/ouro/components/ouro/media-tile/media-tile.test.tsx::MediaTile > is a 16:9 tile as wide as its container, and keeps layout classes, ids, refs and div attributes)
   */
  className?: string | undefined;
  ref?: Ref<HTMLDivElement> | undefined;

  /** Not a prop. The ring is on or off, from your speaker detection: `<MediaTile speaking={level > 0.1}>`. */
  level?: { "Use <MediaTile speaking={level > 0.1}>": never };
  /** Not a prop. Ouro UI uses `muted`: `<MediaTile muted>`. */
  isMuted?: { "Use <MediaTile muted>": never };
  /** Not a prop. Ouro UI uses `name`: `<MediaTile name="Mara Lind">`. */
  label?: { 'Use <MediaTile name="Mara Lind">': never };
  /** Not a prop. Ouro UI uses `fit`: `<MediaTile fit="contain">`. */
  objectFit?: { 'Use <MediaTile fit="contain">': never };
  /** Not a prop. Pass the picture as children, and the photo as `avatar`: `<MediaTile avatar={{ src: photoUrl }}>`. */
  src?: { "Use <MediaTile avatar={{ src: photoUrl }}>": never };
}

/** Props for {@link MediaTile}: its own props and the `<div>` attributes it passes through. */
export type MediaTileProps = Omit<HTMLAttributes<HTMLDivElement>, keyof MediaTileOwnProps | "role" | "aria-label" | "aria-labelledby"> & MediaTileOwnProps;

const line = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const glyphClass = "block size-3.5 shrink-0 @2xs/tile:size-4";

function MicOffGlyph(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className={glyphClass}>
      <rect x="9" y="3" width="6" height="11" rx="3" {...line} />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M4 4l16 16" {...line} />
    </svg>
  );
}

function HandGlyph(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className={glyphClass}>
      <path d="M8 12V5.5a1.5 1.5 0 0 1 3 0V11m0-6.5a1.5 1.5 0 0 1 3 0V11m0-5a1.5 1.5 0 0 1 3 0v7.5a7 7 0 0 1-7 7 6.5 6.5 0 0 1-5.2-2.6L3.6 15a1.5 1.5 0 0 1 2.4-1.8L8 15.5" {...line} />
    </svg>
  );
}

function SignalGlyph(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className={glyphClass}>
      <path d="M5 20v-4" {...line} strokeWidth={3} />
      <path d="M12 20v-9M19 20V5" {...line} strokeWidth={3} strokeOpacity={0.3} />
    </svg>
  );
}

function PauseGlyph(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className={glyphClass}>
      <path d="M9 6.5v11M15 6.5v11" {...line} strokeWidth={2.5} />
    </svg>
  );
}

function PinGlyph(props: SVGProps<SVGSVGElement>): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className={glyphClass} {...props}>
      <path d="M14 3.5l6.5 6.5M17.25 6.75 13 11l1 5-1.5 1.5-7-7L7 9l5 1 4.25-4.25M8.5 15.5 4 20" {...line} />
    </svg>
  );
}

/** A value from a list, or `undefined` when it is not one. */
function oneOf<T extends string>(list: readonly T[], value: unknown): T | undefined {
  return list.find((entry) => entry === value);
}

function millisecondsOf(value: number | undefined): number | undefined {
  return typeof value === "number" && value >= 0 ? value : undefined;
}

/** `value` once it has held for `onDelay` (turning true) or `offDelay` (turning false), in milliseconds. */
function useHeld(value: boolean, onDelay: number, offDelay: number): boolean {
  const [held, setHeld] = useState(value);
  useEffect(() => {
    // Stryker disable next-line ConditionalExpression: a timer that sets the value it already holds changes nothing.
    if (held === value) return;
    const timer = setTimeout(() => setHeld(value), value ? onDelay : offDelay);
    return () => clearTimeout(timer);
  }, [value, held, onDelay, offDelay]);
  return held;
}

/**
 * Watches the tile's size (ResizeObserver) and, with `report`, whether it can be seen
 * (IntersectionObserver and the page's visibility), gathering the changes once a frame. Returns
 * the photo size for the tile and whether its name is cut short.
 */
function useTileObservers(
  tile: { current: HTMLDivElement | null },
  nameRef: { current: HTMLSpanElement | null },
  report: MediaTileOwnProps["onVisibilityChange"],
  name: string,
  presenting: boolean,
): { photoSize: ReturnType<typeof avatarSizeFor>; truncated: boolean } {
  const [photoSize, setPhotoSize] = useState<ReturnType<typeof avatarSizeFor>>("xl");
  // Stryker disable next-line BooleanLiteral: the layout effect below measures the name before the first paint.
  const [truncated, setTruncated] = useState(false);
  // The latest callback, so a new function each render neither resubscribes nor reports again.
  const reportRef = useRef(report);
  useLayoutEffect(() => {
    reportRef.current = report;
  });
  // A longer name, or "Presenting" after it, can cut the name short without a resize.
  useLayoutEffect(() => {
    const element = nameRef.current!;
    setTruncated(element.scrollWidth > element.clientWidth);
  }, [nameRef, name, presenting]);
  // Stryker disable next-line ConditionalExpression: without a callback nothing reads whether the tile is seen, so observing it too changes only the cost.
  const watching = report !== undefined;
  useEffect(() => {
    const element = tile.current!;
    let frame = 0;
    let width = 0;
    let height = 0;
    // Stryker disable next-line BooleanLiteral: nothing reads it until the first intersection sets it.
    let seen = false;
    // A resize can reach a frame before the first intersection does; until then, whether the tile is seen is unknown.
    let known = false;
    // Stryker disable next-line StringLiteral: no report's key is either start, so the first report always goes out.
    let last = "";
    const flush = () => {
      frame = 0;
      setPhotoSize(avatarSizeFor(width, height));
      const plateName = nameRef.current!;
      setTruncated(plateName.scrollWidth > plateName.clientWidth);
      const call = reportRef.current;
      if (!call || !known) return;
      const visible = seen && document.visibilityState !== "hidden";
      const key = `${visible} ${width} ${height}`;
      if (key === last) return;
      last = key;
      call(visible, width, height);
    };
    const schedule = () => {
      frame ||= requestAnimationFrame(flush);
    };
    const resize = new ResizeObserver(([entry]) => {
      const box = entry!.borderBoxSize[0]!;
      width = Math.ceil(box.inlineSize);
      height = Math.ceil(box.blockSize);
      schedule();
    });
    resize.observe(element);
    let intersection: IntersectionObserver | undefined;
    // Stryker disable next-line ConditionalExpression: without a callback nothing reads whether the tile is seen, so observing it too changes only the cost.
    if (watching) {
      intersection = new IntersectionObserver(
        ([entry]) => {
          // Stryker disable next-line LogicalOperator,ConditionalExpression,EqualityOperator: with the one threshold at VISIBLE_RATIO, Chromium and WebKit already report isIntersecting false below it; the ratio guards an engine that does not.
          seen = entry!.isIntersecting && entry!.intersectionRatio >= VISIBLE_RATIO;
          known = true;
          schedule();
        },
        { threshold: [VISIBLE_RATIO] },
      );
      intersection.observe(element);
    }
    // A hidden page runs no animation frames, so its change is reported at once.
    const onPageVisibility = () => {
      // Stryker disable next-line CallExpression: a frame left waiting runs the same flush again, which reports nothing new.
      cancelAnimationFrame(frame);
      flush();
    };
    document.addEventListener("visibilitychange", onPageVisibility);
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      intersection?.disconnect();
      document.removeEventListener("visibilitychange", onPageVisibility);
    };
  }, [tile, nameRef, watching]);
  return { photoSize, truncated };
}

/**
 * A tile for one live picture in a call: a person's camera, their photo when the camera is off,
 * or a shared screen. Pass your `<video>` as children; MediaTile renders no media itself. Over
 * the picture it draws a name plate in the bottom start corner, with a crossed-out microphone
 * while the person is muted and "Presenting" after the name, a raised hand and a poor-connection
 * glyph in the top start corner, and the speaking ring.
 *
 * The tile reads as one sentence: "Mara Lind, speaking, camera on, hand raised". It is a group
 * with that name, and nothing in it is read again. The ring is an inset box-shadow over the
 * picture, so it never moves the layout. It has two states, speaking or not, held for
 * `hysteresis` and eased between over `--ouro-duration-fast`; it never throbs with the voice.
 * With reduced motion it is steady on or off, and under forced colours it is an outline.
 *
 * The name plate sits on a solid translucent fill with no backdrop blur, which would repaint
 * over moving video every frame; with reduced transparency or more contrast the fill is solid.
 * A name too long for the plate is cut short, with the whole name in its tooltip.
 *
 * `onVisibilityChange` tells you whether the tile can be seen and its size, from
 * IntersectionObserver and ResizeObserver, once a frame and only when something changed, so you
 * can stop receiving pictures nobody sees and ask for the smallest size at or above the tile's.
 *
 * Its agent side, `mediaTileAx` in `media-tile-styles.ts`, declares one read, `participant`
 * (name, muted, camera, speaking, raised hand and connection, which anyone may read, since the
 * tile shows them to everyone in the call), and one action, `pin`, which only changes the
 * person's own view, so an agent may take it. The Pin toggle carries `data-ax-action="pin"`.
 *
 * Use `Avatar` instead for a person without live media, and `AspectRatio` for plain media.
 *
 * @claim "The tile reads as one sentence:" registry/ouro/components/ouro/media-tile/media-tile.test.tsx verify:testExists(registry/ouro/components/ouro/media-tile/media-tile.test.tsx::MediaTile > reads as one sentence: who, then what they are doing, in the order a person listens for it)
 * @claim "It is a group with that name," registry/ouro/components/ouro/media-tile/media-tile.test.tsx verify:testExists(registry/ouro/components/ouro/media-tile/media-tile.test.tsx::MediaTile > reads as one sentence: who, then what they are doing, in the order a person listens for it)
 * @claim "The ring is an inset box-shadow" registry/ouro/components/ouro/media-tile/media-tile.test.tsx verify:testExists(registry/ouro/components/ouro/media-tile/media-tile.test.tsx::MediaTile speaking > draws the ring as an inset box-shadow that never moves the layout, and as an outline under forced colours)
 * @claim "It has two states, speaking or" registry/ouro/components/ouro/media-tile/media-tile.test.tsx verify:testExists(registry/ouro/components/ouro/media-tile/media-tile.test.tsx::MediaTile motion > fades the ring in over the fast duration, and turns it on at once with reduced motion)
 * @claim "With reduced motion it is steady" registry/ouro/components/ouro/media-tile/media-tile.test.tsx verify:testExists(registry/ouro/components/ouro/media-tile/media-tile.test.tsx::MediaTile motion > fades the ring in over the fast duration, and turns it on at once with reduced motion)
 * @claim "The name plate sits on a" registry/ouro/components/ouro/media-tile/media-tile.test.tsx verify:testExists(registry/ouro/components/ouro/media-tile/media-tile.test.tsx::MediaTile > puts the name plate on a translucent fill with no blur, solid with reduced transparency)
 * @claim "A name too long for the" registry/ouro/components/ouro/media-tile/media-tile.test.tsx verify:testExists(registry/ouro/components/ouro/media-tile/media-tile.test.tsx::MediaTile > cuts a long name short on a small tile, with the whole name in its tooltip)
 * @claim "`onVisibilityChange` tells you whether the" registry/ouro/components/ouro/media-tile/media-tile.test.tsx verify:testExists(registry/ouro/components/ouro/media-tile/media-tile.test.tsx::MediaTile visibility > reports its size rounded up once a frame, never twice with the same values, whatever the callback)
 * @claim "Its agent side, `mediaTileAx` in" registry/ouro/components/ouro/media-tile/media-tile.test.tsx verify:testExists(registry/ouro/components/ouro/media-tile/media-tile.test.tsx::MediaTile > declares its agent side: a participant read anyone may take, and a private pin an agent may take)
 * @group Display
 * @see https://ui.ouro.bot/docs/media-tile
 *
 * @example
 * <MediaTile name="Mara Lind" speaking={isSpeaking} muted={isMuted} avatar={{ src: photoUrl }} onVisibilityChange={subscribe}>
 *   <video ref={attachStream} autoPlay playsInline muted />
 * </MediaTile>
 * <MediaTile name="Theo Okafor" source="screen" presenting ring={false}>
 *   <video ref={attachShare} autoPlay playsInline muted />
 * </MediaTile>
 */
export function MediaTile(props: MediaTileProps): JSX.Element {
  const {
    name,
    children,
    cameraOn: cameraOnProp,
    source: sourceProp = "camera",
    fit: fitProp,
    avatar,
    muted = false,
    handRaised = false,
    connection: connectionProp = "good",
    paused,
    speaking = false,
    hysteresis,
    ring = true,
    pinned = false,
    onPinnedChange,
    presenting = false,
    actions,
    onVisibilityChange,
    labels: labelsProp,
    className,
    ref,
    // Guard props (hint types), dropped here so they never reach the DOM.
    level,
    isMuted,
    label,
    objectFit,
    src,
    ...rest
  } = props;
  const labels = { ...defaultLabels, ...labelsProp };
  // A source, fit or connection that is not one of MediaTile's (a type error) warns and renders the default.
  const source = oneOf(sources, sourceProp) ?? "camera";
  const defaultFit = source === "screen" ? "contain" : "cover";
  const fit = oneOf(["cover", "contain"] as const, fitProp) ?? defaultFit;
  const connection = oneOf(connections, connectionProp) ?? "good";
  const onDelay = millisecondsOf(hysteresis?.on);
  const offDelay = millisecondsOf(hysteresis?.off);
  const speakingShown = useHeld(Boolean(speaking), onDelay ?? HYSTERESIS_DEFAULT.on, offDelay ?? HYSTERESIS_DEFAULT.off);
  const hasMedia = children !== undefined && children !== null && children !== false;
  const cameraOn = cameraOnProp ?? hasMedia;
  const pausedWords = paused ? (typeof paused === "string" ? paused : labels.paused) : undefined;
  const picture = hasMedia && (source === "screen" || cameraOn) && pausedWords === undefined;
  const tile = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLSpanElement>(null);
  const mergedRef = useMergedRef(ref, tile);
  const { photoSize, truncated } = useTileObservers(tile, nameRef, onVisibilityChange, name, presenting);
  useAppearanceClassNameCheck(
    "MediaTile",
    className,
    process.env.NODE_ENV !== "production"
      ? "MediaTile draws its own surface; set --ouro-media-tile-ring for the ring's colour, or wrap the tile in an element of your own"
      : // Stryker disable next-line StringLiteral: production only; the check never runs there.
        /* istanbul ignore next @preserve -- production only */ "",
  );
  useDevWarnings(
    "MediaTile",
    process.env.NODE_ENV !== "production"
      ? () => [
          !name && ["name is empty, so screen readers hear no one", '<MediaTile name="Mara Lind">'],
          source !== sourceProp && [`source="${String(sourceProp)}" is not a source; use "camera", "screen"`, '<MediaTile source="screen">'],
          fitProp !== undefined && fit !== fitProp && [`fit="${String(fitProp)}" is not a fit; use "cover", "contain"`, `<MediaTile fit="${defaultFit}">`],
          connection !== connectionProp && [`connection="${String(connectionProp)}" is not a connection; use "good", "fair", "poor"`, '<MediaTile connection="poor">'],
          ((hysteresis?.on !== undefined && onDelay === undefined) || (hysteresis?.off !== undefined && offDelay === undefined)) && [
            "hysteresis takes milliseconds from 0",
            "<MediaTile hysteresis={{ on: 300, off: 600 }}>",
          ],
          typeof speaking !== "boolean" && ["speaking is on or off, not a level", "<MediaTile speaking={level > 0.1}>"],
          level !== undefined && ["level is not a prop; speaking is on or off", "<MediaTile speaking={level > 0.1}>"],
          isMuted !== undefined && ["isMuted is not a prop", "<MediaTile muted>"],
          label !== undefined && ["label is not a prop; the name names the tile", `<MediaTile name="${String(label)}">`],
          objectFit !== undefined && ["objectFit is not a prop", `<MediaTile fit="${String(objectFit)}">`],
          src !== undefined && ["src is not a prop; pass the picture as children, and the photo as avatar", `<MediaTile avatar={{ src: "${String(src)}" }}>`],
        ]
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );
  const sentence = sentenceFor(
    { name, presenting, speaking: speakingShown, muted, source, cameraOn, paused: pausedWords, handRaised, connection, pinned },
    labels,
  );
  const shownSize = avatar?.size ?? photoSize;
  const status = handRaised || connection === "poor";
  const controls = onPinnedChange !== undefined || (actions !== undefined && actions !== null && actions !== false);
  return (
    <div
      {...rest}
      ref={mergedRef}
      role="group"
      aria-label={sentence}
      data-ouro="media-tile"
      data-source={source}
      data-fit={fit}
      data-connection={connection}
      data-picture={picture ? "" : undefined}
      data-speaking={speakingShown ? "" : undefined}
      className={cn(tileClass, className)}
    >
      <div aria-hidden="true" data-ouro-media-tile-media="" className={cn(mediaClass, fitClasses[fit], !picture && "invisible")}>
        {children}
      </div>
      {!picture && (
        <div aria-hidden="true" data-ouro-media-tile-photo="" className="absolute inset-0 grid place-items-center">
          <span className="relative inline-flex">
            <Avatar {...avatar} name={name} alt="" size={shownSize} />
            {pausedWords !== undefined && (
              <span
                data-ouro-media-tile-paused=""
                title={upperFirst(pausedWords)}
                className={cn(
                  plateClass,
                  "absolute flex size-7 items-center justify-center rounded-full",
                  // On a photo of 48px or less the glyph would cover the initials, so it sits beside the photo.
                  smallPhotos.includes(shownSize) ? "start-full bottom-0 ms-1" : "-end-1.5 -bottom-1.5",
                )}
              >
                <PauseGlyph />
              </span>
            )}
          </span>
        </div>
      )}
      {status && (
        <div aria-hidden="true" className="absolute start-2 top-2 z-20 flex gap-1">
          {handRaised && (
            <span data-ouro-media-tile-hand="" title={upperFirst(labels.handRaised)} className={cn(plateClass, "flex size-7 items-center justify-center rounded-md")}>
              <HandGlyph />
            </span>
          )}
          {connection === "poor" && (
            <span
              data-ouro-media-tile-connection=""
              title={upperFirst(labels.poorConnection)}
              className={cn(plateClass, "flex size-7 items-center justify-center rounded-md text-[color-mix(in_oklab,var(--warning)_70%,var(--foreground))]")}
            >
              <SignalGlyph />
            </span>
          )}
        </div>
      )}
      <div
        aria-hidden="true"
        data-ouro-media-tile-plate=""
        className={cn(
          plateClass,
          "absolute start-2 bottom-2 z-20 flex max-w-[calc(100%-1rem)] items-center gap-1 rounded-md px-1.5 py-0.5 text-xs leading-5 font-medium @2xs/tile:text-sm",
        )}
      >
        {muted && (
          <span data-ouro-media-tile-muted="" title={upperFirst(labels.muted)} className="text-[color-mix(in_oklab,var(--destructive)_75%,var(--foreground))]">
            <MicOffGlyph />
          </span>
        )}
        <span ref={nameRef} data-ouro-media-tile-name="" title={truncated ? name : undefined} className="min-w-0 truncate">
          {name}
        </span>
        {presenting && (
          <span data-ouro-media-tile-presenting="" className="shrink-0 text-[color-mix(in_oklab,var(--muted-foreground)_70%,var(--foreground))]">
            · {upperFirst(labels.presenting)}
          </span>
        )}
        {pinned && onPinnedChange === undefined && (
          <span data-ouro-media-tile-pinned="" title={upperFirst(labels.pinned)}>
            <PinGlyph />
          </span>
        )}
      </div>
      {controls && (
        <div data-ouro-media-tile-controls="" data-pinned={pinned ? "" : undefined} className={cn(plateClass, controlsClass)}>
          {onPinnedChange !== undefined && (
            <Toggle
              data-ouro-control="media-tile"
              data-ouro-part="pin"
              data-ax-action="pin"
              title={labels.pin}
              label={labels.pin}
              icon={PinGlyph}
              hideLabel
              size="sm"
              pressed={pinned}
              onPressedChange={onPinnedChange}
            />
          )}
          {actions}
        </div>
      )}
      {ring && <span aria-hidden="true" data-ouro-part="ring" data-highlighted={speakingShown ? "" : undefined} className={ringClass} />}
    </div>
  );
}
