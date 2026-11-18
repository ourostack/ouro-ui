import { afterPaint } from "../after-paint";

/** A tune for the saloon's organ: its notes (a MIDI note and its length in beats), how long a beat lasts, and its stops. */
export interface Tune {
  name: "toccata" | "prelude" | "lullaby";
  notes: ReadonlyArray<readonly [midi: number, beats: number]>;
  /** A beat, in seconds. */
  beat: number;
  /** How loud the whole tune is. */
  level: number;
  /** The pipes each note sounds: a harmonic of the note, and how loud it is. */
  stops: ReadonlyArray<readonly [harmonic: number, level: number]>;
}

/** The C major figure that opens Bach's Prelude in C, BWV 846. */
const PRELUDE: ReadonlyArray<readonly [number, number]> = [[60, 0.5], [64, 0.5], [67, 0.5], [72, 0.5], [76, 0.5], [67, 0.5], [72, 0.5], [76, 0.5]];

/**
 * What the organ plays, a press each and round again, each a few seconds long: the famous opening flourish of
 * Bach's Toccata in D minor on full organ; then, gentler, the opening of his Prelude in C on a soft flute stop;
 * then, softest, the opening of Brahms's Lullaby, which puts the squid at the window to sleep. Old music, free to
 * play.
 */
export const TUNES: readonly Tune[] = [
  {
    name: "toccata",
    notes: [[81, 0.25], [79, 0.25], [81, 1.5], [79, 0.25], [77, 0.25], [76, 0.25], [74, 0.25], [73, 0.75], [74, 2]],
    beat: 0.32,
    level: 0.08,
    stops: [[0.5, 0.6], [1, 1], [2, 0.45], [4, 0.2]],
  },
  {
    name: "prelude",
    notes: [...PRELUDE, ...PRELUDE.slice(0, -1), [76, 1.5]],
    beat: 0.34,
    level: 0.06,
    stops: [[1, 1], [2, 0.3]],
  },
  {
    name: "lullaby",
    notes: [[64, 0.5], [64, 0.5], [67, 1.5], [64, 0.5], [64, 0.5], [67, 1.5], [64, 0.5], [67, 0.5], [72, 1], [71, 1], [69, 0.75], [69, 0.75], [67, 2]],
    beat: 0.28,
    level: 0.05,
    stops: [[1, 1], [2, 0.15]],
  },
];

/** The tune a press plays, counting presses from the first since the voyage began: the next one along each time. */
export function tuneFor(plays: number): Tune {
  return TUNES[(plays - 1) % TUNES.length]!;
}

/**
 * Plays `tune` from the press that asked for it, on a few sine waves per note, quiet. Web Audio only, made here;
 * nothing is fetched. Where the browser has no Web Audio, or is driven by automation (an agent's or a test's), the organ plays in silence. The press makes the audio
 * context, so a browser that only lets a press start sound lets it play; the pipes are built in a task after the
 * press's frame (afterPaint), which they held up by several milliseconds on a slow CPU, and the first note starts
 * 50 ms after that.
 */
export function playTune(tune: Tune): void {
  const Context = typeof window === "undefined" ? undefined : window.AudioContext;
  if (!Context || navigator.webdriver) return;
  const audio = new Context();
  afterPaint(() => play(audio, tune));
}

/** Builds the tune's pipes on `audio` and plays them, then closes it. */
function play(audio: AudioContext, tune: Tune): void {
  const out = audio.createGain();
  out.gain.value = tune.level;
  out.connect(audio.destination);
  let at = audio.currentTime + 0.05;
  for (const [midi, beats] of tune.notes) {
    const frequency = 440 * 2 ** ((midi - 69) / 12);
    const length = beats * tune.beat;
    for (const [harmonic, level] of tune.stops) {
      const pipe = audio.createOscillator();
      const gain = audio.createGain();
      pipe.frequency.value = frequency * harmonic;
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(level, at + 0.02);
      gain.gain.setValueAtTime(level, at + length - 0.04);
      gain.gain.linearRampToValueAtTime(0, at + length);
      pipe.connect(gain).connect(out);
      pipe.start(at);
      pipe.stop(at + length + 0.02);
    }
    at += length;
  }
  window.setTimeout(() => void audio.close(), (at - audio.currentTime + 0.5) * 1000);
}
