/*
 * The captures the Apple pages play (loop.tsx), each recorded from the iOS Simulator running real SwiftUI: the
 * foundations reel is a small app built on ouro-ui-apple 0.2.1 alone, and Spoonjoy's are its own app. Files live in
 * site/public/apple/media/ as <name>.mp4 (HEVC), <name>.webm (VP9), <name>-poster.jpg (the first frame) and
 * <name>-still.jpg (the settled frame shown under reduced motion), with -dark variants where `dark` is set;
 * media/manifest.json records how each was made.
 */

export interface Clip {
  /** What the clip shows, for a screen reader and for the still that stands in for it. */
  label: string;
  /** The words under it. */
  caption: string;
  /** Where it was captured. */
  source: string;
  width: number;
  height: number;
  /** Whether a dark-mode capture exists. */
  dark: boolean;
  /** Whether the MP4 is HEVC (the new captures) rather than H.264 (Ouro MD's, from its own page). */
  hevc: boolean;
}

const REEL = "Captured from the iOS Simulator: the package's own SwiftUI.";
const SPOONJOY = "Captured from the iOS Simulator: Spoonjoy's own app, with its sample kitchen.";

export const CLIPS = {
  "hx-spring": {
    label: "A tile springs from side to side and is caught mid-flight, carrying its speed into the new direction.",
    caption: "Core's spring, re-aimed halfway.",
    source: REEL,
    width: 590,
    height: 860,
    dark: true,
    hevc: true,
  },
  "hx-press": {
    label: "A Save button dips as it is pressed, then turns into Saved with a check.",
    caption: "The press, at 0.97.",
    source: REEL,
    width: 590,
    height: 860,
    dark: false,
    hevc: true,
  },
  "hx-themes": {
    label: "A small screen crossfades through the themes, in light and then in dark.",
    caption: "Six themes, one screen.",
    source: REEL,
    width: 590,
    height: 860,
    dark: false,
    hevc: true,
  },
  "hx-reduce-motion": {
    label: "The same tile, with Reduce Motion on: instead of moving, it fades out in one place and in at the other.",
    caption: "Reduce Motion: a crossfade, not a trip.",
    source: REEL,
    width: 590,
    height: 860,
    dark: false,
    hevc: true,
  },
  "hx-haptics": {
    label: "A checklist ticks off item by item, a stepper steps up, and a finish lands.",
    caption: "Checked, stepped, finished.",
    source: REEL,
    width: 590,
    height: 860,
    dark: false,
    hevc: true,
  },
  "spoonjoy-cook-step": {
    label: "Spoonjoy's cook mode turning from one step of a recipe to the next.",
    caption: "Spoonjoy's cook mode, one step at a time.",
    source: SPOONJOY,
    width: 590,
    height: 1100,
    dark: false,
    hevc: true,
  },
  "ouro-md-typing": {
    label: "Ouro MD on a Mac: someone types Markdown and it appears as the finished page while they type.",
    caption: "Ouro MD: you write in the finished page.",
    source: "Captured on a Mac from Ouro MD itself, for its page on ouroboros.bot.",
    width: 840,
    height: 630,
    dark: true,
    hevc: false,
  },
} as const satisfies Record<string, Clip>;

export type ClipName = keyof typeof CLIPS;
