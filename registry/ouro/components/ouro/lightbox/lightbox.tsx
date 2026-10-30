"use client";

import { useId, useLayoutEffect, useRef, useState, type JSX, type KeyboardEvent, type ReactNode, type SVGProps } from "react";
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/ouro/class-name-check";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { useDevWarnings, type DevWarning } from "@/registry/ouro/lib/ouro/use-dev-messages";
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
  popupClass,
  stageClass,
  thumbnailClass,
  thumbnailImageClass,
  titleClass,
  zoomOrigin,
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

  /** Not a prop. Pass the images as `images`: `<Lightbox images={[{ src, alt }]}>`. */
  slides?: { 'Use images={[{ src, alt }]}': never };
}

/** A Lightbox that draws its own thumbnails, which open the viewer. */
export type LightboxWithThumbnailsProps = LightboxBaseProps & {
  /** Layout only, for the thumbnails: width and margins (`max-w-2xl`, `mt-6`). Appearance classes warn in development. */
  className?: string | undefined;
  /** Not with thumbnails. Pass `open` and `onOpenChange` too to open the viewer from your own layout. */
  open?: never;
  /** Not with thumbnails. Pass `open` and `onOpenChange` too to open the viewer from your own layout. */
  index?: never;
  /** Not with thumbnails. Pass `open` and `onOpenChange` too to open the viewer from your own layout. */
  onOpenChange?: never;
};

/** A controlled Lightbox: the viewer alone, which you open from thumbnails you lay out yourself. */
export type LightboxControlledProps = LightboxBaseProps & {
  /**
   * Whether the viewer is open. Focus goes back to whatever had it when the viewer opened, and the
   * viewer grows from that element.
   *
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
  /** Not with `open`: lay out your own thumbnails instead, since a controlled Lightbox draws the viewer alone. */
  className?: never;
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
}

/**
 * Steps the viewer with the arrow keys, in reading order, from anywhere in it, by pressing the
 * carousel's own Previous or Next. A key with a modifier, or one typed into a field in a caption,
 * is left alone.
 */
function stepWithArrowKeys(event: KeyboardEvent<HTMLElement>): void {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  if ((event.target as Element).closest("input, textarea, select, [contenteditable]")) return;
  event.preventDefault();
  const rtl = getComputedStyle(event.currentTarget).direction === "rtl";
  const part = (event.key === "ArrowRight") !== rtl ? "next" : "previous";
  event.currentTarget.querySelector<HTMLButtonElement>(`[data-ouro-control="carousel"][data-ouro-part="${part}"]`)!.click();
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
  const href = images[shown]?.href;
  return (
    <>
      <div ref={header} data-ouro-lightbox-header="" className={headerClass}>
        <div className={titleClass}>
          <DialogTitle>{label}</DialogTitle>
          {/* The viewer's name: the label and the position, which the header shows apart. */}
          <span id={nameId} hidden>
            {`${label}, ${fillTemplate(positionLabel, shown + 1, total)}`}
          </span>
        </div>
        <span data-ouro-lightbox-position="" className={counterClass}>
          {fillTemplate(positionLabel, shown + 1, total)}
        </span>
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
          onIndexChange?.(next);
        }}
        previousLabel={previousLabel}
        nextLabel={nextLabel}
        slideLabel={positionLabel}
        className={stageClass}
      >
        {images.map((image, position) => (
          <figure key={position} data-ouro-lightbox-figure="" className={figureClass}>
            <img src={image.src} alt={image.alt} decoding="async" className={imageClass} />
            {(image.title !== undefined || image.caption !== undefined) && (
              <figcaption className={captionClass}>
                {image.title !== undefined && <span className="font-medium text-foreground">{image.title}</span>}
                {image.caption !== undefined && <span>{image.caption}</span>}
              </figcaption>
            )}
          </figure>
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
 * the Previous and Next buttons, a trackpad or a swipe; the new position is announced politely,
 * once. Escape, Close or a press outside closes it, and focus goes back to the thumbnail that
 * opened it. The viewer grows from that thumbnail and slides between images; with reduced
 * motion it fades and jumps instead.
 *
 * To open the viewer from thumbnails you lay out yourself (a before-and-after pair, a mark on a
 * map), pass `open` with `onOpenChange`, the image as `index`, and follow the user with
 * `onIndexChange`: it then draws no thumbnails, and focus goes back to whatever had it.
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
 * @claim "focus goes back to the thumbnail" registry/ouro/components/ouro/lightbox/lightbox.test.tsx verify:testExists(registry/ouro/components/ouro/lightbox/lightbox.test.tsx::Lightbox opening and closing > closes with Escape and gives focus back to the thumbnail that opened it)
 * @claim "it then draws no thumbnails, and" registry/ouro/components/ouro/lightbox/lightbox.test.tsx verify:testExists(registry/ouro/components/ouro/lightbox/lightbox.test.tsx::Lightbox controlled > draws no thumbnails, and opens on index when open)
 * @claim "it then draws no thumbnails, and" registry/ouro/components/ouro/lightbox/lightbox.test.tsx verify:testExists(registry/ouro/components/ouro/lightbox/lightbox.test.tsx::Lightbox controlled > gives focus back to what had it when the viewer opened, and grows from it)
 * @claim "The viewer grows from that thumbnail" registry/ouro/components/ouro/lightbox/lightbox.test.tsx verify:testExists(registry/ouro/components/ouro/lightbox/lightbox.test.tsx::Lightbox motion > grows from the thumbnail that opened it, and only fades with reduced motion)
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
    onIndexChange,
    className,
    open: openProp,
    index: indexProp,
    onOpenChange,
    // A guard prop (hint type), dropped here so it never reaches the DOM.
    slides,
  } = props as LightboxBaseProps & {
    className?: string;
    open?: boolean;
    index?: number;
    onOpenChange?: (open: boolean) => void;
  };
  const controlled = openProp !== undefined;

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
          controlled &&
            typeof onOpenChange !== "function" && [
              "open needs onOpenChange, which closes the viewer",
              '<Lightbox label="Kitchen photos" images={images} open={open} index={index} onOpenChange={setOpen}>',
            ],
          !controlled &&
            (indexProp !== undefined || onOpenChange !== undefined) && [
              "index and onOpenChange need open; without it Lightbox draws its own thumbnails",
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
            className={popupClass}
            aria-labelledby={nameId}
            initialFocus={() => popup.current!.querySelector<HTMLElement>("[data-ouro-carousel-viewport]")}
            // Controlled, Base UI gives focus back to what had it when the viewer opened. A pressed
            // thumbnail need not have had focus (Safari does not focus a pressed button).
            finalFocus={controlled ? true : () => thumbnails.current[start]}
            onKeyDown={stepWithArrowKeys}
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
            />
          </DialogPopupUnchecked>
        </DialogViewport>
      </DialogPortal>
    </DialogRoot>
  );
  if (controlled) return viewer;

  return (
    <div data-ouro="lightbox" className={cn("min-w-0", className)}>
      <ul role="list" aria-label={label} className={gridClass}>
        {images.map((image, position) => (
          <li key={position} className="m-0 p-0">
            <button
              ref={(node) => {
                thumbnails.current[position] = node;
              }}
              type="button"
              aria-haspopup="dialog"
              data-ouro-control="lightbox"
              data-ouro-part="thumbnail"
              className={thumbnailClass}
              onClick={() => {
                setStart(position);
                setOwnOpen(true);
              }}
            >
              <img src={image.thumbnail ?? image.src} alt={image.alt} loading="lazy" decoding="async" className={thumbnailImageClass} />
            </button>
          </li>
        ))}
      </ul>
      {viewer}
    </div>
  );
}
