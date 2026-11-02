export {
  ANNOUNCE_GAP_MS,
  bandClass,
  bandSizes,
  firstName,
  finalWordsClass,
  interimWordsClass,
  labelClass,
  linesClass,
  linesSizes,
  liveCaptionsAx,
  MAX_LINES_DEFAULT,
  MAX_LINES_MAX,
  MAX_LINES_MIN,
  speakerClass,
  spokenText,
  trackClass,
};

// Class strings, values, helpers and the agent side for LiveCaptions, apart from the component so
// its file exports only components and types (React Fast Refresh). Class strings are literal so
// the app's Tailwind finds them when it compiles.

/** How many lines the band shows without `maxLines`. @internal */
const MAX_LINES_DEFAULT = 2;
/**
 * The fewest lines a band shows. @internal
 * @claim "The fewest lines a band shows." registry/ouro/components/ouro/live-captions/live-captions.test.tsx verify:testExists(registry/ouro/components/ouro/live-captions/live-captions.test.tsx::LiveCaptions > keeps 2 lines by default, or the nearest whole number from 1 to 6)
 */
const MAX_LINES_MIN = 1;
/**
 * The most lines a band shows. @internal
 * @claim "The most lines a band shows." registry/ouro/components/ouro/live-captions/live-captions.test.tsx verify:testExists(registry/ouro/components/ouro/live-captions/live-captions.test.tsx::LiveCaptions > keeps 2 lines by default, or the nearest whole number from 1 to 6)
 */
const MAX_LINES_MAX = 6;

/**
 * The shortest gap between two announcements, in milliseconds. @internal
 * @claim "The shortest gap between two announcements," registry/ouro/components/ouro/live-captions/live-captions.test.tsx verify:testExists(registry/ouro/components/ouro/live-captions/live-captions.test.tsx::LiveCaptions announcements > reads at most one announcement every 2 seconds, and batches the lines that finish in between into the next)
 */
const ANNOUNCE_GAP_MS = 2000;

/**
 * The first word of a speaker's name, which the band shows: "Mara" for "Mara Lind". @internal
 * @claim "The first word of a speaker's" registry/ouro/components/ouro/live-captions/live-captions.test.tsx verify:testExists(registry/ouro/components/ouro/live-captions/live-captions.test.tsx::LiveCaptions > shows each line as the speaker's first name in a tint of the brand colour, then their words)
 */
function firstName(speaker: string): string {
  return speaker.trim().split(/\s/)[0]!;
}

/** A finished line, as an announcement reads it. @internal */
interface SpokenLine {
  speaker: string;
  text: string;
}

/**
 * What one announcement says for lines that finished together: each speaker's full name once,
 * then what they said, as "Mara Lind: First. Second. Jonas Ek: Third." @internal
 * @claim "What one announcement says for lines" registry/ouro/components/ouro/live-captions/live-captions.test.tsx verify:testExists(registry/ouro/components/ouro/live-captions/live-captions.test.tsx::LiveCaptions announcements > reads at most one announcement every 2 seconds, and batches the lines that finish in between into the next)
 */
function spokenText(lines: readonly SpokenLine[]): string {
  const parts: string[] = [];
  let previous: string | undefined;
  for (const { speaker, text } of lines) {
    parts.push(speaker === previous ? text : `${speaker}: ${text}`);
    previous = speaker;
  }
  return parts.join(" ");
}

/**
 * The band: a solid, translucent black fill with rounded corners, no blur, readable over any
 * picture. Solid black when the system asks for reduced transparency, solid black with a white
 * edge when it asks for more contrast, and Canvas with a CanvasText edge under forced colours.
 * @internal
 * @claim "The band: a solid, translucent black" registry/ouro/components/ouro/live-captions/live-captions.test.tsx verify:testExists(registry/ouro/components/ouro/live-captions/live-captions.test.tsx::LiveCaptions > draws a solid translucent black band with rounded corners and no blur)
 * @claim "Solid black when the system asks" registry/ouro/components/ouro/live-captions/live-captions.test.tsx verify:testExists(registry/ouro/components/ouro/live-captions/live-captions.test.tsx::LiveCaptions > goes solid black under reduced transparency, and white on solid black with an edge under more contrast)
 * @claim "Canvas with a CanvasText edge under" registry/ouro/components/ouro/live-captions/live-captions.test.tsx verify:testExists(registry/ouro/components/ouro/live-captions/live-captions.test.tsx::LiveCaptions > keeps its words and fill apart under forced colours, with an edge around the band)
 */
const bandClass =
  "box-border grid w-full gap-1 rounded-xl bg-black/80 text-start text-white " +
  "[@media(prefers-reduced-transparency:reduce)]:bg-black " +
  "contrast-more:bg-black contrast-more:border contrast-more:border-solid contrast-more:border-white " +
  "forced-colors:border forced-colors:border-solid forced-colors:border-[CanvasText] forced-colors:bg-[Canvas]";

/**
 * The band's padding at each size. @internal
 * @claim "The band's padding at each size." registry/ouro/components/ouro/live-captions/live-captions.test.tsx verify:testExists(registry/ouro/components/ouro/live-captions/live-captions.test.tsx::LiveCaptions > sets its words at 14, 18 and 24px on 20, 28 and 32px lines, md by default)
 */
const bandSizes = { sm: "px-3 py-1.5", md: "px-4 py-2", lg: "px-5 py-3" } as const;

/** The visible label, small and quiet over the lines. @internal */
const labelClass = "m-0 text-xs font-medium text-white/75 contrast-more:text-white forced-colors:text-[CanvasText]";

/**
 * The window onto the lines: exactly `--ouro-live-captions-lines` lines of its own line height
 * tall, whatever the lines hold, so the band never changes height. @internal
 * @claim "exactly `--ouro-live-captions-lines` lines of its own" registry/ouro/components/ouro/live-captions/live-captions.test.tsx verify:testExists(registry/ouro/components/ouro/live-captions/live-captions.test.tsx::LiveCaptions > is exactly maxLines lines tall, empty, full and overflowing, so nothing around it moves)
 */
const linesClass = "relative h-[calc(var(--ouro-live-captions-lines)*1lh)] overflow-hidden";

/**
 * The words' size and line height at each band size. @internal
 * @claim "The words' size and line height" registry/ouro/components/ouro/live-captions/live-captions.test.tsx verify:testExists(registry/ouro/components/ouro/live-captions/live-captions.test.tsx::LiveCaptions > sets its words at 14, 18 and 24px on 20, 28 and 32px lines, md by default)
 */
const linesSizes = { sm: "text-sm/5", md: "text-lg/7", lg: "text-2xl/8" } as const;

/**
 * The column of lines, held to the bottom of the window so the newest words sit on the last
 * line and older ones leave over the top edge. When a line pushes the others up, they slide
 * there over `--ouro-duration-base`; with reduced motion (the device's, or `OuroProvider`'s)
 * they jump. @internal
 * @claim "The column of lines, held to" registry/ouro/components/ouro/live-captions/live-captions.test.tsx verify:testExists(registry/ouro/components/ouro/live-captions/live-captions.test.tsx::LiveCaptions > is exactly maxLines lines tall, empty, full and overflowing, so nothing around it moves)
 * @claim "they slide there over `--ouro-duration-base`; with" registry/ouro/components/ouro/live-captions/live-captions.test.tsx verify:testExists(registry/ouro/components/ouro/live-captions/live-captions.test.tsx::LiveCaptions motion > slides older lines up and off the top as a new line comes, and with reduced motion moves them at once)
 */
const trackClass =
  "absolute inset-x-0 bottom-0 flex flex-col " +
  "transition-[translate] duration-(--ouro-duration-base) ease-(--ouro-ease-out)";

/**
 * The speaker's first name: a light tint of the brand colour, which keeps 4.5:1 on the band
 * whatever the theme's primary. White under more contrast, CanvasText under forced colours.
 * @internal
 * @claim "which keeps 4.5:1 on the band" registry/ouro/components/ouro/live-captions/live-captions.test.tsx verify:testExists(registry/ouro/components/ouro/live-captions/live-captions.test.tsx::LiveCaptions > keeps names and words at 4.5:1 or more over a white picture, under stock shadcn and Ouro colours)
 */
const speakerClass =
  "font-semibold text-[color-mix(in_oklab,var(--primary)_35%,white)] contrast-more:text-white forced-colors:text-[CanvasText]";

/** Words that are final: white. @internal */
const finalWordsClass = "text-white transition-colors duration-(--ouro-duration-fast) ease-[ease] forced-colors:text-[CanvasText]";

/**
 * Words that may still change: white at 70%, which keeps 4.5:1 on the band, and GrayText under
 * forced colours. They turn white in place when final: only their colour changes. @internal
 * @claim "Words that may still change: white" registry/ouro/components/ouro/live-captions/live-captions.test.tsx verify:testExists(registry/ouro/components/ouro/live-captions/live-captions.test.tsx::LiveCaptions > turns interim words white in place when they become final, moving nothing)
 * @claim "Words that may still change: white" registry/ouro/components/ouro/live-captions/live-captions.test.tsx verify:testExists(registry/ouro/components/ouro/live-captions/live-captions.test.tsx::LiveCaptions > keeps names and words at 4.5:1 or more over a white picture, under stock shadcn and Ouro colours)
 * @claim "They turn white in place when" registry/ouro/components/ouro/live-captions/live-captions.test.tsx verify:testExists(registry/ouro/components/ouro/live-captions/live-captions.test.tsx::LiveCaptions > turns interim words white in place when they become final, moving nothing)
 */
const interimWordsClass =
  "text-white/70 transition-colors duration-(--ouro-duration-fast) ease-[ease] contrast-more:text-white forced-colors:text-[GrayText]";

/**
 * LiveCaptions' agent side, for Ouro AX's kit. Its one read, `captions`, is what people say, which
 * an agent may read only while the person has asked it to follow the meeting (`consent:
 * "listening"`), and only through a filtered watch (`push: "filtered"`). It declares no actions:
 * turning captions on and off is declared once, in a calling app's own controls.
 *
 * @example
 * liveCaptionsAx.reads[0].consent; // "listening"
 * @claim "It declares no actions: turning captions" registry/ouro/components/ouro/live-captions/live-captions.test.tsx verify:testExists(registry/ouro/components/ouro/live-captions/live-captions.test.tsx::LiveCaptions > declares one agent read, the captions, behind listening consent and a filtered push, and no actions)
 * @claim "Its one read, `captions`, is what" registry/ouro/components/ouro/live-captions/live-captions.test.tsx verify:testExists(registry/ouro/components/ouro/live-captions/live-captions.test.tsx::LiveCaptions > declares one agent read, the captions, behind listening consent and a filtered push, and no actions)
 */
// TODO(ourostack/ouro-ui ax/component): wrap with defineComponentAx once it lands
const liveCaptionsAx = {
  component: "LiveCaptions",
  reads: [
    {
      id: "captions",
      summary: "What people say, once the person asks you to follow the meeting.",
      fields: ["speaker", "text", "at"],
      consent: "listening",
      push: "filtered",
    },
  ],
  actions: [],
} as const;
