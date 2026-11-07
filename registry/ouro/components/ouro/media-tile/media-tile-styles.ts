export {
  avatarSizeFor,
  connections,
  controlsClass,
  defaultLabels,
  fitClasses,
  HYSTERESIS_DEFAULT,
  mediaClass,
  mediaTileAx,
  plateClass,
  ringClass,
  sentenceFor,
  smallPhotos,
  sources,
  tileClass,
  upperFirst,
  VISIBLE_RATIO,
};
export type { MediaTileConnection, MediaTileHysteresis, MediaTileLabels, MediaTileSentence };

// Class strings, values and the agent side for MediaTile, apart from the component so its file
// exports only components (React Fast Refresh). Class strings are literal so the app's Tailwind
// finds them when it compiles.

import { defineComponentAx } from "@/registry/ouro/ax/component";

/**
 * How much of a tile must be on screen before it counts as seen: a tenth of it, so a sliver at
 * the edge of a scrolled strip doesn't keep a picture coming. @internal
 * @claim "How much of a tile must be" registry/ouro/components/ouro/media-tile/media-tile.test.tsx verify:testExists(registry/ouro/components/ouro/media-tile/media-tile.test.tsx::MediaTile visibility > counts a tile as seen only once a tenth of it is on screen, so a sliver doesn't count)
 */
const VISIBLE_RATIO = 0.1;

/**
 * How long, in milliseconds, someone must speak before the ring comes on, and be quiet before it
 * goes. @internal
 * @claim "How long, in milliseconds, someone must" registry/ouro/components/ouro/media-tile/media-tile.test.tsx verify:testExists(registry/ouro/components/ouro/media-tile/media-tile.test.tsx::MediaTile speaking > turns the ring on after 300ms of speaking and off after 600ms of quiet, and ignores a blip shorter than that)
 */
const HYSTERESIS_DEFAULT = { on: 300, off: 600 } as const;

/**
 * How long someone must speak before the speaking ring comes on (`on`), and be quiet before it
 * goes (`off`), in milliseconds, so a cough doesn't flash it.
 */
interface MediaTileHysteresis {
  /** Milliseconds of speaking before the ring comes on. @default 300 */
  on?: number | undefined;
  /** Milliseconds of quiet before the ring goes. @default 600 */
  off?: number | undefined;
}

/** How well the person's media is getting through. Only `poor` shows: a fair connection still carries the call. */
type MediaTileConnection = "good" | "fair" | "poor";

/** The connections a tile knows. @internal */
const connections = ["good", "fair", "poor"] as const;

/** Where the picture comes from. @internal */
const sources = ["camera", "screen"] as const;

/**
 * The words a tile is read in, one sentence per tile ("Mara Lind, speaking, camera on, hand
 * raised"), and the words of its controls. Translate them with the rest of your interface.
 */
interface MediaTileLabels {
  /** Read while the speaking ring is on: "speaking". */
  speaking: string;
  /** Read while the person is muted: "muted". It is also the muted glyph's tooltip. */
  muted: string;
  /** Read while the camera is on: "camera on". */
  cameraOn: string;
  /** Read while the camera is off: "camera off". */
  cameraOff: string;
  /** Read for a tile whose picture is a shared screen: "shared screen". */
  screen: string;
  /** Read while the picture is paused, when `paused` gives no reason of its own: "video paused". */
  paused: string;
  /** Read while the person's hand is up: "hand raised". It is also the hand's tooltip. */
  handRaised: string;
  /** Read while the connection is poor: "poor connection". It is also the glyph's tooltip. */
  poorConnection: string;
  /** Read, and shown on the name plate after the name, while the person presents: "presenting". */
  presenting: string;
  /** Read while the tile is pinned: "pinned". */
  pinned: string;
  /** The Pin control's name, which stays the same pinned or not (it is a toggle): "Pin". */
  pin: string;
}

/**
 * The words a tile uses without `labels`. @internal
 * @claim "The words a tile uses without" registry/ouro/components/ouro/media-tile/media-tile.test.tsx verify:testExists(registry/ouro/components/ouro/media-tile/media-tile.test.tsx::MediaTile > reads as one sentence: who, then what they are doing, in the order a person listens for it)
 */
const defaultLabels: MediaTileLabels = {
  speaking: "speaking",
  muted: "muted",
  cameraOn: "camera on",
  cameraOff: "camera off",
  screen: "shared screen",
  paused: "video paused",
  handRaised: "hand raised",
  poorConnection: "poor connection",
  presenting: "presenting",
  pinned: "pinned",
  pin: "Pin",
};

/** What a tile's sentence says. @internal */
interface MediaTileSentence {
  name: string;
  presenting: boolean;
  speaking: boolean;
  muted: boolean;
  source: (typeof sources)[number];
  cameraOn: boolean;
  /** The words for a paused picture, or `undefined` while it plays. */
  paused: string | undefined;
  handRaised: boolean;
  connection: MediaTileConnection;
  pinned: boolean;
}

/**
 * A tile as one sentence: the name, then presenting, speaking, muted, the picture (camera on or
 * off, a shared screen, or paused), a raised hand, a poor connection and pinned, in that order.
 * @internal
 * @claim "A tile as one sentence: the" registry/ouro/components/ouro/media-tile/media-tile.test.tsx verify:testExists(registry/ouro/components/ouro/media-tile/media-tile.test.tsx::MediaTile > reads as one sentence: who, then what they are doing, in the order a person listens for it)
 */
function sentenceFor(tile: MediaTileSentence, labels: MediaTileLabels): string {
  const picture = tile.paused ?? (tile.source === "screen" ? labels.screen : tile.cameraOn ? labels.cameraOn : labels.cameraOff);
  return [
    tile.name,
    tile.presenting && labels.presenting,
    tile.speaking && labels.speaking,
    tile.muted && labels.muted,
    picture,
    tile.handRaised && labels.handRaised,
    tile.connection === "poor" && labels.poorConnection,
    tile.pinned && labels.pinned,
  ]
    .filter(Boolean)
    .join(", ");
}

/** Words with their first letter upper case, for a tooltip or a name plate: "Presenting". @internal */
function upperFirst(words: string): string {
  return words.charAt(0).toLocaleUpperCase() + words.slice(1);
}

/**
 * The photo's size for a tile whose shorter side is this many pixels: 32px under 96, 48px
 * under 160, 64px under 280, 72px under 440, and 112px from there. @internal
 * @claim "The photo's size for a tile" registry/ouro/components/ouro/media-tile/media-tile.test.tsx verify:testExists(registry/ouro/components/ouro/media-tile/media-tile.test.tsx::MediaTile > grows the photo with the tile, 64px until the tile is measured)
 */
function avatarSizeFor(width: number, height: number): "sm" | "lg" | "xl" | "2xl" | "3xl" {
  const side = Math.min(width, height);
  if (side < 96) return "sm";
  if (side < 160) return "lg";
  if (side < 280) return "xl";
  return side < 440 ? "2xl" : "3xl";
}

/**
 * The photo sizes, 48px and smaller, beside which the paused glyph sits rather than over the
 * corner, where it would cover the initials. @internal
 * @claim "beside which the paused glyph sits" registry/ouro/components/ouro/media-tile/media-tile.test.tsx verify:testExists(registry/ouro/components/ouro/media-tile/media-tile.test.tsx::MediaTile > keeps the paused glyph off the initials: beside a small photo, on the corner of a large one)
 */
const smallPhotos: readonly string[] = ["xs", "sm", "md", "lg"];

/**
 * The tile: a 16:9 box in the muted surface with rounded corners, that clips its picture. Its
 * size is the app's layout (`aspect-square`, `h-full`, a grid cell). @internal
 * @claim "The tile: a 16:9 box in" registry/ouro/components/ouro/media-tile/media-tile.test.tsx verify:testExists(registry/ouro/components/ouro/media-tile/media-tile.test.tsx::MediaTile > is a 16:9 tile as wide as its container, and keeps layout classes, ids, refs and div attributes)
 */
const tileClass =
  "@container/tile group/tile relative isolate box-border block aspect-video w-full overflow-hidden rounded-xl " +
  "bg-muted text-foreground forced-colors:border forced-colors:border-solid forced-colors:border-[CanvasText]";

/** The layer the app's media fills, hidden but still mounted while the photo shows, so a `<video>` keeps its stream. @internal */
const mediaClass = "absolute inset-0 *:block *:size-full";

/**
 * How the picture fills the tile: a camera is cropped to fill it, a share is never cropped. @internal
 * @claim "How the picture fills the tile:" registry/ouro/components/ouro/media-tile/media-tile.test.tsx verify:testExists(registry/ouro/components/ouro/media-tile/media-tile.test.tsx::MediaTile > crops a camera to fill the tile and never crops a share)
 */
const fitClasses = { cover: "*:object-cover", contain: "*:object-contain" } as const;

/**
 * The name plate's, the glyphs' and the controls' fill: the surface at about three quarters, solid
 * where the person asks for less transparency or more contrast, and never a backdrop blur, which
 * would repaint over moving video every frame. @internal
 * @claim "solid where the person asks for less" registry/ouro/components/ouro/media-tile/media-tile.test.tsx verify:testExists(registry/ouro/components/ouro/media-tile/media-tile.test.tsx::MediaTile > puts the name plate on a translucent fill with no blur, solid with reduced transparency)
 */
const plateClass =
  "box-border border border-solid border-transparent text-foreground " +
  "bg-[color-mix(in_oklab,var(--background)_76%,transparent)] " +
  "[@media(prefers-reduced-transparency:reduce)]:bg-background contrast-more:bg-background contrast-more:border-foreground " +
  "forced-colors:border-[CanvasText]";

/**
 * The speaking ring: an inset box-shadow over the picture in `--ouro-media-tile-ring` (default
 * the theme's `--primary`), with a hairline of the surface inside it so it shows on any picture.
 * It fades in and out over `--ouro-duration-fast`; with reduced motion it is steady on or off,
 * and under forced colours it is a Highlight outline. @internal
 * @claim "The speaking ring: an inset box-shadow" registry/ouro/components/ouro/media-tile/media-tile.test.tsx verify:testExists(registry/ouro/components/ouro/media-tile/media-tile.test.tsx::MediaTile speaking > draws the ring as an inset box-shadow that never moves the layout, and as an outline under forced colours)
 */
const ringClass =
  "pointer-events-none absolute inset-0 z-10 rounded-[inherit] opacity-0 " +
  "shadow-[inset_0_0_0_3px_var(--ouro-media-tile-ring,var(--primary)),inset_0_0_0_4px_var(--background)] " +
  "transition-opacity duration-(--ouro-duration-fast) ease-(--ouro-ease-out) data-highlighted:opacity-100 motion-reduce:transition-none " +
  "forced-colors:shadow-none forced-colors:outline-3 forced-colors:outline-solid forced-colors:outline-[Highlight] forced-colors:-outline-offset-3";

/**
 * The tile's controls in its top end corner: shown while a fine pointer is over the tile, while
 * focus is inside it, while it is pinned, and always on a coarse pointer, where there is no
 * hover. @internal
 * @claim "The tile's controls in its top" registry/ouro/components/ouro/media-tile/media-tile.test.tsx verify:testExists(registry/ouro/components/ouro/media-tile/media-tile.test.tsx::MediaTile controls > shows its controls while focus is inside the tile or it is pinned, and hides them otherwise)
 * @claim "The tile's controls in its top" registry/ouro/components/ouro/media-tile/media-tile.touch.test.tsx verify:testExists(registry/ouro/components/ouro/media-tile/media-tile.touch.test.tsx::MediaTile on a touch screen > always shows its controls, and gives the Pin toggle a 44px target)
 */
const controlsClass =
  "absolute end-2 top-2 z-20 flex items-center gap-1 rounded-lg p-0.5 " +
  "opacity-0 transition-opacity duration-(--ouro-duration-fast) ease-[ease] " +
  "pointer-fine:group-hover/tile:opacity-100 group-focus-within/tile:opacity-100 group-focus-within/tile:transition-none " +
  "data-pinned:opacity-100 pointer-coarse:opacity-100";

/**
 * MediaTile's agent side, declared with Ouro AX's `defineComponentAx`: it reads who is in the tile and what they are doing,
 * and an agent may pin the tile, which only the person sees.
 *
 * @example
 * mediaTileAx.actions[0].id; // "pin"
 * @claim "it reads who is in the tile" registry/ouro/components/ouro/media-tile/media-tile.test.tsx verify:testExists(registry/ouro/components/ouro/media-tile/media-tile.test.tsx::MediaTile > declares its agent side: a participant read anyone may take, and a private pin an agent may take)
 */
const mediaTileAx = defineComponentAx({
  component: "MediaTile",
  reads: [
    {
      id: "participant",
      summary: "Who is in the tile, and what they are doing.",
      fields: ["name", "muted", "camera", "speaking", "handRaised", "connection"],
      consent: "none",
    },
  ],
  actions: [{ id: "pin", summary: "Keep this tile in the person's main view.", effect: "private", agent: true }],
});
