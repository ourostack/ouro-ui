import { useEffect, useRef, useState, type JSX } from "react";
import { Switch } from "@/registry/ouro/components/ouro/switch/switch";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import kit from "./kit.json";

/*
 * OuroHaptics' table of moments, drawn as taps over time and, if you ask, played as soft clicks: the HIG's own way
 * of showing a haptic on a page (bars in time with a tone). The taps are a sketch of how each system feedback feels,
 * not Apple's waveform, and the page says so. iPhone browsers have no vibration API, so only the app can make a
 * phone tap; an Android phone buzzes along as a bonus.
 */

export interface Tap {
  /** Milliseconds from the start. */
  at: number;
  /** 0 to 1. */
  strength: number;
  /** 0 (soft, round) to 1 (crisp). */
  sharpness: number;
}

type Moment = (typeof kit.haptics)[number];

const WEIGHT = { light: 0.6, medium: 0.8, heavy: 1 } as const;

/** How a moment's feedback feels, as taps. */
export function tapsFor(moment: Moment): Tap[] {
  switch (moment.feedback) {
    case "selection":
      return [{ at: 0, strength: 0.42, sharpness: 0.9 }];
    case "impact": {
      const weight = WEIGHT[(moment as { weight: keyof typeof WEIGHT }).weight];
      return [{ at: 0, strength: weight * ((moment as { intensity: number }).intensity ?? 1), sharpness: 0.55 }];
    }
    case "success":
      return [
        { at: 0, strength: 0.55, sharpness: 0.6 },
        { at: 110, strength: 1, sharpness: 0.7 },
      ];
    case "warning":
      return [
        { at: 0, strength: 1, sharpness: 0.6 },
        { at: 160, strength: 0.55, sharpness: 0.5 },
      ];
    default:
      return [
        { at: 0, strength: 0.8, sharpness: 0.8 },
        { at: 70, strength: 0.65, sharpness: 0.8 },
        { at: 140, strength: 1, sharpness: 0.85 },
        { at: 230, strength: 0.5, sharpness: 0.7 },
      ];
  }
}

/** The span every row is drawn over, so taps line up in time across the table. */
const SPAN = 300;

let audio: AudioContext | undefined;

/** Plays taps as soft clicks: a short, quickly fading tone per tap, brighter for a crisper tap. */
export function playClicks(taps: Tap[]): void {
  const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Context) return;
  audio ??= new Context();
  void audio.resume();
  const start = audio.currentTime + 0.01;
  for (const tap of taps) {
    const when = start + tap.at / 1000;
    const tone = audio.createOscillator();
    const gain = audio.createGain();
    tone.type = "sine";
    tone.frequency.setValueAtTime(140 + tap.sharpness * 260, when);
    tone.frequency.exponentialRampToValueAtTime(70 + tap.sharpness * 80, when + 0.04);
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(0.05 + tap.strength * 0.22, when + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.055 - tap.sharpness * 0.015);
    tone.connect(gain).connect(audio.destination);
    tone.start(when);
    tone.stop(when + 0.08);
  }
}

/** An Android phone taps along; an iPhone's browser can't, and doesn't pretend to. */
export function vibrate(taps: Tap[]): void {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  const pattern: number[] = [];
  let at = 0;
  for (const tap of taps) {
    if (pattern.length) pattern.push(Math.max(tap.at - at, 0));
    const length = Math.round(8 + tap.strength * 14);
    pattern.push(length);
    at = tap.at + length;
  }
  navigator.vibrate(pattern);
}

/** One tap as a damped ripple around the midline: stronger swings wider, crisper rings shorter and tighter. */
function ripple(x: number, tap: Tap): string {
  const amplitude = 4 + tap.strength * 18;
  const length = 46 - tap.sharpness * 26;
  const cycles = 2.5;
  const points: string[] = [];
  for (let step = 0; step <= 48; step++) {
    const t = step / 48;
    const y = 24 - amplitude * Math.exp(-3.2 * t) * Math.sin(t * cycles * 2 * Math.PI + Math.PI / 2) * (step === 0 ? 0 : 1);
    points.push(`${(x + t * length).toFixed(1)} ${y.toFixed(1)}`);
  }
  return `M${points.join(" L")}`;
}

function Wave({ taps, playing }: { taps: Tap[]; playing: boolean }): JSX.Element {
  return (
    <svg viewBox={`0 0 ${SPAN + 20} 48`} className={cn("apple-wave", playing && "apple-wave-playing")} aria-hidden="true">
      <line x1="0" x2={SPAN + 20} y1="24" y2="24" className="apple-wave-base" />
      {/* The playhead sweeps through the taps in step with the soft clicks. */}
      {playing ? <line x1="15" x2="15" y1="2" y2="46" className="apple-wave-head" style={{ animationDuration: `${SPAN}ms` }} /> : null}
      {taps.map((tap, index) => (
        <path key={index} d={ripple(15 + tap.at, tap)} className="apple-wave-tap" style={{ animationDelay: `${tap.at}ms` }} />
      ))}
    </svg>
  );
}

export function HapticTable(): JSX.Element {
  const [sound, setSound] = useState(false);
  const [playing, setPlaying] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const play = (moment: Moment) => {
    const taps = tapsFor(moment);
    if (sound) playClicks(taps);
    vibrate(taps);
    setPlaying(null);
    // A frame later, so pressing the same row again restarts its glow.
    requestAnimationFrame(() => setPlaying(moment.name));
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setPlaying(null), SPAN + 400);
  };

  return (
    <div className="apple-haptics" data-apple-haptics="">
      <div className="apple-haptics-head">
        <Switch label="Soft clicks" checked={sound} onCheckedChange={setSound} description="Hear a moment as a quiet click when you press it." />
      </div>
      <ul className="apple-haptics-list" aria-label="OuroHaptics moments">
        {kit.haptics.map((moment) => (
          <li key={moment.name} className="apple-haptic">
            <button type="button" className="apple-haptic-button" onClick={() => play(moment)} aria-describedby={`haptic-${moment.name}`}>
              <span className="apple-haptic-name site-mono">
                <svg viewBox="0 0 16 16" aria-hidden="true" className="apple-haptic-play">
                  <path d="M5 3.5v9l7.5-4.5z" fill="currentColor" />
                </svg>
                .{moment.name}
              </span>
              <Wave taps={tapsFor(moment)} playing={playing === moment.name} />
            </button>
            <p id={`haptic-${moment.name}`} className="apple-haptic-when">
              {moment.when}
            </p>
          </li>
        ))}
      </ul>
      <p className="apple-haptics-note">
        The taps are a sketch of how a moment feels, drawn from Apple's system feedback rather than its exact waveform. The choosing, ticking and stepping moments share iOS's selection tick on purpose: the name says what happened, the tick stays the same. Your iPhone's browser can't tap you back; the app can.
      </p>
    </div>
  );
}
