import { useEffect, useRef, useState, type CSSProperties, type JSX } from "react";
import { useReducedMotion } from "@/registry/ouro/lib/ouro/use-reduced-motion";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { href } from "../paths";
import { CLIPS, type ClipName } from "./clips";

/*
 * A real capture, played as a short muted loop: Apple's own product-page pattern (prior art in the desk's
 * apple-site notes). Frameless, with no drawn phone around it. Each clip has a light and, where it was captured, a
 * dark version, and the page's scheme picks one by CSS. Nothing downloads until the clip nears the screen. Under
 * reduced motion nothing plays by itself: the settled still (a JPEG) shows, and the clip loads only if the reader presses
 * Play. Every loop has a play/pause button under it, off the recording (WCAG 2.2.2).
 */

const media = (file: string) => href(`/apple/media/${file}`);

function Variant({ name, scheme, label, hevc }: { name: string; scheme: "light" | "dark"; label: string; hevc: boolean }): JSX.Element {
  return (
    <video
      className={`apple-loop-video apple-loop-${scheme}`}
      muted
      playsInline
      loop
      preload="none"
      poster={media(`${name}-poster.jpg`)}
      aria-label={label}
      data-apple-scheme={scheme}
    >
      <source src={media(`${name}.mp4`)} type={hevc ? 'video/mp4; codecs="hvc1"' : "video/mp4"} />
      <source src={media(`${name}.webm`)} type="video/webm" />
      {/* Every clip is silent; the captions say so, and the label says what it shows. */}
      <track kind="captions" src={media("silent.vtt")} srcLang="en" label="English" />
    </video>
  );
}

/** The video of a variant the page is showing (the other one is display: none). */
function shown(frame: HTMLElement | null): HTMLVideoElement | undefined {
  const videos = [...(frame?.querySelectorAll<HTMLVideoElement>("video") ?? [])];
  return videos.find((video) => getComputedStyle(video).display !== "none");
}

export function Loop({ clip, caption, className, size = "md" }: { clip: ClipName; caption?: string; className?: string; size?: "sm" | "md" | "lg" }): JSX.Element {
  const info = CLIPS[clip];
  const frame = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  // The reader's own choice, once they make one; until then, loops play unless the reader asked for reduced motion.
  const [chosen, setChosen] = useState<boolean | null>(null);
  const playing = chosen ?? !reduced;
  const [near, setNear] = useState(false);

  // Plays only near the screen, never under reduced motion, and never after the reader paused it.
  useEffect(() => {
    const element = frame.current;
    if (!element || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setNear(Boolean(entry?.isIntersecting)), { threshold: 0.35 });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    const video = shown(element);
    for (const other of element.querySelectorAll("video")) if (other !== video) other.pause();
    if (!video) return;
    if (near && playing) void video.play().catch(() => {});
    else video.pause();
  }, [near, playing]);
  // The scheme can change while the clip plays: follow it to the variant now showing.
  useEffect(() => {
    const observer = new MutationObserver(() => {
      const element = frame.current;
      const video = shown(element);
      for (const other of element?.querySelectorAll("video") ?? []) if (other !== video) other.pause();
      if (video && near && playing) void video.play().catch(() => {});
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, [near, playing]);

  return (
    <figure
      className={cn("apple-loop", `apple-loop-${size}`, className)}
      style={{ "--apple-loop-native": `${info.width}px` } as CSSProperties}
      data-apple-clip={clip}
      data-apple-playing={playing ? "" : undefined}
    >
      <div ref={frame} className="apple-loop-frame" data-apple-dark={info.dark ? "" : undefined} style={{ aspectRatio: `${info.width} / ${info.height}` }}>
        <Variant name={clip} scheme="light" label={info.label} hevc={info.hevc} />
        {info.dark ? <Variant name={`${clip}-dark`} scheme="dark" label={info.label} hevc={info.hevc} /> : null}
        <img className="apple-loop-still apple-loop-light" src={media(`${clip}-still.jpg`)} alt={info.label} width={info.width} height={info.height} loading="lazy" decoding="async" />
        {info.dark ? (
          <img className="apple-loop-still apple-loop-dark" src={media(`${clip}-dark-still.jpg`)} alt={info.label} width={info.width} height={info.height} loading="lazy" decoding="async" />
        ) : null}
      </div>
      <figcaption className="apple-loop-caption">
        <span>
          {caption ?? info.caption} <span className="apple-loop-source">{info.source}</span>
        </span>
          <button
            type="button"
            className="apple-loop-toggle"
            aria-label={playing ? `Pause: ${info.label}` : `Play: ${info.label}`}
            onClick={() => setChosen(!playing)}
          >
            {!playing ? (
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M5 3.5v9l7.5-4.5z" fill="currentColor" />
              </svg>
            ) : (
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M4.5 3.5h2.5v9H4.5zM9 3.5h2.5v9H9z" fill="currentColor" />
              </svg>
            )}
          </button>
      </figcaption>
    </figure>
  );
}
