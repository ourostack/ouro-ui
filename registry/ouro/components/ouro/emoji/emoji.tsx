"use client";

import { useEffect, useRef, useState, type HTMLAttributes, type ImgHTMLAttributes, type JSX, type ReactNode, type Ref } from "react";
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/ouro/class-name-check";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { useMergedRef } from "@/registry/ouro/lib/ouro/refs";
import { useDevWarnings } from "@/registry/ouro/lib/ouro/use-dev-messages";
import { useMediaQuery } from "@/registry/ouro/lib/ouro/use-media-query";
import { emojiClass, emojiSkinTones, splitEmojiText, toneOf, type EmojiSkinTone } from "@/registry/ouro/components/ouro/emoji/emoji-styles";

export type { EmojiSkinTone } from "@/registry/ouro/components/ouro/emoji/emoji-styles";

/**
 * An animation drawn as a filmstrip: square frames stacked top to bottom in one image, so the
 * frames are the image's height over its width.
 */
export interface EmojiFilmstrip {
  /** The filmstrip image's address. */
  src: string;
  /** Frames a second. */
  fps: number;
}

/** An emoji's image in one skin tone: `skinTones` on an `EmojiItem`. */
export interface EmojiItemTone {
  /** Identifies the emoji in this tone, unique in the catalogue: `"thumbs-up-tone3"`. Reactions and tokens use it. */
  id: string;
  /** The still image's address. */
  src: string;
  /** Sizes of the still image for sharper screens, as `<img srcset>`: `"wave-2x.png 2x"`. */
  srcSet?: string | undefined;
  /** An animated image (GIF, animated WebP or PNG), shown while the emoji plays; the still one shows otherwise. */
  animatedSrc?: string | undefined;
  /** The animation as a filmstrip of square frames, played while the emoji plays, for a tone without `animatedSrc`. */
  filmstrip?: EmojiFilmstrip | undefined;
  /**
   * The emoji in this tone as text (`"👍🏽"`), which `EmojiText` finds in messages; Ouro never draws it as text.
   *
   * @claim "Ouro never draws it as text" registry/ouro/components/ouro/emoji-picker/emoji-picker.catalogue.test.tsx verify:testExists(registry/ouro/components/ouro/emoji-picker/emoji-picker.catalogue.test.tsx::EmojiPicker with a catalogue > draws only the catalogue's images, each named by its emoji's name, with the custom category labelled by the app)
   */
  text?: string | undefined;
}

/**
 * One emoji in an image catalogue: its id, its name and the image that draws it. An app maps
 * its own emoji set to this, whether a standard set or an organization's custom emoji.
 *
 * @example
 * const party: EmojiItem = { id: "party", name: "Party popper", shortcodes: ["party", "tada"], keywords: ["celebrate"], src: "/emoji/party.png", animatedSrc: "/emoji/party.gif" };
 */
export interface EmojiItem {
  /** Identifies the emoji, unique in the catalogue: `"party"`. Reactions, recents and `:id:` tokens use it. */
  id: string;
  /** Its name, which is the image's `alt`, what screen readers hear and what the search matches first: `"Party popper"`. */
  name: string;
  /**
   * The still image's address. It shows whenever the emoji is not playing, and always with reduced motion.
   *
   * @claim "always with reduced motion" registry/ouro/components/ouro/emoji/emoji.test.tsx verify:testExists(registry/ouro/components/ouro/emoji/emoji.test.tsx::Emoji > shows the still image with reduced motion, whatever play says or the pointer does)
   */
  src: string;
  /** Sizes of the still image for sharper screens, as `<img srcset>`: `"party-2x.png 2x"`. */
  srcSet?: string | undefined;
  /**
   * An animated image (GIF, animated WebP or PNG), which plays while the pointer is on the emoji
   * or on the button around it, or that button has focus. With reduced motion it never plays.
   *
   * @claim "With reduced motion it never plays" registry/ouro/components/ouro/emoji/emoji.test.tsx verify:testExists(registry/ouro/components/ouro/emoji/emoji.test.tsx::Emoji > shows the still image with reduced motion, whatever play says or the pointer does)
   */
  animatedSrc?: string | undefined;
  /**
   * The animation as a filmstrip, square frames stacked top to bottom in one image, for an
   * emoji without `animatedSrc`: while the emoji plays, it steps through the frames at `fps`;
   * otherwise, and always with reduced motion, `src` shows.
   *
   * @claim "it steps through the frames at `fps`" registry/ouro/components/ouro/emoji/emoji.test.tsx verify:testExists(registry/ouro/components/ouro/emoji/emoji.test.tsx::Emoji > plays a filmstrip by stepping through its frames at its fps while its button is under the mouse, and shows the still image after)
   * @claim "always with reduced motion, `src` shows" registry/ouro/components/ouro/emoji/emoji.test.tsx verify:testExists(registry/ouro/components/ouro/emoji/emoji.test.tsx::Emoji > shows the still image with reduced motion, whatever play says or the pointer does)
   */
  filmstrip?: EmojiFilmstrip | undefined;
  /** The still image's width in pixels, given to the `<img>` so the page keeps its shape while it loads. It shows at the text's size. */
  width?: number | undefined;
  /** The still image's height in pixels, as `width`. */
  height?: number | undefined;
  /** Short names typed between colons, without them: `["party", "tada"]`. The first makes the emoji's token, `:party:`. */
  shortcodes?: readonly string[] | undefined;
  /** More words the search matches: `["celebrate", "hooray"]`. */
  keywords?: readonly string[] | undefined;
  /**
   * The emoji as plain text, such as its Unicode character (`"🎉"`), for places an image cannot
   * go (a copied message, a notification). `EmojiText` finds it in messages and draws the image;
   * Ouro never draws it as text.
   *
   * @claim "Ouro never draws it as text" registry/ouro/components/ouro/emoji-picker/emoji-picker.catalogue.test.tsx verify:testExists(registry/ouro/components/ouro/emoji-picker/emoji-picker.catalogue.test.tsx::EmojiPicker with a catalogue > draws only the catalogue's images, each named by its emoji's name, with the custom category labelled by the app)
   */
  text?: string | undefined;
  /** It is the organization's or app's own emoji rather than one of the standard set. Ouro draws it the same; apps can label or treat it apart. */
  custom?: boolean | undefined;
  /**
   * The emoji in Unicode's five skin tones, light to dark; leave it out for an emoji without tones.
   *
   * @claim "Unicode's five skin tones" https://www.unicode.org/reports/tr51/#Diversity verify:urlOk(https://www.unicode.org/reports/tr51/#Diversity)
   */
  skinTones?: readonly EmojiItemTone[] | undefined;
}

/** A category of a catalogue: its name, the icon its button shows, and its emoji in order. */
export interface EmojiCatalogueCategory {
  /** Identifies the category, unique in the catalogue: `"people"`, `"custom"`. */
  id: string;
  /** Its name, shown as its heading and read for its button: `"People"`, or the organization's name for its custom emoji. */
  label: string;
  /** What its button in a picker's category bar shows: an icon element. Defaults to its first emoji's image. */
  icon?: ReactNode;
  /** Its emoji, in the order they show. */
  items: readonly EmojiItem[];
}

/**
 * An image-based emoji set, by category: what `EmojiPicker`, `ReactionBar`, `Autocomplete`
 * and `EmojiText` draw instead of the platform's emoji font when an app passes it. Put an
 * organization's custom emoji in a category of their own, labelled by the app.
 *
 * The image addresses are used as they are, so an app that loads images its own way (a
 * content security policy, a custom scheme, signed or `blob:` URLs) puts the addresses it can
 * load in the catalogue when it builds it.
 *
 * @example
 * const catalogue: EmojiCatalogue = { categories: [{ id: "smileys", label: "Smileys", items: smileys }, { id: "custom", label: "Contoso", items: custom }] };
 */
export interface EmojiCatalogue {
  /** The categories, in the order they show. An emoji in more than one counts once, by its id. */
  categories: readonly EmojiCatalogueCategory[];
}

/** The props Emoji adds to the `<img>` attributes it passes through. */
export interface EmojiOwnProps {
  /** The emoji to draw, from the app's catalogue. */
  item: EmojiItem;
  /** The skin tone to draw it in, for an emoji with `skinTones`. @default "default" */
  skinTone?: EmojiSkinTone | (string & { 'Use "default", "light", "medium-light", "medium", "medium-dark" or "dark"': never }) | undefined;
  /**
   * Plays an animated emoji now (`true`) or keeps it still (`false`). Without it, the emoji
   * plays while the mouse is on it or on the button, link or option around it, or that has
   * focus. Reduced motion keeps it still whatever this says.
   */
  play?: boolean | undefined;
  /** The image's text alternative. @default the emoji's `name` */
  alt?: string | undefined;
  /** Layout only: margins, and a size other than the text's (`size-8`). Appearance classes warn in development. */
  className?: string | undefined;
  /** The `<img>`. */
  ref?: Ref<HTMLImageElement> | undefined;

  /** Not a prop. The image comes from the catalogue's item: `<Emoji item={{ id, name, src }} />`. */
  src?: { 'Use <Emoji item={{ id, name, src }} />': never };
  /** Not a prop. Emoji draws a catalogue's item, not text: `<Emoji item={catalogueItem} />`. */
  emoji?: { 'Use <Emoji item={catalogueItem} />': never };
  /** Not a prop. Ouro UI uses `play`: `<Emoji item={item} play />`. */
  animate?: { 'Use <Emoji item={item} play />': never };
}

/** Props for {@link Emoji}: its own props and the `<img>` attributes it passes through. */
export type EmojiProps = Omit<ImgHTMLAttributes<HTMLImageElement>, keyof EmojiOwnProps | "srcSet" | "children"> & EmojiOwnProps;

/** What an emoji plays for: the button, link or option around it, else the image itself. */
const hostSelector = 'button, a[href], [role="button"], [role="option"], [role="menuitem"]';

/** Whether the mouse is on, or focus is in, the element the emoji plays for, while `watch` is on. */
function useHostActive(image: { current: HTMLImageElement | null }, watch: boolean): boolean {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    // Stryker disable next-line ConditionalExpression: listening without need changes nothing; play decides first.
    if (!watch) return;
    const own = image.current!;
    const host = own.parentElement!.closest<HTMLElement>(hostSelector) ?? own;
    const listening = new AbortController();
    const listen = <K extends keyof HTMLElementEventMap>(type: K, handler: (event: HTMLElementEventMap[K]) => void) =>
      // Stryker disable next-line ObjectLiteral: a listener left once play is set or the emoji is gone decides nothing.
      host.addEventListener(type, handler, { signal: listening.signal });
    listen("pointerenter", (event) => setHovered(event.pointerType === "mouse"));
    listen("pointerleave", () => setHovered(false));
    listen("focusin", () => setFocused(true));
    listen("focusout", (event) => setFocused(host.contains(event.relatedTarget as Node | null)));
    // Stryker disable next-line BlockStatement: once play is set or the emoji is gone, what the host did decides nothing.
    return () => {
      // Stryker disable next-line CallExpression: a listener left once play is set or the emoji is gone decides nothing.
      listening.abort();
      setHovered(false);
      setFocused(false);
    };
  }, [image, watch]);
  return hovered || focused;
}

/**
 * Cancels the image's filmstrip animation, at most one: the image runs no other.
 *
 * @claim "at most one" registry/ouro/components/ouro/emoji/emoji.test.tsx verify:testExists(registry/ouro/components/ouro/emoji/emoji.test.tsx::Emoji > plays an animated image over a filmstrip, a tone's filmstrip in that tone, leaves one frame or a broken strip still, and starts a strip once)
 */
function stopAnimations(image: HTMLImageElement): void {
  for (const animation of image.getAnimations()) animation.cancel();
}

/**
 * Steps a filmstrip through its frames while `strip` is set: one Web Animation on the image's
 * `object-position`, started once the filmstrip has loaded (its height over its width is the
 * number of frames) and cancelled when it stops.
 */
function useFilmstrip(image: { current: HTMLImageElement | null }, strip: EmojiFilmstrip | undefined): void {
  const src = strip?.src;
  const fps = strip?.fps;
  useEffect(() => {
    if (src === undefined) return;
    const own = image.current!;
    let stopped = false;
    // Starts once the filmstrip is ready, whether it loads now or was there already.
    own.decode().then(
      () => {
        // A start for a filmstrip that has stopped, or changed pace, is stale: one animation an emoji.
        // Stryker disable next-line ConditionalExpression: Chromium, where the mutation run tests, fails a stale decode itself; WebKit resolves it.
        /* istanbul ignore if @preserve -- WebKit only, and only when its decode resolves late: Chromium fails a stale decode itself */ if (stopped) return;
        const frames = Math.round(own.naturalHeight / own.naturalWidth);
        if (!(frames > 1)) return;
        own.animate([{ objectPosition: "50% 0%" }, { objectPosition: "50% 100%" }], {
          duration: (frames / fps!) * 1000,
          iterations: Infinity,
          easing: `steps(${frames}, jump-none)`,
        });
      },
      // A filmstrip that fails to load leaves the still image.
      () => {},
    );
    return () => {
      // Stryker disable next-line BooleanLiteral: Chromium, where the mutation run tests, fails a stale decode itself; WebKit resolves it.
      stopped = true;
      stopAnimations(own);
    };
  }, [image, src, fps]);
}

/**
 * One emoji from an image catalogue, drawn as an `<img>` the size of the text around it, named
 * by its `alt` (the emoji's name). An animated emoji shows its still image until it plays:
 * while the mouse is on it or on the button around it, or that button has focus, or while
 * `play` says so. With reduced motion it always shows the still image. `skinTone` draws an
 * emoji with tones in one of them.
 *
 * Use `EmojiText` instead to draw the emoji in a message's text, and an emoji character for an
 * app that uses the platform's emoji font.
 *
 * @group Chat
 * @see https://ui.ouro.bot/docs/emoji
 *
 * @example
 * <Emoji item={party} />
 * <Button variant="plain" aria-label="Party popper"><Emoji item={party} alt="" /></Button>
 * @claim "named by its `alt` (the emoji's name)" registry/ouro/components/ouro/emoji/emoji.test.tsx verify:testExists(registry/ouro/components/ouro/emoji/emoji.test.tsx::Emoji > draws the still image named by the emoji's name, the size of the text, in the tone asked for)
 * @claim "With reduced motion it always shows the" registry/ouro/components/ouro/emoji/emoji.test.tsx verify:testExists(registry/ouro/components/ouro/emoji/emoji.test.tsx::Emoji > shows the still image with reduced motion, whatever play says or the pointer does)
 * @claim "while the mouse is on it or on" registry/ouro/components/ouro/emoji/emoji.test.tsx verify:testExists(registry/ouro/components/ouro/emoji/emoji.test.tsx::Emoji > plays while the mouse is on its button or the button has focus, and stops after)
 */
export function Emoji(props: EmojiProps): JSX.Element {
  const {
    item,
    skinTone = "default",
    play,
    alt,
    className,
    ref,
    // Guard props (hint types), dropped here so they never reach the DOM.
    src,
    emoji,
    animate,
    ...rest
  } = props;
  const knownTone = emojiSkinTones.includes(skinTone as EmojiSkinTone);
  useAppearanceClassNameCheck(
    "Emoji",
    className,
    process.env.NODE_ENV !== "production"
      ? (token: string) => `remove "${token}"; an emoji is its image`
      : // Stryker disable next-line StringLiteral: production only; the check never runs there.
        /* istanbul ignore next @preserve -- production only */ "",
  );
  useDevWarnings(
    "Emoji",
    process.env.NODE_ENV !== "production"
      ? () => [
          !item.src && ["item has no src, so there is no image to draw", '<Emoji item={{ id: "party", name: "Party popper", src: "/emoji/party.png" }} />'],
          !knownTone && [`skinTone="${skinTone}" is not a skin tone; use ${emojiSkinTones.map((tone) => `"${tone}"`).join(", ")}`, '<Emoji item={item} skinTone="medium" />'],
          src !== undefined && ["src is not a prop; the image comes from item", "<Emoji item={{ id, name, src }} />"],
          emoji !== undefined && ["emoji is not a prop; Emoji draws a catalogue's item", "<Emoji item={catalogueItem} />"],
          animate !== undefined && ["animate is not a prop", "<Emoji item={item} play />"],
        ]
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );

  const form = toneOf(item, skinTone as EmojiSkinTone);
  const own = useRef<HTMLImageElement>(null);
  const mergedRef = useMergedRef(ref, own);
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)", true);
  const animated = Boolean(form.animatedSrc ?? form.filmstrip) && !reduced;
  // Stryker disable next-line ConditionalExpression,LogicalOperator,EqualityOperator: listening saves work only; play decides first.
  const hostActive = useHostActive(own, animated && play === undefined);
  const playing = animated && (play ?? hostActive);
  // An animated image wins over a filmstrip.
  const strip = playing && !form.animatedSrc ? form.filmstrip : undefined;
  useFilmstrip(own, strip);
  return (
    <img
      loading="lazy"
      {...rest}
      ref={mergedRef}
      data-ouro="emoji"
      src={strip ? strip.src : playing ? form.animatedSrc : form.src}
      srcSet={playing ? undefined : form.srcSet}
      width={item.width}
      height={item.height}
      alt={alt ?? item.name}
      draggable={false}
      decoding="async"
      className={cn(emojiClass, strip && "object-cover object-top", className)}
    />
  );
}

/** The props EmojiText adds to the `<span>` attributes it passes through. */
export interface EmojiTextOwnProps {
  /** The text, with emoji as tokens (`:party:`, `:thumbs-up-tone3:`) or as the text the catalogue lists (`"🎉"`). */
  text: string;
  /** The emoji to draw, which the app supplies. */
  catalogue: EmojiCatalogue;
  /**
   * Draws emoji that stand alone, up to three with nothing else but spaces, at more than twice
   * the size, as chat apps show a message of only emoji.
   *
   * @claim "up to three with nothing else but spaces" registry/ouro/components/ouro/emoji/emoji.test.tsx verify:testExists(registry/ouro/components/ouro/emoji/emoji.test.tsx::EmojiText > enlarges up to three emoji alone, and nothing with other text, more emoji or without enlarge)
   */
  enlarge?: boolean | undefined;
  /** Layout only: margins, width (`mt-1`). Appearance classes warn in development. */
  className?: string | undefined;
  /** The `<span>`. */
  ref?: Ref<HTMLSpanElement> | undefined;

  /** Not a prop. The text goes in `text`, so EmojiText can find its emoji: `<EmojiText text={message.body} catalogue={catalogue} />`. */
  children?: { 'Use <EmojiText text={message.body} catalogue={catalogue} />': never };
}

/** Props for {@link EmojiText}: its own props and the `<span>` attributes it passes through. */
export type EmojiTextProps = Omit<HTMLAttributes<HTMLSpanElement>, keyof EmojiTextOwnProps> & EmojiTextOwnProps;

/**
 * A message's text with its emoji drawn from an image catalogue: each token (`:party:`, an
 * emoji's first shortcode or else its id, as `EmojiPicker` and `Autocomplete` put into a
 * `Composer`) and each emoji's `text` the catalogue lists becomes the emoji's image, which
 * screen readers hear by name. A token the catalogue does not know stays as typed. `enlarge`
 * shows a message of only emoji large.
 *
 * Use `Emoji` instead for a single emoji outside text, and plain text for an app that uses the
 * platform's emoji font.
 *
 * @group Chat
 * @see https://ui.ouro.bot/docs/emoji-text
 *
 * @example
 * <Message author={author} time={sentAt}>
 *   <EmojiText text={message.body} catalogue={catalogue} enlarge />
 * </Message>
 * @claim "A token the catalogue does not know" registry/ouro/components/ouro/emoji/emoji.test.tsx verify:testExists(registry/ouro/components/ouro/emoji/emoji.test.tsx::EmojiText > draws shortcode, id and tone id tokens as their images, and leaves unknown ones as text)
 * @claim "each emoji's `text` the catalogue lists becomes" registry/ouro/components/ouro/emoji/emoji.test.tsx verify:testExists(registry/ouro/components/ouro/emoji/emoji.test.tsx::EmojiText > draws the emoji text the catalogue lists as its images, longest first, with or without a variation selector)
 * @claim "shows a message of only emoji large" registry/ouro/components/ouro/emoji/emoji.test.tsx verify:testExists(registry/ouro/components/ouro/emoji/emoji.test.tsx::EmojiText > enlarges up to three emoji alone, and nothing with other text, more emoji or without enlarge)
 */
export function EmojiText(props: EmojiTextProps): JSX.Element {
  const {
    text,
    catalogue,
    enlarge = false,
    className,
    // Guard prop (a hint type), dropped here so it never reaches the DOM.
    children,
    ...rest
  } = props;
  useAppearanceClassNameCheck(
    "EmojiText",
    className,
    process.env.NODE_ENV !== "production"
      ? (token: string) => `remove "${token}"; EmojiText takes the look of the text around it`
      : // Stryker disable next-line StringLiteral: production only; the check never runs there.
        /* istanbul ignore next @preserve -- production only */ "",
  );
  useDevWarnings(
    "EmojiText",
    process.env.NODE_ENV !== "production"
      ? () => [
          !catalogue && ["catalogue is missing, so no emoji can be drawn", "<EmojiText text={message.body} catalogue={catalogue} />"],
          children !== undefined && ["children is not a prop; the text goes in text", "<EmojiText text={message.body} catalogue={catalogue} />"],
        ]
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );
  // Without text (an app that passed children), there is nothing to draw.
  const parts = catalogue ? splitEmojiText(text ?? "", catalogue) : [text];
  const found = parts.filter((part) => typeof part !== "string");
  const large = enlarge && found.length > 0 && found.length <= 3 && parts.every((part) => typeof part !== "string" || part.trim() === "");
  return (
    <span {...rest} data-ouro="emoji-text" data-enlarged={large ? "" : undefined} className={className}>
      {parts.map((part, index) =>
        typeof part === "string" ? (
          part
        ) : (
          <Emoji key={index} item={part.item} skinTone={part.tone} className={large ? "size-[2.75em] align-middle" : undefined} />
        ),
      )}
    </span>
  );
}
