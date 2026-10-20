export { buzz, chime, createChimeContext };
export type { ChimeOptions };

// The export list comes first because the shadcn CLI drops comments before a file's
// first statement, which would take the JSDoc below with it.

type AudioContextConstructor = new () => AudioContext;

/** Options for {@link chime}. */
interface ChimeOptions {
  /**
   * The audio context to play on, from `createChimeContext()` in a click handler. Browsers
   * play sound only after the person has interacted with the page, so create it when they
   * start what will chime later (a timer's Start), and keep it. Without one, `chime` makes
   * its own, which a browser may keep silent.
   */
  context?: AudioContext | null | undefined;
}

const TONE_HZ = 880;
const TONE_SECONDS = 0.18;
const GAP_SECONDS = 0.12;
const TONES = 3;
const PATTERN: readonly number[] = [200, 100, 200, 100, 400];

function constructor(): AudioContextConstructor | null {
  const scope = globalThis as unknown as { AudioContext?: AudioContextConstructor; webkitAudioContext?: AudioContextConstructor };
  return scope.AudioContext ?? scope.webkitAudioContext ?? null;
}

/**
 * Makes an audio context for {@link chime}, or returns `null` where the browser has no Web
 * Audio. Call it from a click or key handler, where browsers allow sound to start, and pass
 * it to every later `chime`.
 *
 * @group Feedback
 * @see https://ourostack.github.io/ouro-ui/docs/timer
 *
 * @example
 * const context = useRef<AudioContext | null>(null);
 * const start = () => {
 *   context.current ??= createChimeContext();
 *   timer.start();
 * };
 */
function createChimeContext(): AudioContext | null {
  const Context = constructor();
  if (!Context) return null;
  try {
    return new Context();
  } catch {
    return null;
  }
}

/**
 * Plays a short alert, three soft tones, for something that just finished: a timer at zero.
 * It resolves `true` once the tones are scheduled and `false` when the browser has no Web
 * Audio or keeps the page silent (no interaction yet), so the caller can rely on what shows
 * on screen instead. It never throws. Pair it with `buzz()` for phones on silent.
 *
 * Use `toast()` instead to tell the person something in words; a chime only draws their
 * attention back to the screen.
 *
 * @group Feedback
 * @see https://ourostack.github.io/ouro-ui/docs/timer
 *
 * @example
 * const played = await chime({ context });
 */
async function chime({ context }: ChimeOptions = {}): Promise<boolean> {
  const audio = context ?? createChimeContext();
  if (!audio) return false;
  // A context chime made for itself is closed once its tones end, or at once when it stays silent.
  const own = !context;
  const done = () => {
    if (own) void audio.close().catch(() => undefined);
  };
  try {
    if (audio.state === "suspended") await audio.resume();
    if (audio.state !== "running") {
      done();
      return false;
    }
    const start = audio.currentTime;
    for (let index = 0; index < TONES; index += 1) {
      const at = start + index * (TONE_SECONDS + GAP_SECONDS);
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = TONE_HZ;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.4, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + TONE_SECONDS);
      oscillator.connect(gain);
      gain.connect(audio.destination);
      oscillator.start(at);
      oscillator.stop(at + TONE_SECONDS);
      if (index === TONES - 1) oscillator.onended = done;
    }
    return true;
  } catch {
    done();
    return false;
  }
}

/**
 * Vibrates the device in a short alert pattern, where it can (most Android phones; not iOS
 * or desktops). Returns whether it did. Call it with `chime()`, so a phone on silent still
 * gets the alert.
 *
 * @group Feedback
 * @see https://ourostack.github.io/ouro-ui/docs/timer
 *
 * @example
 * buzz();
 */
function buzz(): boolean {
  /* istanbul ignore if @preserve -- server only */
  if (typeof navigator === "undefined") return false;
  if (typeof navigator.vibrate !== "function") return false;
  try {
    return navigator.vibrate([...PATTERN]);
  } catch {
    return false;
  }
}
