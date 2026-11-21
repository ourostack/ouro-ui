import { useSyncExternalStore, type JSX } from "react";

// The phone frame's status bar: the reader's own time, and, under the Live theme, their own sky (themes/live.ts), so the
// phone a demo opens in reads as theirs. A picture of a phone's bar: screen readers skip it, as the frame's title names it.

/** The time on the reader's clock, as a phone shows it ("9:41"), in their own locale's hours. */
export function phoneTime(now: Date, locale?: string): string {
  return new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }).format(now).replace(/\s?[AP]\.?M\.?$/i, "");
}

// The time the bar shows, read once and again only as the minute turns: React reads a snapshot twice in a render and
// wants the same both times, which a fresh read of the clock gives no longer once a minute ends between the two (#2679).
let shown: string | undefined;
const readTime = () => (shown ??= phoneTime(new Date()));

/** Ticks once a minute, on the minute, so the bar's time turns over when the reader's clock does. */
function subscribeMinute(onChange: () => void): () => void {
  let timer: ReturnType<typeof setTimeout>;
  const tick = () => {
    shown = phoneTime(new Date());
    onChange();
    timer = setTimeout(tick, 60_000 - (Date.now() % 60_000));
  };
  // A bar that mounts after a while with none shown reads the clock afresh, not the time the last one showed.
  shown = undefined;
  timer = setTimeout(tick, 60_000 - (Date.now() % 60_000));
  return () => clearTimeout(timer);
}

/** Follows the root's Live sky (data-sky), which live-clock.ts moves on as the sun does. */
function subscribeSky(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-sky", "data-live"] });
  return () => observer.disconnect();
}

const noSky = () => null;

/** The sky's mark: a sun high for day, on the line for dawn and dusk, a moon for night. */
function SkyMark({ phase }: { phase: string }): JSX.Element {
  if (phase === "night") {
    return (
      <svg viewBox="0 0 16 16" className="size-3" fill="currentColor">
        <path d="M10.5 1.5a6.5 6.5 0 1 0 4 11.6A6 6 0 0 1 10.5 1.5Z" />
      </svg>
    );
  }
  if (phase === "dawn" || phase === "dusk") {
    return (
      <svg viewBox="0 0 16 16" className="size-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <path d="M4 11a4 4 0 0 1 8 0M1.5 11h13M8 3.5V5M3.4 5.9l1 1M12.6 5.9l-1 1" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 16 16" className="size-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="8" cy="8" r="3" />
      <path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1" />
    </svg>
  );
}

/** The bar across the top of the phone frame: the time, ticking with the reader's clock, and their sky under Live. */
export function PhoneStatus(): JSX.Element {
  const time = useSyncExternalStore(subscribeMinute, readTime, () => "");
  const phase = useSyncExternalStore(
    subscribeSky,
    () => (document.documentElement.hasAttribute("data-live") ? document.documentElement.getAttribute("data-sky") : null),
    noSky,
  );
  return (
    <div
      aria-hidden="true"
      data-site-phone-status={phase ?? ""}
      className="flex h-8 items-center justify-between bg-background px-6 text-xs font-semibold text-foreground tabular-nums"
    >
      <span>{time}</span>
      {/* Live's own sky in a chip: the time keeps the page's colors, which read whatever the sky. */}
      {phase && (
        // The night's moon in Live's pale sun on its dark sky, and a day's sun in the page's text color on its pale one.
        <span className={`grid size-5 place-items-center rounded-full bg-(--live-sky) ${phase === "night" ? "text-(--live-sun)" : "text-foreground"}`}>
          <SkyMark phase={phase} />
        </span>
      )}
    </div>
  );
}
