"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type HTMLAttributes, type JSX, type KeyboardEvent, type PointerEvent, type ReactNode, type RefObject, type SVGProps } from "react";
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/ouro/class-name-check";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { holdPageAtPress } from "@/registry/ouro/lib/ouro/page-scroll-hold";
import { useDevWarnings, type DevWarning } from "@/registry/ouro/lib/ouro/use-dev-messages";
import { useMountedOpen } from "@/registry/ouro/lib/ouro/use-mounted-open";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Carousel } from "@/registry/ouro/components/ouro/carousel/carousel";
import { fillTemplate } from "@/registry/ouro/components/ouro/carousel/carousel-styles";
import {
  DialogBackdrop,
  DialogClose,
  DialogPopupUnchecked,
  DialogPortal,
  DialogRoot,
  DialogTitle,
  DialogViewport,
} from "@/registry/ouro/components/ouro/dialog/dialog-parts";
import {
  captionClass,
  counterClass,
  figureClass,
  gridClass,
  headerClass,
  imageClass,
  fullScreenClass,
  mosaicCellClass,
  mosaicClass,
  mosaicLayout,
  mosaicMoreClass,
  mosaicThumbnailClass,
  popupClass,
  stageClass,
  thumbnailClass,
  thumbnailImageClass,
  titleClass,
  zoomedImageClass,
  zoomOrigin,
  zoomViewClass,
} from "@/registry/ouro/components/ouro/lightbox/lightbox-styles";

/** One image in a {@link Lightbox}. */
export interface LightboxImage {
  /** The full-size image's address, shown in the viewer. */
  src: string;
  /** Describes the image for screen readers, on its thumbnail and in the viewer. */
  alt: string;
  /** A smaller file for the thumbnail. @default src */
  thumbnail?: string | undefined;
  /** A short title under the image in the viewer, shown as given. */
  title?: ReactNode;
  /**
   * A line under the title in the viewer, shown as given: Lightbox adds nothing to it.
   *
   * @claim "Lightbox adds nothing to it" registry/ouro/components/ouro/lightbox/lightbox.test.tsx verify:testExists(registry/ouro/components/ouro/lightbox/lightbox.test.tsx::Lightbox viewer > shows the title and caption with the image, exactly as given)
   */
  caption?: ReactNode;
  /** The original file, or a page about the image: the viewer links to it in a new tab. */
  href?: string | undefined;
  /**
   * The image's own width and height, in any unit. With `layout="mosaic"` and one image, its
   * thumbnail keeps this shape (between 3:4 and 3:1), so the page holds its place before it loads.
   *
   * @claim "its thumbnail keeps this shape" registry/ouro/components/ouro/lightbox/lightbox.mosaic.test.tsx verify:testExists(registry/ouro/components/ouro/lightbox/lightbox.mosaic.test.tsx::Lightbox mosaic > draws one picture at its own shape, between 3:4 and 3:1, and 4:3 when its size is unknown)
   */
  width?: number | undefined;
  /** The image's own height; see `width`. */
  height?: number | undefined;
  /**
   * A still frame of an animated image (a GIF), which its thumbnail shows instead when the user
   * asks for reduced motion. The viewer still plays the image, since opening it asks to see it.
   */
  still?: string | undefined;
}

/** Props shared by both ways of using a {@link Lightbox}. */
export interface LightboxBaseProps {
  /**
   * Names the viewer for screen readers, with the position ("Kitchen photos, 2 of 4"), and shows
   * at its top, such as "Kitchen photos". With thumbnails it names their list too. It is always
   * required.
   *
   * @claim "It is always required" registry/ouro/components/ouro/lightbox/lightbox.test-d.ts verify:fileLine(registry/ouro/components/ouro/lightbox/lightbox.test-d.ts, /expectTypeOf<\{\simages:\stypeof\simages\s\}>\(\)\.not\.toExtend<LightboxProps>/)
   * @claim "Names the viewer for screen readers" registry/ouro/components/ouro/lightbox/lightbox.test.tsx verify:testExists(registry/ouro/components/ouro/lightbox/lightbox.test.tsx::Lightbox opening and closing > opens on the image pressed, named by the label and the position)
   */
  label: string;
  /** The images, in order. The viewer steps through them, and the thumbnails show them in a grid. */
  images: readonly LightboxImage[];
  /** Next on the last image goes back to the first, and Previous on the first goes to the last. */
  loop?: boolean | undefined;
  /** Called with the image's index when the user moves to another image in the viewer, once per change. */
  onIndexChange?: ((index: number) => void) | undefined;
  /** The close button's accessible name. @default "Close" */
  closeLabel?: string | undefined;
  /** The Previous button's accessible name. @default "Previous image" */
  previousLabel?: string | undefined;
  /** The Next button's accessible name. @default "Next image" */
  nextLabel?: string | undefined;
  /**
   * The position the viewer shows and announces when it changes: `{n}` is the image's number
   * and `{total}` the number of images. @default "{n} of {total}"
   *
   * @claim "The position the viewer shows and" registry/ouro/components/ouro/lightbox/lightbox.test.tsx verify:testExists(registry/ouro/components/ouro/lightbox/lightbox.test.tsx::Lightbox viewer > shows the position and announces it once when it changes)
   */
  positionLabel?: string | undefined;
  /** The text of the link to an image's `href`. @default "Open original" */
  originalLabel?: string | undefined;
  /**
   * The zoom button's accessible name. It shows while the image is drawn smaller than its own
   * size, and zooms it to that size, as a double-tap or a pinch does. @default "Zoom"
   *
   * @claim "It shows while the image is" registry/ouro/components/ouro/lightbox/lightbox.zoom.test.tsx verify:testExists(registry/ouro/components/ouro/lightbox/lightbox.zoom.test.tsx::Lightbox zoom > offers the zoom button only while the image is drawn smaller than its own size)
   */
  zoomLabel?: string | undefined;

  /**
   * The viewer covers the whole screen at every width, with no frame around it, rather than
   * sitting in a dialog with the page around it. Use it where pictures are the point, as in a
   * chat's photos.
   *
   * @claim "The viewer covers the whole screen at" registry/ouro/components/ouro/lightbox/lightbox.mosaic.test.tsx verify:testExists(registry/ouro/components/ouro/lightbox/lightbox.mosaic.test.tsx::Lightbox full screen > covers the whole screen with no frame, from the thumbnails or controlled)
   */
  fullScreen?: boolean | undefined;

  /** Not a prop. Pass the images as `images`: `<Lightbox images={[{ src, alt }]}>`. */
  slides?: { 'Use images={[{ src, alt }]}': never };
  /** Not a prop. Lightbox uses `fullScreen`: `<Lightbox fullScreen>`. */
  fullscreen?: { "Use <Lightbox fullScreen>": never };
}

/** A Lightbox that draws its own thumbnails, which open the viewer. */
export type LightboxWithThumbnailsProps = LightboxBaseProps & {
  /** Layout only, for the thumbnails: width and margins (`max-w-2xl`, `mt-6`). Appearance classes warn in development. */
  className?: string | undefined;
  /**
   * How the thumbnails sit. `grid`: as many 4:3 thumbnails in a row as fit. `mosaic`: one frame,
   * as a chat shows the pictures in a message: one picture at its own shape (`width` and
   * `height`), two side by side, three as one large and two small, four or more as a 2 by 2 grid
   * with "+N" on the last; the viewer still steps through them all. @default "grid"
   *
   * @claim "as many 4:3 thumbnails in a row" registry/ouro/components/ouro/lightbox/lightbox.test.tsx verify:testExists(registry/ouro/components/ouro/lightbox/lightbox.test.tsx::Lightbox thumbnails > lays the thumbnails out in as many columns of at least 8rem as fit)
   * @claim "as a chat shows the pictures in" registry/ouro/components/ouro/lightbox/lightbox.mosaic.test.tsx verify:testExists(registry/ouro/components/ouro/lightbox/lightbox.mosaic.test.tsx::Lightbox mosaic > draws one picture at its own shape, between 3:4 and 3:1, and 4:3 when its size is unknown)
   * @claim "as a chat shows the pictures in" registry/ouro/components/ouro/lightbox/lightbox.mosaic.test.tsx verify:testExists(registry/ouro/components/ouro/lightbox/lightbox.mosaic.test.tsx::Lightbox mosaic > draws two side by side, three as one large and two small, and four or more as a 2 by 2 grid)
   * @claim "as a chat shows the pictures in" registry/ouro/components/ouro/lightbox/lightbox.mosaic.test.tsx verify:testExists(registry/ouro/components/ouro/lightbox/lightbox.mosaic.test.tsx::Lightbox mosaic > shows four of more pictures, the last saying how many more follow, to sight and to screen readers)
   * @claim "as a chat shows the pictures in" registry/ouro/components/ouro/lightbox/lightbox.mosaic.test.tsx verify:testExists(registry/ouro/components/ouro/lightbox/lightbox.mosaic.test.tsx::Lightbox mosaic > opens the viewer on the picture pressed, steps on past the four shown, and gives focus back to the last one shown)
   */
  layout?: "grid" | "mosaic" | (string & { 'Use "grid" or "mosaic"': never }) | undefined;
  /** Not with thumbnails. Pass `open` and `onOpenChange` too to open the viewer from your own layout. */
  open?: never;
  /** Not with thumbnails. Pass `open` and `onOpenChange` too to open the viewer from your own layout. */
  index?: never;
  /** Not with thumbnails. Pass `open` and `onOpenChange` too to open the viewer from your own layout. */
  onOpenChange?: never;
  /** Not with thumbnails: focus goes to the thumbnail of the image last shown. */
  returnFocus?: never;
};

/** A controlled Lightbox: the viewer alone, which you open from thumbnails you lay out yourself. */
export type LightboxControlledProps = LightboxBaseProps & {
  /**
   * Whether the viewer is open. Focus goes back to whatever had it when the viewer opened, unless
   * `returnFocus` gives another element, and the viewer grows from that element. Keep the Lightbox
   * mounted and change `open`: one that mounts already open after a press or a key appears and leaves
   * without its transitions, and says so in development.
   *
   * @claim "Keep the Lightbox mounted and change" registry/ouro/components/ouro/lightbox/lightbox.test.tsx verify:testExists(registry/ouro/components/ouro/lightbox/lightbox.test.tsx::Lightbox controlled > says once in development that a viewer mounted already open runs no transitions)
   * @claim "Focus goes back to whatever had" registry/ouro/components/ouro/lightbox/lightbox.test.tsx verify:testExists(registry/ouro/components/ouro/lightbox/lightbox.test.tsx::Lightbox controlled > gives focus back to what had it when the viewer opened, and grows from it)
   */
  open: boolean;
  /**
   * The image the viewer shows, by its place in `images`. It opens on it, and moves to it when you change it
   * while open; update it in `onIndexChange` to follow the user. @default 0
   *
   * @claim "moves to it when you change" registry/ouro/components/ouro/lightbox/lightbox.test.tsx verify:testExists(registry/ouro/components/ouro/lightbox/lightbox.test.tsx::Lightbox controlled > moves to an index the app sets while the viewer is open)
   */
  index?: number | undefined;
  /** Called with `false` when the user closes the viewer (Close, Escape, a press outside). */
  onOpenChange: (open: boolean) => void;
  /**
   * Where focus goes as the viewer closes, given the index of the image last shown: return that
   * image's thumbnail in your layout, so the user is back where they were looking. Return nothing
   * to give focus back to what had it when the viewer opened.
   *
   * @claim "Where focus goes as the viewer" registry/ouro/components/ouro/lightbox/lightbox.test.tsx verify:testExists(registry/ouro/components/ouro/lightbox/lightbox.test.tsx::Lightbox controlled > gives focus to what returnFocus gives for the image last shown, or else back to what had it)
   */
  returnFocus?: ((index: number) => HTMLElement | null | undefined) | undefined;
  /** Not with `open`: lay out your own thumbnails instead, since a controlled Lightbox draws the viewer alone. */
  className?: never;
  /**
   * Not with `open`: a controlled Lightbox draws no thumbnails to lay out.
   *
   * @claim "a controlled Lightbox draws no thumbnails" registry/ouro/components/ouro/lightbox/lightbox.test.tsx verify:testExists(registry/ouro/components/ouro/lightbox/lightbox.test.tsx::Lightbox controlled > draws no thumbnails, and opens on index when open)
   */
  layout?: never;
};

/** Props for {@link Lightbox}: thumbnails of its own, or `open` with `onOpenChange` for the viewer alone. */
export type LightboxProps = LightboxWithThumbnailsProps | LightboxControlledProps;

function ExternalIcon(props: SVGProps<SVGSVGElement>): JSX.Element {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" {...props}>
      <path d="M9 3h4v4M13 3L7.5 8.5M11 9.5V13H3V5h3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ZoomIcon({ out }: { out: boolean }): JSX.Element {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className="size-4">
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
      <path d={out ? "M5 7h4M10.5 10.5L14 14" : "M5 7h4M7 5v4M10.5 10.5L14 14"} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon(): JSX.Element {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className="size-4">
      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

interface ViewerProps {
  label: string;
  images: readonly LightboxImage[];
  loop: boolean;
  index: number;
  onIndexChange: ((index: number) => void) | undefined;
  nameId: string;
  closeLabel: string;
  previousLabel: string;
  nextLabel: string;
  positionLabel: string;
  originalLabel: string;
  zoomLabel: string;
  /** Where the viewer writes the index of the image it shows, for focus to go to as it closes. */
  shownRef: { current: number };
}

/**
 * Steps the viewer with the arrow keys, in reading order, from anywhere in it, by pressing the
 * carousel's own Previous or Next, and goes to the first or the last image with Home or End. A
 * key with a modifier, or one typed into a field in a caption, is left alone.
 */
function stepWithKeys(event: KeyboardEvent<HTMLElement>): void {
  const { key } = event;
  if (key !== "ArrowLeft" && key !== "ArrowRight" && key !== "Home" && key !== "End") return;
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  // A field in a caption moves its caret, and a zoomed image scrolls.
  if ((event.target as Element).closest("input, textarea, select, [contenteditable], [data-ouro-lightbox-zoom-view]")) return;
  event.preventDefault();
  if (key === "Home" || key === "End") {
    // Scrolled to the start or the end, as the carousel's buttons scroll: the carousel reports and
    // announces where it settles. Right to left, the end is the most negative scrollLeft.
    const viewport = event.currentTarget.querySelector<HTMLElement>("[data-ouro-carousel-viewport]")!;
    const end = getComputedStyle(viewport).direction === "rtl" ? -viewport.scrollWidth : viewport.scrollWidth;
    const behavior = matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth";
    viewport.scrollTo({ left: key === "Home" ? 0 : end, behavior });
    return;
  }
  const rtl = getComputedStyle(event.currentTarget).direction === "rtl";
  const part = (key === "ArrowRight") !== rtl ? "next" : "previous";
  event.currentTarget.querySelector<HTMLButtonElement>(`[data-ouro-control="carousel"][data-ouro-part="${part}"]`)!.click();
}

/** Below this, zooming in would show almost nothing more. */
const minZoom = 1.05;
/**
 * How long a double-tap's second tap may follow the first, in milliseconds: the longest of the
 * platforms' defaults, so an unhurried tapper and a busy device still double-tap.
 */
const doubleTapTime = 500;
/** How far a tap may drift, and how far apart a double-tap's taps may be, in pixels. */
const tapSlop = 24;

interface FigureProps {
  image: LightboxImage;
  /** How many times larger than fitted the image is drawn, up to its own size. */
  scale: number;
  onScale: (scale: number) => void;
  /** Reports how far the image can zoom: its own width over its fitted width. */
  onMaxScale: (max: number) => void;
  zoomLabel: string;
}

/** The image's fitted size, and its own width. */
interface Fitted {
  width: number;
  height: number;
  natural: number;
}

/**
 * The fitted size, measured while the image is drawn in the slide (it stays there, hidden, while
 * zoomed), and its own width once it has loaded: another image of the same shape takes the same
 * space, so only its load tells its own size has changed.
 */
function useFittedSize(picture: RefObject<HTMLImageElement | null>): Fitted {
  // Stryker disable next-line ObjectLiteral: measured as the image mounts, before anything reads it; unmeasured, max is 1 either way.
  const [fitted, setFitted] = useState<Fitted>({ width: 0, height: 0, natural: 0 });
  useEffect(
    () => {
      const img = picture.current!;
      const measure = () => setFitted({ width: img.offsetWidth, height: img.offsetHeight, natural: img.naturalWidth });
      const observer = new ResizeObserver(measure);
      observer.observe(img);
      img.addEventListener("load", measure);
      return () => {
        observer.disconnect();
        img.removeEventListener("load", measure);
      };
    },
    // Stryker disable next-line ArrayDeclaration: a ref does not change, so the effect runs once whatever its dependencies.
    [picture],
  );
  return fitted;
}

/** What the pinch reads as it happens: the scale drawn, how far it can go, and how to set it. */
interface Zoom {
  scale: number;
  max: number;
  onScale: (scale: number) => void;
}

/**
 * A pinch on the figure: the fingers set the scale and hold the point between them still. Its
 * moves are the pinch's alone, so the carousel does not also turn the page (a non-passive
 * listener). `zoomTo` sets the scale, keeping the point at (x, y) still.
 */
function usePinch(figure: RefObject<HTMLElement | null>, latest: RefObject<Zoom>, zoomTo: RefObject<(scale: number, x: number, y: number) => void>): void {
  useEffect(
    () => {
      const node = figure.current!;
      // The scale the pinch last set, kept here: a lift can come before React has drawn it.
      let pinch: { distance: number; scale: number; last: number } | undefined;
      const spread = (touches: TouchList) => Math.hypot(touches[0]!.clientX - touches[1]!.clientX, touches[0]!.clientY - touches[1]!.clientY);
      const onStart = (event: TouchEvent) => {
        // Stryker disable next-line EqualityOperator: no layout draws an image at exactly minZoom of its fitted size, so > and >= agree.
        if (event.touches.length === 2 && latest.current.max > minZoom) pinch = { distance: spread(event.touches), scale: latest.current.scale, last: latest.current.scale };
      };
      const onMove = (event: TouchEvent) => {
        if (!pinch || event.touches.length !== 2) return;
        event.preventDefault();
        const next = Math.min(latest.current.max, Math.max(1, (pinch.scale * spread(event.touches)) / pinch.distance));
        pinch.last = next;
        const [a, b] = [event.touches[0]!, event.touches[1]!];
        zoomTo.current(next, (a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2);
      };
      const onEnd = (event: TouchEvent) => {
        if (!pinch || event.touches.length > 1) return;
        // A pinch that ends nearly fitted settles fitted.
        // Stryker disable next-line EqualityOperator: no pinch ends at exactly minZoom, so < and <= agree.
        if (pinch.last < minZoom) latest.current.onScale(1);
        pinch = undefined;
      };
      // Stryker disable next-line ObjectLiteral,BooleanLiteral: onStart never takes the default, so passive only spares the browser a wait.
      node.addEventListener("touchstart", onStart, { passive: true });
      // Stryker disable next-line ObjectLiteral: an element's touchmove listener is not passive unless asked; this says so.
      node.addEventListener("touchmove", onMove, { passive: false });
      node.addEventListener("touchend", onEnd);
      node.addEventListener("touchcancel", onEnd);
      return () => {
        node.removeEventListener("touchstart", onStart);
        node.removeEventListener("touchmove", onMove);
        node.removeEventListener("touchend", onEnd);
        node.removeEventListener("touchcancel", onEnd);
      };
    },
    // Stryker disable next-line ArrayDeclaration: refs do not change, so the effect runs once whatever its dependencies.
    [figure, latest, zoomTo],
  );
}

/**
 * A double-tap, or a double-click: a short press soon after another, close to where it was. Returns
 * the pointer handlers for the element, which call `onDoubleTap` with the second press's point.
 */
function useDoubleTap(onDoubleTap: (x: number, y: number) => void): Pick<HTMLAttributes<HTMLElement>, "onPointerDown" | "onPointerUp"> {
  const pressed = useRef<{ x: number; y: number } | undefined>(undefined);
  const lastTap = useRef<{ time: number; x: number; y: number } | undefined>(undefined);
  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    pressed.current = { x: event.clientX, y: event.clientY };
    // A second finger is a pinch, not a tap.
    if (!event.isPrimary) lastTap.current = undefined;
  };
  const onPointerUp = (event: PointerEvent<HTMLElement>) => {
    const start = pressed.current;
    pressed.current = undefined;
    const previous = lastTap.current;
    lastTap.current = undefined;
    if (!start || !event.isPrimary || Math.hypot(event.clientX - start.x, event.clientY - start.y) > tapSlop) return;
    if (
      !previous ||
      // Stryker disable next-line EqualityOperator: a test cannot time a press to the millisecond, and no person can tell one apart.
      event.timeStamp - previous.time > doubleTapTime ||
      Math.hypot(event.clientX - previous.x, event.clientY - previous.y) > tapSlop
    ) {
      lastTap.current = { time: event.timeStamp, x: event.clientX, y: event.clientY };
      return;
    }
    onDoubleTap(event.clientX, event.clientY);
  };
  return { onPointerDown, onPointerUp };
}

/**
 * One image and its caption. Zoomed, the image is drawn larger in a scroller over the slide, so a
 * finger, a trackpad or the arrow keys move around it, and a swipe there pans instead of turning
 * the page. A double-tap zooms to the image's own size at the tap and back; a pinch zooms it too.
 */
function LightboxFigure({ image, scale, onScale, onMaxScale, zoomLabel }: FigureProps): JSX.Element {
  const figure = useRef<HTMLElement>(null);
  const picture = useRef<HTMLImageElement>(null);
  const view = useRef<HTMLDivElement>(null);
  const fitted = useFittedSize(picture);
  // Never larger than the image's own size: a small image does not zoom at all.
  // Stryker disable next-line ConditionalExpression,EqualityOperator: unmeasured, 0 / 0 makes max NaN, which zooms nothing, as 1 does.
  const max = fitted.width > 0 ? Math.max(1, fitted.natural / fitted.width) : 1;
  const zoomed = scale > 1;
  // The point of the image to keep under the finger as the scale changes: a fraction of the
  // image (fx, fy) and where it sits in the figure (px, py).
  const focal = useRef<{ fx: number; fy: number; px: number; py: number } | null>(null);
  // Stryker disable next-line ObjectLiteral: the layout effect below fills it before anything reads it.
  const latest = useRef({ scale, max, onScale, onMaxScale });
  useLayoutEffect(() => {
    latest.current = { scale, max, onScale, onMaxScale };
  });

  const zoomTo = (next: number, x: number, y: number) => {
    const box = figure.current!.getBoundingClientRect();
    const drawn = (latest.current.scale > 1 ? view.current!.firstElementChild! : picture.current!).getBoundingClientRect();
    // A point off the picture ends up off it too; the scroller's own bounds hold the edge.
    focal.current = { fx: (x - drawn.left) / drawn.width, fy: (y - drawn.top) / drawn.height, px: x - box.left, py: y - box.top };
    latest.current.onScale(next);
  };
  // For the pinch's listeners: zoomTo reads only refs, so the first is as good as any.
  const zoomAt = useRef(zoomTo);
  usePinch(figure, latest, zoomAt);
  const taps = useDoubleTap((x, y) => {
    if (zoomed) {
      onScale(1);
      return;
    }
    // Stryker disable next-line EqualityOperator: no layout draws an image at exactly minZoom of its fitted size, so > and >= agree.
    if (max > minZoom) zoomTo(max, x, y);
  });

  useEffect(() => {
    latest.current.onMaxScale(max);
  }, [max]);

  // After a zoom, scroll so the focal point is where it was, or to the middle.
  useLayoutEffect(() => {
    const point = focal.current;
    focal.current = null;
    if (!zoomed) return;
    const scroller = view.current!;
    const drawn = scroller.firstElementChild as HTMLElement;
    const { fx, fy, px, py } = point ?? { fx: 0.5, fy: 0.5, px: scroller.clientWidth / 2, py: scroller.clientHeight / 2 };
    scroller.scrollLeft = drawn.offsetLeft + fx * drawn.offsetWidth - px;
    scroller.scrollTop = drawn.offsetTop + fy * drawn.offsetHeight - py;
  }, [scale, zoomed]);

  return (
    <figure
      ref={figure}
      data-ouro-lightbox-figure=""
      data-zoomed={zoomed ? "" : undefined}
      className={figureClass}
      {...taps}
    >
      <img ref={picture} src={image.src} alt={image.alt} decoding="async" className={cn(imageClass, zoomed && "invisible")} />
      {/* Zoomed, the image covers the caption, so the caption steps aside until it is fitted again. */}
      {(image.title !== undefined || image.caption !== undefined) && (
        <figcaption className={cn(captionClass, zoomed && "invisible")}>
          {image.title !== undefined && <span className="font-medium text-foreground">{image.title}</span>}
          {image.caption !== undefined && <span>{image.caption}</span>}
        </figcaption>
      )}
      {zoomed && (
        <div
          ref={view}
          role="group"
          aria-label={zoomLabel}
          tabIndex={0}
          data-ouro-lightbox-zoom-view=""
          data-ouro-control="lightbox"
          data-ouro-part="zoom-view"
          className={zoomViewClass}
        >
          <img
            src={image.src}
            alt={image.alt}
            className={zoomedImageClass}
            style={{ width: fitted.width * scale, height: fitted.height * scale }}
          />
        </div>
      )}
    </figure>
  );
}

/**
 * The viewer's contents. It mounts when the viewer opens, so it starts on the image chosen; an
 * index the app changes while it is open starts the carousel again on that image.
 */
function LightboxViewer({
  label,
  images,
  loop,
  index,
  onIndexChange,
  nameId,
  closeLabel,
  previousLabel,
  nextLabel,
  positionLabel,
  originalLabel,
  zoomLabel,
  shownRef,
}: ViewerProps): JSX.Element {
  const [start, setStart] = useState(index);
  const [current, setCurrent] = useState(index);
  const [requested, setRequested] = useState(index);
  const [run, setRun] = useState(0);
  // Only a change to `index` moves the viewer, so an app that does not follow onIndexChange
  // leaves the user where they went.
  if (index !== requested) {
    setRequested(index);
    if (index !== current) {
      setStart(index);
      setCurrent(index);
      setRun(run + 1);
    }
  }
  const header = useRef<HTMLDivElement>(null);
  // Starting the carousel again takes away the scroller that had focus: give it to the new one.
  useLayoutEffect(() => {
    const viewer = header.current!.parentElement!;
    if (run > 0 && !viewer.contains(document.activeElement)) viewer.querySelector<HTMLElement>("[data-ouro-carousel-viewport]")!.focus();
  }, [run]);
  const total = images.length;
  // The app may remove images while the viewer is open.
  const shown = Math.min(current, total - 1);
  useLayoutEffect(() => {
    shownRef.current = shown;
  });
  const href = images[shown]?.href;
  // Only the image in view is zoomed, and moving to another image draws it fitted again.
  const [zoom, setZoom] = useState<{ index: number; scale: number } | null>(null);
  const [maxima, setMaxima] = useState<Readonly<Record<number, number>>>({});
  const scale = zoom?.index === shown ? zoom.scale : 1;
  // Stryker disable next-line EqualityOperator: no layout draws an image at exactly minZoom of its fitted size, so > and >= agree.
  const zoomable = (maxima[shown] ?? 1) > minZoom;
  return (
    <>
      <div ref={header} data-ouro-lightbox-header="" className={headerClass}>
        <div className={titleClass}>
          <DialogTitle>{label}</DialogTitle>
          {/* The viewer's name: the label and the position, which the header shows apart. One image
              has no position worth naming. */}
          <span id={nameId} hidden>
            {total > 1 ? `${label}, ${fillTemplate(positionLabel, shown + 1, total)}` : label}
          </span>
        </div>
        {total > 1 && (
          <span data-ouro-lightbox-position="" className={counterClass}>
            {fillTemplate(positionLabel, shown + 1, total)}
          </span>
        )}
        {href !== undefined && (
          <Button
            href={href}
            target="_blank"
            reloadDocument
            variant="outline"
            tone="secondary"
            size="sm"
            data-ouro-control="lightbox"
            data-ouro-part="original"
            startIcon={ExternalIcon}
          >
            {/* Below 640px only the icon shows; the text still names the link. */}
            <span className="max-sm:sr-only">{originalLabel}</span>
          </Button>
        )}
        {zoomable && (
          <Button
            variant="outline"
            tone="secondary"
            size="sm"
            aria-label={zoomLabel}
            aria-pressed={scale > 1}
            data-ouro-control="lightbox"
            data-ouro-part="zoom"
            onClick={() => setZoom({ index: shown, scale: scale > 1 ? 1 : maxima[shown]! })}
          >
            <ZoomIcon out={scale > 1} />
          </Button>
        )}
        <DialogClose
          render={
            <Button
              variant="outline"
              tone="secondary"
              size="sm"
              aria-label={closeLabel}
              data-ouro-control="lightbox"
              data-ouro-part="close"
            >
              <CloseIcon />
            </Button>
          }
        />
      </div>
      <Carousel
        key={run}
        label={label}
        loop={loop}
        defaultIndex={start}
        onIndexChange={(next) => {
          setCurrent(next);
          setZoom(null);
          onIndexChange?.(next);
        }}
        previousLabel={previousLabel}
        nextLabel={nextLabel}
        slideLabel={positionLabel}
        className={stageClass}
      >
        {images.map((image, position) => (
          <LightboxFigure
            key={position}
            image={image}
            scale={position === shown ? scale : 1}
            onScale={(next) => setZoom({ index: position, scale: next })}
            onMaxScale={(max) => setMaxima((list) => ({ ...list, [position]: max }))}
            zoomLabel={zoomLabel}
          />
        ))}
      </Carousel>
    </>
  );
}

/**
 * Thumbnails that open a full-screen image viewer. Use it for proof screenshots, a listing's
 * photos or before-and-after pairs: pressing a thumbnail opens the viewer on that image. It shows
 * the image as large as the screen allows, uncropped, with its title and caption under it and
 * Close beside the position ("2 of 4") at its top. Step through the images with the arrow keys,
 * the Previous and Next buttons, a trackpad or a swipe, and go to the first or the last with Home
 * or End; the new position is announced politely, once. With one image the viewer shows neither
 * the position nor Previous and Next. Escape, Close or a press outside closes it, and focus goes
 * to the thumbnail of the image last shown. The viewer grows from the thumbnail pressed and
 * slides between images; with reduced motion it fades and jumps instead.
 * On a phone it runs edge to edge, and an image drawn smaller than its own size zooms to that
 * size with a double-tap or the zoom button, or as far as two fingers pinch it; zoomed, a swipe
 * moves around the image rather than to the next one.
 *
 * For a chat message's pictures, pass `layout="mosaic"`: one frame that shows one picture at its
 * own shape, two side by side, three as one large and two small, and four or more as a 2 by 2
 * grid with "+N" on the last. Pass `fullScreen` for a viewer that covers the whole screen with no
 * frame. An animated image's `still` frame shows in its thumbnail when the user asks for reduced
 * motion.
 *
 * To open the viewer from thumbnails you lay out yourself (a before-and-after pair, a mark on a
 * map), pass `open` with `onOpenChange`, the image as `index`, and follow the user with
 * `onIndexChange`: it then draws no thumbnails, and focus goes back to whatever had it, or to
 * the element `returnFocus` gives for the image last shown, such as its thumbnail.
 *
 * Use `Carousel` instead to show the images in the page one at a time, and `Dialog`
 * when the viewer holds more than images.
 *
 * @group Display
 * @see https://ui.ouro.bot/docs/lightbox
 *
 * @example
 * <Lightbox
 *   label="Kitchen photos"
 *   images={[
 *     { src: "/photos/before.jpg", alt: "The old kitchen, with dark cabinets", title: "Before" },
 *     { src: "/photos/after.jpg", alt: "The new kitchen, with white cabinets", title: "After", caption: "Six weeks later" },
 *   ]}
 * />
 * <Lightbox
 *   label="Kitchen photos"
 *   images={photos}
 *   open={open}
 *   index={index}
 *   onOpenChange={setOpen}
 *   onIndexChange={setIndex}
 * />
 * @claim "Step through the images with the" registry/ouro/components/ouro/lightbox/lightbox.test.tsx verify:testExists(registry/ouro/components/ouro/lightbox/lightbox.test.tsx::Lightbox navigation > steps with the arrow keys from anywhere in the viewer, in reading order)
 * @claim "Step through the images with the" registry/ouro/components/ouro/lightbox/lightbox.touch.test.tsx verify:testExists(registry/ouro/components/ouro/lightbox/lightbox.touch.test.tsx::Lightbox on a touch screen > moves to the next image with a swipe)
 * @claim "the new position is announced politely" registry/ouro/components/ouro/lightbox/lightbox.test.tsx verify:testExists(registry/ouro/components/ouro/lightbox/lightbox.test.tsx::Lightbox viewer > shows the position and announces it once when it changes)
 * @claim "Step through the images with the" registry/ouro/components/ouro/lightbox/lightbox.test.tsx verify:testExists(registry/ouro/components/ouro/lightbox/lightbox.test.tsx::Lightbox navigation > goes to the first and the last image with Home and End)
 * @claim "focus goes to the thumbnail of" registry/ouro/components/ouro/lightbox/lightbox.test.tsx verify:testExists(registry/ouro/components/ouro/lightbox/lightbox.test.tsx::Lightbox opening and closing > closes with Escape and gives focus to the thumbnail of the image last shown)
 * @claim "it then draws no thumbnails, and" registry/ouro/components/ouro/lightbox/lightbox.test.tsx verify:testExists(registry/ouro/components/ouro/lightbox/lightbox.test.tsx::Lightbox controlled > gives focus to what returnFocus gives for the image last shown, or else back to what had it)
 * @claim "With one image the viewer shows" registry/ouro/components/ouro/lightbox/lightbox.test.tsx verify:testExists(registry/ouro/components/ouro/lightbox/lightbox.test.tsx::Lightbox viewer > shows no position, Previous or Next for one image)
 * @claim "it then draws no thumbnails, and" registry/ouro/components/ouro/lightbox/lightbox.test.tsx verify:testExists(registry/ouro/components/ouro/lightbox/lightbox.test.tsx::Lightbox controlled > draws no thumbnails, and opens on index when open)
 * @claim "it then draws no thumbnails, and" registry/ouro/components/ouro/lightbox/lightbox.test.tsx verify:testExists(registry/ouro/components/ouro/lightbox/lightbox.test.tsx::Lightbox controlled > gives focus back to what had it when the viewer opened, and grows from it)
 * @claim "an image drawn smaller than its" registry/ouro/components/ouro/lightbox/lightbox.zoom.test.tsx verify:testExists(registry/ouro/components/ouro/lightbox/lightbox.zoom.test.tsx::Lightbox zoom > zooms at a double-tap's point and back with another)
 * @claim "an image drawn smaller than its" registry/ouro/components/ouro/lightbox/lightbox.zoom.test.tsx verify:fileLine(registry/ouro/components/ouro/lightbox/lightbox.zoom.test.tsx, /chromiumOnly\(\"pinches\sbetween\sthe\sfitted\ssize\sand\sthe\simage's\sown\ssize,\sholding\sthe\spoint\sbetween\sthe\sfingers\"/)
 * @claim "zoomed, a swipe moves around the" registry/ouro/components/ouro/lightbox/lightbox.touch.test.tsx verify:testExists(registry/ouro/components/ouro/lightbox/lightbox.touch.test.tsx::Lightbox zoom on a touch screen > zooms with a real double-tap, and then pans with a swipe instead of turning the page)
 * @claim "one frame that shows one picture" registry/ouro/components/ouro/lightbox/lightbox.mosaic.test.tsx verify:testExists(registry/ouro/components/ouro/lightbox/lightbox.mosaic.test.tsx::Lightbox mosaic > draws one picture at its own shape, between 3:4 and 3:1, and 4:3 when its size is unknown)
 * @claim "two side by side, three as" registry/ouro/components/ouro/lightbox/lightbox.mosaic.test.tsx verify:testExists(registry/ouro/components/ouro/lightbox/lightbox.mosaic.test.tsx::Lightbox mosaic > draws two side by side, three as one large and two small, and four or more as a 2 by 2 grid)
 * @claim "four or more as a 2 by" registry/ouro/components/ouro/lightbox/lightbox.mosaic.test.tsx verify:testExists(registry/ouro/components/ouro/lightbox/lightbox.mosaic.test.tsx::Lightbox mosaic > shows four of more pictures, the last saying how many more follow, to sight and to screen readers)
 * @claim "Pass `fullScreen` for a viewer" registry/ouro/components/ouro/lightbox/lightbox.mosaic.test.tsx verify:testExists(registry/ouro/components/ouro/lightbox/lightbox.mosaic.test.tsx::Lightbox full screen > covers the whole screen with no frame, from the thumbnails or controlled)
 * @claim "An animated image's `still` frame shows" registry/ouro/components/ouro/lightbox/lightbox.mosaic.test.tsx verify:testExists(registry/ouro/components/ouro/lightbox/lightbox.mosaic.test.tsx::Lightbox still frames > shows an animated image's still frame in its thumbnail when the user asks for reduced motion)
 * @claim "The viewer grows from the thumbnail" registry/ouro/components/ouro/lightbox/lightbox.test.tsx verify:testExists(registry/ouro/components/ouro/lightbox/lightbox.test.tsx::Lightbox motion > grows from the thumbnail that opened it, and only fades with reduced motion)
 */
export function Lightbox(props: LightboxProps): JSX.Element {
  const {
    label,
    images,
    loop = false,
    closeLabel = "Close",
    previousLabel = "Previous image",
    nextLabel = "Next image",
    positionLabel = "{n} of {total}",
    originalLabel = "Open original",
    zoomLabel = "Zoom",
    onIndexChange,
    className,
    open: openProp,
    index: indexProp,
    onOpenChange,
    returnFocus,
    fullScreen = false,
    layout: layoutProp = "grid",
    // Guard props (hint types), dropped here so they never reach the DOM.
    slides,
    fullscreen,
  } = props as LightboxBaseProps & {
    layout?: string;
    className?: string;
    open?: boolean;
    index?: number;
    onOpenChange?: (open: boolean) => void;
    returnFocus?: (index: number) => HTMLElement | null | undefined;
  };
  const controlled = openProp !== undefined;
  const mountedOpen = useMountedOpen(openProp);
  // A layout that is not one of Ouro UI's (a type error) warns and renders the grid.
  const mosaic = layoutProp === "mosaic";

  useAppearanceClassNameCheck(
    "Lightbox",
    className,
    process.env.NODE_ENV !== "production"
      ? (token: string) => `remove "${token}"; Lightbox draws its own thumbnails`
      : // Stryker disable next-line StringLiteral: production only; the check never runs there.
        /* istanbul ignore next @preserve -- production only */ "",
  );
  useDevWarnings(
    "Lightbox",
    process.env.NODE_ENV !== "production"
      ? (): DevWarning[] => [
          !label && [
            "label is required; it names the thumbnails and the viewer for screen readers",
            '<Lightbox label="Kitchen photos" images={images}>',
          ],
          images.length === 0 && ["there are no images", '<Lightbox label="Kitchen photos" images={[{ src: "/photos/a.jpg", alt: "…" }]}>'],
          ...images.map(
            (image, position): DevWarning =>
              !image.alt && [
                `images[${position}] has no alt; describe the image for screen readers`,
                `{ src: "${image.src}", alt: "The new kitchen, with white cabinets" }`,
              ],
          ),
          slides !== undefined && ["slides is not a prop", '<Lightbox label="Kitchen photos" images={[{ src, alt }]}>'],
          fullscreen !== undefined && ["fullscreen is not a prop", '<Lightbox label="Kitchen photos" images={images} fullScreen>'],
          layoutProp !== "grid" && layoutProp !== "mosaic" && [`layout="${String(layoutProp)}" is not a layout; use "grid", "mosaic"`, '<Lightbox layout="mosaic">'],
          controlled &&
            typeof onOpenChange !== "function" && [
              "open needs onOpenChange, which closes the viewer",
              '<Lightbox label="Kitchen photos" images={images} open={open} index={index} onOpenChange={setOpen}>',
            ],
          !controlled &&
            (indexProp !== undefined || onOpenChange !== undefined || returnFocus !== undefined) && [
              "index, onOpenChange and returnFocus need open; without it Lightbox draws its own thumbnails",
              '<Lightbox label="Kitchen photos" images={images} open={open} index={index} onOpenChange={setOpen}>',
            ],
          mountedOpen && [
            "mounted already open, so the viewer's open and close transitions don't run; mount it closed and change open",
            '<Lightbox label="Kitchen photos" images={images} open={open} index={index} onOpenChange={setOpen}>',
          ],
          controlled &&
            className !== undefined && [
              "className lays out the thumbnails, and a Lightbox with open draws none",
              '<div className="…"><Lightbox open={open} … /></div>',
            ],
        ]
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );

  const [ownOpen, setOwnOpen] = useState(false);
  const [start, setStart] = useState(0);
  const open = controlled ? openProp : ownOpen;
  const setOpen = controlled ? (onOpenChange ?? (() => {})) : setOwnOpen;
  // What had focus as the app opened the viewer, read before Base UI makes the page inert.
  const [wasOpen, setWasOpen] = useState(open);
  const [opener, setOpener] = useState<Element | null>(null);
  // Stryker disable next-line ConditionalExpression: read again while open, the opener changes nothing, since the origin is set once per opening.
  if (open !== wasOpen) {
    setWasOpen(open);
    // Stryker disable next-line ConditionalExpression: an opener read as it closes is read again before the next opening uses it.
    if (open) setOpener(document.activeElement);
  }
  const nameId = useId();
  // Stryker disable next-line ArrayDeclaration: each thumbnail's ref writes its own place before the viewer can read it.
  const thumbnails = useRef<(HTMLButtonElement | null)[]>([]);
  const popup = useRef<HTMLDivElement | null>(null);
  const shown = useRef(0);

  const viewer = (
    <DialogRoot open={open} onOpenChange={(next) => setOpen(next)}>
      <DialogPortal>
        <DialogBackdrop />
        <DialogViewport>
          <DialogPopupUnchecked
            ref={(node: HTMLDivElement | null) => {
              popup.current = node;
              // Once per opening: the viewer grows from its opener, the thumbnail pressed or, when
              // controlled, what had focus (nothing when the page had none).
              if (!node || node.style.transformOrigin) return;
              const from = controlled ? opener : thumbnails.current[start]!;
              if (from && from !== document.body) node.style.transformOrigin = zoomOrigin(from, node);
            }}
            size="lg"
            className={fullScreen ? cn(popupClass, fullScreenClass) : popupClass}
            data-full-screen={fullScreen ? "" : undefined}
            aria-labelledby={nameId}
            initialFocus={() => popup.current!.querySelector<HTMLElement>("[data-ouro-carousel-viewport]")}
            // Focus goes to the thumbnail of the image last shown. Controlled, that is what
            // returnFocus gives, or else (true) Base UI gives focus back to what had it when the
            // viewer opened. A pressed thumbnail need not have had focus (Safari does not focus a
            // pressed button). A mosaic shows four: an image past them returns to the last, "+N".
            finalFocus={controlled ? () => returnFocus?.(shown.current) ?? true : () => thumbnails.current[mosaic ? Math.min(shown.current, 3) : shown.current]}
            onKeyDown={stepWithKeys}
          >
            <LightboxViewer
              label={label}
              images={images}
              loop={loop}
              index={controlled ? (indexProp ?? 0) : start}
              onIndexChange={onIndexChange}
              nameId={nameId}
              closeLabel={closeLabel}
              previousLabel={previousLabel}
              nextLabel={nextLabel}
              positionLabel={positionLabel}
              originalLabel={originalLabel}
              zoomLabel={zoomLabel}
              shownRef={shown}
            />
          </DialogPopupUnchecked>
        </DialogViewport>
      </DialogPortal>
    </DialogRoot>
  );
  if (controlled) return viewer;

  const thumbnail = (image: LightboxImage, position: number, more = 0) => (
    <button
      ref={(node) => {
        thumbnails.current[position] = node;
      }}
      type="button"
      aria-haspopup="dialog"
      data-ouro-control="lightbox"
      data-ouro-part="thumbnail"
      {...holdPageAtPress.dialog}
      className={mosaic ? mosaicThumbnailClass : thumbnailClass}
      onClick={() => {
        setStart(position);
        setOwnOpen(true);
      }}
    >
      {/* With reduced motion an animated image's thumbnail shows its still frame, chosen by the browser. */}
      <picture className="contents">
        {image.still !== undefined && <source media="(prefers-reduced-motion: reduce)" srcSet={image.still} />}
        <img src={image.thumbnail ?? image.src} alt={image.alt} loading="lazy" decoding="async" className={thumbnailImageClass} />
      </picture>
      {more > 0 && (
        <>
          <span aria-hidden="true" data-ouro-lightbox-more="" className={mosaicMoreClass}>{`+${more}`}</span>
          <span className="sr-only">{`, and ${more} more`}</span>
        </>
      )}
    </button>
  );

  if (mosaic) {
    // Four at most show; the viewer steps through the rest from the last, which says how many follow.
    const tiles = images.slice(0, 4);
    const more = images.length - tiles.length;
    const shape = mosaicLayout(tiles.length, images[0]?.width, images[0]?.height);
    return (
      <div data-ouro="lightbox" data-layout="mosaic" className={cn("min-w-0", className)}>
        <ul role="list" aria-label={label} className={cn(mosaicClass, shape.grid)} style={{ aspectRatio: shape.ratio }}>
          {tiles.map((image, position) => (
            <li key={position} className={mosaicCellClass}>
              {thumbnail(image, position, position === tiles.length - 1 ? more : 0)}
            </li>
          ))}
        </ul>
        {viewer}
      </div>
    );
  }

  return (
    <div data-ouro="lightbox" className={cn("min-w-0", className)}>
      <ul role="list" aria-label={label} className={gridClass}>
        {images.map((image, position) => (
          <li key={position} className="m-0 p-0">
            {thumbnail(image, position)}
          </li>
        ))}
      </ul>
      {viewer}
    </div>
  );
}
