import { Component, startTransition, Suspense, useEffect, useRef, useState, type JSX, type ReactNode } from "react";
import { demos } from "../docs/demos";
import { useXray } from "../voyage/xray-store";

// The components index draws each component small, beside its name: its own live demo, scaled down, so the catalog shows
// what each one looks like before you open it. The server draws the empty frames only, so nothing moves when one fills.

/**
 * The demos that don't make a preview: one that mounts something for the whole page (a toast region, a bar fixed to the
 * screen, X-ray), keeps time or sound going while it is drawn (a timer, a meter), or shows nothing until it is used.
 */
export const NO_PREVIEW: ReadonlySet<string> = new Set([
  "inspector",
  "toaster",
  "swipe-actions",
  "install-prompt",
  "route-progress",
  "tab-bar",
  "level-meter",
  "live-captions",
  "timer",
  "timer-tray",
  "moment",
  "sync-status",
  "skip-link",
]);

/** How far from the screen a frame starts to fill: about a screen ahead, so a preview is drawn by the time it is seen. */
const AHEAD = "600px 0px";

/** A frame waiting to be drawn, and whether it is near the screen now. */
type Waiting = { draw: () => void; near: boolean };

/** Frames waiting to be drawn. One is drawn at a time when the browser is idle, the nearest the middle of the screen first. */
const waiting = new Map<Element, Waiting>();
let watcher: IntersectionObserver | undefined;
let drawing = false;

/** The waiting frame nearest the middle of the screen, of those near it now: a row scrolled past waits for its turn back. */
function nearest(): Element | undefined {
  let best: Element | undefined;
  let distance = Infinity;
  for (const [element, entry] of waiting) {
    if (!entry.near) continue;
    const box = element.getBoundingClientRect();
    const away = Math.abs(box.top + box.height / 2 - innerHeight / 2);
    if (away < distance) [best, distance] = [element, away];
  }
  return best;
}

function pump(): void {
  if (drawing || nearest() === undefined) return;
  drawing = true;
  const later = (run: () => void) => ("requestIdleCallback" in window ? requestIdleCallback(run, { timeout: 400 }) : setTimeout(run, 32));
  later(() => {
    drawing = false;
    const element = nearest();
    if (element) {
      const { draw } = waiting.get(element)!;
      waiting.delete(element);
      watcher?.unobserve(element);
      draw();
    }
    pump();
  });
}

/** Draws `element`'s frame once it is near the screen and its turn comes; returns what stops waiting. */
function watch(element: Element, draw: () => void): () => void {
  watcher ??= new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const frame = waiting.get(entry.target);
        if (frame) frame.near = entry.isIntersecting;
      }
      pump();
    },
    { rootMargin: AHEAD },
  );
  waiting.set(element, { draw, near: false });
  watcher.observe(element);
  return () => {
    waiting.delete(element);
    watcher?.unobserve(element);
  };
}

/** A preview that fails to load or render leaves its frame empty: the row still says what the component is. */
class Quiet extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }
  override render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * One component's preview: its live demo, drawn at a third of its size or so in a frame beside its name on the components
 * index. It is a picture of the component, so it is hidden from screen readers and takes no focus or press (`inert`); the
 * row's link covers it. It fills as it nears the screen, and then stays.
 */
export function CatalogPreview({ name }: { name: string }): JSX.Element {
  const frame = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  // X-ray tells what the page is made of, not what these pictures are: they step out of sight while it is on.
  const xray = useXray();
  const Demo = Object.hasOwn(demos, name) && !NO_PREVIEW.has(name) ? demos[name] : undefined;
  useEffect(() => {
    const element = frame.current;
    if (!element || !Demo) return;
    // A transition, so React draws it in slices between frames.
    return watch(element, () => startTransition(() => setShown(true)));
  }, [Demo]);
  return (
    <div
      ref={frame}
      aria-hidden="true"
      inert
      data-site-preview={name}
      // Set from the moment its turn comes, before its demo has loaded: what the page's budget counts (catalog.spec.ts).
      data-site-preview-drawn={shown ? "" : undefined}
      className="relative flex h-20 w-30 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted/50 select-none sm:h-24 sm:w-36 dark:bg-muted/65"
    >
      {shown && Demo && (
        <Quiet>
          <Suspense fallback={null}>
            {/* Drawn at 360 by 240 and scaled to the frame. It fades in, which reduced motion keeps, shorter, as a fade moves nothing. */}
            <div
              className={`flex h-60 w-90 flex-none scale-[0.3333] items-center-safe justify-center p-4 transition-opacity duration-(--ouro-duration-slow) starting:opacity-0 motion-reduce:duration-(--ouro-duration-fast) sm:scale-40 ${xray ? "invisible" : ""}`}
            >
              <Demo />
            </div>
          </Suspense>
        </Quiet>
      )}
    </div>
  );
}
